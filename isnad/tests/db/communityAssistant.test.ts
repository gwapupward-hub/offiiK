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
    await sql.unsafe(
      "INSERT INTO community_settings " +
      "(community_id, assistant_config, verification_config, publisher_config, learning_config) " +
      "VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)",
      [
        id,
        JSON.stringify(settings.assistant),
        JSON.stringify(settings.verification),
        JSON.stringify(settings.publisher),
        JSON.stringify(settings.learning),
      ]
    );
  }

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

  await sql.unsafe("UPDATE communities SET status = 'paused' WHERE id = $1", [communityIds[0]]);
  await ask(GROUP, "Why is Isnad silent?");
  assert.equal(telegram.sent.length, 3, "paused communities never reply");
});
