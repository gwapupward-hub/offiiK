import postgres from "postgres";

type DatabaseClient = ReturnType<typeof postgres>;

let databaseClient: DatabaseClient | undefined;

const REQUIRED_TABLES = [
  "schema_migrations",
  "users",
  "telegram_identities",
  "profiles",
  "user_settings",
  "conversations",
  "messages",
  "message_citations",
  "memory_summaries",
  "analytics_events",
  "processed_telegram_updates",
  "api_rate_limits",
  "knowledge_documents",
  "knowledge_chunks",
  "bookmark_collections",
  "bookmarks",
  "study_notes",
  "learning_courses",
  "learning_modules",
  "learning_lessons",
  "course_enrollments",
  "lesson_progress",
  "daily_quran_items",
  "daily_hadith_items",
  "daily_vocabulary_items",
  "daily_checkins",
] as const;

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabase(): DatabaseClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!databaseClient) {
    databaseClient = postgres(databaseUrl, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    });
  }

  return databaseClient;
}

export type DatabaseHealth = {
  configured: boolean;
  reachable: boolean;
  schemaReady: boolean;
  appliedMigrations: string[];
  missingTables: string[];
  error?: string;
};

export async function checkDatabase(): Promise<DatabaseHealth> {
  if (!databaseConfigured()) {
    return {
      configured: false,
      reachable: false,
      schemaReady: false,
      appliedMigrations: [],
      missingTables: [...REQUIRED_TABLES],
    };
  }

  try {
    const sql = getDatabase();
    await sql`SELECT 1`;

    const [tables] = await sql<
      Array<Record<(typeof REQUIRED_TABLES)[number], boolean>>
    >`
      SELECT
        to_regclass('public.schema_migrations') IS NOT NULL AS schema_migrations,
        to_regclass('public.users') IS NOT NULL AS users,
        to_regclass('public.telegram_identities') IS NOT NULL AS telegram_identities,
        to_regclass('public.profiles') IS NOT NULL AS profiles,
        to_regclass('public.user_settings') IS NOT NULL AS user_settings,
        to_regclass('public.conversations') IS NOT NULL AS conversations,
        to_regclass('public.messages') IS NOT NULL AS messages,
        to_regclass('public.message_citations') IS NOT NULL AS message_citations,
        to_regclass('public.memory_summaries') IS NOT NULL AS memory_summaries,
        to_regclass('public.analytics_events') IS NOT NULL AS analytics_events,
        to_regclass('public.processed_telegram_updates') IS NOT NULL AS processed_telegram_updates,
        to_regclass('public.api_rate_limits') IS NOT NULL AS api_rate_limits,
        to_regclass('public.knowledge_documents') IS NOT NULL AS knowledge_documents,
        to_regclass('public.knowledge_chunks') IS NOT NULL AS knowledge_chunks,
        to_regclass('public.bookmark_collections') IS NOT NULL AS bookmark_collections,
        to_regclass('public.bookmarks') IS NOT NULL AS bookmarks,
        to_regclass('public.study_notes') IS NOT NULL AS study_notes,
        to_regclass('public.learning_courses') IS NOT NULL AS learning_courses,
        to_regclass('public.learning_modules') IS NOT NULL AS learning_modules,
        to_regclass('public.learning_lessons') IS NOT NULL AS learning_lessons,
        to_regclass('public.course_enrollments') IS NOT NULL AS course_enrollments,
        to_regclass('public.lesson_progress') IS NOT NULL AS lesson_progress,
        to_regclass('public.daily_quran_items') IS NOT NULL AS daily_quran_items,
        to_regclass('public.daily_hadith_items') IS NOT NULL AS daily_hadith_items,
        to_regclass('public.daily_vocabulary_items') IS NOT NULL AS daily_vocabulary_items,
        to_regclass('public.daily_checkins') IS NOT NULL AS daily_checkins
    `;

    const missingTables = REQUIRED_TABLES.filter((table) => !tables?.[table]);
    let appliedMigrations: string[] = [];

    if (tables?.schema_migrations) {
      const migrations = await sql<Array<{ filename: string }>>`
        SELECT filename FROM schema_migrations ORDER BY filename
      `;
      appliedMigrations = migrations.map((migration) => migration.filename);
    }

    const requiredMigrations = [
      "001_phase_1_foundation.sql",
      "002_saved_conversations.sql",
      "003_bookmarks_notes.sql",
      "004_guided_learning.sql",
      "005_daily_knowledge.sql",
    ];

    return {
      configured: true,
      reachable: true,
      schemaReady:
        missingTables.length === 0 &&
        requiredMigrations.every((migration) => appliedMigrations.includes(migration)),
      appliedMigrations,
      missingTables,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      schemaReady: false,
      appliedMigrations: [],
      missingTables: [...REQUIRED_TABLES],
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}
