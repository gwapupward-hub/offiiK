import assert from "node:assert/strict";
import { after, test } from "node:test";
import { resetDatabase, testDatabaseUrl, useTestDatabase } from "../helpers/database";
import { FakeTelegram } from "../helpers/fakeTelegram";

const url = testDatabaseUrl();

test("durable inbox", { skip: !url && "TEST_DATABASE_URL is not set" }, async (t) => {
  await resetDatabase(url!);
  useTestDatabase(url!);
  process.env.TELEGRAM_BOT_TOKEN = "123456:TEST";
  process.env.TELEGRAM_WEBHOOK_SECRET = "hook-secret";
  process.env.ISNAD_COMMUNITY_ENABLED = "true";

  const { getDatabase } = await import("@/lib/db");
  const { setTelegramClientForTesting, TelegramApiError } = await import("@/lib/community/telegramApi");
  const inbox = await import("@/lib/community/telegramInbox");
  const { processInboxUpdate, drainInbox } = await import("@/lib/community/updateProcessor");
  const { ingestTelegramWebhook } = await import("@/lib/community/webhookIngress");
  const sql = getDatabase();
  after(async () => sql.end());

  const telegram = new FakeTelegram();
  setTelegramClientForTesting(telegram);

  // Any real Bot API call from the private failure notice would hit the network.
  const outbound: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    outbound.push(String(input).replace(/bot[^/]+/, "bot<token>"));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  }) as typeof fetch;

  let privateCalls = 0;
  const handlePrivate = async () => {
    privateCalls += 1;
  };

  const privateUpdate = (id: number) => ({
    update_id: id,
    message: { message_id: id, chat: { id: 1001, type: "private" }, from: { id: 1001, first_name: "A" }, text: "What is ihsan?" },
  });

  const deliver = (body: unknown) =>
    ingestTelegramWebhook(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "hook-secret", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );

  await t.test("one update produces exactly one AI response, even when Telegram redelivers it", async () => {
    const first = await deliver(privateUpdate(100));
    const second = await deliver(privateUpdate(100));
    assert.equal(first.response.status, 200);
    assert.deepEqual(await second.response.json(), { ok: true, duplicate: true });
    assert.equal(second.followUp, undefined);

    assert.equal(await processInboxUpdate(100, { handlePrivate }), "succeeded");
    assert.equal(await processInboxUpdate(100, { handlePrivate }), "skipped");
    assert.equal(privateCalls, 1);
    const [row] = await sql`SELECT status, side_effect_started_at FROM telegram_inbox WHERE update_id = 100`;
    assert.equal(row.status, "succeeded");
    assert.ok(row.side_effect_started_at);
  });

  await t.test("an update already handled by the previous deployment is not processed again", async () => {
    await sql`INSERT INTO processed_telegram_updates (update_id) VALUES (101)`;
    const result = await deliver(privateUpdate(101));
    assert.deepEqual(await result.response.json(), { ok: true, duplicate: true });
  });

  await t.test("ordinary group chatter is deduplicated but its content is never stored", async () => {
    const result = await deliver({
      update_id: 102,
      message: { message_id: 1, chat: { id: -100, type: "supergroup" }, from: { id: 5, first_name: "B" }, text: "my private thoughts" },
    });
    assert.equal(result.followUp, undefined);
    const [row] = await sql`SELECT status, payload FROM telegram_inbox WHERE update_id = 102`;
    assert.equal(row.status, "succeeded");
    assert.equal(row.payload, null);
  });

  await t.test("a crash after the AI reply started is never retried (outcome unknown)", async () => {
    await deliver(privateUpdate(103));
    const claimed = await inbox.claimUpdate(103);
    assert.ok(claimed);
    await inbox.markSideEffectStarted(103);
    // Simulate the worker dying: the lease simply expires.
    await sql`UPDATE telegram_inbox SET lease_expires_at = now() - interval '1 second' WHERE update_id = 103`;
    const before = privateCalls;
    await drainInbox(10, { handlePrivate });
    assert.equal(privateCalls, before, "no second AI response");
    const [row] = await sql`SELECT status, last_error_code FROM telegram_inbox WHERE update_id = 103`;
    assert.deepEqual({ ...row }, { status: "terminal_failed", last_error_code: "outcome_unknown" });
  });

  await t.test("a crash before any side effect is retried after the lease expires", async () => {
    await sql`
      INSERT INTO telegram_inbox (update_id, update_kind, payload, status, attempts, lease_expires_at)
      VALUES (104, 'message', ${sql.json(privateUpdate(104) as never)}, 'processing', 1, now() - interval '1 second')
    `;
    const before = privateCalls;
    await drainInbox(10, { handlePrivate });
    assert.equal(privateCalls, before + 1);
    const [row] = await sql`SELECT status, attempts FROM telegram_inbox WHERE update_id = 104`;
    assert.deepEqual({ ...row }, { status: "succeeded", attempts: 2 });
  });

  await t.test("unexpected handler errors are terminal; transient snapshot lookups are tolerated", async () => {
    const membership = {
      update_id: 105,
      my_chat_member: {
        chat: { id: -100555, type: "supergroup", title: "Retry Circle" },
        from: { id: 1001, first_name: "A" },
        date: 1,
        old_chat_member: { status: "left", user: { id: telegram.botId } },
        new_chat_member: { status: "member", user: { id: telegram.botId } },
      },
    };
    await deliver(membership);
    // The registry write happens after getChat/getMe, which fail transiently;
    // the snapshot falls back gracefully, so force a DB-visible failure instead.
    await sql`ALTER TABLE communities RENAME TO communities_tmp`;
    const failed = await processInboxUpdate(105);
    await sql`ALTER TABLE communities_tmp RENAME TO communities`;
    assert.equal(failed, "terminal_failed", "an unexpected handler error is terminal, not silently successful");

    await deliver({ ...membership, update_id: 106 });
    telegram.failNext("getMe", new TelegramApiError("getMe", "api", "Too Many Requests", { errorCode: 429, retryAfterSeconds: 2 }));
    telegram.failNext("getChat", new TelegramApiError("getChat", "network", "network"));
    // getMe/getChat failures are tolerated for snapshots, so this succeeds and records the install.
    assert.equal(await processInboxUpdate(106), "succeeded");
    const [community] = await sql`SELECT status FROM communities WHERE telegram_chat_id = -100555`;
    assert.equal(community.status, "pending");
  });

  await t.test("Telegram 429 on a group reply backs off and retries; it is never marked successful", async () => {
    telegram.setChat({ id: -100777, type: "supergroup", title: "Help Circle" });
    process.env.TELEGRAM_BOT_USERNAME = "isnad_test_bot";
    await deliver({
      update_id: 107,
      message: { message_id: 3, chat: { id: -100777, type: "supergroup" }, from: { id: 9, first_name: "C" }, text: "/help@isnad_test_bot" },
    });
    telegram.failNext("sendMessage", new TelegramApiError("sendMessage", "api", "Too Many Requests", { errorCode: 429, retryAfterSeconds: 3 }));
    assert.equal(await processInboxUpdate(107), "retryable_failed");
    const [row] = await sql`
      SELECT status, last_error_code, side_effect_started_at,
             next_attempt_at BETWEEN now() + interval '2 seconds' AND now() + interval '4 seconds' AS honours_retry_after
      FROM telegram_inbox WHERE update_id = 107
    `;
    assert.deepEqual({ ...row }, {
      status: "retryable_failed",
      last_error_code: "telegram_429",
      side_effect_started_at: null,
      honours_retry_after: true,
    });
    assert.equal(telegram.sent.length, 0);
    await sql`UPDATE telegram_inbox SET next_attempt_at = now() WHERE update_id = 107`;
    assert.equal(await processInboxUpdate(107), "succeeded");
    assert.equal(telegram.sent.length, 1, "exactly one reply after the retry");
    telegram.reset();
  });

  await t.test("a send timeout is never retried (the message may have been delivered)", async () => {
    await deliver({
      update_id: 111,
      message: { message_id: 5, chat: { id: -100777, type: "supergroup" }, from: { id: 9, first_name: "C" }, text: "/help@isnad_test_bot" },
    });
    telegram.failNext("sendMessage", new TelegramApiError("sendMessage", "timeout", "timed out"));
    assert.equal(await processInboxUpdate(111), "terminal_failed");
    await sql`UPDATE telegram_inbox SET next_attempt_at = now() WHERE update_id = 111`;
    assert.equal(await processInboxUpdate(111), "skipped");
  });

  await t.test("a retryable failure with no side effect moves to retryable_failed, then succeeds", async () => {
    await deliver({
      update_id: 108,
      message: { message_id: 4, chat: { id: -100777, type: "supergroup" }, from: { id: 9, first_name: "C" }, text: "/setup" },
    });
    telegram.failNext("getChatMember", new TelegramApiError("getChatMember", "timeout", "timed out"));
    assert.equal(await processInboxUpdate(108), "retryable_failed");
    const [row] = await sql`SELECT status, next_attempt_at > now() AS backing_off FROM telegram_inbox WHERE update_id = 108`;
    assert.deepEqual({ ...row }, { status: "retryable_failed", backing_off: true });
    assert.equal(await processInboxUpdate(108), "skipped", "not before next_attempt_at");
    await sql`UPDATE telegram_inbox SET next_attempt_at = now() WHERE update_id = 108`;
    assert.equal(await processInboxUpdate(108), "succeeded");
    assert.equal(telegram.sent.length, 0, "a non-admin /setup stays silent");
  });

  await t.test("a terminal private failure tells the user once", async () => {
    await deliver(privateUpdate(109));
    outbound.length = 0;
    const status = await processInboxUpdate(109, {
      handlePrivate: async () => {
        throw new Error("model unavailable");
      },
    });
    assert.equal(status, "terminal_failed");
    assert.equal(outbound.length, 1);
    assert.match(outbound[0], /sendMessage$/);
  });

  await t.test("storage outages are not acknowledged", async () => {
    await sql`ALTER TABLE telegram_inbox RENAME TO telegram_inbox_tmp`;
    const result = await deliver(privateUpdate(110));
    await sql`ALTER TABLE telegram_inbox_tmp RENAME TO telegram_inbox`;
    assert.equal(result.response.status, 503);
  });

  await t.test("retention purges payloads and old rows", async () => {
    await sql`UPDATE telegram_inbox SET received_at = now() - interval '4 days' WHERE update_id = 100`;
    await sql`UPDATE telegram_inbox SET received_at = now() - interval '31 days' WHERE update_id = 104`;
    const result = await inbox.purgeInbox();
    assert.ok(result.payloadsPurged >= 1);
    assert.ok(result.rowsDeleted >= 1);
    const [row] = await sql`SELECT payload FROM telegram_inbox WHERE update_id = 100`;
    assert.equal(row.payload, null);
  });
});
