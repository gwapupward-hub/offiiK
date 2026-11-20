import assert from "node:assert/strict";
import { after, test } from "node:test";
import { resetDatabase, testDatabaseUrl, useTestDatabase } from "../helpers/database";
import { FakeTelegram } from "../helpers/fakeTelegram";

const url = testDatabaseUrl();
const GROUP = { id: -1003101, type: "supergroup" as const, title: "Circle One", is_forum: true };
const OTHER = { id: -1003102, type: "supergroup" as const, title: "Circle Two" };
const BOT_ID = 123456;
const USER = { id: 30001, first_name: "Learner" };

test("C1 scoped group Q&A persists only local interactions and obeys pause", {
  skip: !url && "TEST_DATABASE_URL is not set",
}, async () => {
  await resetDatabase(url!);
  useTestDatabase(url!);
  process.env.OPENAI_API_KEY = "fake-test-key";
  process.env.ISNAD_COMMUNITY_ENABLED = "true";

  const { getDatabase } = await import("@/lib/db");
  const { defaultSettings } = await import("@/lib/community/settingsSchema");
  const { classifyUpdate } = await import("@/lib/community/telegramDispatcher");
  const { executeGroupAssistantRoute } = await import("@/lib/community/communityAssistant");
  const { createConversation, saveMessage, upsertTelegramIdentity } = await import("@/lib/store");

  const sql = getDatabase();
  after(async () => sql.end());
  const telegram = new FakeTelegram(BOT_ID, "isnad_test_bot");
  for (const chat of [GROUP, OTHER]) {
    telegram.setChat(chat);
    telegram.setMember(chat.id, BOT_ID, { status: "administrator" });
  }

  const settings = defaultSettings("supergroup");
  settings.assistant.cooldownSeconds = 0;
  const communityIds: string[] = [];
  for (const chat of [GROUP, OTHER]) {
    const [row] = await sql.unsafe<Array<{ id: string }>>(
      "INSERT INTO communities (telegram_chat_id, chat_type, title, status) " +
      "VALUES ($1, $2, $3, 'active') RETURNING id::text AS id",
      [chat.id, chat.type, chat.title]
    );
    const id = row.id;
    communityIds.push(id);
    await sql`
      INSERT INTO community_settings
      (community_id, assistant_config, verification_config, publisher_config, learning_config)
      VALUES (
        ${id},
        ${sql.json(settings.assistant as never)},
        ${sql.json(settings.verification as never)},
        ${sql.json(settings.publisher as never)},
        ${sql.json(settings.learning as never)}
      )
    `;
  }

  const { getCommunityByChatId, getCommunitySettings } = await import("@/lib/community/communityRegistry");
  const saved = await getCommunityByChatId(GROUP.id);
  assert.ok(saved);
  const effective = await getCommunitySettings(saved);
  assert.equal(effective.assistant.cooldownSeconds, 0, "zero cooldown must survive settings persistence");

  const userId = await upsertTelegramIdentity(USER);
  const privateConversation = await createConversation(userId!, "telegram", "PRIVATE SECRET");
  await saveMessage({ conversationId: privateConversation.id, role: "user", content: "PRIVATE SECRET" });

  let updateId = 1;
  let messageId = 1;
  let markCount = 0;
  const historySnapshots: string[] = [];
  const hooks = {
    markSideEffect: async () => { markCount += 1; },
    releaseSideEffect: async () => {},
  };

  async function ask(chat: typeof GROUP | typeof OTHER, question: string) {
    const update = {
      update_id: updateId++,
      message: { message_id: messageId++, chat, from: USER, text: "/ask " + question },
    };
    const route = classifyUpdate(update, { id: BOT_ID, username: "isnad_test_bot" }, {
      communityEnabled: true, assistantReleased: true,
    });
    assert.equal(route.kind, "group_assistant");
    if (route.kind !== "group_assistant") throw new Error("Not an assistant route");
    await executeGroupAssistantRoute(route, {
      client: telegram,
      generate: async (_prompt, history) => {
        historySnapshots.push(history.map((message) => message.content).join(" | "));
        return "A sourced educational answer.";
      },
    }, hooks);
  }

  await ask(GROUP, "What is tawakkul?");
  assert.equal(telegram.sent.length, 1);
  assert.equal(telegram.sent[0].chat_id, GROUP.id);
  assert.ok(telegram.sent[0].reply_parameters?.message_id);
  assert.equal(markCount, 1);

  await ask(GROUP, "Please elaborate.");
  assert.equal(telegram.sent.length, 2);
  assert.match(historySnapshots[1], /What is tawakkul/);
  assert.match(historySnapshots[1], /A sourced educational answer/);
  assert.doesNotMatch(historySnapshots[1], /PRIVATE SECRET/);

  await ask(OTHER, "What is sadaqah?");
  assert.equal(telegram.sent.length, 3);
  assert.doesNotMatch(historySnapshots[2], /What is tawakkul/);
  assert.doesNotMatch(historySnapshots[2], /PRIVATE SECRET/);

  const rows = await sql.unsafe<Array<{ community_id: string; count: number }>>(
    "SELECT community_id::text AS community_id, count(*)::int AS count " +
    "FROM community_interactions GROUP BY community_id"
  );
  assert.equal(rows.length, 2);
  assert.equal(Number(rows.find((row) => row.community_id === communityIds[0])?.count), 2);
  assert.equal(Number(rows.find((row) => row.community_id === communityIds[1])?.count), 1);

  // A staging-equivalent webhook simulation: authenticated ingress -> durable
  // inbox -> AI route -> mocked Telegram, with no live bot or model calls.
  const { ingestTelegramWebhook } = await import("@/lib/community/webhookIngress");
  const { processInboxUpdate } = await import("@/lib/community/updateProcessor");
  Object.assign(process.env, {
    TELEGRAM_BOT_TOKEN: "123456:STAGING-TEST-TOKEN",
    TELEGRAM_WEBHOOK_SECRET: "C1-Test-Webhook-Secret",
    TELEGRAM_BOT_USERNAME: "isnad_test_bot",
  });
  async function deliver(kind: "message" | "channel_post", text: string, chat = GROUP) {
    const id = 9000 + updateId++;
    const message = { message_id: messageId++, chat, from: USER, text };
    const result = await ingestTelegramWebhook(new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": "C1-Test-Webhook-Secret" },
      body: JSON.stringify({ update_id: id, [kind]: message }),
    }));
    assert.equal(result.response.status, 200);
    return id;
  }
  const ignoredId = await deliver("message", "ordinary group chatter");
  const [ignored] = await sql.unsafe<Array<{ status: string; has_payload: boolean }>>(
    "SELECT status, payload IS NOT NULL AS has_payload FROM telegram_inbox WHERE update_id = $1", [ignoredId]
  );
  assert.equal(ignored.status, "succeeded");
  assert.equal(ignored.has_payload, false, "ordinary chatter must not be stored");

  const mentionedId = await deliver("message", "@isnad_test_bot please explain ihsan");
  const [retained] = await sql.unsafe<Array<{ status: string; has_payload: boolean }>>(
    "SELECT status, payload IS NOT NULL AS has_payload FROM telegram_inbox WHERE update_id = $1", [mentionedId]
  );
  assert.equal(retained.status, "pending");
  assert.equal(retained.has_payload, true, "explicit mention is eligible for processing");
  const before = telegram.sent.length;
  const result = await processInboxUpdate(mentionedId, {
    token: "123456:STAGING-TEST-TOKEN", client: telegram,
    generateGroup: async (_prompt, messages) => {
      assert.doesNotMatch(messages.map(x => x.content).join(" "), /PRIVATE SECRET/);
      return "The Ihsan hadith teaches worship with excellence."; 
    },
  });
  assert.equal(result, "succeeded");
  assert.equal(telegram.sent.length, before + 1);
  assert.equal(telegram.sent.at(-1)?.chat_id, GROUP.id);
  assert.match(telegram.sent.at(-1)!.text, /Ihsan hadith/);
  const duplicate = await processInboxUpdate(mentionedId, {
    token: "123456:STAGING-TEST-TOKEN", client: telegram,
    generateGroup: async () => "This must not send twice",
  });
  assert.equal(duplicate, "skipped");
  assert.equal(telegram.sent.length, before + 1);

  // Replay as a channel update: the assistant must not ingest/channel-respond.
  const channelId = await deliver("channel_post", "/ask religious question");
  const [channel] = await sql.unsafe<Array<{ status: string; has_payload: boolean }>>(
    "SELECT status, payload IS NOT NULL AS has_payload FROM telegram_inbox WHERE update_id = $1", [channelId]
  );
  assert.equal(channel.status, "succeeded");
  assert.equal(channel.has_payload, false);

  await sql.unsafe("UPDATE communities SET status = 'paused' WHERE id = $1", [communityIds[0]]);
  const sentBeforePauseCheck = telegram.sent.length;
  await ask(GROUP, "Why is Isnad silent?");
  assert.equal(telegram.sent.length, sentBeforePauseCheck, "paused communities never reply");
  const pausedId = await deliver("message", "@isnad_test_bot should be ignored while paused");
  const [pausedInbox] = await sql.unsafe<Array<{ status: string; has_payload: boolean }>>(
    "SELECT status, payload IS NOT NULL AS has_payload FROM telegram_inbox WHERE update_id = $1", [pausedId]
  );
  assert.equal(pausedInbox.status, "succeeded");
  assert.equal(pausedInbox.has_payload, false, "paused group text must not be retained");

  await sql.unsafe("UPDATE communities SET status = 'active' WHERE id = $1", [communityIds[0]]);
  process.env.ISNAD_COMMUNITY_GLOBAL_PAUSE = "true";
  try {
    const globalPausedId = await deliver("message", "@isnad_test_bot should be ignored during emergency stop");
    const [globalPausedInbox] = await sql.unsafe<Array<{ status: string; has_payload: boolean }>>(
      "SELECT status, payload IS NOT NULL AS has_payload FROM telegram_inbox WHERE update_id = $1", [globalPausedId]
    );
    assert.equal(globalPausedInbox.status, "succeeded");
    assert.equal(globalPausedInbox.has_payload, false, "global pause must prevent raw group-text retention");
  } finally {
    delete process.env.ISNAD_COMMUNITY_GLOBAL_PAUSE;
  }
});
