import type { PoolClient } from "pg";
import { getPool, query } from "./db";
import type { NotificationEventType } from "./types";

export type NotificationInput = {
  recipientId: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  channel?: "in_app" | "email";
};

/**
 * Notifications are written after the business transaction commits.
 * A notification failure must never roll back a booking or a decision.
 */
export async function sendNotifications(inputs: NotificationInput[]): Promise<void> {
  if (inputs.length === 0) return;
  let client: PoolClient;
  try {
    client = await getPool().connect();
  } catch (error) {
    console.error("[simpar] notification connection failed (business transaction preserved)", error);
    return;
  }
  try {
    await client.query("BEGIN");
    for (const input of inputs) {
      const channel = input.channel ?? "in_app";
      await client.query(
        `INSERT INTO notifications
           (recipient_id, event_type, related_entity_type, related_entity_id, title, body,
            delivery_channel, delivery_status, attempts, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent', 1, now())`,
        [
          input.recipientId,
          input.eventType,
          input.entityType ?? null,
          input.entityId ?? null,
          input.title,
          input.body,
          channel,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("[simpar] notification delivery failed (business transaction preserved)", error);
  } finally {
    client.release();
  }
}

export async function getAcademicRecipientIds(): Promise<string[]> {
  try {
    const rows = await query<{ id: string }>(
      "SELECT id FROM users WHERE role = 'academic' AND is_active = true",
    );
    return rows.map((row) => row.id);
  } catch (error) {
    console.error("[simpar] failed to load academic recipients (business transaction preserved)", error);
    return [];
  }
}

export async function getStudentRecipientIds(): Promise<string[]> {
  try {
    const rows = await query<{ id: string }>(
      "SELECT id FROM users WHERE role = 'student' AND is_active = true",
    );
    return rows.map((row) => row.id);
  } catch (error) {
    console.error("[simpar] failed to load student recipients (business transaction preserved)", error);
    return [];
  }
}

export async function getNotificationRecipients(
  ...ids: Array<string | null | undefined>
): Promise<string[]> {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export async function listNotifications(userId: string, limit = 50) {
  return query<{
    id: string;
    event_type: string;
    title: string;
    body: string;
    read_at: Date | null;
    created_at: Date;
    related_entity_type: string | null;
    related_entity_id: string | null;
  }>(
    `SELECT id, event_type, title, body, read_at, created_at, related_entity_type, related_entity_id
       FROM notifications
      WHERE recipient_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, limit],
  );
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    "SELECT count(*)::text AS count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL",
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationsRead(userId: string, ids?: string[]): Promise<void> {
  if (ids && ids.length > 0) {
    await query(
      "UPDATE notifications SET read_at = now() WHERE recipient_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL",
      [userId, ids],
    );
    return;
  }
  await query("UPDATE notifications SET read_at = now() WHERE recipient_id = $1 AND read_at IS NULL", [
    userId,
  ]);
}
