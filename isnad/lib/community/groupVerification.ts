import { moduleMayAct } from "@/lib/community/botPermissions";
import { fetchBotSnapshot } from "@/lib/community/communityCommands";
import { getCommunityByChatId, getCommunitySettings } from "@/lib/community/communityRegistry";
import { replyContext, type Route } from "@/lib/community/telegramDispatcher";
import { type TelegramClient } from "@/lib/community/telegramApi";
import { formatVerificationResult, verifyAndStoreText } from "@/lib/community/verificationEvidence";
import { consumeRateLimit, rateLimitKey } from "@/lib/store";

type VerifyRoute = Extract<Route, { kind: "group_verification" }>;
export type VerifyDependencies = {
  client: TelegramClient;
  verify?: typeof verifyAndStoreText;
};

/** No autonomous group scanning. Explicit command only, conservative and capped. */
export async function executeGroupVerificationRoute(
  route: VerifyRoute,
  deps: VerifyDependencies,
  hooks: { markSideEffect: () => Promise<void> }
): Promise<void> {
  const m = route.message;
  if (!m.from || m.from.is_bot || m.sender_chat || m.via_bot) return;
  const community = await getCommunityByChatId(m.chat.id);
  if (!community || community.status !== "active" || community.chatType === "channel") return;
  const settings = await getCommunitySettings(community);
  if (!settings.verification.enabled) return;
  const botPermissions = await fetchBotSnapshot(deps.client, m.chat.id, community.chatType);
  if (!moduleMayAct("verification", community.chatType, community.status, settings, botPermissions)) return;
  const question = route.question.trim();
  // Treat short or huge requests as an instructional reply, never store their contents.
  if (question.length < 10 || question.length > 2500) {
    await hooks.markSideEffect();
    await deps.client.sendMessage({
      ...replyContext(m),
      text: "Reply to a text message with /verify, or send /verify followed by a quotation of 10–2500 characters. Isnad checks wording against reviewed sources; it does not issue authenticity grades.",
      link_preview_options: { is_disabled: true },
    });
    return;
  }
  const user = await consumeRateLimit(rateLimitKey("isn-c2-verify-user:" + community.id + ":" + m.from.id), 5, 3600);
  if (!user.allowed) return;
  const group = await consumeRateLimit(rateLimitKey("isn-c2-verify-group:" + community.id), 40, 3600);
  if (!group.allowed) return;
  // Reserve the effect before persistence: a timed-out Telegram send must not
  // cause the same message to create multiple verification records.
  await hooks.markSideEffect();
  const { result } = await (deps.verify ?? verifyAndStoreText)({
    communityId: community.id,
    telegramUserId: m.from.id,
    telegramMessageId: m.message_id,
    threadId: m.is_topic_message && typeof m.message_thread_id === "number" ? m.message_thread_id : null,
    submissionText: question,
  });
  await deps.client.sendMessage({
    ...replyContext(m),
    text: formatVerificationResult(result).slice(0, 3900),
    link_preview_options: { is_disabled: true },
  });
}
