#!/usr/bin/env node
/**
 * Read-only staging preflight. It never registers a webhook, executes a
 * migration, drains an inbox, or prints connection strings or bot tokens.
 */
import process from "node:process";
import { pathToFileURL } from "node:url";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { SITE_URL } from "../site.config.mjs";

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw Error("Missing staging configuration: " + key);
  return value;
}
function httpsOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw Error("Invalid staging origin."); }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash || url.port) {
    throw Error("Staging origin must be an HTTPS origin without credentials or a path.");
  }
  return url.origin;
}

export function validateStagingConfig(env) {
  if (env.ISNAD_RELEASE_TARGET !== "staging" || env.VERCEL_ENV === "production") {
    throw Error("Refusing execution outside the explicit staging release target.");
  }
  const username = required(env, "ISNAD_STAGING_BOT_USERNAME").replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{5,32}$/.test(username) || !username.endsWith("bot") || username === "the_isnad_bot") {
    throw Error("A distinct staging bot username is required.");
  }
  const token = required(env, "TELEGRAM_BOT_TOKEN");
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw Error("Invalid staging token format.");
  if (required(env, "TELEGRAM_BOT_USERNAME").replace(/^@/, "").toLowerCase() !== username) {
    throw Error("Configured bot username does not match the expected staging identity.");
  }
  const origin = httpsOrigin(required(env, "ISNAD_STAGING_ORIGIN"));
  const productionOrigin = new URL(SITE_URL).hostname;
  const domain = new URL(origin).hostname;
  if (domain === productionOrigin || domain === productionOrigin.replace(/^www\./, "")) {
    throw Error("Production site is not a staging origin.");
  }
  if (httpsOrigin(required(env, "PUBLIC_BASE_URL")) !== origin ||
      required(env, "TELEGRAM_MINI_APP_URL") !== origin + "/telegram") {
    throw Error("Public base and Mini App URLs must target the exact staging origin.");
  }
  const dbUrl = required(env, "DATABASE_URL");
  let db;
  try { db = new URL(dbUrl); } catch { throw Error("Invalid staging database URL."); }
  if (!["postgres:", "postgresql:"].includes(db.protocol) ||
      db.hostname !== required(env, "ISNAD_STAGING_DATABASE_HOST") ||
      db.pathname !== "/isnad_staging" ||
      decodeURIComponent(db.username) !== "isnad_staging_owner") {
    throw Error("Database must match the isolated staging host, database and role.");
  }
  if (env.DATABASE_SSL === "disable") throw Error("Staging PostgreSQL requires TLS.");
  const webhookSecret = required(env, "TELEGRAM_WEBHOOK_SECRET");
  const cronSecret = required(env, "CRON_SECRET");
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret) || cronSecret.length < 32 ||
      webhookSecret === cronSecret) throw Error("Separate high-entropy webhook and cron secrets required.");
  required(env, "OPENAI_API_KEY");
  return { username, token, origin, dbUrl, expectedHost: db.hostname };
}

async function getTelegram(config, method) {
  let response;
  try {
    response = await fetch("https://api.telegram.org/bot" + config.token + "/" + method,
      { redirect: "error", signal: AbortSignal.timeout(10000) });
  } catch { throw Error("Telegram identity/webhook read failed."); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw Error("Telegram " + method + " rejected the read.");
  return data.result;
}

async function inspectDatabase(config) {
  const sql = postgres(config.dbUrl, { max:1, prepare:false, ssl:"require", connect_timeout:10 });
  try {
    return await sql.begin("read only", async tx => {
      const [identity] = await tx.unsafe("SELECT current_database() AS db, current_user AS role, to_regclass('public.schema_migrations') IS NOT NULL AS migrated");
      if (identity.db !== "isnad_staging" || identity.role !== "isnad_staging_owner") throw Error("Connected database identity mismatch.");
      if (!identity.migrated) return { schemaReady:false, missingMigrations:"all" };
      const expected = (await readdir(fileURLToPath(new URL("../db/migrations/", import.meta.url)))).filter(n=>n.endsWith(".sql")).sort();
      const rows = await tx.unsafe("SELECT filename FROM schema_migrations ORDER BY filename");
      const applied = new Set(rows.map(row=>row.filename));
      const missing = expected.filter(name=>!applied.has(name));
      return { schemaReady:missing.length===0, missingMigrations:missing };
    });
  } finally { await sql.end(); }
}

export async function runPreflight(env = process.env) {
  const config = validateStagingConfig(env);
  const bot = await getTelegram(config, "getMe");
  if (!bot?.is_bot || bot.username?.toLowerCase() !== config.username ||
      String(bot.id) !== config.token.split(":")[0]) {
    throw Error("Bot identity mismatch; no setup operation is permitted.");
  }
  const webhook = await getTelegram(config, "getWebhookInfo");
  const expected = config.origin + "/api/telegram/webhook";
  if (webhook.url && webhook.url !== expected) {
    throw Error("Staging bot already points to a different webhook; review it manually.");
  }
  const database = await inspectDatabase(config);
  // This URL is an explicit staging origin; never send credentials to it.
  let health = null;
  let webhookAuth = false;
  try {
    const response = await fetch(config.origin + "/api/health", {
      redirect:"error", signal:AbortSignal.timeout(10000)
    });
    if (response.ok) health = await response.json();
    const probe = await fetch(expected, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:"{}", redirect:"error", signal:AbortSignal.timeout(10000)
    });
    webhookAuth = probe.status === 401;
  } catch { /* endpoint not yet ready */ }
  const report = {
    target:"staging",
    botIdentityVerified:true,
    webhookState:webhook.url === expected ? "configured" : "not_configured",
    databaseIdentityVerified:true,
    databaseSchemaReady:database.schemaReady,
    missingMigrations:database.missingMigrations,
    deployedHealthReady:health?.ready === true,
    webhookRejectsMissingSecret:webhookAuth,
    communityEnabled:health?.services?.community?.enabled === true,
    // Staging preflight does not certify real Telegram delivery or scholarly QA.
    readyForLiveTests:database.schemaReady && health?.ready === true &&
      webhookAuth && webhook.url === expected && health?.services?.community?.enabled === true,
  };
  console.log(JSON.stringify(report,null,2));
  return report;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runPreflight().then(report=>{if(!report.readyForLiveTests)process.exitCode=1;})
    .catch(()=>{console.error("Staging preflight failed. Check target identity, required environment variables, database access and Telegram permissions. No secrets were printed.");process.exitCode=1;});
}
