import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { ingestTelegramWebhook, secretMatches } from "@/lib/community/webhookIngress";

delete process.env.DATABASE_URL;

function request(body: unknown, secret?: string) {
  return new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) },
    body: JSON.stringify(body),
  });
}

const update = { update_id: 10, message: { message_id: 1, chat: { id: 1, type: "private" }, text: "hi" } };

beforeEach(() => {
  delete process.env.DATABASE_URL;
});

test("constant-time secret comparison", () => {
  assert.equal(secretMatches("abc", "abc"), true);
  assert.equal(secretMatches("abd", "abc"), false);
  assert.equal(secretMatches("abcd", "abc"), false);
  assert.equal(secretMatches(null, "abc"), false);
});

test("fails closed in production when TELEGRAM_WEBHOOK_SECRET is missing", async () => {
  const result = await ingestTelegramWebhook(request(update), { TELEGRAM_BOT_TOKEN: "1:x", NODE_ENV: "production" });
  assert.equal(result.response.status, 503);
  assert.equal(result.followUp, undefined);
});

test("rejects a wrong or missing secret", async () => {
  const env = { TELEGRAM_BOT_TOKEN: "1:x", TELEGRAM_WEBHOOK_SECRET: "s3cret", NODE_ENV: "production" };
  assert.equal((await ingestTelegramWebhook(request(update, "wrong"), env)).response.status, 401);
  assert.equal((await ingestTelegramWebhook(request(update), env)).response.status, 401);
});

test("accepts an authenticated update and defers processing", async () => {
  const env = { TELEGRAM_BOT_TOKEN: "1:x", TELEGRAM_WEBHOOK_SECRET: "s3cret", NODE_ENV: "production" };
  const result = await ingestTelegramWebhook(request(update, "s3cret"), env);
  assert.equal(result.response.status, 200);
  assert.equal(typeof result.followUp, "function", "work happens after the acknowledgement");
});

test("ignores malformed bodies without processing", async () => {
  const env = { TELEGRAM_BOT_TOKEN: "1:x", TELEGRAM_WEBHOOK_SECRET: "s3cret" };
  const result = await ingestTelegramWebhook(request({ update_id: "x" }, "s3cret"), env);
  assert.equal(result.response.status, 200);
  assert.equal(result.followUp, undefined);
});
