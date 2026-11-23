import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getDatabase } from "@/lib/db";
import { normalizeEvidenceText, verifyAndStoreText } from "@/lib/community/verificationEvidence";
import { resetDatabase, testDatabaseUrl, useTestDatabase } from "../helpers/database";

const url = testDatabaseUrl();

test("C2 evidence persistence, provenance and inconclusive fallbacks", {
  skip: !url && "TEST_DATABASE_URL is not set",
}, async (t) => {
  await resetDatabase(url!);
  useTestDatabase(url!);
  const sql = getDatabase();
  after(async () => sql.end());

  const [community] = await sql`
    INSERT INTO communities (telegram_chat_id, chat_type, title, status)
    VALUES (-10020347, 'supergroup', 'Synthetic Verification Test', 'active')
    RETURNING id
  `;
  const [reviewer] = await sql`
    INSERT INTO users (id) VALUES (gen_random_uuid()) RETURNING id
  `;
  const [editor] = await sql`
    INSERT INTO users (id) VALUES (gen_random_uuid()) RETURNING id
  `;

  const synthetic = "A synthetic lesson explains how evidence records are checked";
  const textIndex = normalizeEvidenceText(synthetic);
  const [source] = await sql`
    INSERT INTO source_records (
      community_id, submitted_by, source_type, work, locator, edition, canonical_text, normalized_text,
      language, source_version, review_status
    ) VALUES (
      ${community.id}, ${editor.id}, 'scholarship', 'Synthetic fixture, not real religious evidence', 'test:1',
      'CI only', ${synthetic}, ${textIndex}, 'en', 'test-v1', 'pending'
    ) RETURNING id
  `;

  const input = (text: string, messageId: number) => ({
    communityId: String(community.id),
    telegramUserId: 101,
    telegramMessageId: messageId,
    threadId: 50,
    submissionText: text,
  });

  await t.test("unreviewed evidence cannot yield a match", async () => {
    const { requestId, result } = await verifyAndStoreText(input(synthetic, 1));
    assert.ok(requestId);
    assert.equal(result.status, "inconclusive");
    const [count] = await sql`
      SELECT count(*)::int AS count FROM verification_findings WHERE request_id = ${requestId}
    `;
    assert.equal(count.count, 0);
  });

  await t.test("approval requires reviewer identity, but only text matching is asserted", async () => {
    await assert.rejects(sql`
      UPDATE source_records SET review_status = 'approved' WHERE id = ${source.id}
    `);
    await sql`
      UPDATE source_records
      SET review_status = 'approved', reviewed_by = ${reviewer.id}, reviewed_at = now(),
          license_notice = 'Synthetic fixture for CI only',
          provenance = ${sql.json({ provider: 'ci-test', source: 'synthetic' })}
      WHERE id = ${source.id}
    `;
    const { requestId, result } = await verifyAndStoreText(input(synthetic + ".", 2));
    assert.equal(result.status, "text_matched");
    assert.equal(result.matches.length, 1);
    const [finding] = await sql`
      SELECT text_match_status, attribution_status, grading_status
      FROM verification_findings WHERE request_id = ${requestId}
    `;
    assert.equal(finding.text_match_status, "exact");
    assert.equal(finding.attribution_status, "not_assessed");
    assert.equal(finding.grading_status, "not_assessed");
  });

  await t.test("a wrong or revoked source is never asserted as verified", async () => {
    const wrong = await verifyAndStoreText(input("This is not the approved text at all", 3));
    assert.equal(wrong.result.status, "inconclusive");
    await sql`
      UPDATE source_records SET review_status = 'revoked' WHERE id = ${source.id}
    `;
    const revoked = await verifyAndStoreText(input(synthetic, 4));
    assert.equal(revoked.result.status, "inconclusive");
  });

  await t.test("stored submissions are community-scoped and expire", async () => {
    const rows = await sql`
      SELECT community_id, thread_id, expires_at > now() AS unexpired
      FROM verification_requests ORDER BY submitted_at
    `;
    assert.equal(rows.length, 4);
    assert.ok(rows.every((row) => String(row.community_id) === String(community.id)));
    assert.ok(rows.every((row) => Number(row.thread_id) === 50));
    assert.ok(rows.every((row) => row.unexpired === true));
    await assert.rejects(verifyAndStoreText(input("short", 5)));
    const [one] = await sql`
      SELECT id FROM verification_requests ORDER BY submitted_at ASC LIMIT 1
    `;
    await sql`UPDATE verification_requests SET expires_at = now() - interval '1 minute' WHERE id = ${one.id}`;
    const { runCommunityMaintenance } = await import("@/lib/community/maintenance");
    const purged = await runCommunityMaintenance();
    assert.equal(purged.verificationRequestsDeleted, 1);
    const [left] = await sql`SELECT count(*)::int AS count FROM verification_requests`;
    assert.equal(left.count, 3);
  });
});
