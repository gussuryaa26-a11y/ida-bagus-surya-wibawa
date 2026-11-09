import type { PoolClient } from "pg";
import { sendNotifications, getAcademicRecipientIds } from "./notifications";
import { query } from "./db";
import { writeAudit } from "./audit";

export type ConflictCandidate = {
  bookingId: string;
  activityName: string;
};

export async function recordPostApprovalConflicts(
  client: PoolClient,
  input: {
    candidateBookingIds: string[];
    conflictType: string;
    sourceEntityType: string;
    sourceEntityId: string | null;
    sourceChange: string;
    details?: Record<string, unknown>;
  },
): Promise<ConflictCandidate[]> {
  if (input.candidateBookingIds.length === 0) return [];
  const rows = await client.query<{ id: string; activity_name: string }>(
    `SELECT id, activity_name
       FROM booking_requests
      WHERE id = ANY($1::uuid[])
        AND status IN ('approved', 'cancellation_requested')`,
    [input.candidateBookingIds],
  );

  const created: ConflictCandidate[] = [];
  for (const row of rows.rows) {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM post_approval_conflicts
        WHERE booking_id = $1
          AND conflict_type = $2
          AND source_entity_type = $3
          AND source_entity_id IS NOT DISTINCT FROM $4::uuid
          AND resolved_at IS NULL
        LIMIT 1`,
      [row.id, input.conflictType, input.sourceEntityType, input.sourceEntityId],
    );
    if (existing.rows[0]) continue;

    await client.query(
      `INSERT INTO post_approval_conflicts
         (booking_id, conflict_type, source_entity_type, source_entity_id, source_change, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        row.id,
        input.conflictType,
        input.sourceEntityType,
        input.sourceEntityId,
        input.sourceChange,
        JSON.stringify(input.details ?? {}),
      ],
    );

    await writeAudit(client, {
      actorId: null,
      actorLabel: "sistem",
      action: "booking.post_approval_conflict",
      entityType: "booking_request",
      entityId: row.id,
      newState: {
        conflictType: input.conflictType,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        sourceChange: input.sourceChange,
      },
      reason: "Konflik terdeteksi setelah persetujuan; booking tidak dibatalkan otomatis.",
    });

    created.push({ bookingId: row.id, activityName: row.activity_name });
  }
  return created;
}

export async function notifyPostApprovalConflicts(conflicts: ConflictCandidate[]): Promise<void> {
  if (conflicts.length === 0) return;
  const academicIds = await getAcademicRecipientIds();
  if (academicIds.length === 0) return;
  const notifications = conflicts.flatMap((conflict) =>
    academicIds.map((recipientId) => ({
      recipientId,
      eventType: "booking.post_approval_conflict" as const,
      title: "Konflik jadwal pasca-persetujuan",
      body: `Booking "${conflict.activityName}" berbenturan dengan perubahan jadwal/pembatasan baru. Booking tidak dibatalkan otomatis; tinjau dan tentukan tindakan sesuai kebijakan kampus.`,
      entityType: "booking_request",
      entityId: conflict.bookingId,
    })),
  );
  await sendNotifications(notifications);
}

export async function markConflictsNotified(bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return;
  await query(
    `UPDATE post_approval_conflicts SET notified_at = now() WHERE booking_id = ANY($1::uuid[]) AND notified_at IS NULL`,
    [bookingIds],
  );
}
