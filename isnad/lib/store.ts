import { createHash } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  type CitationRecord,
  type ConversationChannel,
  type ConversationSummary,
  type RoutingFlags,
  type StoredMessage,
  type UserProfile,
  type UserSettings,
} from "@/lib/appTypes";
import { databaseConfigured, getDatabase } from "@/lib/db";

export type TelegramIdentityInput = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

type RateBucket = { count: number; resetAt: number };
const localRateLimits = new Map<string, RateBucket>();

function mapSettings(row: Record<string, unknown> | undefined): UserSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    language: String(row.language ?? "en"),
    answerLength: (row.answer_length ?? "balanced") as UserSettings["answerLength"],
    showArabic: Boolean(row.show_arabic),
    transliteration: Boolean(row.transliteration),
    citationDepth: (row.citation_depth ?? "standard") as UserSettings["citationDepth"],
    madhhabContext: String(row.madhhab_context ?? "balanced"),
    theme: (row.theme ?? "system") as UserSettings["theme"],
    memoryEnabled: Boolean(row.memory_enabled),
  };
}

export async function upsertTelegramIdentity(identity: TelegramIdentityInput): Promise<string | null> {
  if (!databaseConfigured()) return null;
  const sql = getDatabase();

  return sql.begin(async (transaction) => {
    const [existing] = await transaction`
      SELECT user_id::text AS user_id
      FROM telegram_identities
      WHERE telegram_user_id = ${identity.id}
    `;

    let userId = existing?.user_id as string | undefined;
    if (!userId) {
      const [created] = await transaction`
        INSERT INTO users DEFAULT VALUES RETURNING id::text AS id
      `;
      userId = created.id as string;
    }

    await transaction`
      INSERT INTO telegram_identities (
        telegram_user_id, user_id, username, first_name, last_name, language_code, updated_at
      ) VALUES (
        ${identity.id}, ${userId}, ${identity.username ?? null}, ${identity.first_name},
        ${identity.last_name ?? null}, ${identity.language_code ?? null}, now()
      )
      ON CONFLICT (telegram_user_id) DO UPDATE SET
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        language_code = EXCLUDED.language_code,
        updated_at = now()
    `;

    const displayName = [identity.first_name, identity.last_name].filter(Boolean).join(" ");
    await transaction`
      INSERT INTO profiles (user_id, display_name)
      VALUES (${userId}, ${displayName})
      ON CONFLICT (user_id) DO NOTHING
    `;
    await transaction`
      INSERT INTO user_settings (user_id, language)
      VALUES (${userId}, ${identity.language_code?.split("-")[0] ?? "en"})
      ON CONFLICT (user_id) DO NOTHING
    `;
    await transaction`UPDATE users SET last_seen_at = now() WHERE id = ${userId}`;

    return userId;
  });
}

export async function getSettings(userId: string | null): Promise<UserSettings> {
  if (!userId || !databaseConfigured()) return DEFAULT_SETTINGS;
  const sql = getDatabase();
  const [row] = await sql`
    SELECT language, answer_length, show_arabic, transliteration, citation_depth,
           madhhab_context, theme, memory_enabled
    FROM user_settings WHERE user_id = ${userId}
  `;
  return mapSettings(row);
}

export async function updateSettings(userId: string, settings: UserSettings): Promise<UserSettings> {
  const sql = getDatabase();
  const [row] = await sql`
    INSERT INTO user_settings (
      user_id, language, answer_length, show_arabic, transliteration,
      citation_depth, madhhab_context, theme, memory_enabled, updated_at
    ) VALUES (
      ${userId}, ${settings.language}, ${settings.answerLength}, ${settings.showArabic},
      ${settings.transliteration}, ${settings.citationDepth}, ${settings.madhhabContext},
      ${settings.theme}, ${settings.memoryEnabled}, now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      language = EXCLUDED.language,
      answer_length = EXCLUDED.answer_length,
      show_arabic = EXCLUDED.show_arabic,
      transliteration = EXCLUDED.transliteration,
      citation_depth = EXCLUDED.citation_depth,
      madhhab_context = EXCLUDED.madhhab_context,
      theme = EXCLUDED.theme,
      memory_enabled = EXCLUDED.memory_enabled,
      updated_at = now()
    RETURNING language, answer_length, show_arabic, transliteration, citation_depth,
              madhhab_context, theme, memory_enabled
  `;
  return mapSettings(row);
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const sql = getDatabase();
  const [row] = await sql`
    SELECT p.user_id::text AS user_id, t.telegram_user_id, t.username, t.first_name,
           t.last_name, t.language_code, p.display_name, p.bio
    FROM profiles p
    JOIN telegram_identities t ON t.user_id = p.user_id
    WHERE p.user_id = ${userId}
  `;
  if (!row) return null;
  return {
    userId: row.user_id as string,
    telegramUserId: Number(row.telegram_user_id),
    username: (row.username as string | null) ?? undefined,
    firstName: row.first_name as string,
    lastName: (row.last_name as string | null) ?? undefined,
    displayName: row.display_name as string,
    bio: row.bio as string,
    languageCode: (row.language_code as string | null) ?? undefined,
  };
}

