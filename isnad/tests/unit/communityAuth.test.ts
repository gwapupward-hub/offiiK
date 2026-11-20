import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPABILITY_TELEGRAM_REQUIREMENT,
  mayClaim,
  resolveCapabilities,
  ROLE_CAPABILITIES,
} from "@/lib/community/communityAuth";
import type { Capability } from "@/lib/community/types";

const admin = { status: "administrator" as const };
const member = { status: "member" as const };
const left = { status: "left" as const };
const creator = { status: "creator" as const };
const has = (roles: Parameters<typeof resolveCapabilities>[0], live: Parameters<typeof resolveCapabilities>[1], c: Capability) =>
  resolveCapabilities(roles, live).capabilities.has(c);

test("every capability declares a Telegram requirement", () => {
  for (const capabilities of Object.values(ROLE_CAPABILITIES)) {
    for (const capability of capabilities) assert.ok(CAPABILITY_TELEGRAM_REQUIREMENT[capability], capability);
  }
});

test("an owner who is a live admin holds every owner capability", () => {
  for (const capability of ROLE_CAPABILITIES.owner) assert.equal(has(["owner"], admin, capability), true, capability);
});

test("an owner demoted in Telegram immediately loses high-impact capabilities", () => {
  assert.equal(has(["owner"], member, "settings.update"), false);
  assert.equal(has(["owner"], member, "community.pause"), false);
  assert.equal(has(["owner"], member, "community.activate"), false);
  assert.equal(has(["owner"], member, "community.view"), true, "can still read");
});

test("someone who left the chat keeps no capability at all", () => {
  assert.equal(resolveCapabilities(["owner"], left).capabilities.size, 0);
  assert.equal(resolveCapabilities(["owner"], null).capabilities.size, 0);
});

test("a Telegram admin with no Isnad role has no capability", () => {
  assert.equal(resolveCapabilities([], admin).capabilities.size, 0);
  assert.equal(resolveCapabilities([], admin).roleCapabilities.size, 0);
});

test("the Telegram chat creator is an implicit owner (owner recovery)", () => {
  const resolution = resolveCapabilities([], creator);
  assert.ok(resolution.effectiveRoles.includes("owner"));
  assert.equal(resolution.capabilities.has("roles.manage"), true);
});

test("delegated roles are scoped", () => {
  assert.equal(has(["community_manager"], admin, "settings.update"), true);
  assert.equal(has(["community_manager"], admin, "community.activate"), false);
  assert.equal(has(["community_manager"], admin, "roles.manage"), false);
  assert.equal(has(["analytics_viewer"], member, "analytics.view"), true);
  assert.equal(has(["analytics_viewer"], member, "settings.update"), false);
  assert.equal(has(["publisher"], member, "content.publish"), false, "publishing needs live admin");
  assert.equal(has(["publisher"], admin, "content.publish"), true);
  assert.equal(has(["content_editor"], member, "content.edit"), true);
});

test("restricted members still count as members unless they left", () => {
  assert.equal(has(["analytics_viewer"], { status: "restricted", is_member: true }, "analytics.view"), true);
  assert.equal(has(["analytics_viewer"], { status: "restricted", is_member: false }, "analytics.view"), false);
});

test("only current admins or the creator may claim", () => {
  assert.equal(mayClaim(admin), true);
  assert.equal(mayClaim(creator), true);
  assert.equal(mayClaim(member), false);
  assert.equal(mayClaim(null), false);
});
