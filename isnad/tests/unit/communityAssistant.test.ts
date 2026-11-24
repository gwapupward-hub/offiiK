import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantTriggerAllowed } from "@/lib/community/communityAssistant";
import { defaultSettings } from "@/lib/community/settingsSchema";
import {
  classifyUpdate,
  mentionedQuestion,
  shouldRetainPayload,
  type TelegramMessage,
  type TelegramUpdate,
} from "@/lib/community/telegramDispatcher";

const BOT = { id: 123456, username: "isnad_test_bot" };
const CHAT = { id: -100123, type: "supergroup" as const, is_forum: true };
const FROM = { id: 42, first_name: "Student" };
const ON = { communityEnabled: true, assistantReleased: true };
const INGEST = { ...ON, botId: BOT.id, botUsername: BOT.username };
let next = 1;

function incoming(text: string, extra: Partial<TelegramMessage> = {}): TelegramUpdate {
  return { update_id: next++, message: { message_id: next++, from: FROM, chat: CHAT, text, ...extra } };
}

function assistantRoute(update: TelegramUpdate) {
  const route = classifyUpdate(update, BOT, ON);
  assert.equal(route.kind, "group_assistant", JSON.stringify(route));
  if (route.kind !== "group_assistant") throw new Error("Expected assistant route");
  return route;
}

test("C1 remains silent for ordinary chatter, other bots, edits and disabled communities", () => {
  assert.equal(classifyUpdate(incoming("How is everyone?"), BOT, ON).kind, "ignore");
  assert.equal(classifyUpdate(incoming("@other_bot please respond"), BOT, ON).kind, "ignore");
  assert.equal(classifyUpdate(incoming("@isnad_test_bots suspicious"), BOT, ON).kind, "ignore");
  assert.equal(classifyUpdate(incoming("@isnad_test_bot what is salah?"), BOT, { communityEnabled: false, assistantReleased: true }).kind, "ignore");
  assert.equal(classifyUpdate(incoming("@isnad_test_bot what is salah?"), BOT, { communityEnabled: true }).kind, "ignore");
  assert.equal(classifyUpdate(incoming("@isnad_test_bot question", { from: { id: 999, is_bot: true } }), BOT, ON).kind, "ignore");
  assert.equal(classifyUpdate(incoming("@isnad_test_bot question", { sender_chat: { id: -100222, type: "channel" } }), BOT, ON).kind, "ignore");
  const edited = incoming("@isnad_test_bot what is salah?").message!;
  assert.equal(classifyUpdate({ update_id: next++, edited_message: edited }, BOT, ON).kind, "ignore");
});

test("explicit @mention produces only the question and does not match similarly named users", () => {
  assert.equal(mentionedQuestion("Hello @ISNAD_TEST_BOT, what is tawakkul?", BOT.username), "Hello , what is tawakkul?");
  assert.equal(mentionedQuestion("Hi @isnad_test_bots", BOT.username), null);
  const route = assistantRoute(incoming("@isnad_test_bot explain tawakkul"));
  assert.equal(route.trigger, "mention");
  assert.equal(route.question, "explain tawakkul");
  assert.equal(shouldRetainPayload(incoming("@isnad_test_bot explain tawakkul"), INGEST), true);
  assert.equal(shouldRetainPayload(incoming("hello world"), INGEST), false);
  assert.equal(shouldRetainPayload(incoming("@other_bot hello"), INGEST), false);
});

test("group /ask is explicit, while other commands stay isolated", () => {
  const route = assistantRoute(incoming("/ask please explain zakat"));
  assert.equal(route.trigger, "command");
  assert.equal(route.question, "please explain zakat");
  assert.equal(assistantRoute(incoming("/ask@isnad_test_bot what is wudu?")).trigger, "command");
  assert.equal(classifyUpdate(incoming("/ask@other_bot hello"), BOT, ON).kind, "ignore");
  assert.equal(classifyUpdate(incoming("/history@isnad_test_bot"), BOT, ON).kind, "group_private_only_notice");
  assert.equal(classifyUpdate(incoming("/setup"), BOT, ON).kind, "group_admin_command");
});

test("reply mode and topic mode require explicit community settings", () => {
  const reply = assistantRoute(incoming("Could you elaborate?", {
    reply_to_message: { message_id: 8, from: { id: BOT.id, is_bot: true } },
  }));
  const topic = assistantRoute(incoming("What is the meaning of ihsan?", {
    is_topic_message: true, message_thread_id: 44,
  }));
  const settings = defaultSettings("supergroup").assistant;
  assert.equal(assistantTriggerAllowed(settings, reply), false);
  assert.equal(assistantTriggerAllowed(settings, topic), false);
  assert.equal(assistantTriggerAllowed(settings, assistantRoute(incoming("/ask explain ihsan"))), true);
  assert.equal(assistantTriggerAllowed({ ...settings, responseMode: "mention_and_reply" }, reply), true);
  assert.equal(assistantTriggerAllowed({ ...settings, responseMode: "qa_topics", qaTopicIds: [44] }, topic), true);
  assert.equal(assistantTriggerAllowed({ ...settings, responseMode: "qa_topics", qaTopicIds: [11] }, topic), false);
  assert.equal(assistantTriggerAllowed({ ...settings, enabled: false }, topic), false);
  assert.equal(shouldRetainPayload(incoming("More detail?", {
    reply_to_message: { message_id: 8, from: { id: BOT.id, is_bot: true } },
  }), INGEST), true);
});

test("a configured group topic never turns an unconfigured group into a question stream", () => {
  const group = incoming("just chatting", { is_topic_message: true, message_thread_id: 44 });
  assert.equal(shouldRetainPayload(group, INGEST), false);
  const topic = assistantRoute(group);
  assert.equal(topic.trigger, "topic");
  assert.equal(assistantTriggerAllowed({ ...defaultSettings("supergroup").assistant, responseMode: "qa_topics", qaTopicIds: [] }, topic), false);
});
