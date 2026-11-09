import type { PoolClient } from "pg";

export type AuditInput = {
  actorId: string | null;
  actorLabel?: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  previousState?: unknown;
  newState?: unknown;
  reason?: string | null;
  correlationId?: string | null;
};

export async function writeAudit(client: PoolClient, input: AuditInput): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs
       (actor_id, actor_label, action, entity_type, entity_id, previous_state, new_state, reason, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.actorId,
      input.actorLabel ?? null,
      input.action,
      input.entityType,
      input.entityId,
      input.previousState === undefined ? null : JSON.stringify(input.previousState),
      input.newState === undefined ? null : JSON.stringify(input.newState),
      input.reason ?? null,
      input.correlationId ?? null,
    ],
  );
}
