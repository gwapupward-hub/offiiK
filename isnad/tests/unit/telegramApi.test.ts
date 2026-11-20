import assert from "node:assert/strict";
import { test } from "node:test";
import { botIdFromToken, createTelegramClient, TelegramApiError } from "@/lib/community/telegramApi";

const TOKEN = "123456:SECRET-TOKEN-VALUE";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("derives the bot id from the token", () => {
  assert.equal(botIdFromToken(TOKEN), 123456);
  assert.equal(botIdFromToken("garbage"), 0);
});

test("429 is retryable and carries retry_after", async () => {
  const client = createTelegramClient(TOKEN, {
    fetchImpl: async () => jsonResponse(429, { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 7 } }),
  });
  const error = await client.sendMessage({ chat_id: 1, text: "x" }).catch((caught) => caught);
  assert.ok(error instanceof TelegramApiError);
  assert.equal(error.retryable, true);
  assert.equal(error.retryAfterSeconds, 7);
  assert.equal(error.outcomeUnknown, false);
  assert.equal(error.code, "telegram_429");
});

test("400/403 are not retryable", async () => {
  const client = createTelegramClient(TOKEN, {
    fetchImpl: async () => jsonResponse(403, { ok: false, error_code: 403, description: "Forbidden: bot was kicked" }),
  });
  const error = await client.getChatMember(-1, 2).catch((caught) => caught);
  assert.equal(error.retryable, false);
  assert.equal(error.errorCode, 403);
});

test("timeouts are retryable but flagged as unknown outcome, and never leak the token", async () => {
  const client = createTelegramClient(TOKEN, {
    timeoutMs: 5,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        // AbortSignal.timeout() uses an unref'd timer; keep the loop alive until it fires.
        const keepAlive = setTimeout(() => undefined, 1_000);
        init.signal?.addEventListener("abort", () => {
          clearTimeout(keepAlive);
          reject(init.signal?.reason);
        });
      }),
  });
  const error = await client.sendMessage({ chat_id: 1, text: "x" }).catch((caught) => caught);
  assert.equal(error.kind, "timeout");
  assert.equal(error.outcomeUnknown, true);
  assert.equal(String(error.message).includes("SECRET"), false);
});

test("getMe is cached after success and retried after failure", async () => {
  let calls = 0;
  const client = createTelegramClient(TOKEN, {
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse(500, { ok: false, error_code: 500 })
        : jsonResponse(200, { ok: true, result: { id: 123456, is_bot: true, username: "isnad_bot" } });
    },
  });
  await assert.rejects(client.getMe());
  assert.equal((await client.getMe()).username, "isnad_bot");
  await client.getMe();
  assert.equal(calls, 2);
});
