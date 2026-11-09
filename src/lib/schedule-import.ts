import ExcelJS from "exceljs";
import type { PoolClient } from "pg";
import { query, withTransaction } from "./db";
import { AppError } from "./errors";
import { writeAudit } from "./audit";
import { getClockConfig, getSettings } from "./settings";
import { dateKeyInTimezone, isValidTimeKey, normalizeTime, timeKeyInTimezone } from "./operational-clock";
import { markConflictsNotified, notifyPostApprovalConflicts, recordPostApprovalConflicts } from "./conflicts";
import type { SessionUser } from "./types";

export type ParsedScheduleRow = {
  rowNumber: number;
  roomCode: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveUntil: string;
  semesterLabel: string;
  courseName: string | null;
};

export type RowIssue = {
  rowNumber: number;
  roomCode: string;
  errors: string[];
};

export type ImportPreview = {
  filename: string;
  totalRows: number;
  validRows: ParsedScheduleRow[];
  issues: RowIssue[];
  missingHeaders: string[];
};

export type ImportCommitResult = {
  importId: string;
  status: "success" | "partial" | "failed";
  totalRows: number;
  successRows: number;
  failedRows: number;
  issues: RowIssue[];
  conflictsDetected: number;
};

const HEADER_ALIASES: Record<string, string> = {
  room_code: "room_code",
  kode_ruangan: "room_code",
  kode_room: "room_code",
  ruangan: "room_code",
  room: "room_code",
  day_of_week: "day_of_week",
  hari: "day_of_week",
  hari_minggu: "day_of_week",
  start_time: "start_time",
  jam_mulai: "start_time",
  mulai: "start_time",
  end_time: "end_time",
  jam_selesai: "end_time",
  selesai: "end_time",
  effective_from: "effective_from",
  mulai_berlaku: "effective_from",
  tanggal_mulai: "effective_from",
  effective_until: "effective_until",
  sampai_berlaku: "effective_until",
  tanggal_selesai: "effective_until",
  semester_label: "semester_label",
  semester: "semester_label",
  course_name: "course_name",
  mata_kuliah: "course_name",
  matakuliah: "course_name",
};

const MAX_IMPORT_ROWS = 5_000;

const REQUIRED_HEADERS = [
  "room_code",
  "day_of_week",
  "start_time",
  "end_time",
  "effective_from",
  "effective_until",
  "semester_label",
];

const DAY_NAMES: Record<string, number> = {
  "1": 1,
  senin: 1,
  monday: 1,
  "2": 2,
  selasa: 2,
  tuesday: 2,
  "3": 3,
  rabu: 3,
  wednesday: 3,
  "4": 4,
  kamis: 4,
  thursday: 4,
  "5": 5,
  jumat: 5,
  friday: 5,
  "6": 6,
  sabtu: 6,
  saturday: 6,
  "7": 7,
  minggu: 7,
  sunday: 7,
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // ignore, handled by \n
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => value.trim() !== ""));
}

function excelValueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const candidate = value as {
      text?: string;
      result?: unknown;
      richText?: Array<{ text?: string }>;
      hyperlink?: string;
    };
    if (typeof candidate.text === "string") return candidate.text;
    if (candidate.result !== undefined) return excelValueToText(candidate.result);
    if (Array.isArray(candidate.richText)) {
      return candidate.richText.map((part) => part.text ?? "").join("");
    }
    if (candidate.hyperlink) return candidate.hyperlink;
  }
  return String(value);
}

