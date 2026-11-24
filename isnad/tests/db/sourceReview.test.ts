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
  const { parseDraftSource, submitSourceDraft, reviewSourceRecord, listCommunitySources,
    listSourceCorrections, acknowledgeSourceCorrection } =
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
    provenance: { provider: "CI fixtures", citation: "test01", rightsBasis: "Synthetic authored fixture" },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw Error("Invalid test source fixture");
  const id = await submitSourceDraft({
    communityId, actorUserId: editor, actorTelegramUserId: 10001,
    correlationId: "test-submit", draft: parsed.value,
  });
  assert.equal((await listCommunitySources(communityId)).length, 1);
  assert.equal((await listCommunitySources(otherCommunityId)).length, 0);
  // Natural keys are community-scoped: the same edition can be queued in B,
  // but B cannot inherit A's human approval.
  const otherSourceId = await submitSourceDraft({
    communityId: otherCommunityId, actorUserId: editor, actorTelegramUserId: 10001,
    correlationId: "test-other-draft", draft: parsed.value,
  });
  assert.notEqual(otherSourceId, id);
  assert.equal((await listCommunitySources(otherCommunityId)).length, 1);

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

  await assert.rejects(reviewSourceRecord({
    communityId, sourceId: id, actorUserId: reviewer.id, actorTelegramUserId: 10002,
    correlationId: "test-revoke-missing-reason", decision: "revoke",
  }));
  const revoked = await reviewSourceRecord({
    communityId, sourceId: id, actorUserId: reviewer.id, actorTelegramUserId: 10002,
    correlationId: "test-revoke", decision: "revoke",
    reason: "The submitted source record was withdrawn by the reviewer.",
  });
  assert.equal(revoked.kind, "revoked");
  if (revoked.kind !== "revoked") throw new Error("Expected revocation");
  assert.equal(revoked.affectedFindings, 1);
  const corrections = await listSourceCorrections(communityId);
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].status, "needs_review");
  assert.equal(corrections[0].requestId, matching.requestId);
  assert.equal((await listSourceCorrections(otherCommunityId)).length, 0);
  const [affected] = await sql.unsafe<Array<{ status: string }>>(
    "SELECT status FROM verification_requests WHERE id=$1", [matching.requestId]
  );
  assert.equal(affected.status, "needs_review");
  const wrongCorrection = await acknowledgeSourceCorrection({
    communityId: otherCommunityId, noticeId: corrections[0].id,
    actorUserId: other.id, actorTelegramUserId: 10003, correlationId: "ack-cross",
  });
  assert.equal(wrongCorrection, "not_found");
  const acknowledged = await acknowledgeSourceCorrection({
    communityId, noticeId: corrections[0].id,
    actorUserId: reviewer.id, actorTelegramUserId: 10002, correlationId: "ack",
  });
  assert.equal(acknowledged, "acknowledged");
  assert.equal((await listSourceCorrections(communityId))[0].status, "acknowledged");
  assert.equal(await acknowledgeSourceCorrection({
    communityId, noticeId: corrections[0].id,
    actorUserId: reviewer.id, actorTelegramUserId: 10002, correlationId: "ack-repeat",
  }), "conflict");
  const afterRevocation = await verifyAndStoreText(request(communityId, 4));
  assert.equal(afterRevocation.result.status, "inconclusive");
  const actions = await sql.unsafe<Array<{ action: string }>>(
    "SELECT action FROM community_audit_events WHERE community_id=$1 ORDER BY created_at",
    [communityId]
  );
  assert.deepEqual(actions.map(a=>a.action).sort(), ["source.approved", "source.correction_acknowledged", "source.revoked", "source.submitted"]);
});
