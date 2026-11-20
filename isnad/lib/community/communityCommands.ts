import { getDatabase } from "@/lib/db";
import { blockedModules, evaluateModules, snapshotBotPermissions } from "@/lib/community/botPermissions";
import { mayClaim, resolveCapabilities } from "@/lib/community/communityAuth";
import {
  findUserIdByTelegramId,
  getActiveRoles,
  getCommunitySettings,
  issueSetupNonce,
  migrateCommunityChat,
  pauseCommunity,
  recordBotMembershipChange,
  recordMemberRightsChange,
  resumeCommunity,
  upsertCommunityFromChat,
} from "@/lib/community/communityRegistry";
import { MODULE_LABELS } from "@/lib/community/settingsSchema";
import {
  resolveBotUsername,
  TelegramApiError,
  type InlineKeyboardButton,
  type TelegramClient,
} from "@/lib/community/telegramApi";
import {
  replyContext,
  type ChatMemberUpdated,
  type Route,
  type TelegramMessage,
} from "@/lib/community/telegramDispatcher";
import type {
  BotPermissionSnapshot,
  CommunityChatType,
  CommunityRecord,
  ModuleKey,
} from "@/lib/community/types";
import { consumeRateLimit, rateLimitKey } from "@/lib/store";
import { SITE_URL } from "@/site.config.mjs";

export type CommandContext = {
  client: TelegramClient;
  correlationId: string;
  /** Must be awaited before the first outbound message (see telegramInbox). */
  markSideEffect: () => Promise<void>;
  /** Undoes markSideEffect when Telegram definitively rejected the only send. */
  releaseSideEffect?: () => Promise<void>;
};

const GROUP_HELP_TEXT =
  "Isnad in this community\n\n" +
  "Isnad stays silent unless an administrator connects and activates it.\n\n" +
  "Administrators: /setup connects this community, /community opens the Community Manager, /pause stops all automated activity, /resume restarts it after a fresh permission check.\n\n" +
  "For personal questions, history and saved sources, message Isnad privately.";

const MODULE_FOR_COMMAND: Record<string, ModuleKey> = {
  ask: "assistant",
  verify: "verification",
  lesson: "learning",
  quiz: "learning",
};

export function miniAppBaseUrl(): string {
  const configured = process.env.TELEGRAM_MINI_APP_URL?.trim();
  const base = configured || `${SITE_URL}/telegram`;
  return base.replace(/\/+$/, "");
}

/** t.me direct link that opens the Mini App with a signed start_param (works in groups). */
export function communitySetupLink(botUsername: string, startParam: string): string {
  const shortName = process.env.TELEGRAM_MINI_APP_SHORT_NAME?.trim() || "askiik";
  return `https://t.me/${botUsername}/${shortName}?startapp=${encodeURIComponent(startParam)}`;
}

async function reply(
  ctx: CommandContext,
  message: TelegramMessage,
  text: string,
  buttons?: InlineKeyboardButton[][]
): Promise<void> {
  await ctx.markSideEffect();
  try {
    await ctx.client.sendMessage({
      ...replyContext(message),
      text,
      link_preview_options: { is_disabled: true },
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    });
  } catch (error) {
    // A definitive API rejection (e.g. 429) means nothing was delivered, so the
    // update may be retried with backoff. Timeouts stay "outcome unknown".
    if (error instanceof TelegramApiError && !error.outcomeUnknown) await ctx.releaseSideEffect?.();
    throw error;
  }
}

function isMissingChatOrUser(error: unknown): boolean {
  return error instanceof TelegramApiError && error.kind === "api" && (error.errorCode === 400 || error.errorCode === 403);
}

/** Fresh view of the bot's own rights in a chat. A bot no longer in the chat yields status "left". */
export async function fetchBotSnapshot(
  client: TelegramClient,
  chatId: number,
  chatType: CommunityChatType
): Promise<BotPermissionSnapshot> {
  let member;
  try {
    member = await client.getChatMember(chatId, client.botId);
  } catch (error) {
    if (!isMissingChatOrUser(error)) throw error;
    return snapshotBotPermissions({ status: "left", user: { id: client.botId } }, chatType, undefined, false);
  }
  const [chat, me] = await Promise.all([
    member.status === "member" && chatType !== "channel" ? client.getChat(chatId).catch(() => null) : null,
    client.getMe().catch(() => null),
  ]);
  return snapshotBotPermissions(member, chatType, chat?.permissions, Boolean(me?.can_read_all_group_messages));
}