function excelTimeToText(value: unknown): string {
  if (value instanceof Date) {
    const hours = String(value.getUTCHours()).padStart(2, "0");
    const minutes = String(value.getUTCMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  if (typeof value === "number") {
    const totalMinutes = Math.round((value % 1) * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  return excelValueToText(value);
}

function excelDateToText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = excelValueToText(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const ymd = /^(\d{4})[/](\d{1,2})[/](\d{1,2})$/.exec(text);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  return text;
}

function parseTimeCell(value: unknown): string {
  const text = excelTimeToText(value).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
    try {
      return normalizeTime(text);
    } catch {
      return text;
    }
  }
  return text;
}

export async function readScheduleFile(
  filename: string,
  buffer: Buffer,
): Promise<{ headers: string[]; records: Array<{ rowNumber: number; values: Record<string, unknown> }> }> {
  const lower = filename.toLowerCase();
  let matrix: unknown[][] = [];
  if (lower.endsWith(".csv")) {
    matrix = parseCsv(buffer.toString("utf8")) as unknown[][];
  } else if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new AppError("VALIDATION_ERROR", "File Excel tidak memiliki worksheet.");
    if (sheet.rowCount > MAX_IMPORT_ROWS + 1) {
      throw new AppError(
        "VALIDATION_ERROR",
        `File memiliki ${sheet.rowCount} baris; batas impor ${MAX_IMPORT_ROWS} baris.`,
      );
    }
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: unknown[] = [];
      for (let i = 1; i <= row.cellCount; i += 1) {
        values.push(row.getCell(i).value);
      }
      matrix.push(values);
    });
  } else if (lower.endsWith(".xls")) {
    throw new AppError("VALIDATION_ERROR", "Format .xls lama tidak didukung. Simpan ulang sebagai .xlsx atau .csv.");
  } else {
    throw new AppError("VALIDATION_ERROR", "Format file harus .csv atau .xlsx.");
  }

  if (matrix.length === 0) throw new AppError("VALIDATION_ERROR", "File jadwal kosong.");
  if (matrix.length > MAX_IMPORT_ROWS + 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      `File memiliki ${matrix.length - 1} baris data; batas impor ${MAX_IMPORT_ROWS} baris.`,
    );
  }

  const headerRow = matrix[0].map((cell) => normalizeHeader(excelValueToText(cell)));
  const mappedHeaders = headerRow.map((header) => HEADER_ALIASES[header] ?? header);
  const records: Array<{ rowNumber: number; values: Record<string, unknown> }> = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    if (!row || row.every((cell) => excelValueToText(cell).trim() === "")) continue;
    const values: Record<string, unknown> = {};
    mappedHeaders.forEach((header, columnIndex) => {
      if (header) values[header] = row[columnIndex];
    });
    records.push({ rowNumber: index + 1, values });
  }
  return { headers: mappedHeaders.filter(Boolean), records };
}

async function resolveRooms(codes: string[]): Promise<Record<string, { id: string; name: string }>> {
  const unique = [...new Set(codes.filter(Boolean))];
  if (unique.length === 0) return {};
  const rows = await query<{ id: string; code: string; name: string }>(
    "SELECT id, code, name FROM rooms WHERE upper(code) = ANY($1::text[])",
    [unique.map((code) => code.toUpperCase())],
  );
  const map: Record<string, { id: string; name: string }> = {};
  for (const row of rows) map[row.code.toUpperCase()] = { id: row.id, name: row.name };
  return map;
}

