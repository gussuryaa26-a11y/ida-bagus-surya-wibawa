import type { PoolClient } from "pg";
import { isExclusionViolation, isUniqueViolation, query, queryOne, withTransaction } from "./db";
import { AppError } from "./errors";
import { writeAudit } from "./audit";
import { getClockConfig, getSettings } from "./settings";
import { checkRoomAvailability } from "./availability";
import { GENERAL_BOOKING_HOURS, validateGeneralBookingHours } from "./booking-hours";
import { formatCapacityPercentage } from "./capacity";
import { addOperationalMinutes, combineDateAndTime } from "./operational-clock";
import { getAcademicRecipientIds, sendNotifications } from "./notifications";
import {
  ACTIVITY_TYPES,
  FACILITIES,
  type ActivityType,
  type BookingStatus,
  type BookingWithRelations,
  type SessionUser,
} from "./types";

type BookingJoinRow = {
  id: string;
  requester_id: string;
  organization_id: string;
  org_position_snapshot: string | null;
  activity_name: string;
  activity_purpose: string;
  activity_type: string;
  participant_count: number;
  capacity_percentage_snapshot: string | number | null;
  capacity_review_required: boolean;
  required_facilities: string[];
  room_id: string;
  start_at: Date;
  end_at: Date;
  status: BookingStatus;
  slot_held: boolean;
  submitted_at: Date;
  decision_target_at: Date;
  hold_expires_at: Date;
  late_notified_at: Date | null;
  revision_deadline_at: Date | null;
  decision_by: string | null;
  decision_at: Date | null;
  decision_reason: string | null;
  cancelled_at: Date | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  idempotency_key: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  room_code: string;
  room_name: string;
  room_category: "classroom" | "multipurpose" | "hall";
  room_capacity: number | null;
  room_facilities: string[];
  requester_name: string;
  requester_login_id: string;
  requester_nim: string | null;
  requester_program_study: string | null;
  requester_phone: string | null;
  requester_email: string | null;
  organization_name: string;
  organization_name_snapshot: string;
  organization_code: string;
};

const BOOKING_SELECT = `
  SELECT b.*, r.code AS room_code, r.name AS room_name, r.category AS room_category,
         r.capacity AS room_capacity, r.facilities AS room_facilities,
         u.full_name AS requester_name, u.login_id AS requester_login_id, u.nim AS requester_nim,
         u.program_study AS requester_program_study, u.contact_phone AS requester_phone,
         u.contact_email AS requester_email,
         o.name AS organization_name, o.code AS organization_code
    FROM booking_requests b
    JOIN rooms r ON r.id = b.room_id
    JOIN users u ON u.id = b.requester_id
    JOIN organizations o ON o.id = b.organization_id
`;

export function mapBooking(row: BookingJoinRow): BookingWithRelations {
  return {
    id: row.id,
    requesterId: row.requester_id,
    organizationId: row.organization_id,
    orgPositionSnapshot: row.org_position_snapshot,
    activityName: row.activity_name,
    activityPurpose: row.activity_purpose,
    activityType: row.activity_type,
    participantCount: row.participant_count,
    capacityPercentageSnapshot:
      row.capacity_percentage_snapshot === null ? null : Number(row.capacity_percentage_snapshot),
    capacityReviewRequired: row.capacity_review_required,
    requiredFacilities: row.required_facilities,
    roomId: row.room_id,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    slotHeld: row.slot_held,
    submittedAt: row.submitted_at,
    decisionTargetAt: row.decision_target_at,
    holdExpiresAt: row.hold_expires_at,
    lateNotifiedAt: row.late_notified_at,
    revisionDeadlineAt: row.revision_deadline_at,
    decisionBy: row.decision_by,
    decisionAt: row.decision_at,
    decisionReason: row.decision_reason,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    cancellationReason: row.cancellation_reason,
    idempotencyKey: row.idempotency_key,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    roomCode: row.room_code,
    roomName: row.room_name,
    roomCategory: row.room_category,
    roomCapacity: row.room_capacity,
    roomFacilities: row.room_facilities,
    requesterName: row.requester_name,
    requesterLoginId: row.requester_login_id,
    requesterNim: row.requester_nim,
    requesterProgramStudy: row.requester_program_study,
    requesterPhone: row.requester_phone,
    requesterEmail: row.requester_email,
    organizationName: row.organization_name_snapshot || row.organization_name,
    organizationCode:
      row.organization_name_snapshot && row.organization_name_snapshot !== row.organization_name
        ? ""
        : row.organization_code,
  };
}

