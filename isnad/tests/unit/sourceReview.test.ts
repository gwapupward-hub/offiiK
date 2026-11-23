import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDraftSource } from "@/lib/community/sourceReview";
import { classifyUpdate } from "@/lib/community/telegramDispatcher";
import { resolveCapabilities } from "@/lib/community/communityAuth";

const draft = {
  sourceType: "scholarship", work: "Synthetic test document",
  locator: "fixture:1", edition: "CI-test", sourceVersion: "v1",
  canonicalText: "Synthetic phrase for demonstrating content review",
  language: "en", sourceUrl: "https://example.org/test",
  licenseNotice: "Synthetic material authored for test use",
  provenance: { provider: "CI fixtures", citation: "fixture1", rightsBasis: "Original synthetic test" },
};

test("source submissions require provenance, declared rights and bounded text", () => {
  const valid = parseDraftSource(draft);
  assert.equal(valid.ok, true);
  const invalid = parseDraftSource({ ...draft, canonicalText: "short", sourceUrl: "http://example.org", provenance: {} });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.ok(invalid.issues.some(issue => issue.includes("canonicalText")));
    assert.ok(invalid.issues.some(issue => issue.includes("sourceUrl")));
    assert.ok(invalid.issues.some(issue => issue.includes("provenance")));
  }
  assert.equal(parseDraftSource({ ...draft, injected: true }).ok, false);
  assert.equal(parseDraftSource({ ...draft, sourceType: "unverified_website" }).ok, false);
});

test("editor cannot approve evidence; reviewer can but cannot publish", () => {
  const editor = resolveCapabilities(["content_editor"], { status: "member" });
  assert.equal(editor.capabilities.has("content.edit"), true);
  assert.equal(editor.capabilities.has("content.review"), false);
  const reviewer = resolveCapabilities(["source_reviewer"], { status: "member" });
  assert.equal(reviewer.capabilities.has("content.review"), true);
  assert.equal(reviewer.capabilities.has("content.publish"), false);
  const demoted = resolveCapabilities(["source_reviewer"], { status: "left" });
  assert.equal(demoted.capabilities.size, 0);
});

test("text /verify and reply /verify remain inactive until release", () => {
  const bot = { id: 10001, username: "isnad_test_bot" };
  const message = { message_id: 22, chat: { type: "supergroup" as const, id: -10021 },
    from: { id: 79 }, text: "/verify@isnad_test_bot",
    reply_to_message: { message_id: 21, text: "An example citation of synthetic scholarly wording" } };
  const update = { update_id: 1, message };
  const disabled = classifyUpdate(update, bot, { communityEnabled: true, assistantReleased: true });
  assert.equal(disabled.kind, "group_module_unavailable");
  const enabled = classifyUpdate(update, bot, { communityEnabled: true, verificationReleased: true });
  assert.equal(enabled.kind, "group_verification");
  if (enabled.kind === "group_verification") {
    assert.equal(enabled.question, message.reply_to_message.text);
  }
  assert.equal(classifyUpdate({ update_id: 2, message: { ...message, text: "ordinary group chatter" } },
    bot, { communityEnabled: true, verificationReleased: true }).kind, "ignore");
  assert.equal(classifyUpdate({ update_id: 3, message: { ...message, text: "/verify@other_bot text" } },
    bot, { communityEnabled: true, verificationReleased: true }).kind, "ignore");
});
