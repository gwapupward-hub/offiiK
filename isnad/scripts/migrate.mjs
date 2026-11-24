import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";
import { validateStagingConfig } from "./staging-preflight.mjs";

// Builds are side-effect free. Migrations are an explicit operator step.
if (process.argv.includes("--vercel-build")) {
  console.log("Skipping database migrations during build. Run the approved migration step separately.");
  process.exit(0);
}
const staging = process.env.ISNAD_RELEASE_TARGET === "staging";
if (staging) {
  try { validateStagingConfig(process.env); }
  catch { console.error("Invalid staging migration target; no migrations executed."); process.exit(1); }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const migrationsDir = path.join(process.cwd(), "db", "migrations");
const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
});

let advisoryLockHeld = false;

try {
  if (staging) {
    const [identity] = await sql`SELECT current_database() AS db, current_user AS role`;
    if (identity.db !== 'isnad_staging' || identity.role !== 'isnad_staging_owner') {
      throw Error('Connected database identity mismatch; no migrations executed.');
    }
  }
  await sql`SELECT pg_advisory_lock(hashtext('isnad_schema_migrations'))`;
  advisoryLockHeld = true;

  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const filename of files) {
    const [existing] = await sql`
      SELECT filename FROM schema_migrations WHERE filename = ${filename}
    `;
    if (existing) {
      console.log(`Skipping ${filename}`);
      continue;
    }

    const contents = await readFile(path.join(migrationsDir, filename), "utf8");
    await sql.begin(async (transaction) => {
      await transaction.unsafe(contents);
      await transaction`
        INSERT INTO schema_migrations (filename) VALUES (${filename})
      `;
    });
    console.log(`Applied ${filename}`);
  }
} finally {
  if (advisoryLockHeld) {
    await sql`SELECT pg_advisory_unlock(hashtext('isnad_schema_migrations'))`.catch(() => undefined);
  }
  await sql.end();
}
