import assert from "node:assert/strict";
import { after, test } from "node:test";
import { NextRequest } from "next/server";
import { resetDatabase, testDatabaseUrl, useTestDatabase } from "../helpers/database";
import { FakeTelegram } from "../helpers/fakeTelegram";
import { signInitData } from "../helpers/initData";

const url = testDatabaseUrl();
const TOKEN = "123456:TEST-TOKEN";
const BOT_ID = 123456;
const GROUP = { id: -100111, type: "supergroup" as const, title: "Study Circle", is_forum: true };
const OTHER_GROUP = { id: -100222, type: "supergroup" as const, title: "Other Circle" };
const CHANNEL = { id: -100333, type: "channel" as const, title: "Daily Reminders" };
const OWNER = { id: 1001, first_name: "Amina" };
const MEMBER = { id: 1002, first_name: "Bilal" };
const STRANGER = { id: 1003, first_name: "Chen" };

test("community onboarding and administration", { skip: !url && "TEST_DATABASE_URL is not set" }, async (t) => {
  await resetDatabase(url!);
  useTestDatabase(url!);
  Object.assign(process.env, {
    TELEGRAM_BOT_TOKEN: TOKEN,
    TELEGRAM_WEBHOOK_SECRET: "hook-secret",
    TELEGRAM_BOT_USERNAME: "isnad_test_bot",
    TELEGRAM_MINI_APP_SHORT_NAME: "askiik",
    ISNAD_COMMUNITY_ENABLED: "true",
  });

  const { getDatabase } = await import("@/lib/db");
  const { setTelegramClientForTesting } = await import("@/lib/community/telegramApi");
  const { processInboxUpdate } = await import("@/lib/community/updateProcessor");
  const { ingestTelegramWebhook } = await import("@/lib/community/webhookIngress");
  const { createConversation, upsertTelegramIdentity } = await import("@/lib/store");
  const listRoute = await import("@/app/api/v1/communities/route");
  const claimRoute = await import("@/app/api/v1/communities/claim/route");
  const communityRoute = await import("@/app/api/v1/communities/[communityId]/route");
  const settingsRoute = await import("@/app/api/v1/communities/[communityId]/settings/route");
  const activateRoute = await import("@/app/api/v1/communities/[communityId]/activate/route");
  const pauseRoute = await import("@/app/api/v1/communities/[communityId]/pause/route");
  const resumeRoute = await import("@/app/api/v1/communities/[communityId]/resume/route");
  const permissionsRoute = await import("@/app/api/v1/communities/[communityId]/permissions/route");
  const auditRoute = await import("@/app/api/v1/communities/[communityId]/audit/route");
  const rolesRoute = await import("@/app/api/v1/communities/[communityId]/roles/route");
  const revokeRoute = await import("@/app/api/v1/communities/[communityId]/roles/[assignmentId]/route");

  const sql = getDatabase();
  after(async () => sql.end());

  const telegram = new FakeTelegram(BOT_ID, "isnad_test_bot");
  setTelegramClientForTesting(telegram);
  for (const chat of [GROUP, OTHER_GROUP, CHANNEL]) telegram.setChat(chat);
  telegram.setMember(GROUP.id, OWNER.id, { status: "administrator" });
  telegram.setMember(GROUP.id, MEMBER.id, { status: "member" });
  telegram.setMember(GROUP.id, STRANGER.id, { status: "administrator" });
  telegram.setMember(GROUP.id, BOT_ID, { status: "member" });
  telegram.setMember(OTHER_GROUP.id, STRANGER.id, { status: "creator" });
  telegram.setMember(OTHER_GROUP.id, BOT_ID, { status: "administrator" });
  telegram.setMember(CHANNEL.id, OWNER.id, { status: "creator" });
  telegram.setMember(CHANNEL.id, BOT_ID, { status: "administrator" });

  let privateCalls = 0;
  const handlePrivate = async () => {
    privateCalls += 1;
  };
  let updateId = 1;
  let messageId = 1;

  const resetRateLimits = () => sql`DELETE FROM api_rate_limits`;

  async function deliver(update: Record<string, unknown>) {
    const body = { update_id: updateId++, ...update };
    const result = await ingestTelegramWebhook(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "hook-secret", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    assert.equal(result.response.status, 200);
    if (result.followUp) await processInboxUpdate(body.update_id, { handlePrivate });
    return body.update_id;
  }

  const groupText = (from: { id: number; first_name: string }, text: string, extra: Record<string, unknown> = {}) =>
    deliver({ message: { message_id: messageId++, chat: GROUP, from, text, ...extra } });

  const botMembership = (chat: typeof GROUP | typeof CHANNEL | typeof OTHER_GROUP, from: typeof OWNER, status: string, oldStatus = "left") =>
    deliver({
      my_chat_member: {
        chat,
        from,
        date: 1,
        old_chat_member: { status: oldStatus, user: { id: BOT_ID } },
        new_chat_member: { status, user: { id: BOT_ID } },
      },
    });

  function api(
    path: string,
    user: { id: number; first_name: string } | null,
    init: { method?: string; body?: unknown; idempotencyKey?: string; authDate?: number; startParam?: string; forge?: boolean } = {}
  ) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (user) {
      const signed = signInitData(init.forge ? "999:FORGED" : TOKEN, {
        user,
        authDate: init.authDate,
        startParam: init.startParam,
      });
      headers.set("X-Telegram-Init-Data", signed);
    }
    if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);
    return new NextRequest(`http://localhost${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  }
  const ctx = (communityId: string) => ({ params: Promise.resolve({ communityId }) });
  const key = () => `key-${Math.random().toString(36).slice(2)}-${Date.now()}`;

  let communityId = "";
  let otherCommunityId = "";
  let nonce = "";

  await t.test("installing the bot records a pending community and says nothing", async () => {
    await botMembership(GROUP, OWNER, "member");
    const [row] = await sql`SELECT id::text AS id, status, installed_by_telegram_user_id FROM communities WHERE telegram_chat_id = ${GROUP.id}`;
    assert.equal(row.status, "pending");
    assert.equal(Number(row.installed_by_telegram_user_id), OWNER.id);
    communityId = row.id;
    assert.equal(telegram.sent.length, 0);
  });

  await t.test("ordinary group messages, mentions and replies produce no response", async () => {
    await groupText(MEMBER, "Assalamu alaykum, is this hadith authentic?");
    await groupText(MEMBER, "@isnad_test_bot what is zakat?");
    await groupText(MEMBER, "thanks!", { reply_to_message: { message_id: 1, from: { id: BOT_ID, is_bot: true } } });
    await groupText(MEMBER, "/ask what is wudu");
    assert.equal(telegram.sent.length, 0);
    assert.equal(privateCalls, 0, "group messages never reach the private workflow");
  });

  await t.test("group commands never expose private conversation history", async () => {
    const ownerUserId = await upsertTelegramIdentity({ id: OWNER.id, first_name: OWNER.first_name });
    await createConversation(ownerUserId!, "telegram", "SECRET-PRIVATE-TITLE");
    for (const command of ["history", "sources", "new", "settings"]) {
      await groupText(OWNER, `/${command}@isnad_test_bot`);
    }
    assert.equal(privateCalls, 0);
    assert.equal(telegram.sent.length, 4);
    for (const message of telegram.sent) {
      assert.match(message.text, /works only in a private chat/);
      assert.equal(message.text.includes("SECRET"), false);
      assert.equal(message.chat_id, GROUP.id);
    }
    telegram.reset();
  });

  await t.test("/setup from a non-admin is silent unless addressed", async () => {
    await groupText(MEMBER, "/setup");
    assert.equal(telegram.sent.length, 0);
    await groupText(MEMBER, "/setup@isnad_test_bot");
    assert.equal(telegram.sent.length, 1);
    assert.match(telegram.sent[0].text, /Only administrators/);
    telegram.reset();
  });

  await t.test("/setup from an admin replies in-thread with a personal setup link", async () => {
    await groupText(OWNER, "/setup", { is_topic_message: true, message_thread_id: 42 });
    assert.equal(telegram.sent.length, 1);
    const sent = telegram.sent[0];
    assert.equal(sent.message_thread_id, 42, "stays in the forum topic");
    assert.ok(sent.reply_parameters?.message_id);
    const button = sent.reply_markup?.inline_keyboard[0][0] as { url: string };
    const match = button.url.match(/^https:\/\/t\.me\/isnad_test_bot\/askiik\?startapp=(cm_[A-Za-z0-9_-]+)$/);
    assert.ok(match, button.url);
    nonce = match[1];
    const [stored] = await sql`SELECT count(*)::int AS count FROM community_setup_nonces WHERE nonce_hash = ${nonce}`;
    assert.equal(stored.count, 0, "only a hash of the nonce is stored");
    telegram.reset();
  });

  await t.test("anonymous administrators are asked to identify themselves", async () => {
    await groupText({ id: 1087968824, first_name: "Group" }, "/setup", {
      from: { id: 1087968824, is_bot: true, first_name: "Group" },
      sender_chat: GROUP,
    });
    assert.equal(telegram.sent.length, 1);
    assert.match(telegram.sent[0].text, /anonymous administrator/);
    telegram.reset();
  });

  await t.test("authentication: forged, stale and future-dated sessions are rejected", async () => {
    const forged = await listRoute.GET(api("/api/v1/communities", OWNER, { forge: true }));
    assert.equal(forged.status, 401);
    const stale = await listRoute.GET(api("/api/v1/communities", OWNER, { authDate: Math.floor(Date.now() / 1000) - 7200 }));
    assert.equal(stale.status, 401);
    assert.equal((await stale.json()).error.code, "session_expired");
    const future = await listRoute.GET(api("/api/v1/communities", OWNER, { authDate: Math.floor(Date.now() / 1000) + 3600 }));
    assert.equal(future.status, 401);
    const missing = await listRoute.GET(api("/api/v1/communities", null));
    assert.equal(missing.status, 401);
  });

  await t.test("a setup link only works for the administrator it was issued to", async () => {
    const response = await claimRoute.POST(api("/api/v1/communities/claim", STRANGER, { method: "POST", body: { nonce, confirm: false } }));
    assert.equal(response.status, 403);
  });

  await t.test("claim preview shows the real community and bot permissions without writing", async () => {
    const response = await claimRoute.POST(
      api("/api/v1/communities/claim", OWNER, { method: "POST", startParam: nonce, body: { confirm: false } })
    );
    assert.equal(response.status, 200);
    const { preview } = await response.json();
    assert.equal(preview.title, "Study Circle");
    assert.equal(preview.ownership, "unclaimed");
    assert.equal(preview.bot.isAdministrator, false);
    const [owners] = await sql`SELECT count(*)::int AS count FROM community_memberships`;
    assert.equal(owners.count, 0);
  });

  await t.test("confirming a claim requires an idempotency key and is replay-safe", async () => {
    const noKey = await claimRoute.POST(api("/api/v1/communities/claim", OWNER, { method: "POST", body: { nonce, confirm: true } }));
    assert.equal(noKey.status, 422);

    const idem = key();
    const first = await claimRoute.POST(
      api("/api/v1/communities/claim", OWNER, { method: "POST", body: { nonce, confirm: true }, idempotencyKey: idem })
    );
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { communityId, outcome: "claimed" });
    const replay = await claimRoute.POST(
      api("/api/v1/communities/claim", OWNER, { method: "POST", body: { nonce, confirm: true }, idempotencyKey: idem })
    );
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get("Idempotent-Replayed"), "true");
    const reused = await claimRoute.POST(
      api("/api/v1/communities/claim", OWNER, { method: "POST", body: { communityId, confirm: true }, idempotencyKey: idem })
    );
    assert.equal(reused.status, 422);

    const consumed = await claimRoute.POST(api("/api/v1/communities/claim", OWNER, { method: "POST", body: { nonce, confirm: false } }));
    assert.equal(consumed.status, 404, "a used setup link cannot be replayed");
    const [community] = await sql`SELECT status FROM communities WHERE id = ${communityId}`;
    assert.equal(community.status, "pending", "claiming does not activate anything");
  });

  await t.test("another Telegram admin cannot take over a claimed community", async () => {
    const response = await claimRoute.POST(
      api("/api/v1/communities/claim", STRANGER, { method: "POST", body: { communityId, confirm: true }, idempotencyKey: key() })
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "owned_by_other");
  });

  await t.test("users only see communities they can manage right now", async () => {
    await botMembership(OTHER_GROUP, STRANGER, "administrator");
    const [other] = await sql`SELECT id::text AS id FROM communities WHERE telegram_chat_id = ${OTHER_GROUP.id}`;
    otherCommunityId = other.id;

    const mine = await (await listRoute.GET(api("/api/v1/communities", OWNER))).json();
    assert.deepEqual(mine.communities.map((c: { id: string }) => c.id), [communityId]);
    const theirs = await (await listRoute.GET(api("/api/v1/communities", STRANGER))).json();
    assert.deepEqual(theirs.communities.map((c: { id: string; claimable: boolean }) => [c.id, c.claimable]), [[otherCommunityId, true]]);
    const nobody = await (await listRoute.GET(api("/api/v1/communities", MEMBER))).json();
    assert.deepEqual(nobody.communities, []);
  });

  await t.test("blocking #1: a user cannot read or change another community", async () => {
    const read = await communityRoute.GET(api(`/api/v1/communities/${otherCommunityId}`, OWNER), ctx(otherCommunityId));
    assert.equal(read.status, 404);
    const write = await settingsRoute.PATCH(
      api(`/api/v1/communities/${otherCommunityId}/settings`, OWNER, { method: "PATCH", body: { version: 1, assistant: { enabled: false } } }),
      ctx(otherCommunityId)
    );
    assert.equal(write.status, 404);
    const pause = await pauseRoute.POST(
      api(`/api/v1/communities/${otherCommunityId}/pause`, OWNER, { method: "POST", body: {}, idempotencyKey: key() }),
      ctx(otherCommunityId)
    );
    assert.equal(pause.status, 404);
    const invalid = await communityRoute.GET(api("/api/v1/communities/not-a-uuid", OWNER), ctx("not-a-uuid"));
    assert.equal(invalid.status, 404);
    const memberRead = await communityRoute.GET(api(`/api/v1/communities/${communityId}`, MEMBER), ctx(communityId));
    assert.equal(memberRead.status, 404, "a plain member with no role cannot even confirm it exists");
  });

  let version = 0;

  await t.test("the owner sees the community, modules and live capabilities", async () => {
    const response = await communityRoute.GET(api(`/api/v1/communities/${communityId}`, OWNER), ctx(communityId));
    assert.equal(response.status, 200);
    const { community } = await response.json();
    assert.equal(community.status, "pending");
    assert.deepEqual(community.viewer.roles, ["owner"]);
    assert.ok(community.viewer.capabilities.includes("community.activate"));
    assert.equal(community.settings.version, 1);
    assert.equal(community.activation.ready, false, "privacy-mode bot cannot see @mentions");
    version = community.settings.version;
  });

  await t.test("settings: validation, optimistic concurrency and audit", async () => {
    const invalid = await settingsRoute.PATCH(
      api(`/api/v1/communities/${communityId}/settings`, OWNER, { method: "PATCH", body: { version, publisher: { approvalRequired: false } } }),
      ctx(communityId)
    );
    assert.equal(invalid.status, 422);

    const first = await settingsRoute.PATCH(
      api(`/api/v1/communities/${communityId}/settings`, OWNER, {
        method: "PATCH",
        body: { version, assistant: { answerLength: "balanced" }, timezone: "Europe/London" },
      }),
      ctx(communityId)
    );
    assert.equal(first.status, 200);
    const updated = (await first.json()).community;
    assert.equal(updated.settings.version, version + 1);
    assert.equal(updated.timezone, "Europe/London");

    const stale = await settingsRoute.PATCH(
      api(`/api/v1/communities/${communityId}/settings`, OWNER, { method: "PATCH", body: { version, assistant: { answerLength: "detailed" } } }),
      ctx(communityId)
    );
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.currentVersion, version + 1);
    version += 1;
  });

  await t.test("blocking #6: a missing bot permission blocks activation of the dependent module", async () => {
    const blocked = await activateRoute.POST(
      api(`/api/v1/communities/${communityId}/activate`, OWNER, { method: "POST", body: { settingsVersion: version }, idempotencyKey: key() }),
      ctx(communityId)
    );
    assert.equal(blocked.status, 422);
    const body = await blocked.json();
    assert.equal(body.error.code, "missing_permissions");
    assert.deepEqual(body.error.modules.map((m: { key: string }) => m.key), ["assistant"]);
  });

  await t.test("activation succeeds after the permission is granted, and the bot stays silent", async () => {
    telegram.setMember(GROUP.id, BOT_ID, { status: "administrator" });
    const recheck = await permissionsRoute.GET(api(`/api/v1/communities/${communityId}/permissions`, OWNER), ctx(communityId));
    assert.equal((await recheck.json()).community.activation.ready, true);

    const stale = await activateRoute.POST(
      api(`/api/v1/communities/${communityId}/activate`, OWNER, { method: "POST", body: { settingsVersion: version - 1 }, idempotencyKey: key() }),
      ctx(communityId)
    );
    assert.equal(stale.status, 409, "must activate the configuration that was reviewed");

    const response = await activateRoute.POST(
      api(`/api/v1/communities/${communityId}/activate`, OWNER, { method: "POST", body: { settingsVersion: version }, idempotencyKey: key() }),
      ctx(communityId)
    );
    assert.equal(response.status, 200);
    const { community } = await response.json();
    assert.equal(community.status, "active");
    assert.ok(community.modules.every((m: { state: string }) => m.state !== "ready"), "no module runtime ships in C0");

    telegram.reset();
    await groupText(MEMBER, "@isnad_test_bot is music permissible?");
    await groupText(MEMBER, "general chatter");
    assert.equal(telegram.sent.length, 0);
  });

  await t.test("blocking #4: an owner demoted in Telegram immediately loses privileged actions", async () => {
    await resetRateLimits();
    telegram.setMember(GROUP.id, OWNER.id, { status: "member" });
    const patch = await settingsRoute.PATCH(
      api(`/api/v1/communities/${communityId}/settings`, OWNER, { method: "PATCH", body: { version, assistant: { answerLength: "concise" } } }),
      ctx(communityId)
    );
    assert.equal(patch.status, 403);
    assert.equal((await patch.json()).error.code, "telegram_rights_required");
    const pause = await pauseRoute.POST(
      api(`/api/v1/communities/${communityId}/pause`, OWNER, { method: "POST", body: {}, idempotencyKey: key() }),
      ctx(communityId)
    );
    assert.equal(pause.status, 403);
    const read = await communityRoute.GET(api(`/api/v1/communities/${communityId}`, OWNER), ctx(communityId));
    assert.equal(read.status, 200, "read-only access remains while still a member");
    assert.equal((await read.json()).community.viewer.capabilities.includes("settings.update"), false);

    telegram.setMember(GROUP.id, OWNER.id, { status: "left" });
    const gone = await communityRoute.GET(api(`/api/v1/communities/${communityId}`, OWNER), ctx(communityId));
    assert.equal(gone.status, 403);
    telegram.setMember(GROUP.id, OWNER.id, { status: "administrator" });
  });

  await t.test("Telegram outages fail closed instead of granting access", async () => {
    const { TelegramApiError } = await import("@/lib/community/telegramApi");
    telegram.failNext("getChatMember", new TelegramApiError("getChatMember", "timeout", "timed out"));
    const response = await settingsRoute.PATCH(
      api(`/api/v1/communities/${communityId}/settings`, OWNER, { method: "PATCH", body: { version, assistant: { answerLength: "concise" } } }),
      ctx(communityId)
    );
    assert.equal(response.status, 503);
    const [settings] = await sql`SELECT version FROM community_settings WHERE community_id = ${communityId}`;
    assert.equal(settings.version, version, "nothing changed");
  });

  await t.test("delegated roles still need live Telegram rights, and revocation is immediate", async () => {
    const grant = await rolesRoute.POST(
      api(`/api/v1/communities/${communityId}/roles`, OWNER, {
        method: "POST",
        body: { telegramUserId: MEMBER.id, role: "community_manager" },
        idempotencyKey: key(),
      }),
      ctx(communityId)
    );
    assert.equal(grant.status, 201);
    const { assignmentId } = await grant.json();

    const ownerGrant = await rolesRoute.POST(
      api(`/api/v1/communities/${communityId}/roles`, OWNER, { method: "POST", body: { telegramUserId: MEMBER.id, role: "owner" }, idempotencyKey: key() }),
      ctx(communityId)
    );
    assert.equal(ownerGrant.status, 422, "ownership is not delegable");

    const asMember = await pauseRoute.POST(
      api(`/api/v1/communities/${communityId}/pause`, MEMBER, { method: "POST", body: {}, idempotencyKey: key() }),
      ctx(communityId)
    );
    assert.equal(asMember.status, 403, "manager role without Telegram admin rights");

    const managerCannotManageRoles = await rolesRoute.POST(
      api(`/api/v1/communities/${communityId}/roles`, MEMBER, { method: "POST", body: { telegramUserId: 5, role: "publisher" }, idempotencyKey: key() }),
      ctx(communityId)
    );
    assert.equal(managerCannotManageRoles.status, 403);

    const revoke = await revokeRoute.DELETE(
      api(`/api/v1/communities/${communityId}/roles/${assignmentId}`, OWNER, { method: "DELETE" }),
      { params: Promise.resolve({ communityId, assignmentId }) }
    );
    assert.equal(revoke.status, 200);
    const after = await communityRoute.GET(api(`/api/v1/communities/${communityId}`, MEMBER), ctx(communityId));
    assert.equal(after.status, 404);
  });

  await t.test("blocking #8: pause from the group stops everything; resume re-checks permissions", async () => {
    const { moduleMayAct } = await import("@/lib/community/botPermissions");
    const { getCommunityById, getCommunitySettings } = await import("@/lib/community/communityRegistry");
    await resetRateLimits();
    telegram.reset();
    await groupText(OWNER, "/pause raid in progress");
    assert.match(telegram.sent[0].text, /paused/);
    const paused = (await getCommunityById(communityId))!;
    assert.equal(paused.status, "paused");
    assert.equal(paused.pauseReason, "raid in progress");
    const settings = await getCommunitySettings(paused);
    for (const key of ["assistant", "verification", "publisher", "learning"] as const) {
      assert.equal(moduleMayAct(key, paused.chatType, paused.status, settings, paused.botPermissions), false);
    }

    // Admin access stays available while paused.
    const read = await auditRoute.GET(api(`/api/v1/communities/${communityId}/audit`, OWNER), ctx(communityId));
    assert.equal(read.status, 200);

    telegram.setMember(GROUP.id, BOT_ID, { status: "member" });
    const blocked = await resumeRoute.POST(
      api(`/api/v1/communities/${communityId}/resume`, OWNER, { method: "POST", idempotencyKey: key() }),
      ctx(communityId)
    );
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.resumed, false);
    assert.equal(blockedBody.community.status, "permission_lost");

    telegram.setMember(GROUP.id, BOT_ID, { status: "administrator" });
    const resumed = await resumeRoute.POST(
      api(`/api/v1/communities/${communityId}/resume`, OWNER, { method: "POST", idempotencyKey: key() }),
      ctx(communityId)
    );
    const resumedBody = await resumed.json();
    assert.equal(resumedBody.resumed, true);
    assert.equal(resumedBody.community.status, "active");
  });

  await t.test("the bot losing a required permission moves an active community to permission_lost", async () => {
    await deliver({
      my_chat_member: {
        chat: GROUP,
        from: OWNER,
        date: 2,
        old_chat_member: { status: "administrator", user: { id: BOT_ID } },
        new_chat_member: { status: "member", user: { id: BOT_ID } },
      },
    });
    const [row] = await sql`SELECT status FROM communities WHERE id = ${communityId}`;
    assert.equal(row.status, "permission_lost");
    telegram.setMember(GROUP.id, BOT_ID, { status: "administrator" });
  });

  await t.test("admin demotions are tracked from chat_member updates", async () => {
    await deliver({
      chat_member: {
        chat: GROUP,
        from: STRANGER,
        date: 3,
        old_chat_member: { status: "administrator", user: { id: OWNER.id } },
        new_chat_member: { status: "member", user: { id: OWNER.id } },
      },
    });
    const [event] = await sql`
      SELECT action FROM community_audit_events WHERE community_id = ${communityId} ORDER BY created_at DESC LIMIT 1
    `;
    assert.equal(event.action, "membership.telegram_rights_lost");
  });

  await t.test("the audit log records every administrative step without message content", async () => {
    const response = await auditRoute.GET(api(`/api/v1/communities/${communityId}/audit?limit=100`, OWNER), ctx(communityId));
    const { events } = await response.json();
    const actions = events.map((event: { action: string }) => event.action).reverse();
    for (const expected of [
      "bot.added",
      "community.claimed",
      "settings.updated",
      "community.activated",
      "role.granted",
      "role.revoked",
      "community.paused",
      "community.resume_blocked",
      "community.resumed",
      "bot.permissions_changed",
    ]) {
      assert.ok(actions.includes(expected), `missing ${expected}`);
    }
    const [raw] = await sql`
      SELECT count(*)::int AS count FROM community_audit_events
      WHERE before_summary::text ILIKE '%raid in progress%' OR after_summary::text ILIKE '%chatter%'
    `;
    assert.equal(raw.count, 0, "pause reasons and messages stay out of audit summaries");
  });

  await t.test("channels: Q&A is auto-disabled and the private /community flow works", async () => {
    await botMembership(CHANNEL, OWNER, "administrator");
    telegram.reset();
    await deliver({ message: { message_id: messageId++, chat: { id: OWNER.id, type: "private" }, from: OWNER, text: "/community" } });
    assert.equal(telegram.sent.length, 1);
    const button = telegram.sent[0].reply_markup?.inline_keyboard[0][0] as { web_app?: { url: string } };
    assert.match(button.web_app!.url, /\/telegram\/community$/);
    assert.equal(privateCalls, 0);

    const list = await (await listRoute.GET(api("/api/v1/communities", OWNER))).json();
    const channel = list.communities.find((c: { chatType: string }) => c.chatType === "channel");
    assert.equal(channel.claimable, true);
    const claim = await claimRoute.POST(
      api("/api/v1/communities/claim", OWNER, { method: "POST", body: { communityId: channel.id, confirm: true }, idempotencyKey: key() })
    );
    assert.equal(claim.status, 200);
    const { community } = await (await communityRoute.GET(api(`/api/v1/communities/${channel.id}`, OWNER), ctx(channel.id))).json();
    assert.equal(community.settings.assistant.enabled, false);
    assert.equal(community.modules.find((m: { key: string }) => m.key === "assistant").state, "incompatible");
    assert.equal(
      community.modules.find((m: { key: string }) => m.key === "publisher").state,
      "blocked_permissions",
      "a channel admin bot without post rights cannot publish"
    );

    const enable = await settingsRoute.PATCH(
      api(`/api/v1/communities/${channel.id}/settings`, OWNER, {
        method: "PATCH",
        body: { version: community.settings.version, assistant: { enabled: true } },
      }),
      ctx(channel.id)
    );
    assert.equal(enable.status, 422);
  });

  await t.test("the Telegram chat creator can recover ownership explicitly", async () => {
    await resetRateLimits();
    // STRANGER is creator of OTHER_GROUP but OWNER claims it first via a live-admin check.
    telegram.setMember(OTHER_GROUP.id, OWNER.id, { status: "administrator" });
    const claimed = await claimRoute.POST(
      api("/api/v1/communities/claim", OWNER, { method: "POST", body: { communityId: otherCommunityId, confirm: true }, idempotencyKey: key() })
    );
    assert.equal(claimed.status, 200);
    const denied = await claimRoute.POST(
      api("/api/v1/communities/claim", STRANGER, { method: "POST", body: { communityId: otherCommunityId, confirm: true }, idempotencyKey: key() })
    );
    assert.equal(denied.status, 409);
    assert.equal((await denied.json()).error.canRecoverOwnership, true);
    const recovered = await claimRoute.POST(
      api("/api/v1/communities/claim", STRANGER, {
        method: "POST",
        body: { communityId: otherCommunityId, confirm: true, recoverOwnership: true },
        idempotencyKey: key(),
      })
    );
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).outcome, "ownership_recovered");
    const lost = await communityRoute.GET(api(`/api/v1/communities/${otherCommunityId}`, OWNER), ctx(otherCommunityId));
    assert.equal(lost.status, 404);
  });

  await t.test("removing the bot marks the community removed and blocks changes", async () => {
    await resetRateLimits();
    await botMembership(GROUP, OWNER, "left", "administrator");
    const [row] = await sql`SELECT status FROM communities WHERE id = ${communityId}`;
    assert.equal(row.status, "removed");
    const patch = await settingsRoute.PATCH(
      api(`/api/v1/communities/${communityId}/settings`, OWNER, { method: "PATCH", body: { version, assistant: { answerLength: "concise" } } }),
      ctx(communityId)
    );
    assert.equal(patch.status, 409);

    await botMembership(GROUP, OWNER, "administrator");
    const [readded] = await sql`SELECT status, activated_at FROM communities WHERE id = ${communityId}`;
    assert.equal(readded.status, "pending", "re-adding never re-activates automatically");
    assert.equal(readded.activated_at, null);
  });

  await t.test("group → supergroup migration keeps the community", async () => {
    const legacyGroup = { id: -555, type: "group" as const, title: "Old Group" };
    telegram.setChat(legacyGroup);
    await botMembership(legacyGroup as unknown as typeof GROUP, OWNER, "member");
    await deliver({ message: { message_id: messageId++, chat: legacyGroup, from: OWNER, migrate_to_chat_id: -100555 } });
    const [row] = await sql`SELECT chat_type FROM communities WHERE telegram_chat_id = -100555`;
    assert.equal(row.chat_type, "supergroup");
  });

  await t.test("rate limits return 429", async () => {
    await resetRateLimits();
    let last = 0;
    for (let index = 0; index < 31; index += 1) {
      const response = await claimRoute.POST(
        api("/api/v1/communities/claim", MEMBER, { method: "POST", body: { communityId: otherCommunityId, confirm: false } })
      );
      last = response.status;
    }
    assert.equal(last, 429);
  });

  await t.test("blocking #10: private chats still reach the existing workflow", async () => {
    const before = privateCalls;
    await deliver({ message: { message_id: messageId++, chat: { id: MEMBER.id, type: "private" }, from: MEMBER, text: "What is ihsan?" } });
    await deliver({ message: { message_id: messageId++, chat: { id: MEMBER.id, type: "private" }, from: MEMBER, text: "/history" } });
    assert.equal(privateCalls, before + 2);
  });
});
