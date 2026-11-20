import { DEFAULT_SETTINGS } from "@/lib/appTypes";
import { buildConfiguredPrompt } from "@/lib/chatPipeline";
import { moduleMayAct } from "@/lib/community/botPermissions";
import { fetchBotSnapshot } from "@/lib/community/communityCommands";
import { getCommunityByChatId, getCommunitySettings, findUserIdByTelegramId } from "@/lib/community/communityRegistry";
import type { AssistantConfig } from "@/lib/community/settingsSchema";
import { replyContext, type Route } from "@/lib/community/telegramDispatcher";
import { TelegramApiError, type TelegramClient } from "@/lib/community/telegramApi";
import { getDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateAnswer, openAiKeyMissing, type ChatMessage } from "@/lib/providers";
import { consumeRateLimit, rateLimitKey } from "@/lib/store";

type GroupAssistantRoute = Extract<Route, { kind: "group_assistant" }>;

export type AssistantHooks = {
  markSideEffect: () => Promise<void>;
  releaseSideEffect?: () => Promise<void>;
};

export type AssistantDependencies = {
  client: TelegramClient;
  generate?: (prompt: string, messages: ChatMessage[]) => Promise<string>;
};

const MAX_QUESTION_LENGTH = 2000;
const MAX_ANSWER_LENGTH = 3800;
const MAX_HISTORY_PAIRS = 3;

/** Commands are explicit in every response mode; other triggers require opt-in. */
export function assistantTriggerAllowed(config: AssistantConfig, route: GroupAssistantRoute): boolean {
  if (!config.enabled || !route.question.trim()) return false;
  switch (route.trigger) {
    case "command":
    case "mention":
      return true;
    case "reply":
      return config.responseMode === "mention_and_reply" ||
        (config.responseMode === "qa_topics" && route.message.is_topic_message === true &&
          typeof route.message.message_thread_id === "number" &&
          config.qaTopicIds.includes(route.message.message_thread_id));
    case "topic":
      return config.responseMode === "qa_topics" &&
        route.message.is_topic_message === true &&
        typeof route.message.message_thread_id === "number" &&
        config.qaTopicIds.includes(route.message.message_thread_id);
  }
}

async function scopedHistory(communityId: string, threadId: number | null): Promise<ChatMessage[]> {
  const sql = getDatabase();
  const rows = await sql.unsafe<Array<{ question: string; answer: string }>>(
    "SELECT question, answer FROM community_interactions " +
    "WHERE community_id = $1 AND thread_id IS NOT DISTINCT FROM $2 " +
    "AND answer IS NOT NULL AND expires_at > now() " +
    "ORDER BY created_at DESC LIMIT $3",
    [communityId, threadId, MAX_HISTORY_PAIRS]
  );
  const messages: ChatMessage[] = [];
  for (const row of [...rows].reverse()) {
    messages.push({ role: "user", content: row.question.slice(0, MAX_QUESTION_LENGTH) });
    messages.push({ role: "assistant", content: row.answer.slice(0, MAX_ANSWER_LENGTH) });
  }
  return messages;
}

/** Isolated, explicitly triggered group Q&A; never reads the user's private conversations. */
export async function executeGroupAssistantRoute(
  route: GroupAssistantRoute,
  deps: AssistantDependencies,
  hooks: AssistantHooks
): Promise<void> {
  const { message } = route;
  const sender = message.from;
  if (!sender || sender.is_bot || message.sender_chat || message.via_bot) return;
  const community = await getCommunityByChatId(message.chat.id);
  if (!community || community.status !== "active" || community.chatType === "channel") return;

  const settings = await getCommunitySettings(community);
  const config = settings.assistant;
  if (!assistantTriggerAllowed(config, route)) return;

  const question = route.question.trim();
  if (question.length > MAX_QUESTION_LENGTH || config.dailyAiBudget === 0) return;
  const botPermissions = await fetchBotSnapshot(deps.client, message.chat.id, community.chatType);
  if (!moduleMayAct("assistant", community.chatType, community.status, settings, botPermissions)) return;

  // Consume the narrowest limits first. All keys include the community ID.
  const cooldown = config.cooldownSeconds === 0 ||
    (await consumeRateLimit(
      rateLimitKey("isn-c1-cooldown:" + community.id + ":" + sender.id),
      1,
      config.cooldownSeconds
    )).allowed;
  if (!cooldown) return;
  const minute = await consumeRateLimit(
    rateLimitKey("isn-c1-minute:" + community.id),
    15,
    60
  );
  if (!minute.allowed) return;
  const hourly = await consumeRateLimit(
    rateLimitKey("isn-c1-hour:" + community.id),
    config.maxRepliesPerHour,
    3600
  );
  if (!hourly.allowed) return;
  const daily = await consumeRateLimit(
    rateLimitKey("isn-c1-day:" + community.id),
    config.dailyAiBudget,
    86400
  );
  if (!daily.allowed) return;
  if (openAiKeyMissing()) {
    logger.warn("community_assistant_unavailable", { communityId: community.id });
    return;
  }

  const threadId = message.is_topic_message && typeof message.message_thread_id === "number"
    ? message.message_thread_id : null;
  const context = config.interactionRetentionDays > 0
    ? await scopedHistory(community.id, threadId) : [];
  const messages: ChatMessage[] = [...context, { role: "user", content: question }];
  const preferences = {
    ...DEFAULT_SETTINGS,
    language: config.responseLanguage === "auto" ? (sender.language_code || "en") : config.responseLanguage,
    answerLength: config.answerLength,
    memoryEnabled: false,
  };
  const prompt = buildConfiguredPrompt(question, preferences);
  // Reserve the outbound effect before model generation: a long completion must
  // not outlive the inbox lease and be generated a second time by another worker.
  await hooks.markSideEffect();
  const answer = (await (deps.generate ?? generateAnswer)(prompt, messages)).trim();
  if (!answer) return;
  // The core source and uncertainty requirements remain active for every reply.
  const responseText = answer.slice(0, MAX_ANSWER_LENGTH);

  // One update must never start another send after a timeout or lost response.
  try {
    await deps.client.sendMessage({
      ...replyContext(message),
      text: responseText,
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    if (error instanceof TelegramApiError && !error.outcomeUnknown) {
      await hooks.releaseSideEffect?.();
    }
    throw error;
  }

  if (config.interactionRetentionDays > 0) {
    const sql = getDatabase();
    const userId = await findUserIdByTelegramId(sender.id);
    await sql.unsafe(
      "INSERT INTO community_interactions " +
      "(community_id, thread_id, telegram_message_id, requester_user_id, interaction_type, question, answer, expires_at) " +
      "VALUES ($1, $2, $3, $4, 'assistant', $5, $6, now() + make_interval(days => $7))",
      [community.id, threadId, message.message_id, userId, question, responseText, config.interactionRetentionDays]
    );
  }
  logger.info("community_assistant_answered", {
    communityId: community.id,
    trigger: route.trigger,
    threadId,
  });
}
