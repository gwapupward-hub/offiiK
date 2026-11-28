import assert from "node:assert/strict";
import { test } from "node:test";
import { getSkill, resources, tools } from "../../lib/mcp/registry";
import { GET, POST } from "../../app/api/mcp/route";

test("all nine public bundles resolve with provenance and Core first", () => {
  assert.equal(tools.length, 9);
  assert.equal(resources.length, 9);
  for (const tool of tools) {
    const text = getSkill(tool.name);
    assert.ok(text);
    assert.match(text, /SHA-256: [a-f0-9]{64}/);
    assert.match(text, /Not a binding fatwa/);
    assert.match(text, /MIT License/);
    assert.match(text, /## Islamic Teacher Core \(islamic_teacher\)/);
    assert.equal(tool.annotations.readOnlyHint, true);
  }
});
test("finance preserves Core > Fiqh > Muamalat; rejects path traversal", () => {
  const text = getSkill("muamalat_expert")!;
  const core = text.indexOf("## Islamic Teacher Core (islamic_teacher)");
  const fiqh = text.indexOf("## Fiqh Expert (fiqh_expert)");
  const finance = text.indexOf("## Muʿāmalāt Expert (muamalat_expert)");
  assert.ok(core >= 0 && core < fiqh && fiqh < finance);
  for (const name of ["../../.env", "__proto__", "constructor", "unknown"]) {
    assert.equal(getSkill(name), undefined);
  }
});
test("SDK application route is disabled by default and enforces ingress bounds", async () => {
  const keys = ["ISNAD_MCP_ENABLED", "ISNAD_MCP_ALLOWED_HOST", "ISNAD_MCP_ALLOWED_ORIGIN", "ISNAD_MCP_LIMIT_MODE"] as const;
  const previous = keys.map(key => process.env[key]);
  const request = (body: unknown, extra: Record<string,string> = {}) => new Request("http://127.0.0.1:3478/api/mcp", {
    method: "POST", headers: { host: "127.0.0.1:3478", "content-type": "application/json", accept: "application/json, text/event-stream", ...extra },
    body: JSON.stringify(body),
  });
  const rpc = (method: string, params?: unknown) => ({ jsonrpc: "2.0", id: 1, method, params });
  try {
    for (const key of keys) delete process.env[key];
    assert.equal((await POST(request(rpc("tools/list")))).status, 404);
    assert.equal((await GET(new Request("http://127.0.0.1:3478/api/mcp"))).status, 404);
    process.env.ISNAD_MCP_ENABLED = "true";
    assert.equal((await POST(request(rpc("tools/list")))).status, 403);
    process.env.ISNAD_MCP_ALLOWED_HOST = "127.0.0.1:3478";
    assert.equal((await POST(request(rpc("ping")))).status, 503);
    process.env.ISNAD_MCP_LIMIT_MODE = "local";
    assert.equal((await POST(request(rpc("tools/list"), { host: "evil.example" }))).status, 403);
    assert.equal((await POST(request(rpc("tools/list"), { origin: "https://evil.example" }))).status, 403);
    assert.equal((await POST(request(rpc("tools/list"), { "content-type": "text/plain" }))).status, 415);
    assert.equal((await POST(request(rpc("ping", { value: "x".repeat(9000) })))).status, 413);
    assert.equal((await POST(request(rpc("ping"), { "content-length": "9000" }))).status, 413);
    const reconstructed = new Request("http://localhost:3478/api/mcp", { method: "POST", headers: { host: "127.0.0.1:3478", "content-type": "text/plain" }, body: "{}" });
    assert.equal((await POST(reconstructed)).status, 415);
    const response = await POST(request(rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } })));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const text = await response.text();
    assert.match(text, /isnad-mcp/);
    assert.match(text, /2025-11-25/);
  } finally {
    for (const [index, key] of keys.entries()) {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    }
  }
});