export async function previewScheduleImport(
  filename: string,
  buffer: Buffer,
): Promise<ImportPreview & { parsed: Array<ParsedScheduleRow & { roomId: string }> }> {
  const { headers, records } = await readScheduleFile(filename, buffer);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new AppError("VALIDATION_ERROR", `Kolom wajib tidak ditemukan: ${missingHeaders.join(", ")}.`, {
      missingHeaders,
    });
  }

  const issues: RowIssue[] = [];
  const candidates: ParsedScheduleRow[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    const errors: string[] = [];
    const roomCode = excelValueToText(record.values.room_code).trim().toUpperCase();
    const dayText = excelValueToText(record.values.day_of_week).trim().toLowerCase();
    const dayOfWeek = DAY_NAMES[dayText];
    const startTime = parseTimeCell(record.values.start_time);
    const endTime = parseTimeCell(record.values.end_time);
    const effectiveFrom = excelDateToText(record.values.effective_from);
    const effectiveUntil = excelDateToText(record.values.effective_until);
    const semesterLabel = excelValueToText(record.values.semester_label).trim();
    const courseName = excelValueToText(record.values.course_name).trim() || null;

    if (!roomCode) errors.push("Kode ruangan wajib diisi.");
    if (!dayOfWeek) errors.push("Hari tidak dikenali (gunakan 1-7 atau nama hari).");
    if (!isValidTimeKey(startTime)) errors.push("Jam mulai tidak valid (format HH:MM).");
    if (!isValidTimeKey(endTime)) errors.push("Jam selesai tidak valid (format HH:MM).");
    if (isValidTimeKey(startTime) && isValidTimeKey(endTime) && endTime <= startTime) {
      errors.push("Jam selesai harus setelah jam mulai.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) errors.push("Tanggal mulai berlaku tidak valid (YYYY-MM-DD).");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveUntil)) errors.push("Tanggal selesai berlaku tidak valid (YYYY-MM-DD).");
    if (/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) && /^\d{4}-\d{2}-\d{2}$/.test(effectiveUntil) && effectiveUntil < effectiveFrom) {
      errors.push("Tanggal selesai berlaku harus setelah tanggal mulai.");
    }
    if (!semesterLabel) errors.push("Label semester wajib diisi.");

    if (errors.length > 0) {
      issues.push({ rowNumber: record.rowNumber, roomCode, errors });
      continue;
    }

    const signature = [roomCode, dayOfWeek, startTime, endTime, effectiveFrom, effectiveUntil, semesterLabel].join("|");
    if (seen.has(signature)) {
      issues.push({ rowNumber: record.rowNumber, roomCode, errors: ["Duplikat di dalam file impor."] });
      continue;
    }
    seen.add(signature);

    candidates.push({
      rowNumber: record.rowNumber,
      roomCode,
      dayOfWeek,
      startTime,
      endTime,
      effectiveFrom,
      effectiveUntil,
      semesterLabel,
      courseName,
    });
  }

  const rooms = await resolveRooms(candidates.map((row) => row.roomCode));
  const parsed: Array<ParsedScheduleRow & { roomId: string }> = [];
  for (const row of candidates) {
    const room = rooms[row.roomCode];
    if (!room) {
      issues.push({ rowNumber: row.rowNumber, roomCode: row.roomCode, errors: ["Ruangan tidak ditemukan."] });
      continue;
    }
    const duplicate = await query<{ id: string }>(
      `SELECT id FROM class_schedules
        WHERE room_id = $1 AND day_of_week = $2 AND start_time = $3::time AND end_time = $4::time
          AND effective_from = $5::date AND effective_until = $6::date AND semester_label = $7
        LIMIT 1`,
      [room.id, row.dayOfWeek, row.startTime, row.endTime, row.effectiveFrom, row.effectiveUntil, row.semesterLabel],
    );
    if (duplicate[0]) {
      issues.push({ rowNumber: row.rowNumber, roomCode: row.roomCode, errors: ["Jadwal yang sama sudah ada di database."] });
      continue;
    }
    parsed.push({ ...row, roomId: room.id });
  }

  issues.sort((a, b) => a.rowNumber - b.rowNumber);
  return {
    filename,
    totalRows: records.length,
    validRows: parsed,
    issues,
    missingHeaders: [],
    parsed,
  };
}

