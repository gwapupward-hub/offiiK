import assert from "node:assert/strict";
import { after, test } from "node:test";
import postgres from "postgres";
import { resetDatabase, runMigrations, testDatabaseUrl, useTestDatabase } from "../helpers/database";

const url = testDatabaseUrl();

test("migrations", { skip: !url && "TEST_DATABASE_URL is not set" }, async (t) => {
  const { migrationOutput } = await resetDatabase(url!);
  useTestDatabase(url!);
  const sql = postgres(url!, { max: 1, ssl: false, prepare: false, onnotice: () => undefined });
  after(async () => sql.end());

  await t.test("apply cleanly from an empty database, in order", () => {
    const applied = migrationOutput.match(/Applied \S+/g) ?? [];
    assert.deepEqual(applied.map((line) => line.replace("Applied ", "")), [
      "001_phase_1_foundation.sql",
      "002_saved_conversations.sql",
      "003_bookmarks_notes.sql",
      "004_guided_learning.sql",
      "005_daily_knowledge.sql",
      "006_community_foundation.sql",
      "007_content_verification.sql",
      "008_source_review_scope.sql",
    ]);
  });

  await t.test("re-running is a no-op", () => {
    const output = runMigrations(url!);
    assert.equal(/Applied/.test(output), false);
    assert.equal((output.match(/Skipping/g) ?? []).length, 8);
  });

  await t.test("006 is additive and its SQL is idempotent on its own", async () => {
    const { readFile } = await import("node:fs/promises");
    const contents = await readFile("db/migrations/006_community_foundation.sql", "utf8");
    const statements = contents.replace(/--.*$/gm, "").split(";").map((statement) => statement.trim());
    const destructive = statements.filter((statement) => /^(DROP|ALTER|TRUNCATE|DELETE|UPDATE)\b/i.test(statement));
    assert.deepEqual(destructive, []);
    await sql.unsafe(contents);
  });

  await t.test("007 verification schema is additive and idempotent", async () => {
    const { readFile } = await import("node:fs/promises");
    const contents = await readFile("db/migrations/007_content_verification.sql", "utf8");
    const statements = contents.replace(/--.*$/gm, "").split(";").map((part) => part.trim());
    const destructive = statements.filter((part) => /^(DROP|ALTER|TRUNCATE|DELETE|UPDATE)\b/i.test(part));
    assert.deepEqual(destructive, []);
    await sql.unsafe(contents);
  });

  await t.test("health check reports the schema as ready", async () => {
    const { checkDatabase, getDatabase } = await import("@/lib/db");
    const health = await checkDatabase();
    await getDatabase().end();
    assert.equal(health.schemaReady, true, JSON.stringify(health.missingTables));
  });

  await t.test("key constraints exist", async () => {
    // Unique Telegram update id; one active owner per community.
    await sql`INSERT INTO telegram_inbox (update_id, update_kind) VALUES (1, 'message')`;
    await assert.rejects(sql`INSERT INTO telegram_inbox (update_id, update_kind) VALUES (1, 'message')`);
    const [community] = await sql`
      INSERT INTO communities (telegram_chat_id, chat_type) VALUES (-1, 'group') RETURNING id
    `;
    await sql`INSERT INTO community_memberships (community_id, telegram_user_id, role) VALUES (${community.id}, 1, 'owner')`;
    await assert.rejects(
      sql`INSERT INTO community_memberships (community_id, telegram_user_id, role) VALUES (${community.id}, 2, 'owner')`
    );
    await assert.rejects(sql`INSERT INTO communities (telegram_chat_id, chat_type) VALUES (-2, 'private')`);
  });
});
