import { cache } from "react";
import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "./db";
import {
  addOperationalMinutes,
  addDaysToDateKey,
  dateKeyInTimezone,
  normalizeTime,
  validateClockConfig,
  type ClockConfig,
  type DayException,
  type OpsSettings,
  type RevisionHoldPolicy,
} from "./operational-clock";
import { AppError } from "./errors";
import { writeAudit } from "./audit";
import type { SessionUser } from "./types";

type SettingsRow = {
  timezone: string;
  workdays: number[];
  open_time: string;
  close_time: string;
  decision_target_minutes: number;
  hold_limit_minutes: number;
  revision_hold_policy: RevisionHoldPolicy;
  revision_hold_minutes: number | null;
  booking_buffer_minutes: number;
  schedule_freshness_days: number;
  require_fresh_schedule: boolean;
  require_org_position: boolean;
  allow_demo_room_data: boolean;
  notification_channels: string[];
  memo_template_kind: "demo" | "official";
  memo_official_template_path: string | null;
  memo_document_prefix: string;
  data_retention_days: number | null;
  is_confirmed: boolean;
  confirmed_at: Date | null;
  updated_at: Date;
};

export type OperationalSettings = OpsSettings & {
  notificationChannels: string[];
  memoTemplateKind: "demo" | "official";
  memoOfficialTemplatePath: string | null;
  memoDocumentPrefix: string;
  dataRetentionDays: number | null;
  confirmedAt: Date | null;
  updatedAt: Date;
};

function mapSettings(row: SettingsRow): OperationalSettings {
  return {
    timezone: row.timezone,
    workdays: row.workdays.map(Number),
    openTime: normalizeTime(row.open_time),
    closeTime: normalizeTime(row.close_time),
    decisionTargetMinutes: row.decision_target_minutes,
    holdLimitMinutes: row.hold_limit_minutes,
    revisionHoldPolicy: row.revision_hold_policy,
    revisionHoldMinutes: row.revision_hold_minutes,
    bookingBufferMinutes: row.booking_buffer_minutes,
    scheduleFreshnessDays: row.schedule_freshness_days,
    requireFreshSchedule: row.require_fresh_schedule,
    requireOrgPosition: row.require_org_position,
    allowDemoRoomData: row.allow_demo_room_data,
    notificationChannels: row.notification_channels,
    memoTemplateKind: row.memo_template_kind,
    memoOfficialTemplatePath: row.memo_official_template_path,
    memoDocumentPrefix: row.memo_document_prefix,
    dataRetentionDays: row.data_retention_days,
    isConfirmed: row.is_confirmed,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
  };
}

const getSettingsCached = cache(async (): Promise<OperationalSettings> => {
  const row = await queryOne<SettingsRow>("SELECT * FROM operational_settings WHERE id = 1");
  if (!row) throw new Error("Konfigurasi operasional belum tersedia.");
  return mapSettings(row);
});

export async function getSettings(client?: Pick<PoolClient, "query">): Promise<OperationalSettings> {
  const sql = `SELECT * FROM operational_settings WHERE id = 1`;
  if (client) {
    const result = await client.query<SettingsRow>(sql);
    if (!result.rows[0]) throw new Error("Konfigurasi operasional belum tersedia.");
    return mapSettings(result.rows[0]);
  }
  return getSettingsCached();
}

export async function getClockConfig(
  client?: Pick<PoolClient, "query">,
  now: Date = new Date(),
): Promise<ClockConfig> {
  const settings = await getSettings(client);
  const fromDate = addDaysToDateKey(dateKeyInTimezone(now, settings.timezone), -400);
  const toDate = addDaysToDateKey(dateKeyInTimezone(now, settings.timezone), 400);

  const holidaySql = `
    SELECT DISTINCT d::date::text AS date
      FROM academic_calendar c,
           LATERAL generate_series(c.period_start, c.period_end, interval '1 day') d
     WHERE c.regular_classes_enabled = false
       AND c.calendar_type IN ('holiday', 'break', 'exception')
       AND c.period_end >= $1::date
       AND c.period_start <= $2::date
  `;
  const exceptionSql = `
    SELECT exception_date::text AS date, is_closed, open_time, close_time, description
      FROM operational_exceptions
     WHERE exception_date >= $1::date AND exception_date <= $2::date
  `;

  let holidayRows: Array<{ date: string }>;
  let exceptionRows: Array<{
    date: string;
    is_closed: boolean;
    open_time: string | null;
    close_time: string | null;
    description: string;
  }>;

  if (client) {
    holidayRows = (await client.query(holidaySql, [fromDate, toDate])).rows;
    exceptionRows = (await client.query(exceptionSql, [fromDate, toDate])).rows;
  } else {
    [holidayRows, exceptionRows] = await Promise.all([
      query<{ date: string }>(holidaySql, [fromDate, toDate]),
      query<{
        date: string;
        is_closed: boolean;
        open_time: string | null;
        close_time: string | null;
        description: string;
      }>(exceptionSql, [fromDate, toDate]),
    ]);
  }

  const exceptions = new Map<string, DayException>();
  for (const row of exceptionRows) {
    exceptions.set(row.date, {
      isClosed: row.is_closed,
      openTime: row.open_time ? normalizeTime(row.open_time) : null,
      closeTime: row.close_time ? normalizeTime(row.close_time) : null,
      description: row.description,
    });
  }

  const config: ClockConfig = {
    settings,
    holidays: new Set(holidayRows.map((row) => row.date)),
    exceptions,
  };
  validateClockConfig(config);
  return config;
}

/**
 * Recomputes decision/hold deadlines for open requests using the latest
 * operational calendar. Existing revision holds are only released, never
 * re-acquired implicitly, because another booking may already own the slot.
 */