export async function updateProfile(
  userId: string,
  values: { displayName: string; bio: string }
): Promise<UserProfile | null> {
  const sql = getDatabase();
  await sql`
    UPDATE profiles SET display_name = ${values.displayName}, bio = ${values.bio}, updated_at = now()
    WHERE user_id = ${userId}
  `;
  return getProfile(userId);
}

export async function createConversation(
  userId: string,
  channel: ConversationChannel,
  title = "New conversation"
): Promise<ConversationSummary> {
  const sql = getDatabase();
  const [row] = await sql`
    INSERT INTO conversations (user_id, channel, title)
    VALUES (${userId}, ${channel}, ${title.slice(0, 120)})
    RETURNING id::text AS id, channel, title, created_at, updated_at
  `;
  return {
    id: row.id as string,
    channel: row.channel as ConversationChannel,
    title: row.title as string,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
  };
}

export async function getOrCreateConversation(
  userId: string,
  channel: ConversationChannel
): Promise<ConversationSummary> {
  const sql = getDatabase();
  const [row] = await sql`
    SELECT id::text AS id, channel, title, created_at, updated_at
    FROM conversations
    WHERE user_id = ${userId} AND channel = ${channel} AND archived_at IS NULL
    ORDER BY updated_at DESC LIMIT 1
  `;
  if (!row) return createConversation(userId, channel);
  return {
    id: row.id as string,
    channel: row.channel as ConversationChannel,
    title: row.title as string,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
  };
}

export async function listConversations(userId: string, limit = 30): Promise<ConversationSummary[]> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT id::text AS id, channel, title, created_at, updated_at
    FROM conversations
    WHERE user_id = ${userId} AND archived_at IS NULL
    ORDER BY updated_at DESC LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: row.id as string,
    channel: row.channel as ConversationChannel,
    title: row.title as string,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
  }));
}