export type BookingInput = {
  organizationName?: string;
  activityName: string;
  activityPurpose: string;
  activityType: ActivityType;
  participantCount: number;
  requiredFacilities: string[];
  roomId: string;
  date: string;
  startTime: string;
  endTime: string;
};

export function validateBookingInput(input: BookingInput): void {
  if (input.organizationName !== undefined) {
    const organizationName = input.organizationName.trim();
    if (organizationName.length < 3) {
      throw new AppError("VALIDATION_ERROR", "Organisasi yang diwakili wajib diisi (minimal 3 karakter).");
    }
    if (organizationName.length > 160) {
      throw new AppError("VALIDATION_ERROR", "Nama organisasi terlalu panjang (maksimal 160 karakter).");
    }
  }
  if (!input.activityName.trim() || input.activityName.trim().length < 3) {
    throw new AppError("VALIDATION_ERROR", "Nama kegiatan wajib diisi (minimal 3 karakter).");
  }
  if (!input.activityPurpose.trim() || input.activityPurpose.trim().length < 10) {
    throw new AppError("VALIDATION_ERROR", "Tujuan kegiatan wajib diisi (minimal 10 karakter).");
  }
  if (!ACTIVITY_TYPES.includes(input.activityType)) {
    throw new AppError("VALIDATION_ERROR", "Jenis kegiatan tidak valid.");
  }
  if (!Number.isInteger(input.participantCount) || input.participantCount <= 0) {
    throw new AppError("VALIDATION_ERROR", "Jumlah peserta harus bilangan bulat lebih dari nol.");
  }
  const unknownFacilities = input.requiredFacilities.filter(
    (facility) => !FACILITIES.includes(facility as (typeof FACILITIES)[number]),
  );
  if (unknownFacilities.length > 0) {
    throw new AppError("VALIDATION_ERROR", `Fasilitas tidak dikenali: ${unknownFacilities.join(", ")}.`);
  }
  if (!input.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    throw new AppError("VALIDATION_ERROR", "Tanggal kegiatan tidak valid.");
  }
  if (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime)) {
    throw new AppError("VALIDATION_ERROR", "Waktu kegiatan tidak valid.");
  }
  if (
    input.startTime < GENERAL_BOOKING_HOURS.openTime ||
    input.endTime > GENERAL_BOOKING_HOURS.closeTime
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Ruangan kampus hanya dapat dibooking pada pukul ${GENERAL_BOOKING_HOURS.openTime}–${GENERAL_BOOKING_HOURS.closeTime}. Waktu di luar rentang tersebut tidak diperbolehkan.`,
    );
  }
}

async function assertRequesterPolicy(
  client: PoolClient,
  user: SessionUser,
  requireOrgPosition: boolean,
): Promise<{ organizationId: string; orgPosition: string | null; organizationName: string }> {
  if (user.role !== "student") {
    throw new AppError("FORBIDDEN", "Hanya mahasiswa/organisasi mahasiswa yang dapat mengajukan peminjaman.");
  }
  if (!user.organizationId) {
    throw new AppError(
      "BUSINESS_RULE",
      "Profil Anda belum memiliki organisasi resmi. Lengkapi profil terlebih dahulu; pengajuan pribadi tidak diperbolehkan.",
    );
  }
  const organization = await client.query<{ id: string; name: string; is_active: boolean }>(
    "SELECT id, name, is_active FROM organizations WHERE id = $1",
    [user.organizationId],
  );
  if (!organization.rows[0] || !organization.rows[0].is_active) {
    throw new AppError("BUSINESS_RULE", "Organisasi yang Anda wakili tidak aktif atau tidak terdaftar.");
  }
  const position = user.orgPosition?.trim() || null;
  if (requireOrgPosition && !position) {
    throw new AppError(
      "BUSINESS_RULE",
      "Jabatan/peran dalam organisasi wajib diisi sesuai konfigurasi kampus.",
    );
  }
  return {
    organizationId: organization.rows[0].id,
    orgPosition: position,
    organizationName: organization.rows[0].name,
  };
}

function mapAvailabilityError(code: string, reasons: string[]): never {
  const message = reasons.join(" ");
  if (code === "booking_conflict" || code === "class_conflict" || code === "restriction") {
    throw new AppError("CONFLICT", message || "Slot tidak tersedia.", { code });
  }
  throw new AppError("BUSINESS_RULE", message || "Pengajuan tidak memenuhi aturan ketersediaan.", { code });
}

export type CreateBookingResult = {
  booking: BookingWithRelations;
  reused: boolean;
};

export async function createBookingRequest(
  input: BookingInput,
  user: SessionUser,
  options: { idempotencyKey?: string | null; now?: Date } = {},
): Promise<CreateBookingResult> {
  validateBookingInput(input);
  const now = options.now ?? new Date();
  const settings = await getSettings();
  const startAt = combineDateAndTime(input.date, input.startTime, settings.timezone);
  const endAt = combineDateAndTime(input.date, input.endTime, settings.timezone);
  if (endAt <= startAt) {
    throw new AppError("VALIDATION_ERROR", "Waktu selesai harus setelah waktu mulai.");
  }
  validateGeneralBookingHours(startAt, endAt, settings.timezone);
  if (startAt.getTime() < now.getTime()) {
    throw new AppError("BUSINESS_RULE", "Tanggal dan waktu mulai tidak boleh di masa lalu.");
  }

  try {
    const created = await withTransaction(async (client) => {
      const requester = await assertRequesterPolicy(client, user, settings.requireOrgPosition);

      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [input.roomId]);
      const roomLock = await client.query("SELECT id, name FROM rooms WHERE id = $1 FOR SHARE", [
        input.roomId,
      ]);
      if (!roomLock.rows[0]) throw new AppError("NOT_FOUND", "Ruangan tidak ditemukan.");

      if (options.idempotencyKey) {
        const existing = await client.query<BookingJoinRow>(
          `${BOOKING_SELECT} WHERE b.requester_id = $1 AND b.idempotency_key = $2`,
          [user.id, options.idempotencyKey],
        );
        if (existing.rows[0]) {
          return { id: existing.rows[0].id, reused: true };
        }
      }

      const availability = await checkRoomAvailability(
        {
          roomId: input.roomId,
          startAt,
          endAt,
          participantCount: input.participantCount,
          requiredFacilities: input.requiredFacilities,
          now,
        },
        client,
      );
      if (!availability.available) {
        mapAvailabilityError(availability.code, availability.reasons);
      }

      const config = await getClockConfig(client, now);
      const holdExpires = addOperationalMinutes(now, settings.holdLimitMinutes, config);
      const target = addOperationalMinutes(now, settings.decisionTargetMinutes, config);

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO booking_requests
           (requester_id, organization_id, org_position_snapshot, activity_name, activity_purpose,
            activity_type, participant_count, required_facilities, room_id, start_at, end_at,
            status, slot_held, submitted_at, decision_target_at, hold_expires_at, idempotency_key,
            organization_name_snapshot, capacity_percentage_snapshot, capacity_review_required)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending_academic',true,$12,$13,$14,$15,$16,$17,$18)
         RETURNING id`,
        [
          user.id,
          requester.organizationId,
          requester.orgPosition,
          input.activityName.trim(),
          input.activityPurpose.trim(),
          input.activityType,
          input.participantCount,
          input.requiredFacilities,
          input.roomId,
          startAt,
          endAt,
          now,
          target,
          holdExpires,
          options.idempotencyKey ?? null,
          input.organizationName?.trim() || requester.organizationName,
          availability.capacity?.percentage ?? null,
          availability.capacity?.requiresReview ?? false,
        ],
      );

      const bookingId = inserted.rows[0].id;
      await writeAudit(client, {
        actorId: user.id,
        actorLabel: user.fullName,
        action: "booking.submitted",
        entityType: "booking_request",
        entityId: bookingId,
        newState: {
          ...input,
          organizationId: requester.organizationId,
          startAt,
          endAt,
          status: "pending_academic",
          decisionTargetAt: target,
          holdExpiresAt: holdExpires,
          capacityPercentageSnapshot: availability.capacity?.percentage ?? null,
          capacityReviewRequired: availability.capacity?.requiresReview ?? false,
        },
        reason: "Pengajuan peminjaman ruangan untuk kegiatan organisasi",
      });

      return { id: bookingId, reused: false };
    });

    const booking = await getBookingById(created.id);
    if (!booking) throw new AppError("INTERNAL", "Pengajuan tersimpan tetapi gagal dibaca kembali.");

    if (!created.reused) {
      const academicIds = await getAcademicRecipientIds();
      const capacityNote = booking.capacityReviewRequired
        ? ` Jumlah peserta ${booking.participantCount} orang (${formatCapacityPercentage(
            booking.capacityPercentageSnapshot ?? 0,
          )}% dari kapasitas ruangan) melebihi kapasitas; pengajuan ditandai untuk validasi tambahan Akademik.`
        : "";
      await sendNotifications([
        {
          recipientId: user.id,
          eventType: "booking.submitted",
          title: "Pengajuan peminjaman terkirim",
          body: `Pengajuan "${booking.activityName}" untuk ${booking.roomName} pada ${formatBookingRange(booking, settings.timezone)} telah tersimpan dan menunggu keputusan Bagian Akademik.${capacityNote}`,
          entityType: "booking_request",
          entityId: booking.id,
        },
        ...academicIds.map((recipientId) => ({
          recipientId,
          eventType: "booking.submitted" as const,
          title: "Pengajuan baru menunggu keputusan",
          body: `${booking.organizationName} mengajukan "${booking.activityName}" di ${booking.roomName} pada ${formatBookingRange(booking, settings.timezone)}.${capacityNote} Target keputusan 1 jam operasional.`,
          entityType: "booking_request" as const,
          entityId: booking.id,
        })),
      ]);
    }

    return { booking, reused: created.reused };
  } catch (error) {
    if (isExclusionViolation(error)) {
      throw new AppError("CONFLICT", "Slot baru saja diambil pengajuan lain. Silakan pilih waktu atau ruangan lain.");
    }
    if (isUniqueViolation(error) && options.idempotencyKey) {
      const existing = await queryOne<{ id: string }>(
        "SELECT id FROM booking_requests WHERE requester_id = $1 AND idempotency_key = $2",
        [user.id, options.idempotencyKey],
      );
      if (existing) {
        const booking = await getBookingById(existing.id);
        if (booking) return { booking, reused: true };
      }
    }
    throw error;
  }
}

