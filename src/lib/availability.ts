import type { PoolClient } from "pg";
import { query } from "./db";
import { getClockConfig } from "./settings";
import { getScheduleFreshness } from "./schedule-import";
import { getRoomById } from "./rooms";
import {
  addDaysToDateKey,
  combineDateAndTime,
  dateKeyInTimezone,
} from "./operational-clock";
import { AppError } from "./errors";
import { evaluateCapacity } from "./capacity";
import type {
  AvailabilityBlockReason,
  AvailabilityCode,
  AvailabilityResult,
  CapacityAssessment,
  Room,
} from "./types";

const LABELS: Record<AvailabilityCode, string> = {
  available: "Tersedia menurut jadwal",
  room_inactive: "Ruangan tidak aktif",
  capacity_unverified: "Kapasitas belum terverifikasi",
  capacity_insufficient: "Kapasitas melebihi batas 120%",
  facilities_unverified: "Fasilitas belum terverifikasi",
  facilities_missing: "Fasilitas tidak lengkap",
  class_conflict: "Terjadwal untuk perkuliahan",
  booking_conflict: "Sudah dibooking / slot ditahan",
  restriction: "Tidak tersedia: penutupan/pemeliharaan",
  data_stale: "Data jadwal perlu diperbarui",
};

function result(
  room: Room,
  code: AvailabilityCode,
  reasons: string[],
  lastScheduleUpdateAt: Date | null,
  blockReason: AvailabilityBlockReason | null = null,
  capacity: CapacityAssessment | null = null,
): AvailabilityResult {
  return {
    available: code === "available",
    code,
    label: LABELS[code],
    reasons,
    blockReason,
    capacity,
    lastScheduleUpdateAt,
    room,
  };
}

function formatLocal(timestamp: Date, timezone: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export type AvailabilityInput = {
  roomId: string;
  startAt: Date;
  endAt: Date;
  participantCount?: number;
  requiredFacilities?: string[];
  excludeBookingId?: string;
  now?: Date;
};

/** Availability checks for new requests must never accept a start time in the past. */
export function assertStartNotPast(startAt: Date, now: Date = new Date()): void {
  if (startAt.getTime() < now.getTime()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Tanggal dan waktu mulai tidak boleh di masa lalu. Pilih waktu setelah sekarang.",
    );
  }
}

