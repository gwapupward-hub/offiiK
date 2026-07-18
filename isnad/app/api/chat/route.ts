import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt, isFinanceQuestion } from "@/lib/knowledge";
import {
  generateAnswer,
  providerKeyMissing,
  resolveProvider,
  type ChatMessage,
} from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      messages: ChatMessage[];
      provider?: string;
    };
    const { messages } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    const provider = resolveProvider(body.provider);

    const keyError = providerKeyMissing(provider);
    if (keyError) {
      return NextResponse.json({ error: keyError }, { status: 500 });
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    const systemPrompt = buildSystemPrompt(lastUserMessage?.content ?? "");
    const routedToFinance = isFinanceQuestion(lastUserMessage?.content ?? "");

    const answer = await generateAnswer(provider, systemPrompt, messages);

    return NextResponse.json({ answer, routedToFinance, provider });
  } catch (err) {
    console.error("Chat route error:", err);
    return NextResponse.json(
      { error: "Something went wrong answering this question. Please try again." },
      { status: 500 }
    );
  }
}
