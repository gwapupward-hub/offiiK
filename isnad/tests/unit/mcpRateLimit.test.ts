import assert from "node:assert/strict";
import { test } from "node:test";
import { createRateLimiter } from "../../lib/mcp/rateLimit";

test("local mode only admits loopback and resets fixed window", async () => {
  let time = 1000;
  const admit = createRateLimiter({ env: { ISNAD_MCP_LIMIT_MODE: "local" }, now: () => time });
  assert.equal(await admit("mcp.isnadsunnah.site"), "unavailable");
  for (let i = 0; i < 600; i++) assert.equal(await admit("127.0.0.1:3478"), "allow");
  assert.equal(await admit("127.0.0.1:3478"), "limited");
  time += 60000;
  assert.equal(await admit("127.0.0.1:3478"), "allow");
});
test("Redis limiter uses one atomic anonymous global budget and fails closed", async () => {
  const env = { ISNAD_MCP_LIMIT_MODE: "redis", ISNAD_MCP_REDIS_URL: "https://example.upstash.io", ISNAD_MCP_REDIS_TOKEN: "test-only", ISNAD_MCP_LIMIT_NAMESPACE: "test" };
  let result: unknown = 300;
  let requests = 0;
  const fetcher: typeof fetch = async (url, init) => {
    requests++;
    assert.equal(String(url), "https://example.upstash.io/");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-only");
    const args = JSON.parse(String(init?.body));
    assert.equal(args[0], "EVAL");
    assert.match(args[1], /INCR.*EXPIRE/);
    assert.deepEqual(args.slice(2), ["1", "isnad:mcp:test:global", "60"]);
    return Response.json({ result });
  };
  const admit = createRateLimiter({ env, fetcher });
  assert.equal(await admit("mcp.isnadsunnah.site"), "allow");
  result = 301;
  assert.equal(await admit("mcp.isnadsunnah.site"), "limited");
  result = "unexpected";
  assert.equal(await admit("mcp.isnadsunnah.site"), "unavailable");
  env.ISNAD_MCP_REDIS_URL = "https://example.upstash.io.attacker.example";
  assert.equal(await admit("mcp.isnadsunnah.site"), "unavailable");
  assert.equal(requests, 3);
  assert.equal(await createRateLimiter({ env: {} })("mcp.isnadsunnah.site"), "unavailable");
  env.ISNAD_MCP_REDIS_URL = "https://example.upstash.io";
  assert.equal(await createRateLimiter({ env, fetcher: async () => { throw Error("provider down"); } })("mcp.isnadsunnah.site"), "unavailable");
});
