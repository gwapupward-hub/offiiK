import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { buildSkillFiles, createCandidate } from "./server.mjs";
import { tools, getSkill } from "../../isnad/lib/mcp/registry.ts";

test("portable skill manifests preserve every pinned bundle", () => {
  const files = buildSkillFiles();
  assert.equal(Object.keys(files).length, 18);
  for (const tool of tools) {
    const slug = tool.name.replaceAll("_", "-");
    assert.match(files[slug + "/SKILL.md"], new RegExp("^---\\nname: " + slug));
    assert.equal(files[slug + "/references/methodology.md"], getSkill(tool.name));
  }
});
for (const [era, mode] of [["legacy", "legacy"], ["modern", { pin: "2026-07-28" }]]) {
  test("real SDK client: " + era, { timeout: 30000 }, async () => {
    const handler = await createCandidate();
    const client = new Client({ name: "isnad-compat", version: "1.0.0" }, { versionNegotiation: { mode } });
    try {
      const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      });
      await client.connect(transport);
      assert.equal(client.getProtocolEra(), era);
      const list = await client.listTools();
      assert.equal(list.tools.length, 9);
      assert.deepEqual(list.tools.map(t => t.name).sort(), tools.map(t => t.name).sort());
      for (const tool of list.tools) {
        assert.equal(tool.annotations.readOnlyHint, true);
        const call = await client.callTool({ name: tool.name, arguments: {} });
        assert.notEqual(call.isError, true);
        assert.equal(call.content[0].text, getSkill(tool.name));
      }
      const rejected = await client.callTool({ name: "fiqh_expert", arguments: { question: "unexpected" } });
      assert.equal(rejected.isError, true);
      const finance = await client.readResource({ uri: "isnad://skills/muamalat_expert" });
      assert.equal(finance.contents[0].text, getSkill("muamalat_expert"));
      await assert.rejects(client.readResource({ uri: "file:///etc/passwd" }));
    } finally {
      await client.close();
      await handler.close();
    }
  });
}
