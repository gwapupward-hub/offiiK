import { getDatabase } from "@/lib/db";

/**
 * Durable Telegram update inbox.
 *
 *   received (in request) → pending → processing → succeeded
 *                                        ↘ retryable_failed → processing …
 *                                        ↘ terminal_failed
 *
 * Exactly-once delivery is not possible, so the inbox guarantees the property
 * that matters: one update never starts a second AI response or repeats an
 * admin action. Handlers call markSideEffectStarted() before their first
 * outbound effect; a lease that expires after that point is closed as
 * terminal_failed/outcome_unknown instead of being retried.
 */

export const LEASE_SECONDS = 90;
export const MAX_ATTEMPTS = 5;
const PAYLOAD_RETENTION_HOURS = 72;
const ROW_RETENTION_DAYS = 30;

export type InboxStatus = "pending" | "processing" | "succeeded" | "retryable_failed" | "terminal_failed";

export type PersistResult = "inserted" | "duplicate";

/**
 * Persists an update and its dedup key in one transaction. When
 * `retainPayload` is false (e.g. ordinary group chatter that triggers no
 * feature) only the id is kept, already marked succeeded, so message content
 * is never stored.
 */
export async function persistUpdate(input: {
  updateId: number;
  kind: string;
  chatId: number | null;
  payload: unknown;
  retainPayload: boolean;
}): Promise<PersistResult> {
  const sql = getDatabase();
  return sql.begin(async (tx) => {
    const rows = await tx`
      INSERT INTO telegram_inbox (update_id, update_kind, chat_id, payload, status, processed_at, payload_purged_at)
      VALUES (
        ${input.updateId}, ${input.kind}, ${input.chatId},
        ${input.retainPayload ? tx.json(input.payload as never) : null},
        ${input.retainPayload ? "pending" : "succeeded"},
        ${input.retainPayload ? null : sql`now()`},
        ${input.retainPayload ? null : sql`now()`}
      )
      ON CONFLICT (update_id) DO NOTHING
      RETURNING update_id
    `;
    if (rows.length === 0) return "duplicate" as const;
    // Cross-version dedup with the pre-inbox reservation table, so an update
    // already handled by an older deployment is not processed again.
    const legacy = await tx`
      INSERT INTO processed_telegram_updates (update_id) VALUES (${input.updateId})
      ON CONFLICT DO NOTHING RETURNING update_id
    `;
    if (legacy.length === 0) {
      await tx`
        UPDATE telegram_inbox SET status = 'succeeded', processed_at = now(), payload = NULL,
          payload_purged_at = now(), last_error_code = 'legacy_duplicate'
        WHERE update_id = ${input.updateId}
      `;
      return "duplicate" as const;
    }
    return "inserted" as const;
  });
}

export type ClaimedUpdate = { updateId: number; payload: unknown; attempts: number };

/** Claims one update under a lease. Returns null if another worker holds it or it is finished. */
export async function claimUpdate(updateId: number): Promise<ClaimedUpdate | null> {
  const sql = getDatabase();
  const [row] = await sql`
    UPDATE telegram_inbox SET
      status = 'processing',
      attempts = attempts + 1,
      lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS})
    WHERE update_id = ${updateId}
      AND payload IS NOT NULL
      AND side_effect_started_at IS NULL
      AND attempts < ${MAX_ATTEMPTS}
      AND (
        (status IN ('pending', 'retryable_failed') AND next_attempt_at <= now())
        OR (status = 'processing' AND lease_expires_at < now())
      )
    RETURNING update_id, payload, attempts
  `;
  if (!row) return null;
  return { updateId: Number(row.update_id), payload: row.payload, attempts: Number(row.attempts) };
}

/** Records that an outbound side effect is about to happen; disables any further retry. */
export async function markSideEffectStarted(updateId: number): Promise<void> {
  const sql = getDatabase();
  await sql`
    UPDATE telegram_inbox SET side_effect_started_at = COALESCE(side_effect_started_at, now())
    WHERE update_id = ${updateId} AND status = 'processing'
  `;
}

/**
 * Clears the side-effect marker after a send that Telegram *definitively*
 * rejected (e.g. 429), so the update can be retried with backoff. Only valid
 * when that rejected send was the update's sole outbound effect.
 */
export async function releaseSideEffect(updateId: number): Promise<void> {
  const sql = getDatabase();
  await sql`
    UPDATE telegram_inbox SET side_effect_started_at = NULL
    WHERE update_id = ${updateId} AND status = 'processing'
  `;
}

export async function markSucceeded(updateId: number): Promise<void> {
  const sql = getDatabase();
  await sql`
    UPDATE telegram_inbox SET status = 'succeeded', processed_at = now(), lease_expires_at = NULL,
      last_error_code = NULL
    WHERE update_id = ${updateId} AND status = 'processing'
  `;
}