export async function getBookingById(id: string): Promise<BookingWithRelations | null> {
  const row = await queryOne<BookingJoinRow>(`${BOOKING_SELECT} WHERE b.id = $1`, [id]);
  return row ? mapBooking(row) : null;
}

export async function getBookingForUser(
  id: string,
  user: SessionUser,
): Promise<BookingWithRelations | null> {
  const booking = await getBookingById(id);
  if (!booking) return null;
  if (booking.requesterId === user.id || user.role === "academic") return booking;
  return null;
}

export async function listMyBookings(
  userId: string,
  filters: { status?: BookingStatus; search?: string } = {},
): Promise<BookingWithRelations[]> {
  const params: unknown[] = [userId];
  const where: string[] = ["b.requester_id = $1"];
  if (filters.status) {
    params.push(filters.status);
    where.push(`b.status = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`(b.activity_name ILIKE $${params.length} OR r.name ILIKE $${params.length})`);
  }
  const rows = await query<BookingJoinRow>(
    `${BOOKING_SELECT} WHERE ${where.join(" AND ")} ORDER BY b.submitted_at DESC LIMIT 200`,
    params,
  );
  return rows.map(mapBooking);
}

export async function listMyUpcomingBookings(userId: string): Promise<BookingWithRelations[]> {
  const rows = await query<BookingJoinRow>(
    `${BOOKING_SELECT}
      WHERE b.requester_id = $1
        AND b.status = 'approved'
        AND b.end_at >= now()
      ORDER BY b.start_at ASC
      LIMIT 20`,
    [userId],
  );
  return rows.map(mapBooking);
}

export async function listAcademicQueue(filters: {
  status?: BookingStatus;
  search?: string;
  date?: string;
  overdueOnly?: boolean;
} = {}): Promise<BookingWithRelations[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filters.status) {
    params.push(filters.status);
    where.push(`b.status = $${params.length}`);
  } else {
    where.push(`b.status IN ('pending_academic', 'revision_requested')`);
  }
  if (filters.search) {
    params.push(`%${filters.search.trim()}%`);
    where.push(
      `(b.activity_name ILIKE $${params.length} OR r.name ILIKE $${params.length} OR o.name ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`,
    );
  }
  if (filters.date) {
    params.push(filters.date);
    where.push(`b.start_at::date = $${params.length}::date`);
  }
  if (filters.overdueOnly) {
    where.push(`b.status = 'pending_academic' AND now() > b.decision_target_at`);
  }
  const rows = await query<BookingJoinRow>(
    `${BOOKING_SELECT} WHERE ${where.join(" AND ")} ORDER BY b.submitted_at ASC LIMIT 200`,
    params,
  );
  return rows.map(mapBooking);
}

export async function listApprovedForAcademic(limit = 200): Promise<BookingWithRelations[]> {
  const rows = await query<BookingJoinRow>(
    `${BOOKING_SELECT} WHERE b.status = 'approved' ORDER BY b.start_at ASC LIMIT $1`,
    [limit],
  );
  return rows.map(mapBooking);
}

export async function resubmitBooking(
  id: string,
  input: BookingInput,
  user: SessionUser,
  now: Date = new Date(),
): Promise<BookingWithRelations> {
  validateBookingInput(input);
  const settings = await getSettings();
  const startAt = combineDateAndTime(input.date, input.startTime, settings.timezone);
  const endAt = combineDateAndTime(input.date, input.endTime, settings.timezone);
  if (endAt <= startAt) {
    throw new AppError("VALIDATION_ERROR", "Waktu selesai harus setelah waktu mulai.");
  }
  validateGeneralBookingHours(startAt, endAt, settings.timezone);
  if (startAt.getTime() < now.getTime()) {
    throw new AppError("BUSINESS_RULE", "Tanggal dan waktu mulai tidak boleh di masa lalu.");
  }

  try {
    await withTransaction(async (client) => {
      const existing = await client.query<BookingJoinRow>(
        `${BOOKING_SELECT} WHERE b.id = $1 FOR UPDATE OF b`,
        [id],
      );
      if (!existing.rows[0]) throw new AppError("NOT_FOUND", "Pengajuan tidak ditemukan.");
      const booking = existing.rows[0];
      if (booking.requester_id !== user.id) {
        throw new AppError("NOT_FOUND", "Pengajuan tidak ditemukan.");
      }
      if (booking.status !== "revision_requested") {
        throw new AppError("CONFLICT", "Pengajuan ini tidak sedang dalam status perlu revisi.");
      }

      const requester = await assertRequesterPolicy(client, user, settings.requireOrgPosition);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [input.roomId]);
      const roomLock = await client.query("SELECT id FROM rooms WHERE id = $1 FOR SHARE", [input.roomId]);
      if (!roomLock.rows[0]) throw new AppError("NOT_FOUND", "Ruangan tidak ditemukan.");

      const availability = await checkRoomAvailability(
        {
          roomId: input.roomId,
          startAt,
          endAt,
          participantCount: input.participantCount,
          requiredFacilities: input.requiredFacilities,
          excludeBookingId: id,
          now,
        },
        client,
      );
      if (!availability.available) {
        mapAvailabilityError(availability.code, availability.reasons);
      }

      const clock = await getClockConfig(client, now);
      const target = addOperationalMinutes(now, settings.decisionTargetMinutes, clock);
      const holdExpires = addOperationalMinutes(now, settings.holdLimitMinutes, clock);

      await client.query(
        `UPDATE booking_requests SET
           organization_id = $2,
           org_position_snapshot = $3,
           activity_name = $4,
           activity_purpose = $5,
           activity_type = $6,
           participant_count = $7,
           required_facilities = $8,
           room_id = $9,
           start_at = $10,
           end_at = $11,
           status = 'pending_academic',
           slot_held = true,
           submitted_at = $12,
           decision_target_at = $13,
           hold_expires_at = $14,
           organization_name_snapshot = $15,
           capacity_percentage_snapshot = $16,
           capacity_review_required = $17,
           revision_deadline_at = NULL,
           decision_by = NULL,
           decision_at = NULL,
           decision_reason = NULL,
           version = version + 1
         WHERE id = $1`,
        [
          id,
          requester.organizationId,
          requester.orgPosition,
          input.activityName.trim(),
          input.activityPurpose.trim(),
          input.activityType,
          input.participantCount,
          input.requiredFacilities,
          input.roomId,
          startAt,
          endAt,
          now,
          target,
          holdExpires,
          input.organizationName?.trim() || requester.organizationName,
          availability.capacity?.percentage ?? null,
          availability.capacity?.requiresReview ?? false,
        ],
      );

      await writeAudit(client, {
        actorId: user.id,
        actorLabel: user.fullName,
        action: "booking.resubmitted",
        entityType: "booking_request",
        entityId: id,
        previousState: {
          status: booking.status,
          roomId: booking.room_id,
          startAt: booking.start_at,
          endAt: booking.end_at,
        },
        newState: {
          ...input,
          status: "pending_academic",
          startAt,
          endAt,
          capacityPercentageSnapshot: availability.capacity?.percentage ?? null,
          capacityReviewRequired: availability.capacity?.requiresReview ?? false,
        },
        reason: "Perbaikan pengajuan setelah permintaan revisi Akademik",
      });
    });
  } catch (error) {
    if (isExclusionViolation(error)) {
      throw new AppError("CONFLICT", "Slot sudah diambil pengajuan lain. Silakan pilih waktu atau ruangan lain.");
    }
    throw error;
  }

  const updated = await getBookingById(id);
  if (!updated) throw new AppError("INTERNAL", "Pengajuan gagal dibaca kembali.");

  const academicIds = await getAcademicRecipientIds();
  const capacityNote = updated.capacityReviewRequired
    ? ` Jumlah peserta ${updated.participantCount} orang (${formatCapacityPercentage(
        updated.capacityPercentageSnapshot ?? 0,
      )}% dari kapasitas ruangan) melebihi kapasitas; pengajuan ditandai untuk validasi tambahan Akademik.`
    : "";
  await sendNotifications([
    ...academicIds.map((recipientId) => ({
      recipientId,
      eventType: "booking.resubmitted" as const,
      title: "Revisi pengajuan dikirim ulang",
      body: `${updated.organizationName} mengirim ulang "${updated.activityName}" di ${updated.roomName} pada ${formatBookingRange(updated, settings.timezone)}.${capacityNote}`,
      entityType: "booking_request" as const,
      entityId: updated.id,
    })),
    {
      recipientId: user.id,
      eventType: "booking.resubmitted",
      title: "Revisi pengajuan terkirim",
      body: `Revisi untuk "${updated.activityName}" telah dikirim dan menunggu keputusan Akademik.${capacityNote}`,
      entityType: "booking_request",
      entityId: updated.id,
    },
  ]);
  return updated;
}

export function formatBookingRange(booking: Pick<BookingWithRelations, "startAt" | "endAt">, timezone = "Asia/Makassar"): string {
  const date = new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    dateStyle: "medium",
  }).format(booking.startAt);
  const start = new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(booking.startAt);
  const end = new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(booking.endAt);
  return `${date}, ${start}–${end}`;
}
