import { DEFAULT_SETTINGS, type CitationRecord } from "@/lib/appTypes";
import { buildConfiguredPrompt, routeQuestion } from "@/lib/chatPipeline";
import { extractCitations } from "@/lib/citations";
import { databaseConfigured } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  generateAnswer,
  getOpenAiModel,
  openAiKeyMissing,
  streamAnswer,
  type ChatMessage,
} from "@/lib/providers";
import {
  createConversation,
  getConversationMessages,
  getOrCreateConversation,
  getSettings,
  latestCitations,
  listConversations,
  recordEvent,
  saveMessage,
  upsertTelegramIdentity,
  type TelegramIdentityInput,
} from "@/lib/store";

const TELEGRAM_API = "https://api.telegram.org";
const MAX_MESSAGE_LENGTH = 3900;

const DISCLAIMER =
  "Educational guidance, not a binding fatwa. Consult a qualified local scholar for personal high-stakes rulings.";

export const BOT_COMMANDS: { command: string; description: string }[] = [
  { command: "start", description: "Introduce Isnad and open the Mini App" },
  { command: "help", description: "Show commands and usage" },
  { command: "about", description: "Explain Isnad's sources and method" },
  { command: "ask", description: "Ask an Islamic knowledge question" },
  { command: "new", description: "Start a new conversation" },
  { command: "history", description: "Show recent conversations" },
  { command: "sources", description: "Show sources from the last answer" },
  { command: "settings", description: "View answer and memory settings" },
];

export const START_TEXT =
  "✦ Isnad — Islamic Knowledge\n\n" +
  "Ask a question and Isnad will trace the answer through the Qur'an, authentic Sunnah, the Companions, and recognized scholarship. Legitimate disagreement is identified rather than hidden.\n\n" +
  "Send your question directly or use /ask. Use /new for a clean conversation and /sources after an answer.\n\n" +
  DISCLAIMER;

export const HELP_TEXT =
  "How to use Isnad\n\n" +
  "/ask <question> — ask directly\n" +
  "/new — start a clean conversation\n" +
  "/history — view recent conversations\n" +
  "/sources — sources from the latest answer\n" +
  "/settings — current response preferences\n" +
  "/about — methodology and limitations\n\n" +
  DISCLAIMER;

export const ABOUT_TEXT =
  "About Isnad\n\n" +
  "The Islamic Teacher Core governs every answer. Specialist modules extend it for tafsīr, hadith sciences, fiqh, muʿāmalāt, sīrah, ʿaqīdah, Arabic, and daʿwah and tarbiyah without overriding its source hierarchy or safety rules.\n\n" +
  "References are stored with an audit status. A listed reference is not marked verified merely because a model produced it.\n\n" +
  DISCLAIMER;

export type ParsedCommand = { command: string; args: string };

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

type TelegramMessage = {
  message_id?: number;
  text?: string;
  chat?: { id?: number; type?: string };
  from?: TelegramIdentityInput;
};

type TelegramApiResponse = {
  ok: boolean;
  description?: string;
  result?: unknown;
};

function apiUrl(token: string, method: string): string {
  return `${TELEGRAM_API}/bot${token}/${method}`;
}

