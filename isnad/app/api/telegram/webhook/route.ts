import { NextRequest, NextResponse } from "next/server";
import {
  ABOUT_TEXT,
  HELP_TEXT,
  START_TEXT,
  answerQuestion,
  parseCommand,
  sendMessage,
  sendTyping,
} from "@/lib/telegramBot";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Telegram bot webhook. Telegram POSTs an Update here for every message the bot
 * receives in a normal chat (this is separate from the /telegram Mini App).
 * We handle the slash commands and answer plain-text questions with the same
 * knowledge base the Mini App uses.
 *
 * Register this endpoint with `scripts/telegram-setup.mjs` (setWebhook +
 * setMyCommands). That script also sets a `secret_token`, which Telegram echoes
 * back in the `X-Telegram-Bot-Api-Secret-Token` header on every request — we
 * verify it so only Telegram can drive the bot.
 */
export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  // No token → nothing we can do. Ack with 200 so Telegram doesn't retry.
  if (!token) return NextResponse.json({ ok: true });

  // Verify the shared secret when one is configured (the setup script always
  // sets one). Reject anything that doesn't carry the matching header.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== secret) {
      return NextResponse.json({ error: "forbidden" }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();

  // Only text messages in a chat are actionable here.
  if (typeof chatId !== "number" || !text) {
    return NextResponse.json({ ok: true });
  }

  try {
    await handleMessage(token, chatId, text);
  } catch (err) {
    console.error("Telegram webhook error:", err);
    // Best-effort apology; never surface internals to the chat.
    await sendMessage(
      token,
      chatId,
      "Something went wrong answering that. Please try again in a moment."
    ).catch(() => {});
  }

  // Always 200 so Telegram considers the update delivered.
  return NextResponse.json({ ok: true });
}

async function handleMessage(token: string, chatId: number, text: string): Promise<void> {
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
      case "ask":
        if (!parsed.args) {
          await sendMessage(
            token,
            chatId,
            "Add your question after /ask — e.g. /ask Is a conventional mortgage permissible?"
          );
          return;
        }
        await answerAndSend(token, chatId, parsed.args);
        return;
      default:
        await sendMessage(
          token,
          chatId,
          "I don't recognize that command. Send /help to see what I can do, or just type your question."
        );
        return;
    }
  }

  // Not a command → treat the whole message as a question.
  await answerAndSend(token, chatId, text);
}

async function answerAndSend(token: string, chatId: number, question: string): Promise<void> {
  await sendTyping(token, chatId);
  const answer = await answerQuestion(question);
  await sendMessage(token, chatId, answer);
}

// Minimal shape of the Telegram Update payload — just the fields we read.
type TelegramUpdate = {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

type TelegramMessage = {
  text?: string;
  chat?: { id?: number };
};
