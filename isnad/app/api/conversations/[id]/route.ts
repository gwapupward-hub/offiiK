import { NextRequest, NextResponse } from "next/server";
import {
  archiveConversation,
  getConversation,
  getConversationMessages,
  recordEvent,
  renameConversation,
  setConversationPinned,
} from "@/lib/store";
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
  const conversation = await getConversation(session.userId, id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const messages = await getConversationMessages(session.userId, id, 100);
  return NextResponse.json({ conversation, messages });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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
  const body = (await request.json().catch(() => null)) as
    | { title?: unknown; pinned?: unknown }
    | null;
  if (!body || (body.title === undefined && body.pinned === undefined)) {
    return NextResponse.json({ error: "A title or pinned state is required." }, { status: 400 });
  }

  let conversation = await getConversation(session.userId, id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const changes: string[] = [];
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 120) {
      return NextResponse.json(
        { error: "Conversation title must be between 1 and 120 characters." },
        { status: 400 }
      );
    }
    conversation = await renameConversation(session.userId, id, body.title);
    changes.push("title");
  }

  if (body.pinned !== undefined) {
    if (typeof body.pinned !== "boolean") {
      return NextResponse.json({ error: "Pinned state must be true or false." }, { status: 400 });
    }
    conversation = await setConversationPinned(session.userId, id, body.pinned);
    changes.push(body.pinned ? "pinned" : "unpinned");
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  await recordEvent("conversation_updated", session.userId, {
    conversationId: id,
    changes,
  });
  return NextResponse.json({ conversation });
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
  await recordEvent("conversation_archived", session.userId, { conversationId: id });
  return NextResponse.json({ archived: true });
}
