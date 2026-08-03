import type { CitationRecord } from "@/lib/appTypes";
import { getDatabase } from "@/lib/db";
import {
  BOOKMARK_KINDS,
  type BookmarkCollection,
  type BookmarkKind,
  type BookmarkRecord,
  type KnowledgeLibrary,
  type StudyNote,
} from "@/lib/libraryTypes";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function iso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

function normalizeText(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function normalizeTags(value: unknown): string[] {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return [...new Set(
    candidates
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase().replace(/\s+/g, "-"))
      .filter(Boolean)
      .map((item) => item.slice(0, 32))
  )].slice(0, 12);
}

function sourceData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mapCollection(row: Record<string, unknown>): BookmarkCollection {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    bookmarkCount: Number(row.bookmark_count ?? 0),
    noteCount: Number(row.note_count ?? 0),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapBookmark(row: Record<string, unknown>): BookmarkRecord {
  const source = sourceData(row.source_data);
  return {
    id: row.id as string,
    messageId: (row.message_id as string | null) ?? undefined,
    collectionId: (row.collection_id as string | null) ?? undefined,
    kind: row.kind as BookmarkKind,
    title: row.title as string,
    content: row.content as string,
    note: row.note as string,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    citations: Array.isArray(source.citations)
      ? (source.citations as CitationRecord[])
      : [],
    sourceConversationId:
      typeof source.conversationId === "string" ? source.conversationId : undefined,
    sourceConversationTitle:
      typeof source.conversationTitle === "string" ? source.conversationTitle : undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapNote(row: Record<string, unknown>): StudyNote {
  return {
    id: row.id as string,
    collectionId: (row.collection_id as string | null) ?? undefined,
    title: row.title as string,
    content: row.content as string,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function resolveCollectionId(
  userId: string,
  requested: unknown
): Promise<string | null | undefined> {
  if (requested === null || requested === undefined || requested === "") return null;
  if (typeof requested !== "string" || !UUID_PATTERN.test(requested)) return undefined;
  const sql = getDatabase();
  const [row] = await sql`
    SELECT id::text AS id
    FROM bookmark_collections
    WHERE id = ${requested} AND user_id = ${userId}
  `;
  return row ? requested : undefined;
}

export async function listKnowledgeLibrary(
  userId: string,
  options: { query?: string; collectionId?: string } = {}
): Promise<KnowledgeLibrary> {
  const sql = getDatabase();
  const query = normalizeText(options.query, 120);
  const like = `%${query}%`;
  const collectionId = options.collectionId && UUID_PATTERN.test(options.collectionId)
    ? options.collectionId
    : null;

  const [collectionRows, bookmarkRows, noteRows] = await Promise.all([
    sql`
      SELECT c.id::text AS id, c.name, c.description, c.created_at, c.updated_at,
             (SELECT count(*) FROM bookmarks b WHERE b.collection_id = c.id) AS bookmark_count,
             (SELECT count(*) FROM study_notes n WHERE n.collection_id = c.id) AS note_count
      FROM bookmark_collections c
      WHERE c.user_id = ${userId}
      ORDER BY lower(c.name)
    `,
    sql`
      SELECT b.id::text AS id, b.message_id::text AS message_id,
             b.collection_id::text AS collection_id, b.kind, b.title, b.content,
             b.note, b.tags, b.source_data, b.created_at, b.updated_at
      FROM bookmarks b
      WHERE b.user_id = ${userId}
        AND (${collectionId}::uuid IS NULL OR b.collection_id = ${collectionId}::uuid)
        AND (
          ${query === ""}
          OR b.title ILIKE ${like}
          OR b.content ILIKE ${like}
          OR b.note ILIKE ${like}
          OR array_to_string(b.tags, ' ') ILIKE ${like}
        )
      ORDER BY b.updated_at DESC
      LIMIT 200
    `,
    sql`
      SELECT n.id::text AS id, n.collection_id::text AS collection_id,
             n.title, n.content, n.tags, n.created_at, n.updated_at
      FROM study_notes n
      WHERE n.user_id = ${userId}
        AND (${collectionId}::uuid IS NULL OR n.collection_id = ${collectionId}::uuid)
        AND (
          ${query === ""}
          OR n.title ILIKE ${like}
          OR n.content ILIKE ${like}
          OR array_to_string(n.tags, ' ') ILIKE ${like}
        )
      ORDER BY n.updated_at DESC
      LIMIT 200
    `,
  ]);

  return {
    collections: collectionRows.map(mapCollection),
    bookmarks: bookmarkRows.map(mapBookmark),
    notes: noteRows.map(mapNote),
  };
}

export async function createCollection(
  userId: string,
  input: { name: unknown; description?: unknown }
): Promise<BookmarkCollection | null> {
  const name = normalizeText(input.name, 80).replace(/\s+/g, " ");
  const description = normalizeText(input.description, 300);
  if (!name) return null;
  const sql = getDatabase();
  const [row] = await sql`
    INSERT INTO bookmark_collections (user_id, name, description)
    VALUES (${userId}, ${name}, ${description})
    RETURNING id::text AS id, name, description, created_at, updated_at,
              0::bigint AS bookmark_count, 0::bigint AS note_count
  `;
  return mapCollection(row);
}

export async function updateCollection(
  userId: string,
  id: string,
  input: { name?: unknown; description?: unknown }
): Promise<BookmarkCollection | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const sql = getDatabase();
  const [current] = await sql`
    SELECT name, description FROM bookmark_collections
    WHERE id = ${id} AND user_id = ${userId}
  `;
  if (!current) return null;
  const name = input.name === undefined
    ? String(current.name)
    : normalizeText(input.name, 80).replace(/\s+/g, " ");
  const description = input.description === undefined
    ? String(current.description)
    : normalizeText(input.description, 300);
  if (!name) return null;
  const [row] = await sql`
    UPDATE bookmark_collections
    SET name = ${name}, description = ${description}, updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id::text AS id, name, description, created_at, updated_at,
              (SELECT count(*) FROM bookmarks b WHERE b.collection_id = bookmark_collections.id)
                AS bookmark_count,
              (SELECT count(*) FROM study_notes n WHERE n.collection_id = bookmark_collections.id)
                AS note_count
  `;
  return row ? mapCollection(row) : null;
}

export async function deleteCollection(userId: string, id: string): Promise<boolean> {
  if (!UUID_PATTERN.test(id)) return false;
  const sql = getDatabase();
  const rows = await sql`
    DELETE FROM bookmark_collections
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function createBookmark(
  userId: string,
  input: {
    messageId?: unknown;
    collectionId?: unknown;
    kind?: unknown;
    title?: unknown;
    content?: unknown;
    note?: unknown;
    tags?: unknown;
  }
): Promise<BookmarkRecord | null> {
  const sql = getDatabase();
  const collectionId = await resolveCollectionId(userId, input.collectionId);
  if (collectionId === undefined) return null;
  const kind = BOOKMARK_KINDS.includes(input.kind as BookmarkKind)
    ? (input.kind as BookmarkKind)
    : "other";
  const note = normalizeText(input.note, 4_000);
  const tags = normalizeTags(input.tags);

  let messageId: string | null = null;
  let title = normalizeText(input.title, 160).replace(/\s+/g, " ");
  let content = normalizeText(input.content, 40_000);
  let source: Record<string, unknown> = {};

  if (typeof input.messageId === "string" && UUID_PATTERN.test(input.messageId)) {
    messageId = input.messageId;
    const [existing] = await sql`
      SELECT id::text AS id, message_id::text AS message_id,
             collection_id::text AS collection_id, kind, title, content, note,
             tags, source_data, created_at, updated_at
      FROM bookmarks
      WHERE user_id = ${userId} AND message_id = ${messageId}
    `;
    if (existing) return mapBookmark(existing);

    const [message] = await sql`
      SELECT m.id::text AS id, m.content, c.id::text AS conversation_id, c.title AS conversation_title
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = ${messageId} AND m.role = 'assistant' AND c.user_id = ${userId}
    `;
    if (!message) return null;
    const citationRows = await sql`
      SELECT ordinal, label, source_type, work, locator, url, verified
      FROM message_citations
      WHERE message_id = ${messageId}
      ORDER BY ordinal
    `;
    const citations: CitationRecord[] = citationRows.map((citation) => ({
      ordinal: Number(citation.ordinal),
      label: citation.label as string,
      sourceType: citation.source_type as string,
      work: (citation.work as string | null) ?? undefined,
      locator: (citation.locator as string | null) ?? undefined,
      url: (citation.url as string | null) ?? undefined,
      verified: Boolean(citation.verified),
    }));
    content = String(message.content);
    title = title || String(message.conversation_title) || content.slice(0, 100);
    source = {
      conversationId: message.conversation_id,
      conversationTitle: message.conversation_title,
      citations,
    };
  }

  if (!title || !content) return null;
  const [row] = await sql`
    INSERT INTO bookmarks (
      user_id, message_id, collection_id, kind, title, content, note, tags, source_data
    ) VALUES (
      ${userId}, ${messageId}, ${collectionId}, ${messageId ? "ai_response" : kind},
      ${title}, ${content}, ${note}, ${tags}, ${sql.json(source as never)}
    )
    RETURNING id::text AS id, message_id::text AS message_id,
              collection_id::text AS collection_id, kind, title, content, note,
              tags, source_data, created_at, updated_at
  `;
  return mapBookmark(row);
}

export async function updateBookmark(
  userId: string,
  id: string,
  input: {
    collectionId?: unknown;
    kind?: unknown;
    title?: unknown;
    content?: unknown;
    note?: unknown;
    tags?: unknown;
  }
): Promise<BookmarkRecord | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const sql = getDatabase();
  const [current] = await sql`
    SELECT collection_id::text AS collection_id, kind, title, content, note, tags
    FROM bookmarks WHERE id = ${id} AND user_id = ${userId}
  `;
  if (!current) return null;

  const collectionId = input.collectionId === undefined
    ? ((current.collection_id as string | null) ?? null)
    : await resolveCollectionId(userId, input.collectionId);
  if (collectionId === undefined) return null;
  const kind = input.kind === undefined
    ? (current.kind as BookmarkKind)
    : BOOKMARK_KINDS.includes(input.kind as BookmarkKind)
      ? (input.kind as BookmarkKind)
      : null;
  if (!kind) return null;
  const title = input.title === undefined
    ? String(current.title)
    : normalizeText(input.title, 160).replace(/\s+/g, " ");
  const content = input.content === undefined
    ? String(current.content)
    : normalizeText(input.content, 40_000);
  const note = input.note === undefined ? String(current.note) : normalizeText(input.note, 4_000);
  const tags = input.tags === undefined ? (current.tags as string[]) : normalizeTags(input.tags);
  if (!title || !content) return null;

  const [row] = await sql`
    UPDATE bookmarks
    SET collection_id = ${collectionId}, kind = ${kind}, title = ${title},
        content = ${content}, note = ${note}, tags = ${tags}, updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id::text AS id, message_id::text AS message_id,
              collection_id::text AS collection_id, kind, title, content, note,
              tags, source_data, created_at, updated_at
  `;
  return row ? mapBookmark(row) : null;
}

export async function deleteBookmark(userId: string, id: string): Promise<boolean> {
  if (!UUID_PATTERN.test(id)) return false;
  const sql = getDatabase();
  const rows = await sql`
    DELETE FROM bookmarks WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `;
  return rows.length > 0;
}

export async function createNote(
  userId: string,
  input: { collectionId?: unknown; title?: unknown; content?: unknown; tags?: unknown }
): Promise<StudyNote | null> {
  const collectionId = await resolveCollectionId(userId, input.collectionId);
  if (collectionId === undefined) return null;
  const title = normalizeText(input.title, 160).replace(/\s+/g, " ");
  const content = normalizeText(input.content, 40_000);
  const tags = normalizeTags(input.tags);
  if (!title || !content) return null;
  const sql = getDatabase();
  const [row] = await sql`
    INSERT INTO study_notes (user_id, collection_id, title, content, tags)
    VALUES (${userId}, ${collectionId}, ${title}, ${content}, ${tags})
    RETURNING id::text AS id, collection_id::text AS collection_id,
              title, content, tags, created_at, updated_at
  `;
  return mapNote(row);
}

export async function updateNote(
  userId: string,
  id: string,
  input: { collectionId?: unknown; title?: unknown; content?: unknown; tags?: unknown }
): Promise<StudyNote | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const sql = getDatabase();
  const [current] = await sql`
    SELECT collection_id::text AS collection_id, title, content, tags
    FROM study_notes WHERE id = ${id} AND user_id = ${userId}
  `;
  if (!current) return null;
  const collectionId = input.collectionId === undefined
    ? ((current.collection_id as string | null) ?? null)
    : await resolveCollectionId(userId, input.collectionId);
  if (collectionId === undefined) return null;
  const title = input.title === undefined
    ? String(current.title)
    : normalizeText(input.title, 160).replace(/\s+/g, " ");
  const content = input.content === undefined
    ? String(current.content)
    : normalizeText(input.content, 40_000);
  const tags = input.tags === undefined ? (current.tags as string[]) : normalizeTags(input.tags);
  if (!title || !content) return null;
  const [row] = await sql`
    UPDATE study_notes
    SET collection_id = ${collectionId}, title = ${title}, content = ${content},
        tags = ${tags}, updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id::text AS id, collection_id::text AS collection_id,
              title, content, tags, created_at, updated_at
  `;
  return row ? mapNote(row) : null;
}

export async function deleteNote(userId: string, id: string): Promise<boolean> {
  if (!UUID_PATTERN.test(id)) return false;
  const sql = getDatabase();
  const rows = await sql`
    DELETE FROM study_notes WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `;
  return rows.length > 0;
}