/**
 * Records a failure. Retries only when the error is retryable, no side effect
 * has started, and attempts remain; otherwise the update is terminal.
 */
export async function markFailed(
  updateId: number,
  failure: { code: string; retryable: boolean; retryAfterSeconds?: number }
): Promise<InboxStatus> {
  const sql = getDatabase();
  const [row] = await sql`
    UPDATE telegram_inbox SET
      status = CASE
        WHEN ${failure.retryable} AND side_effect_started_at IS NULL AND attempts < ${MAX_ATTEMPTS}
          THEN 'retryable_failed' ELSE 'terminal_failed' END,
      next_attempt_at = now() + make_interval(secs => ${backoffSeconds(failure.retryAfterSeconds)}),
      lease_expires_at = NULL,
      processed_at = CASE
        WHEN ${failure.retryable} AND side_effect_started_at IS NULL AND attempts < ${MAX_ATTEMPTS}
          THEN NULL ELSE now() END,
      last_error_code = ${failure.code.slice(0, 64)}
    WHERE update_id = ${updateId} AND status = 'processing'
    RETURNING status
  `;
  return (row?.status as InboxStatus | undefined) ?? "terminal_failed";
}

function backoffSeconds(retryAfterSeconds?: number): number {
  if (retryAfterSeconds && retryAfterSeconds > 0) return Math.min(Math.ceil(retryAfterSeconds), 3_600);
  return 30;
}

/**
 * Closes expired leases whose side effect already started (outcome unknown,
 * never retried) and returns ids that are ready for another attempt.
 */
export async function collectReadyUpdates(limit = 10): Promise<number[]> {
  const sql = getDatabase();
  await sql`
    UPDATE telegram_inbox SET status = 'terminal_failed', processed_at = now(), lease_expires_at = NULL,
      last_error_code = 'outcome_unknown'
    WHERE status = 'processing' AND lease_expires_at < now() AND side_effect_started_at IS NOT NULL
  `;
  await sql`
    UPDATE telegram_inbox SET status = 'terminal_failed', processed_at = now(), lease_expires_at = NULL,
      last_error_code = COALESCE(last_error_code, 'max_attempts')
    WHERE status IN ('retryable_failed', 'processing') AND attempts >= ${MAX_ATTEMPTS}
      AND (status = 'retryable_failed' OR lease_expires_at < now())
  `;
  const rows = await sql`
    SELECT update_id FROM telegram_inbox
    WHERE payload IS NOT NULL AND side_effect_started_at IS NULL AND attempts < ${MAX_ATTEMPTS}
      AND (
        (status IN ('pending', 'retryable_failed') AND next_attempt_at <= now())
        OR (status = 'processing' AND lease_expires_at < now())
      )
    ORDER BY received_at
    LIMIT ${Math.min(Math.max(limit, 1), 50)}
  `;
  return rows.map((row) => Number(row.update_id));
}

/** Retention: drop raw payloads after the diagnostic window, rows after the dedup window. */
export async function purgeInbox(): Promise<{ payloadsPurged: number; rowsDeleted: number }> {
  const sql = getDatabase();
  const purged = await sql`
    UPDATE telegram_inbox SET payload = NULL, payload_purged_at = now()
    WHERE payload IS NOT NULL AND status IN ('succeeded', 'terminal_failed')
      AND received_at < now() - make_interval(hours => ${PAYLOAD_RETENTION_HOURS})
    RETURNING update_id
  `;
  const deleted = await sql`
    DELETE FROM telegram_inbox
    WHERE received_at < now() - make_interval(days => ${ROW_RETENTION_DAYS})
      AND status IN ('succeeded', 'terminal_failed')
    RETURNING update_id
  `;
  return { payloadsPurged: purged.length, rowsDeleted: deleted.length };
}

export type InboxHealth = Record<InboxStatus, number> & { oldestPendingSeconds: number | null };

export async function inboxHealth(): Promise<InboxHealth> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT status, count(*)::int AS count FROM telegram_inbox
    WHERE received_at > now() - interval '24 hours' GROUP BY status
  `;
  const [oldest] = await sql`
    SELECT EXTRACT(EPOCH FROM now() - min(received_at))::int AS seconds
    FROM telegram_inbox WHERE status IN ('pending', 'retryable_failed')
  `;
  const health: InboxHealth = {
    pending: 0,
    processing: 0,
    succeeded: 0,
    retryable_failed: 0,
    terminal_failed: 0,
    oldestPendingSeconds: oldest?.seconds === null || oldest?.seconds === undefined ? null : Number(oldest.seconds),
  };
  for (const row of rows) health[row.status as InboxStatus] = Number(row.count);
  return health;
}