export async function recomputeOpenDeadlines(client: PoolClient): Promise<void> {
  const config = await getClockConfig(client);
  const held = await client.query<{
    id: string;
    submitted_at: Date;
    status: string;
    slot_held: boolean;
  }>(
    `SELECT id, submitted_at, status, slot_held
       FROM booking_requests
      WHERE status IN ('pending_academic', 'revision_requested')
      FOR UPDATE`,
  );

  for (const row of held.rows) {
    const target = addOperationalMinutes(
      row.submitted_at,
      config.settings.decisionTargetMinutes,
      config,
    );
    const holdExpires = addOperationalMinutes(
      row.submitted_at,
      config.settings.holdLimitMinutes,
      config,
    );
    const shouldHoldRevision =
      row.status === "revision_requested" && config.settings.revisionHoldPolicy === "hold_limited";
    const slotHeld =
      row.status === "pending_academic" ? true : shouldHoldRevision ? row.slot_held : false;
    await client.query(
      `UPDATE booking_requests
          SET decision_target_at = $2, hold_expires_at = $3, slot_held = $4
        WHERE id = $1`,
      [row.id, target, holdExpires, slotHeld],
    );
  }
}

export type UpdateSettingsInput = {
  timezone: string;
  workdays: number[];
  openTime: string;
  closeTime: string;
  decisionTargetMinutes: number;
  holdLimitMinutes: number;
  revisionHoldPolicy: RevisionHoldPolicy;
  revisionHoldMinutes: number | null;
  bookingBufferMinutes: number;
  scheduleFreshnessDays: number;
  requireFreshSchedule: boolean;
  requireOrgPosition: boolean;
  allowDemoRoomData: boolean;
  memoDocumentPrefix: string;
  memoTemplateKind: "demo" | "official";
  memoOfficialTemplatePath: string | null;
  dataRetentionDays: number | null;
  confirmConfiguration: boolean;
};

export async function updateSettings(
  input: UpdateSettingsInput,
  actor: SessionUser,
): Promise<OperationalSettings> {
  const workdays = [...new Set(input.workdays.map(Number))].sort((a, b) => a - b);
  const configCheck: ClockConfig = {
    settings: {
      timezone: input.timezone,
      workdays,
      openTime: normalizeTime(input.openTime),
      closeTime: normalizeTime(input.closeTime),
      decisionTargetMinutes: input.decisionTargetMinutes,
      holdLimitMinutes: input.holdLimitMinutes,
      revisionHoldPolicy: input.revisionHoldPolicy,
      revisionHoldMinutes: input.revisionHoldMinutes,
      bookingBufferMinutes: input.bookingBufferMinutes,
      scheduleFreshnessDays: input.scheduleFreshnessDays,
      requireFreshSchedule: input.requireFreshSchedule,
      requireOrgPosition: input.requireOrgPosition,
      allowDemoRoomData: input.allowDemoRoomData,
      isConfirmed: input.confirmConfiguration,
    },
    holidays: new Set(),
    exceptions: new Map(),
  };
  validateClockConfig(configCheck);
  if (input.revisionHoldPolicy === "hold_limited" && !input.revisionHoldMinutes) {
    throw new AppError("BUSINESS_RULE", "Durasi penahanan revisi wajib diisi bila kebijakan menahan slot dipilih.");
  }
  if (input.bookingBufferMinutes < 0 || input.decisionTargetMinutes <= 0 || input.holdLimitMinutes <= 0) {
    throw new AppError("VALIDATION_ERROR", "Nilai konfigurasi durasi tidak valid.");
  }

  return withTransaction(async (client) => {
    const before = await getSettings(client);
    const update = await client.query<SettingsRow>(
      `UPDATE operational_settings SET
         timezone = $1,
         workdays = $2,
         open_time = $3::time,
         close_time = $4::time,
         decision_target_minutes = $5,
         hold_limit_minutes = $6,
         revision_hold_policy = $7,
         revision_hold_minutes = $8,
         booking_buffer_minutes = $9,
         schedule_freshness_days = $10,
         require_fresh_schedule = $11,
         require_org_position = $12,
         allow_demo_room_data = $13,
         memo_document_prefix = $14,
         memo_template_kind = $15,
         memo_official_template_path = $16,
         data_retention_days = $17,
         is_confirmed = $18,
         confirmed_by = CASE WHEN $18 THEN $19::uuid ELSE NULL END,
         confirmed_at = CASE WHEN $18 THEN now() ELSE NULL END,
         updated_by = $19
       WHERE id = 1
       RETURNING *`,
      [
        input.timezone,
        workdays,
        normalizeTime(input.openTime),
        normalizeTime(input.closeTime),
        input.decisionTargetMinutes,
        input.holdLimitMinutes,
        input.revisionHoldPolicy,
        input.revisionHoldPolicy === "hold_limited" ? input.revisionHoldMinutes : null,
        input.bookingBufferMinutes,
        input.scheduleFreshnessDays,
        input.requireFreshSchedule,
        input.requireOrgPosition,
        input.allowDemoRoomData,
        input.memoDocumentPrefix.trim() || "DEMO",
        input.memoTemplateKind,
        input.memoOfficialTemplatePath?.trim() || null,
        input.dataRetentionDays,
        input.confirmConfiguration,
        actor.id,
      ],
    );

    await recomputeOpenDeadlines(client);

    await writeAudit(client, {
      actorId: actor.id,
      actorLabel: actor.fullName,
      action: "settings.updated",
      entityType: "operational_settings",
      entityId: null,
      previousState: before,
      newState: input,
      reason: "Perubahan konfigurasi operasional",
    });

    const updated = update.rows[0];
    if (!updated) throw new Error("Gagal menyimpan konfigurasi operasional.");
    return mapSettings(updated);
  });
}
