import { spawnSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";

/**
 * Integration tests run against a disposable PostgreSQL database named by
 * TEST_DATABASE_URL (pgvector + pgcrypto required). The public schema is
 * dropped and rebuilt from db/migrations, so never point this at real data.
 */
export function testDatabaseUrl(): string | null {
  return process.env.TEST_DATABASE_URL ?? null;
}

export async function resetDatabase(url: string): Promise<{ migrationOutput: string }> {
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error("Refusing to reset a database whose name does not contain 'test'.");
  }
  const admin = postgres(url, { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
  await admin.unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await admin.end();
  return { migrationOutput: runMigrations(url) };
}

export function runMigrations(url: string): string {
  const result = spawnSync(process.execPath, [path.join("scripts", "migrate.mjs")], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url, DATABASE_SSL: "disable" },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`Migrations failed: ${result.stderr}`);
  return result.stdout;
}

/** Points lib/db at the test database. Must run before the first getDatabase() call. */
export function useTestDatabase(url: string) {
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = "disable";
}
