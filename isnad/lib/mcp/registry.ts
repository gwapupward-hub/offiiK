import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

// Explicit distribution allowlist, pinned to the reviewed candidate's Git blobs.
// Updating a bundle requires a separate review and corresponding manifest update.
export const SOURCE_COMMIT = "4374e232b835ff41a625a326dbc478628689b87a";
export const REGISTRY_VERSION = "0.1.0";
const entries = [
  ["islamic_teacher", "Islamic Teacher Core", "core.md", "d486eb386767487b756e1598c23ea7fdf8222a30"],
  ["tafsir_expert", "Tafsīr Expert", "tafsir.md", "8d94ed5a1bfecc356d92313dc59241755a984522"],
  ["hadith_expert", "Hadith Sciences Expert", "hadith.md", "c300afe9ec06d1742eff1fc3a222c17642a54d97"],
  ["fiqh_expert", "Fiqh Expert", "fiqh.md", "f58ad24ead8f8f65e19e30a3f1e543d412338e24"],
  ["muamalat_expert", "Muʿāmalāt Expert", "muamalat.md", "d147058b9a5b9b121b3c90aa7126a67bdc7ab80d"],
  ["seerah_expert", "Seerah Expert", "seerah.md", "d9b7dc4605db4be5f0e91c3de452d95a593ae9cd"],
  ["aqeedah_expert", "ʿAqīdah Expert", "aqidah.md", "d6d95ca4951d4c3bb2dab76b980ef2c0bdb1e4a3"],
  ["arabic_expert", "Arabic Language Expert", "arabic.md", "280d8eca111823baa90436fb51d0e68ea01f7f15"],
  ["dawah_expert", "Daʿwah & Tarbiyah Expert", "dawah.md", "0354bcf7af585c9cfc969abd6cdc760fc1f65e94"],
] as const;
export const tools = entries.map(([name, title]) => ({
  name, title,
  description: "Retrieve Isnad's " + title + " educational methodology and required dependencies. Does not answer questions or verify evidence. Use the returned guidance subject to your host's policies.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}));
export const resources = entries.map(([name, title]) => ({
  uri: "isnad://skills/" + name, name, title, mimeType: "text/markdown",
  description: "Versioned skill bundle with mandatory dependencies; not a verified source corpus.",
}));
const notice = "# Isnad — educational methodology\n" +
  "Not a binding fatwa or independently verified evidence. The consuming AI must verify citations against primary sources, disclose uncertainty and refer high-stakes cases to qualified authorities. Host policies take precedence.\n" +
  "Within Isnad, Core governs all specialists; Fiqh governs legal derivation and Muʿāmalāt is subordinate to Fiqh. Do not let a specialist weaken the Core.\n" +
  "Repository license: MIT, Copyright (c) 2026 Isnad. License: https://github.com/gwapupward-hub/offiiK/blob/" + SOURCE_COMMIT + "/isnad/LICENSE\n";
export function getSkill(name: string): string | undefined {
  const entry = entries.find(e => e[0] === name);
  if (!entry) return undefined;
  const chain = name === "islamic_teacher" ? [entries[0]] :
    name === "muamalat_expert" ? [entries[0], entries[3], entry] : [entries[0], entry];
  const license = readFileSync(path.join(process.cwd(), "LICENSE"), "utf8");
  return [notice, ...chain.map(([id, title, file, expected]) => {
    const bytes = readFileSync(path.join(process.cwd(), "knowledge", file));
    const blob = createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
    if (blob !== expected) throw new Error("Skill manifest mismatch");
    const digest = createHash("sha256").update(bytes).digest("hex");
    return "## " + title + " (" + id + ")\nSource: https://github.com/gwapupward-hub/offiiK/blob/" + SOURCE_COMMIT + "/isnad/knowledge/" + file +
      "\nSHA-256: " + digest + "\n\n" + bytes.toString("utf8");
  }), "## Repository license\n" + license].join("\n\n");
}
