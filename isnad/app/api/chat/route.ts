import { NextRequest, NextResponse } from "next/server";
import {
  buildSystemPrompt,
  isFinanceQuestion,
  isTafsirQuestion,
} from "@/lib/knowledge";
import { validateTelegramInitData } from "@/lib/telegramAuth";
import {
  generateAnswer,
  openAiKeyMissing,
  type ChatMessage,
} from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Requests from the Telegram Mini App (/telegram) carry the signed initData
    // string. When present, prove it came from Telegram before doing any work;
    // ordinary web requests without the header are unaffected.
    const initData = req.headers.get("x-telegram-init-data");
    if (initData) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        return NextResponse.json(
          { error: "Server is missing TELEGRAM_BOT_TOKEN. Add it to validate Telegram requests." },
          { status: 500 }
        );
      }
      const { valid } = validateTelegramInitData(initData, botToken);
      if (!valid) {
        return NextResponse.json(
          { error: "Telegram authentication failed." },
          { status: 401 }
        );
      }
    }

    const body = (await req.json()) as {
      messages: ChatMessage[];
    };
    const { messages } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    const keyError = openAiKeyMissing();
    if (keyError) {
      return NextResponse.json({ error: keyError }, { status: 500 });
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    const systemPrompt = buildSystemPrompt(lastUserMessage?.content ?? "");
    const routedToFinance = isFinanceQuestion(lastUserMessage?.content ?? "");
    const routedToTafsir = isTafsirQuestion(lastUserMessage?.content ?? "");

    const answer = await generateAnswer(systemPrompt, messages);

    return NextResponse.json({ answer, routedToFinance, routedToTafsir });
  } catch (err) {
    console.error("Chat route error:", err);
    return NextResponse.json(
      { error: "Something went wrong answering this question. Please try again." },
      { status: 500 }
    );
  }
}
