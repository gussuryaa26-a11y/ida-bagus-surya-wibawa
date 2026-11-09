import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "./db";
import { AppError } from "./errors";
import { writeAudit } from "./audit";
import { recomputeOpenDeadlines } from "./settings";
import { detectConflictsForSchedules } from "./schedule-import";
import { markConflictsNotified, notifyPostApprovalConflicts } from "./conflicts";
import type { SessionUser } from "./types";

export type CalendarType = "holiday" | "break" | "semester" | "exception";

export type CalendarEntry = {
  id: string;
  periodStart: string;
  periodEnd: string;
  calendarType: CalendarType;
  description: string;
  regularClassesEnabled: boolean;
  sourceOrAuthority: string;
  updatedAt: Date;
  updatedByName: string | null;
};

type CalendarRow = {
  id: string;
  period_start: string;
  period_end: string;
  calendar_type: CalendarType;
  description: string;
  regular_classes_enabled: boolean;
  source_or_authority: string;
  updated_at: Date;
  updated_by_name: string | null;
};

function mapEntry(row: CalendarRow): CalendarEntry {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    calendarType: row.calendar_type,
    description: row.description,
    regularClassesEnabled: row.regular_classes_enabled,
    sourceOrAuthority: row.source_or_authority,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  };
}

export async function listCalendarEntries(): Promise<CalendarEntry[]> {
  const rows = await query<CalendarRow>(
    `SELECT c.id, c.period_start, c.period_end, c.calendar_type, c.description,
            c.regular_classes_enabled, c.source_or_authority, c.updated_at,
            u.full_name AS updated_by_name
       FROM academic_calendar c
       LEFT JOIN users u ON u.id = c.updated_by
      ORDER BY c.period_start DESC
      LIMIT 200`,
  );
  return rows.map(mapEntry);
}

export type CalendarInput = {
  periodStart: string;
  periodEnd: string;
  calendarType: CalendarType;
  description: string;
  regularClassesEnabled: boolean;
  sourceOrAuthority: string;
};

function assertInput(input: CalendarInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd)) {
    throw new AppError("VALIDATION_ERROR", "Format tanggal kalender tidak valid.");
  }
  if (input.periodEnd < input.periodStart) {
    throw new AppError("VALIDATION_ERROR", "Tanggal akhir periode harus sama atau setelah tanggal mulai.");
  }
  if (!input.description.trim()) throw new AppError("VALIDATION_ERROR", "Deskripsi kalender wajib diisi.");
  if (!input.sourceOrAuthority.trim()) {
    throw new AppError("VALIDATION_ERROR", "Sumber/otoritas kalender wajib dicantumkan.");
  }
}

export async function createCalendarEntry(
  input: CalendarInput,
  actor: SessionUser,
): Promise<CalendarEntry> {
  assertInput(input);
  const entry = await withTransaction(async (client) => {
    const result = await client.query<CalendarRow>(
      `INSERT INTO academic_calendar
         (period_start, period_end, calendar_type, description, regular_classes_enabled,
          source_or_authority, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, period_start, period_end, calendar_type, description,
                 regular_classes_enabled, source_or_authority, updated_at,
                 NULL::text AS updated_by_name`,
      [
        input.periodStart,
        input.periodEnd,
        input.calendarType,
        input.description.trim(),
        input.regularClassesEnabled,
        input.sourceOrAuthority.trim(),
        actor.id,
      ],
    );
    await recomputeOpenDeadlines(client);
    await writeAudit(client, {
      actorId: actor.id,
      actorLabel: actor.fullName,
      action: "calendar.created",
      entityType: "academic_calendar",
      entityId: result.rows[0].id,
      newState: input,
    });
    return mapEntry(result.rows[0]);
  });
  if (input.regularClassesEnabled) {
    await detectCalendarConflicts(input.periodStart, input.periodEnd);
  }
  return entry;
}

