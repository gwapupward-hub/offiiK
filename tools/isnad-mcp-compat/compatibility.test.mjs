import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { SkillsClient } from "@modelcontextprotocol/client/ext/skills";
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
      const skills = new SkillsClient(client);
      assert.equal(skills.supported, true);
      const listing = await skills.list();
      assert.equal(listing.invalid.length, 0);
      assert.equal(listing.skills.length, 9);
      const files = buildSkillFiles();
      for (const entry of listing.skills) {
        const slug = entry.frontmatter.name;
        const { skill } = await skills.get(entry.uri);
        assert.equal(skill.frontmatter.name, slug);
        const manifest = await skills.read(skill);
        assert.equal(manifest.verified, true);
        assert.equal(Buffer.from(manifest.bytes).toString("utf8"), files[slug + "/SKILL.md"]);
        const reference = await skills.read(skill, "references/methodology.md");
        assert.equal(reference.verified, true);
        assert.equal(Buffer.from(reference.bytes).toString("utf8"), files[slug + "/references/methodology.md"]);
        await assert.rejects(skills.read(skill, "../../.env"));
      }
    } finally {
      await client.close();
      await handler.close();
    }
  });
}
