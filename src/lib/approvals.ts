import { withTransaction } from "./db";
import { AppError } from "./errors";
import { writeAudit } from "./audit";
import { getClockConfig, getSettings } from "./settings";
import { checkRoomAvailability } from "./availability";
import { addOperationalMinutes } from "./operational-clock";
import { getAcademicRecipientIds, sendNotifications } from "./notifications";
import { getBookingById, formatBookingRange } from "./bookings";
import { generateInternalMemo } from "./memos";
import type { BookingWithRelations, SessionUser } from "./types";

export type DecisionAction = "approve" | "reject" | "request_revision";

export type DecisionInput = {
  bookingId: string;
  action: DecisionAction;
  reason?: string;
  now?: Date;
};

export async function decideBooking(
  input: DecisionInput,
  user: SessionUser,
): Promise<{ booking: BookingWithRelations; memoError: string | null }> {
  if (user.role !== "academic") {
    throw new AppError("FORBIDDEN", "Hanya pengguna dengan kewenangan Akademik yang dapat memutuskan pengajuan.");
  }
  const reason = input.reason?.trim() ?? "";
  if ((input.action === "reject" || input.action === "request_revision") && reason.length < 5) {
    throw new AppError("VALIDATION_ERROR", "Alasan wajib diisi minimal 5 karakter untuk penolakan atau permintaan revisi.");
  }

  const now = input.now ?? new Date();
  const settings = await getSettings();
  const config = await getClockConfig(undefined, now);

  const outcome = await withTransaction(async (client) => {
    const locked = await client.query<{
      id: string;
      status: string;
      room_id: string;
      start_at: Date;
      end_at: Date;
      participant_count: number;
      required_facilities: string[];
      activity_name: string;
      revision_deadline_at: Date | null;
    }>(
      `SELECT id, status, room_id, start_at, end_at, participant_count, required_facilities,
              activity_name, revision_deadline_at
         FROM booking_requests WHERE id = $1 FOR UPDATE`,
      [input.bookingId],
    );
    const booking = locked.rows[0];
    if (!booking) throw new AppError("NOT_FOUND", "Pengajuan tidak ditemukan.");
    if (booking.status !== "pending_academic") {
      throw new AppError(
        "CONFLICT",
        `Pengajuan sudah tidak dapat diputuskan karena statusnya "${booking.status}".`,
      );
    }

    let slotHeld = true;
    let revisionDeadline: Date | null = null;

    if (input.action === "approve") {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [booking.room_id]);
      const availability = await checkRoomAvailability(
        {
          roomId: booking.room_id,
          startAt: booking.start_at,
          endAt: booking.end_at,
          participantCount: booking.participant_count,
          requiredFacilities: booking.required_facilities,
          excludeBookingId: booking.id,
          now,
        },
        client,
      );
      if (!availability.available) {
        throw new AppError(
          "CONFLICT",
          `Tidak dapat menyetujui: ${availability.reasons.join(" ")}`,
          { code: availability.code },
        );
      }
    }

    if (input.action === "reject") {
      slotHeld = false;
    }

    if (input.action === "request_revision") {
      if (settings.revisionHoldPolicy === "hold_limited" && settings.revisionHoldMinutes) {
        slotHeld = true;
        revisionDeadline = addOperationalMinutes(now, settings.revisionHoldMinutes, config);
      } else {
        slotHeld = false;
        revisionDeadline = null;
      }
    }

    const newStatus =
      input.action === "approve"
        ? "approved"
        : input.action === "reject"
          ? "rejected"
          : "revision_requested";

    await client.query(
      `UPDATE booking_requests SET
         status = $2,
         slot_held = $3,
         revision_deadline_at = $4,
         decision_by = $5,
         decision_at = $6,
         decision_reason = $7,
         version = version + 1
       WHERE id = $1`,
      [booking.id, newStatus, slotHeld, revisionDeadline, user.id, now, reason || null],
    );

    await writeAudit(client, {
      actorId: user.id,
      actorLabel: user.fullName,
      action: `booking.${input.action}`,
      entityType: "booking_request",
      entityId: booking.id,
      previousState: { status: booking.status, slotHeld: true },
      newState: {
        status: newStatus,
        slotHeld,
        revisionDeadlineAt: revisionDeadline,
      },
      reason: reason || null,
    });

    return { status: newStatus, slotHeld };
  });

  const booking = await getBookingById(input.bookingId);
  if (!booking) throw new AppError("INTERNAL", "Keputusan tersimpan tetapi pengajuan gagal dibaca.");

  const academicIds = await getAcademicRecipientIds();
  const baseNotification = {
    entityType: "booking_request",
    entityId: booking.id,
  };

  if (outcome.status === "approved") {
    await sendNotifications([
      {
        recipientId: booking.requesterId,
        eventType: "booking.approved",
        title: "Pengajuan disetujui",
        body: `Pengajuan "${booking.activityName}" di ${booking.roomName} pada ${formatBookingRange(booking, settings.timezone)} telah disetujui. Internal Memo sedang disiapkan.`,
        ...baseNotification,
      },
      ...academicIds.map((recipientId) => ({
        recipientId,
        eventType: "booking.approved" as const,
        title: "Pengajuan disetujui",
        body: `${booking.organizationName} — "${booking.activityName}" di ${booking.roomName} disetujui oleh ${user.fullName}.`,
        ...baseNotification,
      })),
    ]);

    let memoError: string | null = null;
    try {
      await generateInternalMemo(booking.id, user);
    } catch (error) {
      memoError = error instanceof Error ? error.message : "Pembuatan Internal Memo gagal.";
      console.error("[simpar] memo generation failed after approval", error);
    }
    return { booking, memoError };
  }

  const eventType =
    outcome.status === "rejected" ? ("booking.rejected" as const) : ("booking.revision_requested" as const);
  await sendNotifications([
    {
      recipientId: booking.requesterId,
      eventType,
      title: outcome.status === "rejected" ? "Pengajuan ditolak" : "Revisi pengajuan diminta",
      body:
        outcome.status === "rejected"
          ? `Pengajuan "${booking.activityName}" ditolak. Alasan: ${reason || "tidak disebutkan"}.`
          : `Pengajuan "${booking.activityName}" memerlukan revisi. Catatan Akademik: ${reason}.${
              outcome.slotHeld ? " Slot masih ditahan hingga batas revisi." : " Slot telah dilepas; kirim ulang akan memeriksa ketersediaan kembali."
            }`,
      ...baseNotification,
    },
  ]);

  return { booking, memoError: null };
}

export async function getBookingForDecision(
  bookingId: string,
  user: SessionUser,
): Promise<BookingWithRelations | null> {
  if (user.role !== "academic") return null;
  return getBookingById(bookingId);
}

