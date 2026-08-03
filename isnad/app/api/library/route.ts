import { NextRequest, NextResponse } from "next/server";
import {
  createBookmark,
  createCollection,
  createNote,
  listKnowledgeLibrary,
} from "@/lib/libraryStore";
import { recordEvent } from "@/lib/store";
import { resolveTelegramSession } from "@/lib/telegramSession";

export const runtime = "nodejs";

type CreateBody =
  | {
      type: "bookmark";
      messageId?: unknown;
      collectionId?: unknown;
      kind?: unknown;
      title?: unknown;
      content?: unknown;
      note?: unknown;
      tags?: unknown;
    }
  | {
      type: "note";
      collectionId?: unknown;
      title?: unknown;
      content?: unknown;
      tags?: unknown;
    }
  | {
      type: "collection";
      name?: unknown;
      description?: unknown;
    };

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
    return NextResponse.json({ error: "Personal library is unavailable." }, { status: 503 });
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";
  const collectionId = request.nextUrl.searchParams.get("collection") ?? undefined;
  const library = await listKnowledgeLibrary(session.userId, { query, collectionId });
  return NextResponse.json({ library });
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
    return NextResponse.json({ error: "Personal library is unavailable." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body || !body.type) {
    return NextResponse.json({ error: "A library item type is required." }, { status: 400 });
  }

  try {
    if (body.type === "collection") {
      const collection = await createCollection(session.userId, {
        name: body.name,
        description: body.description,
      });
      if (!collection) {
        return NextResponse.json({ error: "Collection name is required." }, { status: 400 });
      }
      await recordEvent("library_collection_created", session.userId, {
        collectionId: collection.id,
      });
      return NextResponse.json({ collection }, { status: 201 });
    }

    if (body.type === "note") {
      const note = await createNote(session.userId, body);
      if (!note) {
        return NextResponse.json(
          { error: "A valid note title, content, and collection are required." },
          { status: 400 }
        );
      }
      await recordEvent("library_note_created", session.userId, { noteId: note.id });
      return NextResponse.json({ note }, { status: 201 });
    }

    if (body.type === "bookmark") {
      const bookmark = await createBookmark(session.userId, body);
      if (!bookmark) {
        return NextResponse.json(
          { error: "A valid saved response or bookmark title and content are required." },
          { status: 400 }
        );
      }
      await recordEvent("library_bookmark_created", session.userId, {
        bookmarkId: bookmark.id,
        kind: bookmark.kind,
        fromMessage: Boolean(bookmark.messageId),
      });
      return NextResponse.json({ bookmark }, { status: 201 });
    }

    return NextResponse.json({ error: "Unsupported library item type." }, { status: 400 });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code === "23505") {
      return NextResponse.json(
        { error: "A collection with this name already exists." },
        { status: 409 }
      );
    }
    throw error;
  }
}
