#!/usr/bin/env node
/** Idempotent production setup for @the_isnad_bot. */

const args = process.argv.slice(2);
const vercelBuild = args.includes("--vercel-build");
const dropPendingUpdates = args.includes("--drop-pending");
const positionalBaseUrl = args.find((arg) => !arg.startsWith("--"));

if (vercelBuild && process.env.VERCEL_ENV !== "production") {
  console.log(`Skipping Telegram setup for Vercel environment: ${process.env.VERCEL_ENV || "unknown"}.`);
  process.exit(0);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const configuredMiniAppUrl = process.env.TELEGRAM_MINI_APP_URL;

function normalizeHttpsUrl(value) {
  if (!value) return "";
  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return normalized.replace(/\/+$/, "");
}

const baseUrl = normalizeHttpsUrl(
  positionalBaseUrl || process.env.PUBLIC_BASE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL
);

const commands = [
  { command: "start", description: "Introduce Isnad and open the Mini App" },
  { command: "help", description: "Show commands and usage" },
  { command: "about", description: "Explain Isnad's sources and method" },
  { command: "ask", description: "Ask an Islamic knowledge question" },
  { command: "new", description: "Start a new conversation" },
  { command: "history", description: "Show recent conversations" },
  { command: "sources", description: "Show sources from the last answer" },
  { command: "settings", description: "View answer and memory settings" },
];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!token) fail("TELEGRAM_BOT_TOKEN is not set.");
if (!baseUrl) fail("Pass the public base URL or set PUBLIC_BASE_URL.");
if (!/^https:\/\//.test(baseUrl)) fail("The public base URL must use HTTPS.");
if (!secret) fail("TELEGRAM_WEBHOOK_SECRET is not set.");
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  fail("TELEGRAM_WEBHOOK_SECRET contains unsupported characters.");
}

async function callApi(method, body = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    fail(`${method} failed: ${data.description || response.statusText}`);
  }
  return data.result;
}

async function main() {
  const webhookUrl = `${baseUrl}/api/telegram/webhook`;
  const miniAppUrl = normalizeHttpsUrl(configuredMiniAppUrl || `${baseUrl}/telegram`);

  if (!/^https:\/\//.test(miniAppUrl)) fail("TELEGRAM_MINI_APP_URL must use HTTPS.");

  await callApi("setMyCommands", { commands });
  const registeredCommands = await callApi("getMyCommands");
  if (!Array.isArray(registeredCommands) || registeredCommands.length !== commands.length) {
    fail("Telegram did not retain the expected command list.");
  }
  console.log(`✓ Registered and verified ${registeredCommands.length} commands.`);

  await callApi("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: dropPendingUpdates,
  });

  const webhookInfo = await callApi("getWebhookInfo");
  if (webhookInfo?.url !== webhookUrl) {
    fail(`Telegram webhook verification failed. Expected ${webhookUrl}.`);
  }
  console.log(`✓ Webhook registered and verified at ${webhookUrl}`);
  console.log(`  Pending updates: ${Number(webhookInfo.pending_update_count || 0)}`);
  if (webhookInfo.last_error_message) {
    console.warn(`  Previous delivery error: ${webhookInfo.last_error_message}`);
  }

  await callApi("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Open Isnad",
      web_app: { url: miniAppUrl },
    },
  });
  console.log(`✓ Menu button opens ${miniAppUrl}`);

  const me = await callApi("getMe");
  console.log(`Done. @${me.username} is connected to ${baseUrl}.`);
}

main().catch((error) => fail(error.message || String(error)));
