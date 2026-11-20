import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  classifyUpdate,
  parseAddressedCommand,
  replyContext,
  shouldRetainPayload,
  type TelegramMessage,
  type TelegramUpdate,
} from "@/lib/community/telegramDispatcher";

const BOT = { id: 123456, username: "isnad_test_bot" };
const ON = { communityEnabled: true };
const OFF = { communityEnabled: false };
const GROUP = { id: -100111, type: "supergroup" as const, title: "Study Circle" };
const alice = { id: 1001, first_name: "Alice" };
let nextId = 1;

function groupMessage(text: string, extra: Partial<TelegramMessage> = {}): TelegramUpdate {
  return { update_id: nextId++, message: { message_id: nextId, chat: GROUP, from: alice, text, ...extra } };
}

function privateMessage(text: string): TelegramUpdate {
  return { update_id: nextId++, message: { message_id: nextId, chat: { id: 1001, type: "private" }, from: alice, text } };
}

describe("silent by default in groups", () => {
  const silent: [string, TelegramUpdate][] = [
    ["ordinary chatter", groupMessage("Assalamu alaykum everyone")],
    ["a question", groupMessage("Is this hadith authentic?")],
    ["an @mention (assistant not shipped)", groupMessage("@isnad_test_bot what is zakat?")],
    ["a reply to the bot", groupMessage("thanks", { reply_to_message: { message_id: 5, from: { id: 123456, is_bot: true } } })],
    ["an unaddressed private-only command", groupMessage("/history")],
    ["an unaddressed module command", groupMessage("/ask what is wudu")],
    ["an unaddressed /help", groupMessage("/help")],
    ["a command for another bot", groupMessage("/setup@other_bot")],
    ["an unknown addressed command", groupMessage("/dance@isnad_test_bot")],
    ["another bot's message", groupMessage("/setup", { from: { id: 777, is_bot: true } })],
    ["a message sent via an inline bot", groupMessage("/setup", { via_bot: { id: 8, is_bot: true } })],
    ["a linked-channel post", groupMessage("/setup", { sender_chat: { id: -100999, type: "channel" } })],
  ];
  for (const [name, update] of silent) {
    test(`ignores ${name}`, () => assert.equal(classifyUpdate(update, BOT, ON).kind, "ignore"));
  }

  test("ignores edited group messages, even commands", () => {
    const update: TelegramUpdate = { update_id: 9, edited_message: groupMessage("/setup").message };
    assert.deepEqual(classifyUpdate(update, BOT, ON), { kind: "ignore", reason: "edited_group_message" });
  });

  test("ignores every group update while community features are disabled", () => {
    for (const text of ["/setup", "/pause", "/history@isnad_test_bot", "hello"]) {
      assert.deepEqual(classifyUpdate(groupMessage(text), BOT, OFF), { kind: "ignore", reason: "community_disabled" });
    }
  });

  test("ignores channel posts entirely", () => {
    const post = { message_id: 1, chat: { id: -100222, type: "channel" as const }, text: "/verify something" };
    assert.equal(classifyUpdate({ update_id: 1, channel_post: post }, BOT, ON).kind, "ignore");
    assert.equal(classifyUpdate({ update_id: 2, edited_channel_post: post }, BOT, ON).kind, "ignore");
  });

  test("ignores callback queries and polls in C0", () => {
    assert.equal(classifyUpdate({ update_id: 1, callback_query: { id: "x", from: alice } }, BOT, ON).kind, "ignore");
    assert.equal(classifyUpdate({ update_id: 2, poll_answer: { poll_id: "p" } }, BOT, ON).kind, "ignore");
  });
});

describe("explicit commands in groups", () => {
  test("admin commands route with or without @target", () => {
    for (const command of ["setup", "community", "pause", "resume"]) {
      const bare = classifyUpdate(groupMessage(`/${command}`), BOT, ON);
      const addressed = classifyUpdate(groupMessage(`/${command}@ISNAD_test_bot reason`), BOT, ON);
      assert.equal(bare.kind, "group_admin_command");
      assert.equal(addressed.kind, "group_admin_command");
      if (addressed.kind === "group_admin_command") {
        assert.equal(addressed.addressed, true);
        assert.equal(addressed.args, "reason");
      }
    }
  });

  test("addressed private-only commands get a notice, never the private handler", () => {
    for (const command of ["history", "new", "sources", "settings", "start", "about"]) {
      const route = classifyUpdate(groupMessage(`/${command}@isnad_test_bot`), BOT, ON);
      assert.equal(route.kind, "group_private_only_notice", command);
    }
  });

  test("addressed module commands report the module is not active", () => {
    assert.equal(classifyUpdate(groupMessage("/ask@isnad_test_bot what is wudu"), BOT, ON).kind, "group_module_unavailable");
    assert.equal(classifyUpdate(groupMessage("/verify@isnad_test_bot"), BOT, ON).kind, "group_module_unavailable");
  });

  test("anonymous administrators are flagged (sender_chat is the group)", () => {
    const route = classifyUpdate(
      groupMessage("/setup", { from: { id: 1087968824, is_bot: true }, sender_chat: GROUP }),
      BOT,
      ON
    );
    assert.equal(route.kind, "group_admin_command");
    if (route.kind === "group_admin_command") assert.equal(route.anonymousAdmin, true);
  });

  test("an @target command is ignored when the bot username is unknown", () => {
    assert.equal(classifyUpdate(groupMessage("/setup@isnad_test_bot"), { id: 1, username: null }, ON).kind, "ignore");
  });

  test("group → supergroup migration is routed", () => {
    const route = classifyUpdate(groupMessage("", { chat: { id: -5, type: "group" }, migrate_to_chat_id: -1005 }), BOT, ON);
    assert.deepEqual(route, { kind: "group_chat_migrated", fromChatId: -5, toChatId: -1005 });
  });
});

