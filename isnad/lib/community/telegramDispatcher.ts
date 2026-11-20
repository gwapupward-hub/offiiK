import type {
  TelegramChatMember,
  TelegramChatRef,
  TelegramUserRef,
} from "@/lib/community/types";

/**
 * Typed routing for every Telegram update the webhook accepts. Classification
 * is pure (no I/O) so the "silent by default" rules are unit-testable:
 *
 * - Private chats keep the existing Isnad conversation workflow.
 * - Group messages only reach a handler when they are an Isnad admin command
 *   or a command explicitly addressed to the bot. Ordinary chatter, edits,
 *   mentions and replies produce nothing until the C1 assistant ships.
 * - Channel posts are never treated as questions.
 * - Bot-originated messages never trigger anything.
 */

export type TelegramEntity = { type: string; offset: number; length: number };

export type TelegramMessage = {
  message_id: number;
  date?: number;
  text?: string;
  caption?: string;
  chat: TelegramChatRef;
  from?: TelegramUserRef;
  sender_chat?: TelegramChatRef;
  message_thread_id?: number;
  is_topic_message?: boolean;
  reply_to_message?: { message_id: number; from?: TelegramUserRef };
  entities?: TelegramEntity[];
  via_bot?: TelegramUserRef;
  migrate_to_chat_id?: number;
  migrate_from_chat_id?: number;
};

export type ChatMemberUpdated = {
  chat: TelegramChatRef;
  from: TelegramUserRef;
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  my_chat_member?: ChatMemberUpdated;
  chat_member?: ChatMemberUpdated;
  callback_query?: { id: string; from: TelegramUserRef; data?: string };
  poll?: { id: string };
  poll_answer?: { poll_id: string };
};

export type UpdateKind =
  | "message"
  | "edited_message"
  | "channel_post"
  | "edited_channel_post"
  | "my_chat_member"
  | "chat_member"
  | "callback_query"
  | "poll"
  | "poll_answer"
  | "unknown";

export function updateKind(update: TelegramUpdate): UpdateKind {
  if (update.message) return "message";
  if (update.edited_message) return "edited_message";
  if (update.channel_post) return "channel_post";
  if (update.edited_channel_post) return "edited_channel_post";
  if (update.my_chat_member) return "my_chat_member";
  if (update.chat_member) return "chat_member";
  if (update.callback_query) return "callback_query";
  if (update.poll) return "poll";
  if (update.poll_answer) return "poll_answer";
  return "unknown";
}

export function updateChatId(update: TelegramUpdate): number | null {
  const chat =
    update.message?.chat ??
    update.edited_message?.chat ??
    update.channel_post?.chat ??
    update.edited_channel_post?.chat ??
    update.my_chat_member?.chat ??
    update.chat_member?.chat;
  return typeof chat?.id === "number" ? chat.id : null;
}

export type GroupAdminCommand = "setup" | "community" | "pause" | "resume";
export const GROUP_ADMIN_COMMANDS: ReadonlySet<string> = new Set(["setup", "community", "pause", "resume"]);
/** Private-chat commands that would expose personal data or state in a group. */
export const PRIVATE_ONLY_COMMANDS: ReadonlySet<string> = new Set([
  "start",
  "new",
  "history",
  "sources",
  "settings",
  "about",
]);
/** Community module commands; inert until the module's runtime ships. */
export const MODULE_COMMANDS: ReadonlySet<string> = new Set(["ask", "verify", "lesson", "quiz"]);

export type AddressedCommand = {
  command: string;
  args: string;
  /** Bot username after `@`, or null for a bare `/command`. */
  target: string | null;
};

/** Parses `/command[@bot] args`. Returns null for non-commands. */
export function parseAddressedCommand(text: string | undefined): AddressedCommand | null {
  if (!text || !text.startsWith("/")) return null;
  const match = text.match(/^\/([A-Za-z0-9_]{1,64})(?:@([A-Za-z0-9_]{3,64}))?(?=\s|$)/);
  if (!match) return null;
  return {
    command: match[1].toLowerCase(),
    target: match[2] ?? null,
    args: text.slice(match[0].length).trim(),
  };
}

export type BotRef = { id: number; username: string | null };