export async function updateCalendarEntry(
  id: string,
  input: CalendarInput,
  actor: SessionUser,
): Promise<CalendarEntry> {
  assertInput(input);
  const entry = await withTransaction(async (client) => {
    const before = await client.query<CalendarRow>(
      `SELECT c.*, NULL::text AS updated_by_name FROM academic_calendar c WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!before.rows[0]) throw new AppError("NOT_FOUND", "Entri kalender tidak ditemukan.");
    const result = await client.query<CalendarRow>(
      `UPDATE academic_calendar SET
         period_start = $2, period_end = $3, calendar_type = $4, description = $5,
         regular_classes_enabled = $6, source_or_authority = $7, updated_by = $8
       WHERE id = $1
       RETURNING id, period_start, period_end, calendar_type, description,
                 regular_classes_enabled, source_or_authority, updated_at`,
      [
        id,
        input.periodStart,
        input.periodEnd,
        input.calendarType,
        input.description.trim(),
        input.regularClassesEnabled,
        input.sourceOrAuthority.trim(),
        actor.id,
      ],
    );
    await recomputeOpenDeadlines(client);
    await writeAudit(client, {
      actorId: actor.id,
      actorLabel: actor.fullName,
      action: "calendar.updated",
      entityType: "academic_calendar",
      entityId: id,
      previousState: before.rows[0],
      newState: input,
    });
    return mapEntry({ ...result.rows[0], updated_by_name: actor.fullName });
  });
  if (input.regularClassesEnabled) {
    await detectCalendarConflicts(input.periodStart, input.periodEnd);
  }
  return entry;
}

export async function deleteCalendarEntry(id: string, actor: SessionUser): Promise<void> {
  const beforeEntry = await withTransaction(async (client) => {
    const before = await client.query("SELECT * FROM academic_calendar WHERE id = $1 FOR UPDATE", [id]);
    if (!before.rows[0]) throw new AppError("NOT_FOUND", "Entri kalender tidak ditemukan.");
    await client.query("DELETE FROM academic_calendar WHERE id = $1", [id]);
    await recomputeOpenDeadlines(client);
    await writeAudit(client, {
      actorId: actor.id,
      actorLabel: actor.fullName,
      action: "calendar.deleted",
      entityType: "academic_calendar",
      entityId: id,
      previousState: before.rows[0],
    });
    return before.rows[0] as { period_start: string; period_end: string; regular_classes_enabled: boolean };
  });
  if (!beforeEntry.regular_classes_enabled) {
    await detectCalendarConflicts(beforeEntry.period_start, beforeEntry.period_end);
  }
}

async function detectCalendarConflicts(periodStart: string, periodEnd: string): Promise<void> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM class_schedules
      WHERE effective_until >= $1::date AND effective_from <= $2::date`,
    [periodStart, periodEnd],
  );
  if (rows.length === 0) return;
  const conflicts = await detectConflictsForSchedules(rows.map((row) => row.id));
  await notifyPostApprovalConflicts(conflicts);
  await markConflictsNotified(conflicts.map((conflict) => conflict.bookingId));
}

export async function findCalendarEntryForDate(dateKey: string, client?: PoolClient) {
  const sql = `SELECT * FROM academic_calendar
                WHERE period_start <= $1::date AND period_end >= $1::date
                ORDER BY period_start DESC`;
  const rows = client ? (await client.query(sql, [dateKey])).rows : await query(sql, [dateKey]);
  return rows as Array<{
    id: string;
    calendar_type: CalendarType;
    description: string;
    regular_classes_enabled: boolean;
  }>;
}

export async function getCalendarEntry(id: string): Promise<CalendarEntry | null> {
  const row = await queryOne<CalendarRow>(
    `SELECT c.id, c.period_start, c.period_end, c.calendar_type, c.description,
            c.regular_classes_enabled, c.source_or_authority, c.updated_at,
            u.full_name AS updated_by_name
       FROM academic_calendar c
       LEFT JOIN users u ON u.id = c.updated_by
      WHERE c.id = $1`,
    [id],
  );
  return row ? mapEntry(row) : null;
}
