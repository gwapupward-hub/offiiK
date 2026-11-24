import { getDatabase } from "@/lib/db";
import { purgeInbox } from "@/lib/community/telegramInbox";

/**
 * Retention policy (documented in docs/community/c0-foundation.md):
 * - telegram_inbox: raw payload 72 hours, row 30 days (dedup window).
 * - community_interactions: deleted at expires_at (default 30 days).
 * - verification_requests and their findings: deleted at expires_at (default 30 days).
 * - community_setup_nonces: deleted one day after expiry.
 * - community_idempotency_keys: deleted after 24 hours.
 * - community_audit_events: retained; not purged automatically in C0.
 */
export async function runCommunityMaintenance(): Promise<Record<string, number>> {
  const sql = getDatabase();
  const inbox = await purgeInbox();
  const interactions = await sql`DELETE FROM community_interactions WHERE expires_at < now() RETURNING id`;
  // ON DELETE CASCADE also removes any findings associated with expired user submissions.
  const verification = await sql`DELETE FROM verification_requests WHERE expires_at < now() RETURNING id`;
  const nonces = await sql`
    DELETE FROM community_setup_nonces WHERE expires_at < now() - interval '1 day' RETURNING nonce_hash
  `;
  const idempotency = await sql`
    DELETE FROM community_idempotency_keys WHERE created_at < now() - interval '24 hours' RETURNING scope
  `;
  return {
    inboxPayloadsPurged: inbox.payloadsPurged,
    inboxRowsDeleted: inbox.rowsDeleted,
    interactionsDeleted: interactions.length,
    verificationRequestsDeleted: verification.length,
    noncesDeleted: nonces.length,
    idempotencyKeysDeleted: idempotency.length,
  };
}