describe("private chats keep the existing workflow", () => {
  test("private messages and commands go to the private handler", () => {
    assert.deepEqual(classifyUpdate(privateMessage("What is ihsan?"), BOT, ON), { kind: "private", edited: false });
    assert.deepEqual(classifyUpdate(privateMessage("/history"), BOT, ON), { kind: "private", edited: false });
    const edited: TelegramUpdate = { update_id: 3, edited_message: privateMessage("x").message };
    assert.deepEqual(classifyUpdate(edited, BOT, ON), { kind: "private", edited: true });
  });

  test("/community opens the Community Manager only when enabled", () => {
    assert.equal(classifyUpdate(privateMessage("/community"), BOT, ON).kind, "private_community");
    assert.equal(classifyUpdate(privateMessage("/community"), BOT, OFF).kind, "private");
  });
});

describe("membership updates", () => {
  const change = (chatType: "private" | "supergroup" | "channel", userId = BOT.id) => ({
    chat: { id: -100111, type: chatType },
    from: alice,
    date: 1,
    old_chat_member: { status: "left" as const, user: { id: userId } },
    new_chat_member: { status: "member" as const, user: { id: userId } },
  });

  test("bot added to a group or channel is a registry event", () => {
    assert.equal(classifyUpdate({ update_id: 1, my_chat_member: change("supergroup") }, BOT, ON).kind, "bot_membership");
    assert.equal(classifyUpdate({ update_id: 2, my_chat_member: change("channel") }, BOT, ON).kind, "bot_membership");
  });

  test("private block/unblock and other users are ignored", () => {
    assert.equal(classifyUpdate({ update_id: 1, my_chat_member: change("private") }, BOT, ON).kind, "ignore");
    assert.equal(classifyUpdate({ update_id: 2, my_chat_member: change("supergroup", 99) }, BOT, ON).kind, "ignore");
    assert.equal(classifyUpdate({ update_id: 3, my_chat_member: change("supergroup") }, BOT, OFF).kind, "ignore");
  });

  test("chat_member changes are routed for rights tracking", () => {
    assert.equal(classifyUpdate({ update_id: 1, chat_member: change("supergroup", 1001) }, BOT, ON).kind, "member_rights");
  });
});

describe("ingestion privacy filter", () => {
  test("never retains ordinary group chatter or channel posts", () => {
    assert.equal(shouldRetainPayload(groupMessage("hello everyone"), ON), false);
    assert.equal(shouldRetainPayload(groupMessage("@isnad_test_bot hi"), ON), false);
    assert.equal(shouldRetainPayload(groupMessage("/setup"), OFF), false);
    const post = { message_id: 1, chat: { id: -1, type: "channel" as const }, text: "hi" };
    assert.equal(shouldRetainPayload({ update_id: 1, channel_post: post }, ON), false);
  });

  test("retains every update a handler can act on", () => {
    const fixtures: TelegramUpdate[] = [
      privateMessage("hi"),
      privateMessage("/community"),
      groupMessage("/setup"),
      groupMessage("/pause@isnad_test_bot"),
      groupMessage("/history@isnad_test_bot"),
      groupMessage("/ask@isnad_test_bot x"),
      groupMessage("/help@isnad_test_bot"),
      groupMessage("/setup", { from: { id: 1087968824, is_bot: true }, sender_chat: GROUP }),
      groupMessage("", { chat: { id: -5, type: "group" }, migrate_to_chat_id: -1005 }),
      {
        update_id: 99,
        my_chat_member: {
          chat: GROUP,
          from: alice,
          date: 1,
          old_chat_member: { status: "left", user: { id: BOT.id } },
          new_chat_member: { status: "member", user: { id: BOT.id } },
        },
      },
    ];
    for (const update of fixtures) {
      const route = classifyUpdate(update, BOT, ON);
      assert.notEqual(route.kind, "ignore", JSON.stringify(update));
      assert.equal(shouldRetainPayload(update, ON), true, JSON.stringify(update));
    }
  });
});

describe("helpers", () => {
  test("parseAddressedCommand", () => {
    assert.deepEqual(parseAddressedCommand("/Setup@Isnad_Bot  now "), { command: "setup", target: "Isnad_Bot", args: "now" });
    assert.deepEqual(parseAddressedCommand("/ask"), { command: "ask", target: null, args: "" });
    assert.equal(parseAddressedCommand("/ask@"), null);
    assert.equal(parseAddressedCommand("hello /setup"), null);
    assert.deepEqual(parseAddressedCommand("/set_up2\nmore"), { command: "set_up2", target: null, args: "more" });
  });

  test("replyContext keeps the forum topic and reply target", () => {
    const base = { chat: GROUP, message_id: 77 };
    assert.deepEqual(replyContext({ ...base, is_topic_message: true, message_thread_id: 12 }), {
      chat_id: GROUP.id,
      reply_parameters: { message_id: 77, allow_sending_without_reply: true },
      message_thread_id: 12,
    });
    assert.equal("message_thread_id" in replyContext({ ...base, message_thread_id: 12 }), false);
  });
});