async function callTelegram(
  token: string,
  method: string,
  payload: Record<string, unknown>
): Promise<TelegramApiResponse> {
  const response = await fetch(apiUrl(token, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as TelegramApiResponse;
  if (!response.ok || !data.ok) {
    throw new Error(data.description ?? `Telegram ${method} failed.`);
  }
  return data;
}

export function parseCommand(text: string): ParsedCommand | null {
  if (!text.startsWith("/")) return null;
  const match = text.slice(1).match(/^(\S+)/);
  if (!match) return null;
  const token = match[1];
  return {
    command: token.split("@")[0].toLowerCase(),
    args: text.slice(1 + token.length).trim(),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function telegramHtml(markdown: string): string {
  return escapeHtml(markdown)
    .replace(/^#{1,4}\s+(.+)$/gm, "<b>$1</b>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

export async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  for (const chunk of splitMessage(text)) {
    try {
      await callTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: telegramHtml(chunk),
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch {
      await callTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: chunk,
        link_preview_options: { is_disabled: true },
      });
    }
  }
}

export async function sendTyping(token: string, chatId: number): Promise<void> {
  await callTelegram(token, "sendChatAction", {
    chat_id: chatId,
    action: "typing",
  }).catch(() => undefined);
}

async function sendDraft(
  token: string,
  chatId: number,
  draftId: number,
  text: string
): Promise<void> {
  await callTelegram(token, "sendMessageDraft", {
    chat_id: chatId,
    draft_id: draftId,
    text: text.slice(-MAX_MESSAGE_LENGTH),
  });
}

function formatSources(citations: CitationRecord[]): string {
  if (citations.length === 0) {
    return "No stored references were found for the latest answer. A reference is never invented to fill this list.";
  }
  return citations
    .map((citation, index) => {
      const audit = citation.verified ? "verified" : "pending audit";
      return `${index + 1}. ${citation.label}${citation.url ? `\n${citation.url}` : ""}\nStatus: ${audit}`;
    })
    .join("\n\n");
}

export async function answerQuestion(question: string): Promise<string> {
  const keyError = openAiKeyMissing();
  if (keyError) return keyError;
  const answer = await generateAnswer(buildConfiguredPrompt(question, DEFAULT_SETTINGS), [
    { role: "user", content: question },
  ]);
  return answer.trim() || "I couldn't produce an answer. Please try rephrasing the question.";
}

export async function handleTelegramUpdate(token: string, update: TelegramUpdate): Promise<void> {
  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  if (typeof chatId !== "number" || !text) return;

  const userId = message.from ? await upsertTelegramIdentity(message.from) : null;
  const settings = await getSettings(userId);
  const parsed = parseCommand(text);

  if (parsed) {
    switch (parsed.command) {
      case "start":
        await sendMessage(token, chatId, START_TEXT);
        return;
      case "help":
        await sendMessage(token, chatId, HELP_TEXT);
        return;
      case "about":
        await sendMessage(token, chatId, ABOUT_TEXT);
        return;
      case "settings":
        await sendMessage(
          token,
          chatId,
          `Current settings\n\nLanguage: ${settings.language}\nAnswer length: ${settings.answerLength}\nArabic text: ${settings.showArabic ? "on" : "off"}\nTransliteration: ${settings.transliteration ? "on" : "off"}\nCitation depth: ${settings.citationDepth}\nMemory: ${settings.memoryEnabled ? "on" : "off"}\nTheme: ${settings.theme}\n\nOpen the Mini App to change these settings.`
        );
        return;
      case "new":
        if (userId && databaseConfigured()) {
          await createConversation(userId, "telegram");
          await sendMessage(token, chatId, "A new conversation has been started.");
        } else {
          await sendMessage(token, chatId, "Conversation persistence requires the production database.");
        }
        return;
      case "history":
        if (!userId || !databaseConfigured()) {
          await sendMessage(token, chatId, "Conversation history requires the production database.");
          return;
        }
        {
          const conversations = await listConversations(userId, 10);
          const history = conversations.length
            ? conversations.map((conversation, index) => `${index + 1}. ${conversation.title}`).join("\n")
            : "No saved conversations yet.";
          await sendMessage(token, chatId, `Recent conversations\n\n${history}`);
        }
        return;
      case "sources":
        if (!userId || !databaseConfigured()) {
          await sendMessage(token, chatId, "Saved sources require the production database.");
          return;
        }
        await sendMessage(token, chatId, formatSources(await latestCitations(userId)));
        return;
      case "ask":
        if (!parsed.args) {
          await sendMessage(token, chatId, "Add your question after /ask.");
          return;
        }
        await answerAndSend(token, chatId, update.update_id, parsed.args, userId, settings);
        return;
      default:
        await sendMessage(token, chatId, "Unknown command. Send /help for the command list.");
        return;
    }
  }

  await answerAndSend(token, chatId, update.update_id, text, userId, settings);
}

async function answerAndSend(
  token: string,
  chatId: number,
  draftId: number,
  question: string,
  userId: string | null,
  settings: typeof DEFAULT_SETTINGS
): Promise<void> {
  const keyError = openAiKeyMissing();
  if (keyError) {
    await sendMessage(token, chatId, keyError);
    return;
  }

  const routing = routeQuestion(question);
  const prompt = buildConfiguredPrompt(question, settings);
  let conversationId: string | null = null;
  let messages: ChatMessage[] = [{ role: "user", content: question }];

  if (userId && databaseConfigured()) {
    const conversation = await getOrCreateConversation(userId, "telegram");
    conversationId = conversation.id;
    if (settings.memoryEnabled) {
      const history = await getConversationMessages(userId, conversation.id, 30);
      messages = history.map(({ role, content }) => ({ role, content }));
      messages.push({ role: "user", content: question });
    }
    await saveMessage({ conversationId, role: "user", content: question });
  }

  await sendTyping(token, chatId);
  let answer = "";
  let draftsSupported = true;
  let lastDraftAt = 0;
  const typingTimer = setInterval(() => void sendTyping(token, chatId), 4000);

  try {
    for await (const delta of streamAnswer(prompt, messages)) {
      answer += delta;
      if (draftsSupported && Date.now() - lastDraftAt >= 700 && answer.trim()) {
        lastDraftAt = Date.now();
        try {
          await sendDraft(token, chatId, draftId, answer);
        } catch {
          draftsSupported = false;
        }
      }
    }
  } finally {
    clearInterval(typingTimer);
  }

  answer = answer.trim() || "I couldn't produce an answer. Please try rephrasing the question.";
  const citations = extractCitations(answer);
  if (conversationId) {
    await saveMessage({
      conversationId,
      role: "assistant",
      content: answer,
      model: getOpenAiModel(),
      routing,
      citations,
    });
  }
  await recordEvent("chat_completed", userId, {
    channel: "telegram",
    model: getOpenAiModel(),
    citationCount: citations.length,
  });
  await sendMessage(token, chatId, answer);
}

function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_MESSAGE_LENGTH) {
    const window = remaining.slice(0, MAX_MESSAGE_LENGTH);
    const breakAt =
      lastIndexBefore(window, "\n\n") ??
      lastIndexBefore(window, "\n") ??
      lastIndexBefore(window, " ") ??
      MAX_MESSAGE_LENGTH;
    chunks.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function lastIndexBefore(haystack: string, needle: string): number | null {
  const index = haystack.lastIndexOf(needle);
  return index > MAX_MESSAGE_LENGTH * 0.5 ? index : null;
}