export type IgnoreReason =
  | "community_disabled"
  | "no_message"
  | "unsupported_chat"
  | "bot_sender"
  | "channel_identity"
  | "edited_group_message"
  | "group_message_not_triggering"
  | "command_for_other_bot"
  | "unaddressed_command"
  | "unknown_command"
  | "channel_post"
  | "private_membership_change"
  | "not_about_bot"
  | "callback_query"
  | "poll"
  | "unknown_update";

export type Route =
  | { kind: "private"; edited: boolean }
  | { kind: "private_community"; message: TelegramMessage }
  | {
      kind: "group_admin_command";
      command: GroupAdminCommand;
      addressed: boolean;
      anonymousAdmin: boolean;
      args: string;
      message: TelegramMessage;
    }
  | { kind: "group_help"; message: TelegramMessage }
  | { kind: "group_private_only_notice"; command: string; message: TelegramMessage }
  | { kind: "group_module_unavailable"; command: string; message: TelegramMessage }
  | { kind: "group_assistant"; trigger: "command" | "mention" | "reply" | "topic"; question: string; message: TelegramMessage }
  | { kind: "group_chat_migrated"; fromChatId: number; toChatId: number }
  | { kind: "bot_membership"; change: ChatMemberUpdated }
  | { kind: "member_rights"; change: ChatMemberUpdated }
  | { kind: "ignore"; reason: IgnoreReason };

const ignore = (reason: IgnoreReason): Route => ({ kind: "ignore", reason });

/** Matches an explicit @bot mention, never an arbitrary @user or substring. */
export function mentionedQuestion(text: string, username: string | null): string | null {
  if (!username || !/^[A-Za-z0-9_]+$/.test(username)) return null;
  const mention = new RegExp("(^|\\s)@" + username + "(?=$|[^A-Za-z0-9_])", "gi");
  if (!mention.test(text)) return null;
  return text.replace(mention, "$1").trim();
}

function isGroup(chat: TelegramChatRef | undefined): boolean {
  return chat?.type === "group" || chat?.type === "supergroup";
}

/**
 * Decides which handler (if any) an update reaches. `bot.username` is only
 * needed for group commands that carry an `@target`; when it is unknown such
 * commands are ignored rather than guessed at.
 */