export async function checkRoomAvailability(
  input: AvailabilityInput,
  client?: Pick<PoolClient, "query">,
): Promise<AvailabilityResult> {
  const room = await getRoomById(input.roomId, true, client);
  if (!room) throw new AppError("NOT_FOUND", "Ruangan tidak ditemukan.");
  if (input.endAt <= input.startAt) {
    throw new AppError("VALIDATION_ERROR", "Waktu selesai harus setelah waktu mulai.");
  }

  const config = await getClockConfig(client, input.now ?? new Date());
  const freshness = await getScheduleFreshness(client);
  const timezone = config.settings.timezone;

  if (!room.isActive) {
    return result(
      room,
      "room_inactive",
      [room.statusNote ? `Ruangan dinonaktifkan: ${room.statusNote}` : "Ruangan dinonaktifkan."],
      freshness.lastImportAt,
      "room_inactive",
    );
  }

  const demoUsable = config.settings.allowDemoRoomData && room.isDemoData;
  const capacity =
    input.participantCount !== undefined
      ? evaluateCapacity({
          participantCount: input.participantCount,
          capacity: room.capacity,
          capacityVerified: room.capacityVerified,
          allowDemoRoomData: config.settings.allowDemoRoomData,
          isDemoData: room.isDemoData,
        })
      : null;

  if (capacity && !capacity.allowed) {
    return result(
      room,
      capacity.status === "rejected" ? "capacity_insufficient" : "capacity_unverified",
      [capacity.reason ?? "Kapasitas ruangan tidak dapat divalidasi."],
      freshness.lastImportAt,
      "capacity",
      capacity,
    );
  }

  const capacityWarning =
    capacity?.status === "warning" && capacity.reason ? [capacity.reason] : [];

  const required = (input.requiredFacilities ?? []).filter(Boolean);
  if (required.length > 0) {
    if (!room.facilitiesVerified && !demoUsable) {
      return result(
        room,
        "facilities_unverified",
        ["Data fasilitas ruangan belum diverifikasi kampus sehingga kebutuhan fasilitas tidak dapat dipastikan."],
        freshness.lastImportAt,
        "facilities",
        capacity,
      );
    }
    const missing = required.filter((facility) => !room.facilities.includes(facility));
    if (missing.length > 0) {
      return result(
        room,
        "facilities_missing",
        [`Fasilitas tidak tersedia: ${missing.join(", ")}.`],
        freshness.lastImportAt,
        "facilities",
        capacity,
      );
    }
  }

  if (config.settings.requireFreshSchedule && freshness.isStale) {
    return result(
      room,
      "data_stale",
      [
        freshness.lastImportAt
          ? `Data jadwal terakhir diperbarui ${freshness.daysSince} hari lalu; kebijakan kesegaran data ${freshness.freshnessDays} hari.`
          : "Belum ada impor jadwal yang tercatat. Data jadwal dianggap belum lengkap.",
      ],
      freshness.lastImportAt,
      "data_stale",
      capacity,
    );
  }

  const restrictionSql = `SELECT id, restriction_type
       FROM room_restrictions
      WHERE room_id = $1
        AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)')
      LIMIT 1`;
  const restrictions = client
    ? (await client.query<{ id: string; restriction_type: string }>(restrictionSql, [
        room.id,
        input.startAt,
        input.endAt,
      ])).rows
    : await query<{ id: string; restriction_type: string }>(restrictionSql, [
        room.id,
        input.startAt,
        input.endAt,
      ]);
  if (restrictions[0]) {
    return result(
      room,
      "restriction",
      [
        restrictions[0].restriction_type === "maintenance"
          ? "Ruangan sedang dalam pemeliharaan pada rentang waktu tersebut."
          : restrictions[0].restriction_type === "closure"
            ? "Ruangan ditutup pada rentang waktu tersebut."
            : "Ada pembatasan penggunaan ruangan pada rentang waktu tersebut.",
      ],
      freshness.lastImportAt,
      "restriction",
      capacity,
    );
  }

  const buffer = config.settings.bookingBufferMinutes;
  const conflictSql = `SELECT id, status
       FROM booking_requests
      WHERE room_id = $1
        AND slot_held = true
        AND ($4::uuid IS NULL OR id <> $4::uuid)
        AND start_at < ($3::timestamptz + make_interval(mins => $5::int))
        AND end_at > ($2::timestamptz - make_interval(mins => $5::int))
      LIMIT 5`;
  const conflictParams = [room.id, input.startAt, input.endAt, input.excludeBookingId ?? null, buffer];
  const conflicts = client
    ? (await client.query<{ id: string; status: string }>(conflictSql, conflictParams)).rows
    : await query<{ id: string; status: string }>(conflictSql, conflictParams);
  if (conflicts.length > 0) {
    const confirmed = conflicts.some((row) => row.status === "approved" || row.status === "cancellation_requested");
    return result(
      room,
      "booking_conflict",
      [
        confirmed
          ? "Sudah ada booking terkonfirmasi pada rentang waktu tersebut."
          : "Slot sedang ditahan oleh pengajuan lain yang menunggu keputusan Akademik.",
      ],
      freshness.lastImportAt,
      confirmed ? "booking_confirmed" : "slot_held",
      capacity,
    );
  }

  const classConflict = await findClassConflict(
    room.id,
    input.startAt,
    input.endAt,
    timezone,
    config.holidays,
    client,
  );
  if (classConflict) {
    return result(
      room,
      "class_conflict",
      [classConflict],
      freshness.lastImportAt,
      "class_schedule",
      capacity,
    );
  }

  return result(
    room,
    "available",
    [
      ...capacityWarning,
      "Tidak ditemukan konflik jadwal kuliah, booking aktif, atau pembatasan pada data yang tercatat.",
      ...(room.isDemoData
        ? ["Data kapasitas/fasilitas ruangan berstatus DEMO dan belum diverifikasi kampus."]
        : []),
      `Ketersediaan bersifat informatif per ${formatLocal(input.now ?? new Date(), timezone)}; server akan memeriksa ulang saat pengajuan dikirim.`,
    ],
    freshness.lastImportAt,
    null,
    capacity,
  );
}

async function findClassConflict(
  roomId: string,
  startAt: Date,
  endAt: Date,
  timezone: string,
  holidays: Set<string>,
  client?: Pick<PoolClient, "query">,
): Promise<string | null> {
  const startDate = dateKeyInTimezone(startAt, timezone);
  const endDate = dateKeyInTimezone(endAt, timezone);
  const scheduleSql = `SELECT day_of_week, start_time, end_time, effective_from, effective_until, course_name
       FROM class_schedules
      WHERE room_id = $1
        AND effective_until >= $2::date
        AND effective_from <= $3::date`;
  type ScheduleRow = {
    day_of_week: number;
    start_time: string;
    end_time: string;
    effective_from: string;
    effective_until: string;
    course_name: string | null;
  };
  const schedules = client
    ? (await client.query<ScheduleRow>(scheduleSql, [roomId, startDate, endDate])).rows
    : await query<ScheduleRow>(scheduleSql, [roomId, startDate, endDate]);
  if (schedules.length === 0) return null;

  let dateKey = startDate;
  let guard = 0;
  while (dateKey <= endDate && guard < 30) {
    if (!holidays.has(dateKey)) {
      const dayOfWeek = isoDay(dateKey);
      for (const schedule of schedules) {
        if (dayOfWeek !== schedule.day_of_week) continue;
        if (dateKey < schedule.effective_from || dateKey > schedule.effective_until) continue;
        const scheduleStart = combineDateAndTime(dateKey, schedule.start_time.slice(0, 5), timezone);
        const scheduleEnd = combineDateAndTime(dateKey, schedule.end_time.slice(0, 5), timezone);
        if (scheduleStart < endAt && scheduleEnd > startAt) {
          return `Terdapat perkuliahan${
            schedule.course_name ? ` (${schedule.course_name})` : ""
          } (pukul ${schedule.start_time.slice(0, 5)}–${schedule.end_time.slice(0, 5)}).`;
        }
      }
    }
    dateKey = addDaysToDateKey(dateKey, 1);
    guard += 1;
  }
  return null;
}

function isoDay(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayOfWeek === 0 ? 7 : dayOfWeek;
}
