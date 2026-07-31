import { NextRequest, NextResponse } from "next/server";
import { createConversation, listConversations, recordEvent } from "@/lib/store";
import { resolveTelegramSession } from "@/lib/telegramSession";

export const runtime = "nodejs";

async function authenticate(request: NextRequest) {
  return resolveTelegramSession(request, { required: true, requireDatabase: true });
}

export async function GET(request: NextRequest) {
  const session = await authenticate(request);
  if (!session || !session.ok) {
    return NextResponse.json(
      { error: session?.error ?? "Telegram authentication is required." },
      { status: session?.status ?? 401 }
    );
  }
  if (!session.userId) {
    return NextResponse.json({ error: "Conversation history is unavailable." }, { status: 503 });
  }

  const conversations = await listConversations(session.userId);
  return NextResponse.json({ conversations });
}

export async function POST(request: NextRequest) {
  const session = await authenticate(request);
  if (!session || !session.ok) {
    return NextResponse.json(
      { error: session?.error ?? "Telegram authentication is required." },
      { status: session?.status ?? 401 }
    );
  }
  if (!session.userId) {
    return NextResponse.json({ error: "Conversation history is unavailable." }, { status: 503 });
  }

  const conversation = await createConversation(session.userId, "mini_app");
  await recordEvent("conversation_created", session.userId, { channel: "mini_app" });
  return NextResponse.json({ conversation }, { status: 201 });
}
