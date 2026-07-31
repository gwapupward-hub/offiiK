import { NextRequest, NextResponse } from "next/server";
import { archiveConversation, getConversationMessages, listConversations } from "@/lib/store";
import { resolveTelegramSession } from "@/lib/telegramSession";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function sessionFor(request: NextRequest) {
  return resolveTelegramSession(request, { required: true, requireDatabase: true });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await sessionFor(request);
  if (!session || !session.ok) {
    return NextResponse.json(
      { error: session?.error ?? "Telegram authentication is required." },
      { status: session?.status ?? 401 }
    );
  }
  if (!session.userId) {
    return NextResponse.json({ error: "Conversation history is unavailable." }, { status: 503 });
  }

  const { id } = await context.params;
  const conversations = await listConversations(session.userId, 100);
  const conversation = conversations.find((item) => item.id === id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const messages = await getConversationMessages(session.userId, id, 100);
  return NextResponse.json({ conversation, messages });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await sessionFor(request);
  if (!session || !session.ok) {
    return NextResponse.json(
      { error: session?.error ?? "Telegram authentication is required." },
      { status: session?.status ?? 401 }
    );
  }
  if (!session.userId) {
    return NextResponse.json({ error: "Conversation history is unavailable." }, { status: 503 });
  }

  const { id } = await context.params;
  const archived = await archiveConversation(session.userId, id);
  if (!archived) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  return NextResponse.json({ archived: true });
}
