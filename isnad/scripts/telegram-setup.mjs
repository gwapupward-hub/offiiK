#!/usr/bin/env node
/**
 * One-time (idempotent) setup for the Isnad Telegram bot (@the_isnad_bot).
 *
 * Registers with Telegram, using the Bot API:
 *   1. setMyCommands       — the slash-command menu shown in the chat.
 *   2. setWebhook          — points @the_isnad_bot at /api/telegram/webhook,
 *                            with a secret_token Telegram echoes back on each
 *                            update so our route can verify it's really Telegram.
 *   3. setChatMenuButton   — the bot's menu button opens the /telegram Mini App.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
 *     node scripts/telegram-setup.mjs https://your-domain.example
 *
 * The base URL may also be passed as PUBLIC_BASE_URL instead of an argument.
 * Requires Node 18+ (uses the global fetch). Run it again any time you change
 * commands, the domain, or the secret.
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const baseUrl = (process.argv[2] || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");

// Keep this list in sync with BOT_COMMANDS in lib/telegramBot.ts.
const commands = [
  { command: "start", description: "Introduce Isnad and how to ask" },
  { command: "help", description: "How to use the bot" },
  { command: "about", description: "What Isnad is and where answers come from" },
  { command: "ask", description: "Ask a question, e.g. /ask Is crypto halal?" },
];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!token) fail("TELEGRAM_BOT_TOKEN is not set.");
if (!baseUrl) fail("Pass your public base URL as an argument or via PUBLIC_BASE_URL.");
if (!/^https:\/\//.test(baseUrl)) fail("Base URL must be https:// — Telegram requires it.");
if (!secret) {
  fail(
    "TELEGRAM_WEBHOOK_SECRET is not set. Choose any hard-to-guess string (e.g.\n" +
      "  `openssl rand -hex 32`) and set the SAME value here and in your app's\n" +
      "  environment, so the webhook route can verify incoming updates."
  );
}

async function callApi(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    fail(`${method} failed: ${data.description || res.status} ${res.statusText}`);
  }
  return data.result;
}

async function main() {
  const webhookUrl = `${baseUrl}/api/telegram/webhook`;
  const miniAppUrl = `${baseUrl}/telegram`;

  await callApi("setMyCommands", { commands });
  console.log(`✓ Registered ${commands.length} commands.`);

  await callApi("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: true,
  });
  console.log(`✓ Webhook set to ${webhookUrl}`);

  await callApi("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Open Isnad",
      web_app: { url: miniAppUrl },
    },
  });
  console.log(`✓ Menu button opens the Mini App at ${miniAppUrl}`);

  const me = await callApi("getMe", {});
  console.log(`\nDone. @${me.username} is ready — send it /start in Telegram.`);
}

main().catch((err) => fail(err.message || String(err)));
