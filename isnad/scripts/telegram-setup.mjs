#!/usr/bin/env node
/** Idempotent production setup for @the_isnad_bot. */
import { SITE_URL } from "../site.config.mjs";

const args = process.argv.slice(2);
const vercelBuild = args.includes("--vercel-build");
const dropPendingUpdates = args.includes("--drop-pending");
const resetCommunityScopes = args.includes("--reset-community-commands");
// Community onboarding registers extra update types and scoped commands. It is
// opt-in so that deploying this code does not change the production bot.
const communityEnabled = process.env.ISNAD_COMMUNITY_ENABLED === "true";
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
  positionalBaseUrl || process.env.PUBLIC_BASE_URL || SITE_URL
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
  ...(communityEnabled
    ? [{ command: "community", description: "Manage groups and channels you administer" }]
    : []),
];

// Scoped command menus so group members never see private-only commands.
const groupCommands = [{ command: "help", description: "How Isnad works in this community" }];
const groupAdminCommands = [
  { command: "setup", description: "Connect this community to Isnad" },
  { command: "community", description: "Open the Community Manager" },
  { command: "pause", description: "Pause all Isnad activity here" },
  { command: "resume", description: "Resume after a permission check" },
  { command: "help", description: "How Isnad works in this community" },
];

const allowedUpdates = communityEnabled
  ? ["message", "edited_message", "my_chat_member", "chat_member"]
  : ["message", "edited_message"];

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

  if (communityEnabled) {
    await callApi("setMyCommands", { commands: groupCommands, scope: { type: "all_group_chats" } });
    await callApi("setMyCommands", {
      commands: groupAdminCommands,
      scope: { type: "all_chat_administrators" },
    });
    console.log("✓ Registered scoped group and administrator commands.");
  } else if (resetCommunityScopes) {
    await callApi("deleteMyCommands", { scope: { type: "all_group_chats" } });
    await callApi("deleteMyCommands", { scope: { type: "all_chat_administrators" } });
    console.log("✓ Removed scoped community commands.");
  }

  await callApi("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: allowedUpdates,
    drop_pending_updates: dropPendingUpdates,
  });

  const webhookInfo = await callApi("getWebhookInfo");
  if (webhookInfo?.url !== webhookUrl) {
    fail(`Telegram webhook verification failed. Expected ${webhookUrl}.`);
  }
  console.log(`✓ Webhook registered and verified at ${webhookUrl}`);
  console.log(`  Allowed updates: ${allowedUpdates.join(", ")}`);
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