export async function getConversationMessages(
  userId: string,
  conversationId: string,
  limit = 40
): Promise<StoredMessage[]> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT m.id::text AS id, m.role, m.content, m.routing, m.created_at
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.id = ${conversationId} AND c.user_id = ${userId}
    ORDER BY m.created_at DESC LIMIT ${limit}
  `;

  const ordered = [...rows].reverse();
  if (ordered.length === 0) return [];
  const messageIds = ordered.map((row) => row.id as string);
  const citationRows = await sql`
    SELECT message_id::text AS message_id, ordinal, label, source_type, work, locator, url, verified
    FROM message_citations
    WHERE message_id = ANY(${messageIds}::uuid[])
    ORDER BY ordinal
  `;
  const citationsByMessage = new Map<string, CitationRecord[]>();
  for (const citation of citationRows) {
    const messageId = citation.message_id as string;
    const existing = citationsByMessage.get(messageId) ?? [];
    existing.push({
      ordinal: Number(citation.ordinal),
      label: citation.label as string,
      sourceType: citation.source_type as string,
      work: (citation.work as string | null) ?? undefined,
      locator: (citation.locator as string | null) ?? undefined,
      url: (citation.url as string | null) ?? undefined,
      verified: Boolean(citation.verified),
    });
    citationsByMessage.set(messageId, existing);
  }

  return ordered.map((row) => ({
    id: row.id as string,
    role: row.role as "user" | "assistant",
    content: row.content as string,
    routing: (row.routing ?? {}) as Partial<RoutingFlags>,
    citations: citationsByMessage.get(row.id as string) ?? [],
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  }));
}

export async function saveMessage(input: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  routing?: Partial<RoutingFlags>;
  citations?: CitationRecord[];
}): Promise<string | null> {
  if (!databaseConfigured()) return null;
  const sql = getDatabase();
  return sql.begin(async (transaction) => {
    const [row] = await transaction`
      INSERT INTO messages (conversation_id, role, content, model, routing)
      VALUES (${input.conversationId}, ${input.role}, ${input.content},
              ${input.model ?? null}, ${transaction.json(input.routing ?? {})})
      RETURNING id::text AS id
    `;
    const messageId = row.id as string;
    for (const citation of input.citations ?? []) {
      await transaction`
        INSERT INTO message_citations (
          message_id, ordinal, label, source_type, work, locator, url, verified
        ) VALUES (
          ${messageId}, ${citation.ordinal}, ${citation.label}, ${citation.sourceType},
          ${citation.work ?? null}, ${citation.locator ?? null}, ${citation.url ?? null},
          ${citation.verified}
        )
      `;
    }
    await transaction`
      UPDATE conversations
      SET updated_at = now(),
          title = CASE
            WHEN title = 'New conversation' AND ${input.role} = 'user'
              THEN left(${input.content}, 80)
            ELSE title
          END
      WHERE id = ${input.conversationId}
    `;
    return messageId;
  });
}

export async function archiveConversation(userId: string, conversationId: string): Promise<boolean> {
  const sql = getDatabase();
  const rows = await sql`
    UPDATE conversations SET archived_at = now(), updated_at = now()
    WHERE id = ${conversationId} AND user_id = ${userId} AND archived_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export async function latestCitations(userId: string): Promise<CitationRecord[]> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT mc.ordinal, mc.label, mc.source_type, mc.work, mc.locator, mc.url, mc.verified
    FROM message_citations mc
    JOIN messages m ON m.id = mc.message_id
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ${userId} AND m.role = 'assistant'
    ORDER BY m.created_at DESC, mc.ordinal ASC
    LIMIT 20
  `;
  return rows.map((row) => ({
    ordinal: Number(row.ordinal),
    label: row.label as string,
    sourceType: row.source_type as string,
    work: (row.work as string | null) ?? undefined,
    locator: (row.locator as string | null) ?? undefined,
    url: (row.url as string | null) ?? undefined,
    verified: Boolean(row.verified),
  }));
}

export async function reserveTelegramUpdate(updateId: number): Promise<boolean> {
  if (!databaseConfigured()) return true;
  const sql = getDatabase();
  const rows = await sql`
    INSERT INTO processed_telegram_updates (update_id)
    VALUES (${updateId}) ON CONFLICT DO NOTHING RETURNING update_id
  `;
  return rows.length > 0;
}

export async function recordEvent(
  eventName: string,
  userId: string | null,
  properties: Record<string, unknown> = {}
): Promise<void> {
  if (!databaseConfigured()) return;
  const sql = getDatabase();
  await sql`
    INSERT INTO analytics_events (user_id, event_name, properties)
    VALUES (${userId}, ${eventName}, ${sql.json(properties)})
  `;
}

export function rateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function consumeRateLimit(
  key: string,
  limit = 20,
  windowSeconds = 60
): Promise<{ allowed: boolean; remaining: number }> {
  if (!databaseConfigured()) {
    const now = Date.now();
    const current = localRateLimits.get(key);
    if (!current || current.resetAt <= now) {
      localRateLimits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { allowed: true, remaining: limit - 1 };
    }
    current.count += 1;
    return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count) };
  }

  const sql = getDatabase();
  const [row] = await sql`
    INSERT INTO api_rate_limits (rate_key, window_started_at, request_count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (rate_key) DO UPDATE SET
      window_started_at = CASE
        WHEN api_rate_limits.window_started_at < now() - make_interval(secs => ${windowSeconds})
          THEN now()
        ELSE api_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN api_rate_limits.window_started_at < now() - make_interval(secs => ${windowSeconds})
          THEN 1
        ELSE api_rate_limits.request_count + 1
      END
    RETURNING request_count
  `;
  const count = Number(row.request_count);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}
