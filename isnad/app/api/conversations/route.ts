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

  const search = request.nextUrl.searchParams.get("q") ?? "";
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 50;
  const conversations = await listConversations(session.userId, limit, search);
  return NextResponse.json({ conversations, query: search.trim().slice(0, 120) });
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

  const body = (await request.json().catch(() => ({}))) as { title?: unknown };
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim().slice(0, 120)
    : "New conversation";
  const conversation = await createConversation(session.userId, "mini_app", title);
  await recordEvent("conversation_created", session.userId, { channel: "mini_app" });
  return NextResponse.json({ conversation }, { status: 201 });
}