export function hasBlockedModules(
  community: Pick<CommunityRecord, "chatType">,
  settings: Parameters<typeof evaluateModules>[2],
  snapshot: Partial<BotPermissionSnapshot>
): boolean {
  return blockedModules(evaluateModules(community.chatType, "active", settings, snapshot, { globalPause: false })).length > 0;
}

// ---------------------------------------------------------------------------
// Membership events (no messages are sent)
// ---------------------------------------------------------------------------

async function handleBotMembership(change: ChatMemberUpdated, ctx: CommandContext): Promise<void> {
  const chatType = change.chat.type === "private" ? null : change.chat.type;
  if (!chatType) return;
  const newMember = change.new_chat_member;
  const present = newMember.status !== "left" && newMember.status !== "kicked";
  const [chat, me] = present
    ? await Promise.all([
        newMember.status === "member" && chatType !== "channel"
          ? ctx.client.getChat(change.chat.id).catch(() => null)
          : null,
        ctx.client.getMe().catch(() => null),
      ])
    : [null, null];
  const snapshot = snapshotBotPermissions(
    newMember,
    chatType,
    chat?.permissions,
    Boolean(me?.can_read_all_group_messages)
  );
  await recordBotMembershipChange({
    chat: change.chat,
    newStatus: newMember.status,
    isMember: newMember.is_member,
    snapshot,
    fromTelegramUserId: change.from && !change.from.is_bot ? change.from.id : null,
    correlationId: ctx.correlationId,
    hasBlockedModules: (community, settings) => hasBlockedModules(community, settings, snapshot),
  });
}

async function handleMemberRights(change: ChatMemberUpdated, ctx: CommandContext): Promise<void> {
  await recordMemberRightsChange({
    chatId: change.chat.id,
    telegramUserId: change.new_chat_member.user.id,
    oldStatus: change.old_chat_member.status,
    newStatus: change.new_chat_member.status,
    correlationId: ctx.correlationId,
  });
}

// ---------------------------------------------------------------------------
// Group admin commands
// ---------------------------------------------------------------------------

