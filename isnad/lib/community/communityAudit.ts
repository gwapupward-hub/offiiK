import type postgres from "postgres";
import { getDatabase } from "@/lib/db";

export type Queryable = postgres.Sql | postgres.TransactionSql;

export type AuditEventInput = {
  communityId: string | null;
  actorUserId?: string | null;
  actorTelegramUserId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  correlationId?: string | null;
};

export type AuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorTelegramUserId: number | null;
  actorDisplayName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  correlationId: string | null;
  createdAt: string;
};

const MAX_SUMMARY_STRING = 200;

/** Keeps audit summaries small and free of raw message content. */
export function summarize(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined) continue;
    if (typeof raw === "string") output[key] = raw.slice(0, MAX_SUMMARY_STRING);
    else if (raw === null || typeof raw === "number" || typeof raw === "boolean") output[key] = raw;
    else output[key] = JSON.parse(JSON.stringify(raw, (_k, v) => (typeof v === "string" ? v.slice(0, MAX_SUMMARY_STRING) : v)));
  }
  return output;
}

export async function recordAuditEvent(db: Queryable, event: AuditEventInput): Promise<void> {
  const before = summarize(event.before);
  const after = summarize(event.after);
  await db`
    INSERT INTO community_audit_events (
      community_id, actor_user_id, actor_telegram_user_id, action, entity_type,
      entity_id, before_summary, after_summary, correlation_id
    ) VALUES (
      ${event.communityId}, ${event.actorUserId ?? null}, ${event.actorTelegramUserId ?? null},
      ${event.action}, ${event.entityType}, ${event.entityId ?? null},
      ${before ? db.json(before as never) : null}, ${after ? db.json(after as never) : null},
      ${event.correlationId ?? null}
    )
  `;
}

export async function listAuditEvents(
  communityId: string,
  options: { limit?: number; before?: string } = {}
): Promise<AuditEvent[]> {
  const sql = getDatabase();
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 100);
  const before = options.before && !Number.isNaN(Date.parse(options.before)) ? options.before : null;
  const rows = await sql`
    SELECT e.id::text AS id, e.action, e.entity_type, e.entity_id, e.actor_telegram_user_id,
           e.before_summary, e.after_summary, e.correlation_id, e.created_at,
           p.display_name
    FROM community_audit_events e
    LEFT JOIN profiles p ON p.user_id = e.actor_user_id
    WHERE e.community_id = ${communityId}
      AND (${before}::timestamptz IS NULL OR e.created_at < ${before}::timestamptz)
    ORDER BY e.created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: row.id as string,
    action: row.action as string,
    entityType: row.entity_type as string,
    entityId: (row.entity_id as string | null) ?? null,
    actorTelegramUserId: row.actor_telegram_user_id === null ? null : Number(row.actor_telegram_user_id),
    actorDisplayName: (row.display_name as string | null) ?? null,
    before: (row.before_summary as Record<string, unknown> | null) ?? null,
    after: (row.after_summary as Record<string, unknown> | null) ?? null,
    correlationId: (row.correlation_id as string | null) ?? null,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  }));
}
