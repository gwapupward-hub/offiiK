import assert from "node:assert/strict";
import { test } from "node:test";
const endpoint = process.env.ISNAD_MCP_TEST_ENDPOINT;
if (!endpoint || !endpoint.startsWith("http://127.0.0.1:")) throw Error("Loopback CI endpoint required");
const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const post = (data = body, extra = {}) => fetch(endpoint, { method: "POST", headers: { ...headers, ...extra }, body: data, redirect: "manual" });

test("built HTTP ingress rejects foreign Origin, forged Host, invalid content type and oversize payloads", async () => {
  const foreign = await post(body, { origin: "https://attacker.example" });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get("cache-control"), "no-store");
  const wrongHost = await post(body, { host: "attacker.example" });
  assert.equal(wrongHost.status, 403);
  const invalidType = await post(body, { "content-type": "text/plain" });
  assert.equal(invalidType.status, 415);
  const oversized = await post("x".repeat(8193));
  assert.equal(oversized.status, 413);
  for (const response of [foreign, wrongHost, invalidType, oversized]) {
    assert.equal(await response.text(), "");
  }
});
test("connection portal communicates disabled release without exposing credentials", async () => {
  const response = await fetch(new URL("/connect", endpoint));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Public access is not available yet/);
  assert.match(html, /noindex/);
  assert.match(html, /mcp\.isnadsunnah\.site\/mcp/);
  assert.doesNotMatch(html, /ISNAD_MCP_REDIS_TOKEN|ISNAD_MCP_REDIS_URL/);
});