async function handleGroupAdminCommand(
  route: Extract<Route, { kind: "group_admin_command" }>,
  ctx: CommandContext
): Promise<void> {
  const { message } = route;
  const rateSubject = route.anonymousAdmin ? "anonymous" : String(message.from?.id ?? "unknown");
  const limit = await consumeRateLimit(rateLimitKey(`community-cmd:${message.chat.id}:${rateSubject}`), 6, 60);
  if (!limit.allowed) return;

  if (route.anonymousAdmin) {
    await reply(
      ctx,
      message,
      "Isnad can't verify an anonymous administrator. Turn off \"Remain anonymous\" for a moment and send the command again, or message Isnad privately and use /community."
    );
    return;
  }
  const from = message.from;
  if (!from) return;

  const member = await ctx.client.getChatMember(message.chat.id, from.id);
  if (!mayClaim(member)) {
    // Non-admins get a reply only when they explicitly addressed the bot.
    if (route.addressed) await reply(ctx, message, `Only administrators of this chat can use /${route.command}.`);
    return;
  }

  const upserted = await upsertCommunityFromChat(getDatabase(), message.chat, { installedBy: from.id });
  if (!upserted) return;
  const { community } = upserted;
  const actor = { userId: await findUserIdByTelegramId(from.id), telegramUserId: from.id };

  if (route.command === "setup" || route.command === "community") {
    const botUsername = await resolveBotUsername(ctx.client);
    const nonce = await issueSetupNonce(community.id, from.id);
    const link = communitySetupLink(botUsername, nonce);
    const roles = await getActiveRoles(community.id, from.id);
    const intro =
      community.status === "pending" && roles.length === 0
        ? "Connect this community to Isnad.\n\nThe Community Manager will verify your administrator rights and show the bot's permissions. Nothing is activated until you review and confirm."
        : `Isnad status here: ${statusLabel(community.status)}.`;
    await reply(
      ctx,
      message,
      `${intro}\n\nThis link works only for you and expires in 15 minutes.`,
      [[{ text: "Open Community Manager", url: link }]]
    );
    return;
  }

  const roles = await getActiveRoles(community.id, from.id);
  const capabilities = resolveCapabilities(roles, member).capabilities;

  if (route.command === "pause") {
    if (!capabilities.has("community.pause")) {
      await reply(ctx, message, "Pausing Isnad needs the owner or community manager role. The owner can grant it in the Community Manager.");
      return;
    }
    const result = await pauseCommunity({
      communityId: community.id,
      reason: route.args || undefined,
      actor,
      source: "group_command",
      correlationId: ctx.correlationId,
    });
    if (!result.ok) {
      await reply(ctx, message, "Isnad could not be paused from its current state.");
      return;
    }
    await reply(
      ctx,
      message,
      result.changed
        ? "Isnad is paused here. Automated replies, scheduled publishing and learning announcements are stopped. Use /resume after the issue is resolved."
        : "Isnad is already paused here."
    );
    return;
  }

  // resume
  if (!capabilities.has("community.resume")) {
    await reply(ctx, message, "Resuming Isnad needs the owner or community manager role.");
    return;
  }
  const snapshot = await fetchBotSnapshot(ctx.client, message.chat.id, community.chatType);
  const settings = await getCommunitySettings(community);
  const blocked = hasBlockedModules(community, settings, snapshot);
  const result = await resumeCommunity({
    communityId: community.id,
    snapshot,
    blocked,
    actor,
    source: "group_command",
    correlationId: ctx.correlationId,
  });
  if (!result.ok) {
    await reply(ctx, message, `Isnad is not paused here (status: ${statusLabel(community.status)}).`);
    return;
  }
  await reply(
    ctx,
    message,
    blocked
      ? "Isnad can't resume yet: the bot is missing permissions an enabled module needs. Open the Community Manager to review them."
      : result.community.status === "active"
        ? "Isnad has resumed after a fresh permission check."
        : "The pause is lifted. Isnad is still waiting for activation in the Community Manager."
  );
}

function statusLabel(status: CommunityRecord["status"]): string {
  switch (status) {
    case "pending":
      return "connected, not yet activated";
    case "active":
      return "active";
    case "paused":
      return "paused";
    case "permission_lost":
      return "paused — missing permissions";
    case "removed":
      return "removed";
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Executes a classified community route. Private routes are handled elsewhere. */
export async function executeCommunityRoute(route: Route, ctx: CommandContext): Promise<void> {
  switch (route.kind) {
    case "bot_membership":
      await handleBotMembership(route.change, ctx);
      return;
    case "member_rights":
      await handleMemberRights(route.change, ctx);
      return;
    case "group_chat_migrated":
      await migrateCommunityChat(route.fromChatId, route.toChatId, ctx.correlationId);
      return;
    case "group_admin_command":
      await handleGroupAdminCommand(route, ctx);
      return;
    case "group_help":
      await reply(ctx, route.message, GROUP_HELP_TEXT);
      return;
    case "group_private_only_notice": {
      const botUsername = await resolveBotUsername(ctx.client);
      await reply(
        ctx,
        route.message,
        `/${route.command} works only in a private chat with Isnad, so personal history and settings are never shown in a group.`,
        [[{ text: "Message Isnad privately", url: `https://t.me/${botUsername}` }]]
      );
      return;
    }
    case "group_module_unavailable": {
      const key = MODULE_FOR_COMMAND[route.command];
      await reply(ctx, route.message, `${key ? MODULE_LABELS[key] : "This feature"} isn't active in this community yet.`);
      return;
    }
    case "private_community":
      await ctx.markSideEffect();
      await ctx.client.sendMessage({
        chat_id: route.message.chat.id,
        text:
          "Community Manager\n\nConnect and configure the groups and channels you administer. Isnad verifies your Telegram administrator rights on every change and stays silent in a community until you activate it.",
        reply_markup: {
          inline_keyboard: [[{ text: "Open Community Manager", web_app: { url: `${miniAppBaseUrl()}/community` } }]],
        },
      });
      return;
    case "private":
    case "ignore":
      return;
  }
}
