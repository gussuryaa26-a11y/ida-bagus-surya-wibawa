import { withTransaction } from "./db";
import { AppError } from "./errors";
import { writeAudit } from "./audit";
import { getAcademicRecipientIds, sendNotifications } from "./notifications";
import { formatBookingRange, getBookingById } from "./bookings";
import { getSettings } from "./settings";
import type { SessionUser } from "./types";

/**
 * Membatalkan pengajuan yang masih menunggu keputusan Akademik.
 *
 * Pembatalan ini langsung melepas slot ruangan dan tidak memerlukan
 * persetujuan Akademik. Booking yang sudah disetujui tidak dapat dibatalkan.
 */
export async function cancelPendingBooking(
  bookingId: string,
  reason: string,
  user: SessionUser,
): Promise<void> {
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    throw new AppError("VALIDATION_ERROR", "Alasan pembatalan wajib diisi minimal 5 karakter.");
  }

  const booking = await getBookingById(bookingId);
  if (!booking || booking.requesterId !== user.id) {
    throw new AppError("NOT_FOUND", "Booking tidak ditemukan.");
  }
  if (booking.status !== "pending_academic") {
    throw new AppError(
      "CONFLICT",
      booking.status === "approved"
        ? "Booking yang sudah disetujui tidak dapat dibatalkan."
        : "Hanya pengajuan yang masih menunggu keputusan Akademik yang dapat dibatalkan.",
    );
  }

  await withTransaction(async (client) => {
    const locked = await client.query<{
      id: string;
      status: string;
      requester_id: string;
    }>("SELECT id, status, requester_id FROM booking_requests WHERE id = $1 FOR UPDATE", [
      bookingId,
    ]);
    const row = locked.rows[0];
    if (!row || row.requester_id !== user.id) {
      throw new AppError("NOT_FOUND", "Booking tidak ditemukan.");
    }
    if (row.status !== "pending_academic") {
      throw new AppError("CONFLICT", "Status pengajuan berubah. Muat ulang halaman sebelum membatalkan.");
    }

    await client.query(
      `UPDATE booking_requests SET
         status = 'cancelled',
         slot_held = false,
         cancelled_at = now(),
         cancelled_by = $2,
         cancellation_reason = $3,
         version = version + 1
       WHERE id = $1`,
      [bookingId, user.id, trimmed],
    );

    await writeAudit(client, {
      actorId: user.id,
      actorLabel: user.fullName,
      action: "booking.cancelled_by_requester",
      entityType: "booking_request",
      entityId: bookingId,
      previousState: { status: "pending_academic", slotHeld: true },
      newState: { status: "cancelled", slotHeld: false },
      reason: trimmed,
    });
  });

  const settings = await getSettings();
  const academicIds = await getAcademicRecipientIds();
  await sendNotifications([
    {
      recipientId: user.id,
      eventType: "booking.cancelled_by_requester",
      title: "Pengajuan dibatalkan",
      body: `Pengajuan "${booking.activityName}" telah dibatalkan sebelum keputusan Akademik. Slot ruangan dilepas.`,
      entityType: "booking_request",
      entityId: bookingId,
    },
    ...academicIds.map((recipientId) => ({
      recipientId,
      eventType: "booking.cancelled_by_requester" as const,
      title: "Pengajuan dibatalkan oleh pemohon",
      body: `${booking.requesterName} membatalkan "${booking.activityName}" di ${booking.roomName} pada ${formatBookingRange(booking, settings.timezone)}. Alasan: ${trimmed}`,
      entityType: "booking_request" as const,
      entityId: bookingId,
    })),
  ]);
}