export async function commitScheduleImport(
  input: {
    filename: string;
    buffer: Buffer;
    source: string;
    sourceVersion: string;
    strict: boolean;
  },
  actor: SessionUser,
): Promise<ImportCommitResult> {
  const preview = await previewScheduleImport(input.filename, input.buffer);
  if (input.strict && preview.issues.length > 0) {
    throw new AppError("BUSINESS_RULE", "Impor dibatalkan karena terdapat baris tidak valid (mode ketat).", {
      issues: preview.issues,
    });
  }
  if (preview.parsed.length === 0) {
    const result = await withTransaction(async (client) => {
      const row = await createImportRecord(client, {
        filename: input.filename,
        source: input.source,
        sourceVersion: input.sourceVersion,
        actorId: actor.id,
        status: "failed",
        totalRows: preview.totalRows,
        successRows: 0,
        failedRows: preview.totalRows,
        details: preview.issues,
      });
      await writeAudit(client, {
        actorId: actor.id,
        actorLabel: actor.fullName,
        action: "schedule.import_failed",
        entityType: "schedule_import",
        entityId: row.id,
        newState: { ...input, buffer: undefined },
        reason: "Tidak ada baris valid.",
      });
      return row.id;
    });
    return {
      importId: result,
      status: "failed",
      totalRows: preview.totalRows,
      successRows: 0,
      failedRows: preview.totalRows,
      issues: preview.issues,
      conflictsDetected: 0,
    };
  }

  const outcome = await withTransaction(async (client) => {
    const status: "partial" | "success" = preview.issues.length > 0 ? "partial" : "success";
    const record = await createImportRecord(client, {
      filename: input.filename,
      source: input.source,
      sourceVersion: input.sourceVersion,
      actorId: actor.id,
      status,
      totalRows: preview.totalRows,
      successRows: preview.parsed.length,
      failedRows: preview.issues.length,
      details: preview.issues,
    });

    const insertedIds: string[] = [];
    for (const row of preview.parsed) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO class_schedules
           (room_id, day_of_week, start_time, end_time, effective_from, effective_until,
            semester_label, course_name, source_version, import_id, last_imported_at)
         VALUES ($1,$2,$3::time,$4::time,$5::date,$6::date,$7,$8,$9,$10,now())
         RETURNING id`,
        [
          row.roomId,
          row.dayOfWeek,
          row.startTime,
          row.endTime,
          row.effectiveFrom,
          row.effectiveUntil,
          row.semesterLabel,
          row.courseName,
          input.sourceVersion,
          record.id,
        ],
      );
      insertedIds.push(inserted.rows[0].id);
    }

    await writeAudit(client, {
      actorId: actor.id,
      actorLabel: actor.fullName,
      action: "schedule.imported",
      entityType: "schedule_import",
      entityId: record.id,
      newState: {
        filename: input.filename,
        source: input.source,
        sourceVersion: input.sourceVersion,
        successRows: preview.parsed.length,
        failedRows: preview.issues.length,
      },
      reason: "Impor jadwal perkuliahan",
    });

    return { importId: record.id, status, insertedIds };
  });

  const conflicts = await detectConflictsForSchedules(outcome.insertedIds);
  await notifyPostApprovalConflicts(conflicts);
  await markConflictsNotified(conflicts.map((conflict) => conflict.bookingId));

  return {
    importId: outcome.importId,
    status: outcome.status,
    totalRows: preview.totalRows,
    successRows: preview.parsed.length,
    failedRows: preview.issues.length,
    issues: preview.issues,
    conflictsDetected: conflicts.length,
  };
}

async function createImportRecord(
  client: PoolClient,
  input: {
    filename: string;
    source: string;
    sourceVersion: string;
    actorId: string;
    status: "success" | "partial" | "failed";
    totalRows: number;
    successRows: number;
    failedRows: number;
    details: RowIssue[];
  },
): Promise<{ id: string }> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO schedule_imports
       (filename, source, source_version, imported_by, status, total_rows, success_rows, failed_rows, details, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     RETURNING id`,
    [
      input.filename,
      input.source,
      input.sourceVersion,
      input.actorId,
      input.status,
      input.totalRows,
      input.successRows,
      input.failedRows,
      JSON.stringify(input.details.slice(0, 500)),
    ],
  );
  return result.rows[0];
}

export async function detectConflictsForSchedules(scheduleIds: string[]) {
  if (scheduleIds.length === 0) return [];
  const schedules = await query<{
    id: string;
    room_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    effective_from: string;
    effective_until: string;
  }>(
    `SELECT id, room_id, day_of_week, start_time, end_time, effective_from, effective_until
       FROM class_schedules WHERE id = ANY($1::uuid[])`,
    [scheduleIds],
  );
  const roomIds = [...new Set(schedules.map((row) => row.room_id))];
  if (roomIds.length === 0) return [];

  const settings = await getSettings();
  const config = await getClockConfig();
  const bookings = await query<{
    id: string;
    room_id: string;
    start_at: Date;
    end_at: Date;
    activity_name: string;
  }>(
    `SELECT id, room_id, start_at, end_at, activity_name
       FROM booking_requests
      WHERE room_id = ANY($1::uuid[])
        AND status IN ('approved', 'cancellation_requested')`,
    [roomIds],
  );

  const candidateIds = new Set<string>();
  for (const booking of bookings) {
    const localDate = dateKeyInTimezone(booking.start_at, settings.timezone);
    const dayOfWeek = isoDay(localDate);
    if (config.holidays.has(localDate)) continue;
    const startTime = timeKeyInTimezone(booking.start_at, settings.timezone);
    const endTime = timeKeyInTimezone(booking.end_at, settings.timezone);
    if (dateKeyInTimezone(booking.end_at, settings.timezone) !== localDate) continue;

    for (const schedule of schedules) {
      if (schedule.room_id !== booking.room_id) continue;
      if (schedule.day_of_week !== dayOfWeek) continue;
      if (localDate < schedule.effective_from || localDate > schedule.effective_until) continue;
      if (schedule.start_time.slice(0, 5) < endTime && schedule.end_time.slice(0, 5) > startTime) {
        candidateIds.add(booking.id);
        break;
      }
    }
  }

  if (candidateIds.size === 0) return [];
  return withTransaction(async (client) => {
    return recordPostApprovalConflicts(client, {
      candidateBookingIds: [...candidateIds],
      conflictType: "class_schedule",
      sourceEntityType: "schedule_import",
      sourceEntityId: scheduleIds[0] ?? null,
      sourceChange: "Impor/perubahan jadwal perkuliahan resmi",
      details: { scheduleIds },
    });
  });
}

function isoDay(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayOfWeek === 0 ? 7 : dayOfWeek;
}

export async function getScheduleFreshness(
  client?: Pick<PoolClient, "query">,
): Promise<{
  lastImportAt: Date | null;
  daysSince: number | null;
  isStale: boolean;
  freshnessDays: number;
}> {
  const settings = await getSettings(client);
  const sql = `SELECT max(completed_at) AS last_import_at
                 FROM schedule_imports
                WHERE status IN ('success', 'partial')`;
  const rows = client
    ? (await client.query<{ last_import_at: Date | null }>(sql)).rows
    : await query<{ last_import_at: Date | null }>(sql);
  const lastImportAt = rows[0]?.last_import_at ?? null;
  if (!lastImportAt) {
    return {
      lastImportAt: null,
      daysSince: null,
      isStale: true,
      freshnessDays: settings.scheduleFreshnessDays,
    };
  }
  const daysSince = Math.floor((Date.now() - lastImportAt.getTime()) / (24 * 60 * 60 * 1000));
  return {
    lastImportAt,
    daysSince,
    isStale: daysSince > settings.scheduleFreshnessDays,
    freshnessDays: settings.scheduleFreshnessDays,
  };
}

export async function listImportHistory(limit = 50) {
  return query<{
    id: string;
    filename: string;
    source: string;
    source_version: string;
    status: string;
    total_rows: number;
    success_rows: number;
    failed_rows: number;
    created_at: Date;
    completed_at: Date | null;
    imported_by_name: string | null;
  }>(
    `SELECT i.id, i.filename, i.source, i.source_version, i.status, i.total_rows,
            i.success_rows, i.failed_rows, i.created_at, i.completed_at,
            u.full_name AS imported_by_name
       FROM schedule_imports i
       LEFT JOIN users u ON u.id = i.imported_by
      ORDER BY i.created_at DESC
      LIMIT $1`,
    [limit],
  );
}

export async function listClassSchedules(roomId?: string, limit = 200) {
  const params: unknown[] = [];
  let where = "";
  if (roomId) {
    params.push(roomId);
    where = "WHERE s.room_id = $1";
  }
  params.push(limit);
  return query<{
    id: string;
    room_id: string;
    room_code: string;
    room_name: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    effective_from: string;
    effective_until: string;
    semester_label: string;
    course_name: string | null;
    source_version: string;
    last_imported_at: Date;
    import_id: string | null;
  }>(
    `SELECT s.*, r.code AS room_code, r.name AS room_name
       FROM class_schedules s
       JOIN rooms r ON r.id = s.room_id
       ${where}
      ORDER BY s.day_of_week, s.start_time
      LIMIT $${params.length}`,
    params,
  );
}
