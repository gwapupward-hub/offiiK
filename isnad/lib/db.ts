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
      Array<{
        schema_migrations: boolean;
        users: boolean;
        telegram_identities: boolean;
        profiles: boolean;
        user_settings: boolean;
        conversations: boolean;
        messages: boolean;
        message_citations: boolean;
        memory_summaries: boolean;
        analytics_events: boolean;
        processed_telegram_updates: boolean;
        api_rate_limits: boolean;
        knowledge_documents: boolean;
        knowledge_chunks: boolean;
      }>
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
        to_regclass('public.knowledge_chunks') IS NOT NULL AS knowledge_chunks
    `;

    const missingTables = REQUIRED_TABLES.filter((table) => !tables?.[table]);
    let appliedMigrations: string[] = [];

    if (tables?.schema_migrations) {
      const migrations = await sql<Array<{ filename: string }>>`
        SELECT filename FROM schema_migrations ORDER BY filename
      `;
      appliedMigrations = migrations.map((migration) => migration.filename);
    }

    return {
      configured: true,
      reachable: true,
      schemaReady:
        missingTables.length === 0 &&
        appliedMigrations.includes("001_phase_1_foundation.sql"),
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
