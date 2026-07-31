import postgres from "postgres";

type DatabaseClient = ReturnType<typeof postgres>;

let databaseClient: DatabaseClient | undefined;

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

export async function checkDatabase(): Promise<{
  configured: boolean;
  reachable: boolean;
  error?: string;
}> {
  if (!databaseConfigured()) {
    return { configured: false, reachable: false };
  }

  try {
    const sql = getDatabase();
    await sql`SELECT 1`;
    return { configured: true, reachable: true };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}
