import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { createRateLimiter } from "../../isnad/lib/mcp/rateLimit.ts";
import { createConcurrencyLimiter } from "../../isnad/lib/mcp/concurrency.ts";

const exec = promisify(execFile);
const container = process.env.ISNAD_TEST_REDIS_CONTAINER;
async function redis(...args) {
  if (!container || !/^[a-f0-9]{12,64}$/.test(container)) throw Error("Disposable CI Redis container required");
  const { stdout } = await exec("docker", ["exec", container, "redis-cli", "--raw", ...args], { timeout: 5000 });
  return stdout.trim();
}

test("real Redis: multiple limiter instances share one atomic anonymous budget", { timeout: 120000 }, async () => {
  const namespace = "ci-" + randomUUID();
  const key = "isnad:mcp:" + namespace + ":global";
  const env = {
    ISNAD_MCP_LIMIT_MODE: "redis", ISNAD_MCP_REDIS_URL: "https://ci.upstash.io",
    ISNAD_MCP_REDIS_TOKEN: "disposable-test", ISNAD_MCP_LIMIT_NAMESPACE: namespace,
  };
  // Transport adapter deliberately substitutes only the REST network hop.
  // The exact production EVAL script and arguments run in a real isolated Redis.
  const fetcher = async (url, init) => {
    assert.equal(String(url), "https://ci.upstash.io/");
    const args = JSON.parse(String(init.body));
    assert.equal(args[0], "EVAL");
    assert.deepEqual(args.slice(2), ["1", key, "60"]);
    const raw = await redis(...args);
    if (!/^\d+$/.test(raw)) return Response.json({ error: "redis error" }, { status: 502 });
    return Response.json({ result: Number(raw) });
  };
  const instances = Array.from({ length: 4 }, () => createRateLimiter({ env, fetcher }));
  try {
    assert.equal(await redis("PING"), "PONG");
    // Seed near the boundary so a short concurrent burst can prove exact admission.
    assert.equal(await redis("SET", key, "290", "EX", "60"), "OK");
    const outcomes = await Promise.all(Array.from({ length: 24 }, (_, i) => instances[i % instances.length]("mcp.isnadsunnah.site")));
    assert.equal(outcomes.filter(x => x === "allow").length, 10);
    assert.equal(outcomes.filter(x => x === "limited").length, 14);
    assert.equal(await redis("GET", key), "314");
    const ttl = Number(await redis("TTL", key));
    assert.ok(ttl > 0 && ttl <= 60);
    await redis("DEL", key);
    assert.equal(await instances[0]("mcp.isnadsunnah.site"), "allow");
    assert.equal(await redis("GET", key), "1");
    assert.ok(Number(await redis("TTL", key)) > 0);
    await redis("EXPIRE", key, "1");
    await new Promise(resolve => setTimeout(resolve, 1300));
    assert.equal(await redis("EXISTS", key), "0");
    assert.equal(await instances[3]("mcp.isnadsunnah.site"), "allow");
    assert.equal(await redis("GET", key), "1");
    const unavailable = createRateLimiter({ env, fetcher: async () => Response.json({ error: "unavailable" }, { status: 503 }) });
    assert.equal(await unavailable("mcp.isnadsunnah.site"), "unavailable");
  } finally {
    await redis("DEL", key);
  }
});

test("real Redis: distributed concurrency lease capacity, release and expiry", { timeout: 120000 }, async () => {
  const namespace = "ci-" + randomUUID();
  const key = "isnad:mcp:" + namespace + ":leases";
  const env = { ISNAD_MCP_LIMIT_MODE: "redis", ISNAD_MCP_REDIS_URL: "https://ci.upstash.io", ISNAD_MCP_REDIS_TOKEN: "disposable-test", ISNAD_MCP_LIMIT_NAMESPACE: namespace };
  const fetcher = async (_url, init) => {
    const args = JSON.parse(String(init.body));
    assert.equal(args[0], "EVAL");
    assert.equal(args[3], key);
    const raw = await redis(...args);
    if (!/^\d+$/.test(raw)) return Response.json({ error: "redis error" }, { status: 502 });
    return Response.json({ result: Number(raw) });
  };
  const instances = Array.from({ length: 4 }, () => createConcurrencyLimiter({ env, fetcher }));
  try {
    // Thirty active and one expired synthetic lease: exactly two new slots.
    const now = Number((await redis("TIME")).split("\n")[0]) * 1000;
    for (let i = 0; i < 30; i++) await redis("ZADD", key, String(now + 30000), "seed-" + i);
    await redis("ZADD", key, String(now - 1000), "expired");
    const outcomes = await Promise.all(instances.map(acquire => acquire()));
    const allowed = outcomes.filter(x => x.status === "allow");
    assert.equal(allowed.length, 2);
    assert.equal(outcomes.filter(x => x.status === "limited").length, 2);
    assert.equal(await redis("ZCARD", key), "32");
    assert.equal(await redis("ZSCORE", key, "expired"), "");
    await allowed[0].release();
    await allowed[0].release();
    assert.equal(await redis("ZCARD", key), "31");
    const recovered = await instances[0]();
    assert.equal(recovered.status, "allow");
    assert.equal(await redis("ZCARD", key), "32");
    assert.ok(Number(await redis("PTTL", key)) > 0);
    await recovered.release();
    await allowed[1].release();
    assert.equal(await redis("ZCARD", key), "30");
    const unavailable = createConcurrencyLimiter({ env, fetcher: async () => Response.json({}, { status: 503 }) });
    assert.equal((await unavailable()).status, "unavailable");
  } finally { await redis("DEL", key); }
});
