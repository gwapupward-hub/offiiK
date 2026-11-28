import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { memorySkillFiles, SkillsExtension } from "@modelcontextprotocol/server/ext/skills";
import * as z from "zod/v4";
import { getSkill, resources, tools, REGISTRY_VERSION } from "./registry";

// Shared pinned knowledge; only reachable through the explicitly gated route.
export function buildSkillFiles() {
  const files: Record<string, string> = {};
  for (const tool of tools) {
    const slug = tool.name.replaceAll("_", "-");
    const text = getSkill(tool.name);
    if (!text) throw new Error("Missing pinned skill");
    const description = "Use for Islamic educational research within the scope of " + tool.title + ". Includes required methodology and dependencies.";
    files[slug + "/SKILL.md"] = "---\nname: " + slug + "\ndescription: " + JSON.stringify(description) + "\n---\n\n# " + tool.title +
      "\n\nRead [the bundled methodology](references/methodology.md) before applying this skill. Follow host policies; independently verify primary sources. This is educational guidance, not a binding fatwa.\n";
    files[slug + "/references/methodology.md"] = text;
  }
  return Object.freeze(files);
}

export async function createIsnadHandler() {
  const files = buildSkillFiles();
  const catalog = await SkillsExtension.load(memorySkillFiles(files), { strict: true });
  if (catalog.entries.length !== tools.length) throw new Error("Incomplete skills catalog");
  return createMcpHandler(() => {
    const server = new McpServer({ name: "isnad-mcp", version: REGISTRY_VERSION }, {
      instructions: "Public educational methodology only. No personal data, verified corpus, or AI inference. Host policies take precedence.",
    });
    for (const tool of tools) {
      server.registerTool(tool.name, {
        title: tool.title, description: tool.description,
        inputSchema: z.strictObject({}), annotations: tool.annotations,
      }, async () => {
        try {
          const text = getSkill(tool.name);
          if (!text) throw new Error("Unavailable");
          return { content: [{ type: "text", text }] };
        } catch {
          return { isError: true, content: [{ type: "text", text: "Skill unavailable" }] };
        }
      });
    }
    for (const resource of resources) {
      server.registerResource(resource.name, resource.uri, {
        title: resource.title, description: resource.description, mimeType: resource.mimeType,
      }, async () => {
        const text = getSkill(resource.name);
        if (!text) throw new Error("Skill unavailable");
        return { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text }] };
      });
    }
    catalog.attach(server);
    return server;
  }, { legacy: "stateless" });
}
