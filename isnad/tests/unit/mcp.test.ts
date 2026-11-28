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
test("gated HTTP transport, discovery, read-only tools and rejection paths", async () => {
  const previous = process.env.ISNAD_MCP_ENABLED;
  const previousOrigin = process.env.ISNAD_MCP_ALLOWED_ORIGIN;
  const request = (body: unknown, extra: Record<string,string> = {}) => new Request("https://isnad.example/api/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...extra },
    body: JSON.stringify(body),
  });
  const rpc = (method: string, params?: unknown) => ({ jsonrpc: "2.0", id: 1, method, params });
  try {
    delete process.env.ISNAD_MCP_ENABLED;
    delete process.env.ISNAD_MCP_ALLOWED_ORIGIN;
    assert.equal((await POST(request(rpc("tools/list")))).status, 404);
    process.env.ISNAD_MCP_ENABLED = "true";
    assert.equal(GET(new Request("https://isnad.example/api/mcp")).status, 405);
    assert.equal((await POST(request(rpc("tools/list"), { origin: "https://evil.example" }))).status, 403);
    assert.equal((await POST(request(rpc("tools/list"), { "mcp-protocol-version": "unsupported" }))).status, 400);
    assert.equal((await POST(request(rpc("tools/list"), { accept: "text/html" }))).status, 406);
    assert.equal((await POST(request(rpc("tools/list"), { "content-type": "text/plain" }))).status, 415);
    assert.equal((await POST(request(rpc("ping", { value: "x".repeat(9000) })))).status, 413);
    const init = await (await POST(request(rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } })))).json();
    assert.equal(init.result.protocolVersion, "2025-11-25");
    assert.equal((await POST(request({ jsonrpc: "2.0", method: "notifications/initialized" }))).status, 202);
    const list = await (await POST(request(rpc("tools/list")))).json();
    assert.equal(list.result.tools.length, 9);
    const call = await (await POST(request(rpc("tools/call", { name: "muamalat_expert", arguments: {} })))).json();
    assert.match(call.result.content[0].text, /## Fiqh Expert \(fiqh_expert\)/);
    const read = await (await POST(request(rpc("resources/read", { uri: "isnad://skills/hadith_expert" })))).json();
    assert.match(read.result.contents[0].text, /## Hadith Sciences Expert \(hadith_expert\)/);
    const rejected = await (await POST(request(rpc("tools/call", { name: "islamic_teacher", arguments: { question: "private" } })))).json();
    assert.equal(rejected.error.code, -32602);
    const forbidden = await (await POST(request(rpc("resources/read", { uri: "file:///etc/passwd" })))).json();
    assert.equal(forbidden.error.code, -32602);
    const unknown = await (await POST(request(rpc("private/write")))).json();
    assert.equal(unknown.error.code, -32601);
  } finally {
    if (previous === undefined) delete process.env.ISNAD_MCP_ENABLED;
    else process.env.ISNAD_MCP_ENABLED = previous;
    if (previousOrigin === undefined) delete process.env.ISNAD_MCP_ALLOWED_ORIGIN;
    else process.env.ISNAD_MCP_ALLOWED_ORIGIN = previousOrigin;
  }
});
