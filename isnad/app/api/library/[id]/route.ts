import { NextRequest, NextResponse } from "next/server";
import {
  deleteBookmark,
  deleteCollection,
  deleteNote,
  updateBookmark,
  updateCollection,
  updateNote,
} from "@/lib/libraryStore";
import { recordEvent } from "@/lib/store";
import { resolveTelegramSession } from "@/lib/telegramSession";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
type LibraryItemType = "bookmark" | "note" | "collection";

async function authenticate(request: NextRequest) {
  return resolveTelegramSession(request, { required: true, requireDatabase: true });
}

function itemType(request: NextRequest): LibraryItemType | null {
  const value = request.nextUrl.searchParams.get("type");
  return value === "bookmark" || value === "note" || value === "collection" ? value : null;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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

  const type = itemType(request);
  if (!type) {
    return NextResponse.json({ error: "A valid library item type is required." }, { status: 400 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Update data is required." }, { status: 400 });
  }

  try {
    if (type === "bookmark") {
      const bookmark = await updateBookmark(session.userId, id, body);
      if (!bookmark) return NextResponse.json({ error: "Bookmark not found or invalid." }, { status: 404 });
      await recordEvent("library_bookmark_updated", session.userId, { bookmarkId: id });
      return NextResponse.json({ bookmark });
    }
    if (type === "note") {
      const note = await updateNote(session.userId, id, body);
      if (!note) return NextResponse.json({ error: "Note not found or invalid." }, { status: 404 });
      await recordEvent("library_note_updated", session.userId, { noteId: id });
      return NextResponse.json({ note });
    }
    const collection = await updateCollection(session.userId, id, body);
    if (!collection) {
      return NextResponse.json({ error: "Collection not found or invalid." }, { status: 404 });
    }
    await recordEvent("library_collection_updated", session.userId, { collectionId: id });
    return NextResponse.json({ collection });
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

export async function DELETE(request: NextRequest, context: RouteContext) {
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

  const type = itemType(request);
  if (!type) {
    return NextResponse.json({ error: "A valid library item type is required." }, { status: 400 });
  }
  const { id } = await context.params;
  const deleted = type === "bookmark"
    ? await deleteBookmark(session.userId, id)
    : type === "note"
      ? await deleteNote(session.userId, id)
      : await deleteCollection(session.userId, id);

  if (!deleted) {
    return NextResponse.json({ error: "Library item not found." }, { status: 404 });
  }
  await recordEvent(`library_${type}_deleted`, session.userId, { itemId: id });
  return NextResponse.json({ deleted: true });
}
