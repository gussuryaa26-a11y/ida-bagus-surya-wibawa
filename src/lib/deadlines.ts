import { query, withTransaction } from "./db";
import { writeAudit } from "./audit";
import { getClockConfig } from "./settings";
import { addOperationalMinutes } from "./operational-clock";
import { getAcademicRecipientIds, sendNotifications } from "./notifications";

export type DeadlineJobResult = {
  ranAt: Date;
  checked: number;
  expired: number;
  reminded: number;
  releasedRevisionSlots: number;
  errors: Array<{ bookingId: string; message: string }>;
};

type LockedBooking = {
  id: string;
  requester_id: string;
  activity_name: string;
  room_id: string;
  start_at: Date;
  end_at: Date;
  status: string;
  submitted_at: Date;
  late_notified_at: Date | null;
  revision_deadline_at: Date | null;
  slot_held: boolean;
  room_name: string;
};

export async function runDeadlineJob(options: { now?: Date; notify?: boolean } = {}): Promise<DeadlineJobResult> {
  const now = options.now ?? new Date();
  const notify = options.notify !== false;
  const config = await getClockConfig(undefined, now);
  const { settings } = config;

  const candidates = await query<{ id: string }>(
    `SELECT id FROM booking_requests
      WHERE status IN ('pending_academic', 'revision_requested')
      ORDER BY submitted_at ASC`,
  );

  const result: DeadlineJobResult = {
    ranAt: now,
    checked: candidates.length,
    expired: 0,
    reminded: 0,
    releasedRevisionSlots: 0,
    errors: [],
  };

  for (const candidate of candidates) {
    try {
      const outcome = await withTransaction(async (client) => {
        const locked = await client.query<LockedBooking>(
          `SELECT b.id, b.requester_id, b.activity_name, b.room_id, b.start_at, b.end_at,
                  b.status, b.submitted_at, b.late_notified_at, b.revision_deadline_at, b.slot_held,
                  r.name AS room_name
             FROM booking_requests b JOIN rooms r ON r.id = b.room_id
            WHERE b.id = $1 FOR UPDATE OF b`,
          [candidate.id],
        );
        const booking = locked.rows[0];
        if (!booking) return null;
        if (!["pending_academic", "revision_requested"].includes(booking.status)) return null;

        const target = addOperationalMinutes(
          booking.submitted_at,
          settings.decisionTargetMinutes,
          config,
        );
        const holdExpiry = addOperationalMinutes(
          booking.submitted_at,
          settings.holdLimitMinutes,
          config,
        );

        let reminded = false;
        if (booking.status === "pending_academic") {
          if (target.getTime() <= now.getTime() && !booking.late_notified_at) {
            reminded = true;
            await client.query(
              "UPDATE booking_requests SET late_notified_at = $2 WHERE id = $1",
              [booking.id, now],
            );
          }

          if (holdExpiry.getTime() <= now.getTime()) {
            const expired = await client.query(
              `UPDATE booking_requests SET
                 status = 'expired',
                 slot_held = false,
                 decision_at = NULL,
                 decision_reason = 'Kedaluwarsa: batas penahanan slot operasional terlewati sebelum keputusan Akademik.',
                 version = version + 1
               WHERE id = $1 AND status = 'pending_academic'`,
              [booking.id],
            );
            if (expired.rowCount === 1) {
              await writeAudit(client, {
                actorId: null,
                actorLabel: "sistem",
                action: "booking.expired",
                entityType: "booking_request",
                entityId: booking.id,
                previousState: { status: booking.status, slotHeld: booking.slot_held },
                newState: { status: "expired", slotHeld: false },
                reason: "Batas penahanan slot tiga jam operasional terlewati.",
              });
              return { kind: "expired" as const, booking, target, holdExpiry, reminded };
            }
          }

          await client.query(
            `UPDATE booking_requests SET decision_target_at = $2, hold_expires_at = $3 WHERE id = $1`,
            [booking.id, target, holdExpiry],
          );
          return { kind: "active" as const, booking, target, holdExpiry, reminded };
        }

        if (booking.status === "revision_requested") {
          if (settings.revisionHoldPolicy === "release") {
            if (booking.slot_held) {
              await client.query(
                `UPDATE booking_requests SET slot_held = false, decision_target_at = $2, hold_expires_at = $3
                  WHERE id = $1 AND status = 'revision_requested'`,
                [booking.id, target, holdExpiry],
              );
              return { kind: "revision_released" as const, booking, target, holdExpiry, reminded: false };
            }
            await client.query(
              `UPDATE booking_requests SET decision_target_at = $2, hold_expires_at = $3 WHERE id = $1`,
              [booking.id, target, holdExpiry],
            );
            return { kind: "active" as const, booking, target, holdExpiry, reminded: false };
          }

          if (booking.revision_deadline_at && booking.revision_deadline_at.getTime() <= now.getTime()) {
            const expired = await client.query(
              `UPDATE booking_requests SET
                 status = 'expired',
                 slot_held = false,
                 decision_at = NULL,
                 decision_reason = 'Kedaluwarsa: batas penahanan slot saat revisi terlewati.',
                 version = version + 1
               WHERE id = $1 AND status = 'revision_requested'`,
              [booking.id],
            );
            if (expired.rowCount === 1) {
              await writeAudit(client, {
                actorId: null,
                actorLabel: "sistem",
                action: "booking.expired",
                entityType: "booking_request",
                entityId: booking.id,
                previousState: { status: booking.status, slotHeld: booking.slot_held },
                newState: { status: "expired", slotHeld: false },
                reason: "Batas penahanan slot revisi terlewati.",
              });
              return { kind: "expired" as const, booking, target, holdExpiry, reminded: false };
            }
          }

          await client.query(
            `UPDATE booking_requests SET decision_target_at = $2, hold_expires_at = $3 WHERE id = $1`,
            [booking.id, target, holdExpiry],
          );
          return { kind: "active" as const, booking, target, holdExpiry, reminded: false };
        }

        return null;
      });

      if (!outcome) continue;

      if (outcome.kind === "expired") {
        result.expired += 1;
        if (notify) {
          const academicIds = await getAcademicRecipientIds();
          await sendNotifications([
            {
              recipientId: outcome.booking.requester_id,
              eventType: "booking.expired",
              title: "Pengajuan kedaluwarsa",
              body: `Pengajuan "${outcome.booking.activity_name}" di ${outcome.booking.room_name} kedaluwarsa karena melewati batas penahanan slot. Silakan ajukan kembali.`,
              entityType: "booking_request",
              entityId: outcome.booking.id,
            },
            ...academicIds.map((recipientId) => ({
              recipientId,
              eventType: "booking.expired" as const,
              title: "Slot pengajuan dilepas (kedaluwarsa)",
              body: `Pengajuan "${outcome.booking.activity_name}" (${outcome.booking.room_name}) kedaluwarsa dan slotnya dilepas.`,
              entityType: "booking_request" as const,
              entityId: outcome.booking.id,
            })),
          ]);
        }
      } else if (outcome.kind === "revision_released") {
        result.releasedRevisionSlots += 1;
      } else if (outcome.reminded) {
        result.reminded += 1;
        if (notify) {
          const academicIds = await getAcademicRecipientIds();
          await sendNotifications([
            {
              recipientId: outcome.booking.requester_id,
              eventType: "booking.overdue",
              title: "Target keputusan terlewati",
              body: `Target keputusan satu jam operasional untuk "${outcome.booking.activity_name}" telah terlewati. Pengajuan masih menunggu keputusan Akademik.`,
              entityType: "booking_request",
              entityId: outcome.booking.id,
            },
            ...academicIds.map((recipientId) => ({
              recipientId,
              eventType: "booking.overdue" as const,
              title: "Pengajuan melewati target 1 jam",
              body: `"${outcome.booking.activity_name}" di ${outcome.booking.room_name} telah melewati target keputusan satu jam operasional. Segera tinjau sebelum slot kedaluwarsa.`,
              entityType: "booking_request" as const,
              entityId: outcome.booking.id,
            })),
          ]);
        }
      }
    } catch (error) {
      result.errors.push({
        bookingId: candidate.id,
        message: error instanceof Error ? error.message : "Kesalahan tidak diketahui",
      });
      console.error("[simpar] deadline job error", candidate.id, error);
    }
  }

  return result;
}
