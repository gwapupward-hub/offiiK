#!/usr/bin/env node
/** Idempotent production setup for @the_isnad_bot. */

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const configuredMiniAppUrl = process.env.TELEGRAM_MINI_APP_URL;
const baseUrl = (process.argv[2] || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");

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

async function callApi(method, body) {
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
  const miniAppUrl = (configuredMiniAppUrl || `${baseUrl}/telegram`).replace(/\/+$/, "");

  if (!/^https:\/\//.test(miniAppUrl)) fail("TELEGRAM_MINI_APP_URL must use HTTPS.");

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
  console.log(`✓ Menu button opens ${miniAppUrl}`);

  const me = await callApi("getMe", {});
  console.log(`Done. @${me.username} is ready.`);
}

main().catch((error) => fail(error.message || String(error)));
