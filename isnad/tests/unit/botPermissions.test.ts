import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateModules, moduleMayAct, snapshotBotPermissions } from "@/lib/community/botPermissions";
import { MODULE_RUNTIME_RELEASED } from "@/lib/community/featureFlags";
import { defaultSettings } from "@/lib/community/settingsSchema";
import { MODULE_KEYS } from "@/lib/community/types";

const bot = { id: 123456 };
const groupSettings = defaultSettings("supergroup");
const channelSettings = defaultSettings("channel");

const groupAdmin = snapshotBotPermissions({ status: "administrator", user: bot }, "supergroup", undefined, false);
const groupMemberPrivacy = snapshotBotPermissions({ status: "member", user: bot }, "supergroup", { can_send_messages: true }, false);
const channelPoster = snapshotBotPermissions(
  { status: "administrator", user: bot, can_post_messages: true, can_edit_messages: true },
  "channel",
  undefined,
  false
);
const channelNoPost = snapshotBotPermissions({ status: "administrator", user: bot }, "channel", undefined, false);

const states = (evaluations: ReturnType<typeof evaluateModules>) =>
  Object.fromEntries(evaluations.map((item) => [item.key, item.state]));

test("a group admin bot satisfies every group module", () => {
  const evaluation = evaluateModules("supergroup", "pending", groupSettings, groupAdmin, { globalPause: false });
  assert.ok(evaluation.every((item) => item.missingPermissions.length === 0));
});

test("privacy mode blocks mention-based Q&A for a non-admin bot", () => {
  const evaluation = evaluateModules("supergroup", "active", groupSettings, groupMemberPrivacy, { globalPause: false });
  assert.equal(states(evaluation).assistant, "blocked_permissions");
  assert.equal(states(evaluation).verification, "awaiting_release");
});

test("a channel needs post and edit rights for publishing; Q&A is incompatible", () => {
  assert.equal(states(evaluateModules("channel", "active", channelSettings, channelPoster, { globalPause: false })).publisher, "awaiting_release");
  const blocked = evaluateModules("channel", "active", channelSettings, channelNoPost, { globalPause: false });
  assert.equal(states(blocked).publisher, "blocked_permissions");
  assert.equal(states(blocked).assistant, "incompatible");
});

test("restricted bots cannot send", () => {
  const snapshot = snapshotBotPermissions({ status: "restricted", user: bot, is_member: true, can_send_messages: false }, "group", undefined, true);
  assert.equal(snapshot.canSendMessages, false);
});

test("pending, paused and globally paused communities never act", () => {
  for (const status of ["pending", "paused", "permission_lost", "removed"] as const) {
    assert.equal(states(evaluateModules("supergroup", status, groupSettings, groupAdmin, { globalPause: false })).publisher, "paused");
  }
  assert.equal(states(evaluateModules("supergroup", "active", groupSettings, groupAdmin, { globalPause: true })).publisher, "paused");
});

test("C1 releases only the assistant runtime; other community modules remain gated", () => {
  assert.equal(MODULE_RUNTIME_RELEASED.assistant, true);
  assert.equal(moduleMayAct("assistant", "supergroup", "active", groupSettings, groupAdmin, { globalPause: false }), true);
  for (const key of MODULE_KEYS.filter((item) => item !== "assistant")) {
    assert.equal(MODULE_RUNTIME_RELEASED[key], false);
    assert.equal(moduleMayAct(key, "supergroup", "active", groupSettings, groupAdmin, { globalPause: false }), false);
  }
});
