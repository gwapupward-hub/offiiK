import assert from "node:assert/strict";
import { after, test } from "node:test";
import { resetDatabase, testDatabaseUrl, useTestDatabase } from "../helpers/database";

const url = testDatabaseUrl();

test("C2B independent source review and community-scoped verification", {
  skip: !url && "TEST_DATABASE_URL is not set",
}, async () => {
  await resetDatabase(url!);
  useTestDatabase(url!);
  const { getDatabase } = await import("@/lib/db");
  const { parseDraftSource, submitSourceDraft, reviewSourceRecord, listCommunitySources } =
    await import("@/lib/community/sourceReview");
  const { verifyAndStoreText } = await import("@/lib/community/verificationEvidence");
  const sql = getDatabase();
  after(async () => sql.end());
  const users = await sql.unsafe<Array<{ id: string }>>("INSERT INTO users DEFAULT VALUES RETURNING id::text AS id");
  const editor = users[0].id;
  const [reviewer] = await sql.unsafe<Array<{ id: string }>>("INSERT INTO users DEFAULT VALUES RETURNING id::text AS id");
  const [other] = await sql.unsafe<Array<{ id: string }>>("INSERT INTO users DEFAULT VALUES RETURNING id::text AS id");
  const groups = await sql.unsafe<Array<{ id: string }>>(
    "INSERT INTO communities (telegram_chat_id,chat_type,status,title) VALUES " +
    "(-100221,'supergroup','active','Test A'),(-100222,'supergroup','active','Test B') RETURNING id::text AS id"
  );
  const communityId = groups[0].id;
  const otherCommunityId = groups[1].id;

  const text = "Synthetic educational wording that is not a religious attribution";
  const parsed = parseDraftSource({
    sourceType: "scholarship", work: "Original CI fixture", locator: "test:01",
    edition: "synthetic", canonicalText: text, language: "en", sourceVersion: "v1",
    sourceUrl: "https://example.org/test1", licenseNotice: "Original synthetic test material",
    provenance: { provider: "CI", citation: "test01", rightsBasis: "Synthetic authored fixture" },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw Error(parsed.issues.join(", "));
  const id = await submitSourceDraft({
    communityId, actorUserId: editor, actorTelegramUserId: 10001,
    correlationId: "test-submit", draft: parsed.value,
  });
  assert.equal((await listCommunitySources(communityId)).length, 1);
  assert.equal((await listCommunitySources(otherCommunityId)).length, 0);

  const request = (group: string, messageId: number) => ({
    communityId: group, telegramUserId: 10001, telegramMessageId: messageId,
    threadId: 90, submissionText: text,
  });
  const pending = await verifyAndStoreText(request(communityId, 1));
  assert.equal(pending.result.status, "inconclusive");

  const self = await reviewSourceRecord({
    communityId, sourceId: id, actorUserId: editor, actorTelegramUserId: 10001,
    correlationId: "test-self", decision: "approve",
  });
  assert.equal(self.kind, "self_review");

  const wrong = await reviewSourceRecord({
    communityId: otherCommunityId, sourceId: id, actorUserId: other.id,
    actorTelegramUserId: 10003, correlationId: "test-cross", decision: "approve",
  });
  assert.equal(wrong.kind, "not_found");

  const approved = await reviewSourceRecord({
    communityId, sourceId: id, actorUserId: reviewer.id, actorTelegramUserId: 10002,
    correlationId: "test-approve", decision: "approve",
  });
  assert.equal(approved.kind, "approved");
  const matching = await verifyAndStoreText(request(communityId, 2));
  assert.equal(matching.result.status, "text_matched");
  const crossCommunity = await verifyAndStoreText(request(otherCommunityId, 3));
  assert.equal(crossCommunity.result.status, "inconclusive");

  const again = await reviewSourceRecord({
    communityId, sourceId: id, actorUserId: reviewer.id, actorTelegramUserId: 10002,
    correlationId: "test-repeat", decision: "approve",
  });
  assert.equal(again.kind, "conflict");

  const revoked = await reviewSourceRecord({
    communityId, sourceId: id, actorUserId: reviewer.id, actorTelegramUserId: 10002,
    correlationId: "test-revoke", decision: "revoke",
  });
  assert.equal(revoked.kind, "revoked");
  const afterRevocation = await verifyAndStoreText(request(communityId, 4));
  assert.equal(afterRevocation.result.status, "inconclusive");
  const actions = await sql.unsafe<Array<{ action: string }>>(
    "SELECT action FROM community_audit_events WHERE community_id=$1 ORDER BY created_at",
    [communityId]
  );
  assert.deepEqual(actions.map(a=>a.action).sort(), ["source.approved", "source.revoked", "source.submitted"]);
});
