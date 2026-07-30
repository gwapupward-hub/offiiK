import { buildSystemPrompt } from "@/lib/knowledge";
import { generateAnswer, openAiKeyMissing } from "@/lib/providers";

/**
 * Shared logic for the Telegram *bot* (chat commands), as opposed to the
 * Telegram *Mini App* (the /telegram web view). The bot receives updates on
 * `app/api/telegram/webhook`, answers questions with the same knowledge base
 * the Mini App uses, and exposes a small set of slash commands.
 */

const TELEGRAM_API = "https://api.telegram.org";

// Telegram hard-caps a single message at 4096 characters. Stay under it and
// split long answers on paragraph/line boundaries where possible.
const MAX_MESSAGE_LENGTH = 4000;

const DISCLAIMER =
  "Educational guidance, not a binding fatwa. For divorce, inheritance, or " +
  "other high-stakes rulings, consult a qualified local scholar.";

/**
 * The command list registered with Telegram via `setMyCommands` (see
 * `scripts/telegram-setup.mjs`). Kept here as the single source of truth; the
 * setup script mirrors it. `description` is what shows in the Telegram command
 * menu, so keep each under Telegram's 256-char limit.
 */
export const BOT_COMMANDS: { command: string; description: string }[] = [
  { command: "start", description: "Introduce Isnad and how to ask" },
  { command: "help", description: "How to use the bot" },
  { command: "about", description: "What Isnad is and where answers come from" },
  { command: "ask", description: "Ask a question, e.g. /ask Is crypto halal?" },
];

export const START_TEXT =
  "✦ Isnad — Islamic Knowledge\n\n" +
  "Ask any question of Islamic knowledge and I'll trace the answer to its " +
  "sources: Qur'an first, then authentic Sunnah, then the Companions, then " +
  "recognized scholarship — disagreement is never hidden.\n\n" +
  "Just send your question as a message, or use /ask.\n" +
  "Example: /ask Is a conventional mortgage permissible?\n\n" +
  "Open the Mini App from the menu button for the full experience, including " +
  "the collapsible source chain beneath each answer.\n\n" +
  DISCLAIMER;

export const HELP_TEXT =
  "How to use Isnad\n\n" +
  "• Send any question directly, or use /ask <your question>.\n" +
  "• /about — what Isnad is and how it builds an answer.\n" +
  "• /start — the welcome message.\n\n" +
  "Each reply reasons from the Qur'an, authentic Sunnah, the Companions, and " +
  "recognized scholarship, and tells you how certain the ruling is.\n\n" +
  DISCLAIMER;

export const ABOUT_TEXT =
  "About Isnad\n\n" +
  "An isnād is the chain of transmission behind a piece of knowledge. Every " +
  "answer is built the same way — Qur'an first, then authentic Sunnah, then " +
  "the Companions, then recognized scholarship — and legitimate scholarly " +
  "disagreement is surfaced, not buried.\n\n" +
  "Seerah questions additionally use evidence-graded Prophetic biography, " +
  "chronology, and early historical reports without treating every popular " +
  "story as established.\n\n" +
  "Finance questions (ribā, zakāh, crypto, mortgages, trade…) additionally " +
  "draw on a Muʿāmalāt add-on.\n\n" +
  DISCLAIMER;

function apiUrl(token: string, method: string): string {
  return `${TELEGRAM_API}/bot${token}/${method}`;
}

/** Parsed slash command, e.g. "/ask@the_isnad_bot foo" → { command: "ask", args: "foo" }. */
export type ParsedCommand = { command: string; args: string };

/**
 * Extracts a leading bot command from message text. Telegram appends
 * `@bot_username` to commands in group chats, so strip that. Returns null when
 * the text isn't a command (i.e. it's a plain question).
 */
export function parseCommand(text: string): ParsedCommand | null {
  if (!text.startsWith("/")) return null;
  const match = text.slice(1).match(/^(\S+)/);
  if (!match) return null;
  const token = match[1];
  const command = token.split("@")[0].toLowerCase();
  const args = text.slice(1 + token.length).trim();
  return { command, args };
}

/** Sends `text` to a chat, splitting into multiple messages if it's too long. */
export async function sendMessage(
  token: string,
  chatId: number,
  text: string
): Promise<void> {
  for (const chunk of splitMessage(text)) {
    await fetch(apiUrl(token, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        // Plain text on purpose: answers contain Markdown-ish characters
        // (###, **, underscores in transliterations) that would break
        // Telegram's strict MarkdownV2 parser and get the message rejected.
        disable_web_page_preview: true,
      }),
    });
  }
}

/** Shows the "typing…" indicator while an answer is being generated. */
export async function sendTyping(token: string, chatId: number): Promise<void> {
  await fetch(apiUrl(token, "sendChatAction"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {
    // A failed typing indicator must never block the actual answer.
  });
}

/**
 * Answers a free-text question with the same OpenAI model + knowledge base the
 * web app and Mini App use. Single-turn (no cross-message memory) to keep the
 * bot stateless. Returns a user-facing error string if the OpenAI key is missing.
 */
export async function answerQuestion(question: string): Promise<string> {
  const keyError = openAiKeyMissing();
  if (keyError) return keyError;

  const systemPrompt = buildSystemPrompt(question);
  const answer = await generateAnswer(systemPrompt, [
    { role: "user", content: question },
  ]);
  return answer.trim() || "I couldn't produce an answer for that. Please try rephrasing.";
}

/** Splits text into <=MAX_MESSAGE_LENGTH chunks, preferring paragraph/line breaks. */
function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_MESSAGE_LENGTH) {
    const window = remaining.slice(0, MAX_MESSAGE_LENGTH);
    // Prefer to break at the last paragraph break, then the last newline, then
    // the last space, then fall back to a hard cut.
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
  const idx = haystack.lastIndexOf(needle);
  // Ignore breaks that appear too early — they'd create tiny, choppy messages.
  return idx > MAX_MESSAGE_LENGTH * 0.5 ? idx : null;
}