export function classifyUpdate(
  update: TelegramUpdate,
  bot: BotRef,
  options: { communityEnabled: boolean; assistantReleased?: boolean }
): Route {
  if (update.my_chat_member) {
    const change = update.my_chat_member;
    if (change.chat.type === "private") return ignore("private_membership_change");
    if (bot.id && change.new_chat_member.user?.id !== bot.id) return ignore("not_about_bot");
    if (!options.communityEnabled) return ignore("community_disabled");
    return { kind: "bot_membership", change };
  }
  if (update.chat_member) {
    if (!options.communityEnabled) return ignore("community_disabled");
    if (!isGroup(update.chat_member.chat) && update.chat_member.chat.type !== "channel") {
      return ignore("unsupported_chat");
    }
    return { kind: "member_rights", change: update.chat_member };
  }
  if (update.channel_post || update.edited_channel_post) return ignore("channel_post");
  if (update.callback_query) return ignore("callback_query");
  if (update.poll || update.poll_answer) return ignore("poll");

  const edited = !update.message && Boolean(update.edited_message);
  const message = update.message ?? update.edited_message;
  if (!message) return ignore("unknown_update");
  if (!message.chat) return ignore("no_message");

  if (message.chat.type === "private") {
    if (message.from?.is_bot) return ignore("bot_sender");
    const command = parseAddressedCommand(message.text?.trim());
    if (!edited && options.communityEnabled && command?.command === "community") {
      return { kind: "private_community", message };
    }
    return { kind: "private", edited };
  }

  if (!isGroup(message.chat)) return ignore("unsupported_chat");
  if (!options.communityEnabled) return ignore("community_disabled");

  if (typeof message.migrate_to_chat_id === "number" && !edited) {
    return { kind: "group_chat_migrated", fromChatId: message.chat.id, toChatId: message.migrate_to_chat_id };
  }
  if (edited) return ignore("edited_group_message");

  // Anonymous administrators post as the group itself (sender_chat === chat).
  const anonymousAdmin = message.sender_chat?.id === message.chat.id;
  if (message.sender_chat && !anonymousAdmin) return ignore("channel_identity");
  if (!anonymousAdmin && (!message.from || message.from.is_bot)) return ignore("bot_sender");
  if (message.via_bot) return ignore("bot_sender");

  const command = parseAddressedCommand(message.text?.trim());
  if (!command) {
    if (!options.assistantReleased || !message.text?.trim()) return ignore("group_message_not_triggering");
    const mentionQuestion = mentionedQuestion(message.text, bot.username);
    if (mentionQuestion) return { kind: "group_assistant", trigger: "mention", question: mentionQuestion, message };
    if (bot.id > 0 && message.reply_to_message?.from?.id === bot.id) {
      return { kind: "group_assistant", trigger: "reply", question: message.text.trim(), message };
    }
    if (message.is_topic_message && typeof message.message_thread_id === "number") {
      // Community-specific topic IDs are checked again by the assistant service.
      return { kind: "group_assistant", trigger: "topic", question: message.text.trim(), message };
    }
    return ignore("group_message_not_triggering");
  }

  if (command.target) {
    if (!bot.username || command.target.toLowerCase() !== bot.username.toLowerCase()) {
      return ignore("command_for_other_bot");
    }
  }
  const addressed = command.target !== null;

  if (GROUP_ADMIN_COMMANDS.has(command.command)) {
    return {
      kind: "group_admin_command",
      command: command.command as GroupAdminCommand,
      addressed,
      anonymousAdmin,
      args: command.args,
      message,
    };
  }
  if (options.assistantReleased && command.command === "ask") {
    return { kind: "group_assistant", trigger: "command", question: command.args, message };
  }
  if (!addressed) return ignore("unaddressed_command");
  if (command.command === "help") return { kind: "group_help", message };
  if (PRIVATE_ONLY_COMMANDS.has(command.command)) {
    return { kind: "group_private_only_notice", command: command.command, message };
  }
  if (MODULE_COMMANDS.has(command.command)) {
    return { kind: "group_module_unavailable", command: command.command, message };
  }
  return ignore("unknown_command");
}

/**
 * Ingestion-time privacy filter: whether the raw payload is worth storing.
 * Ordinary group chatter and channel posts are never retained. Must be a
 * superset of what classifyUpdate routes to a handler (see tests).
 */
export function shouldRetainPayload(update: TelegramUpdate, options: { communityEnabled: boolean; assistantReleased?: boolean; botId?: number; botUsername?: string }): boolean {
  if (update.my_chat_member || update.chat_member) return options.communityEnabled;
  if (update.channel_post || update.edited_channel_post) return false;
  if (update.callback_query || update.poll || update.poll_answer) return false;
  const message = update.message ?? update.edited_message;
  if (!message?.chat) return false;
  if (message.chat.type === "private") return true;
  if (!isGroup(message.chat) || !options.communityEnabled || update.edited_message) return false;
  if (typeof message.migrate_to_chat_id === "number") return true;
  if (message.text?.trim().startsWith("/")) return true;
  if (!options.assistantReleased || message.from?.is_bot || message.sender_chat || message.via_bot) return false;
  if (message.text && mentionedQuestion(message.text, options.botUsername ?? null)) return true;
  return Boolean(options.botId && message.reply_to_message?.from?.id === options.botId && message.text?.trim());
}

/** Whether classifying this update needs the bot username (an `@target` group command). */
export function needsBotUsername(update: TelegramUpdate): boolean {
  const message = update.message;
  if (!message || !isGroup(message.chat)) return false;
  return parseAddressedCommand(message.text?.trim())?.target != null || Boolean(message.text?.includes("@"));
}

/** Reply parameters that keep a response in the right chat, thread and forum topic. */
export function replyContext(message: Pick<TelegramMessage, "chat" | "message_id" | "message_thread_id" | "is_topic_message">) {
  return {
    chat_id: message.chat.id,
    reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
    ...(message.is_topic_message && typeof message.message_thread_id === "number"
      ? { message_thread_id: message.message_thread_id }
      : {}),
  };
}
