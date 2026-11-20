import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySettingsPatch,
  defaultSettings,
  isValidTimezone,
  moduleCompatibility,
  normalizeStoredSettings,
} from "@/lib/community/settingsSchema";

const groupDefaults = defaultSettings("supergroup");

test("defaults match the handoff's initial activation table", () => {
  assert.equal(groupDefaults.assistant.enabled, true);
  assert.equal(groupDefaults.assistant.responseMode, "mention_only");
  assert.equal(groupDefaults.verification.trigger, "explicit_command");
  assert.equal(groupDefaults.publisher.approvalRequired, true);
  assert.equal(groupDefaults.publisher.scheduledPostsEnabled, false);
  assert.equal(groupDefaults.learning.manualOnly, true);
  assert.equal(groupDefaults.learning.publicRankings, false);
  assert.equal(groupDefaults.assistant.interactionRetentionDays, 30);
});

test("channels disable mention-based Q&A automatically", () => {
  assert.equal(defaultSettings("channel").assistant.enabled, false);
  assert.equal(moduleCompatibility("channel").assistant, "incompatible");
  assert.equal(moduleCompatibility("channel").verification, "mini_app_only");
});

test("a valid partial patch merges and reports changed modules", () => {
  const result = applySettingsPatch("supergroup", groupDefaults, {
    version: 3,
    assistant: { answerLength: "detailed", maxRepliesPerHour: 10 },
    timezone: "Europe/London",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.settings.assistant.answerLength, "detailed");
  assert.equal(result.settings.assistant.responseMode, "mention_only");
  assert.equal(result.expectedVersion, 3);
  assert.equal(result.timezone, "Europe/London");
  assert.deepEqual(result.changed, ["assistant"]);
});

test("rejects unknown keys, bad types and out-of-range values", () => {
  const result = applySettingsPatch("supergroup", groupDefaults, {
    version: 1,
    surprise: true,
    assistant: { maxRepliesPerHour: 10_000, answerLength: "epic", nope: 1 },
    verification: "on",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  const paths = result.issues.map((issue) => issue.path).sort();
  assert.deepEqual(paths, ["assistant.answerLength", "assistant.maxRepliesPerHour", "assistant.nope", "surprise", "verification"]);
});

test("requires the current version", () => {
  const result = applySettingsPatch("supergroup", groupDefaults, { assistant: { enabled: false } });
  assert.equal(result.ok, false);
});

test("publishing can never skip approval and learning stays manual", () => {
  for (const patch of [{ publisher: { approvalRequired: false } }, { learning: { manualOnly: false } }]) {
    const result = applySettingsPatch("supergroup", groupDefaults, { version: 1, ...patch });
    assert.equal(result.ok, false, JSON.stringify(patch));
  }
});

test("cannot enable an incompatible module", () => {
  const result = applySettingsPatch("channel", defaultSettings("channel"), { version: 1, assistant: { enabled: true } });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issues[0].path, "assistant.enabled");
});

test("Q&A topic mode needs at least one topic", () => {
  const bad = applySettingsPatch("supergroup", groupDefaults, { version: 1, assistant: { responseMode: "qa_topics" } });
  assert.equal(bad.ok, false);
  const good = applySettingsPatch("supergroup", groupDefaults, {
    version: 1,
    assistant: { responseMode: "qa_topics", qaTopicIds: [4, 9] },
  });
  assert.equal(good.ok, true);
});

test("timezone validation uses IANA names", () => {
  assert.equal(isValidTimezone("Asia/Riyadh"), true);
  assert.equal(isValidTimezone("Mars/Olympus"), false);
  assert.equal(applySettingsPatch("group", groupDefaults, { version: 1, timezone: "nowhere" }).ok, false);
});

test("stored JSON is normalized: junk dropped, invalid values fall back to defaults", () => {
  const normalized = normalizeStoredSettings("supergroup", {
    assistant: { enabled: false, injected: "x", maxRepliesPerHour: -5 },
    publisher: { approvalRequired: false },
  });
  assert.equal(normalized.assistant.enabled, false);
  assert.equal("injected" in normalized.assistant, false);
  assert.equal(normalized.assistant.maxRepliesPerHour, groupDefaults.assistant.maxRepliesPerHour);
  assert.equal(normalized.publisher.approvalRequired, true);
});
