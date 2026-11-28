import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { buildSkillFiles } from "./server.mjs";

// Only write to a caller-provided empty development output directory.
// The workflow never publishes these unreviewed files or archives.
const arg = process.argv[2];
if (!arg) throw new Error("Supply an isolated output directory");
const output = resolve(arg);
mkdirSync(output, { recursive: false });
for (const [relative, content] of Object.entries(buildSkillFiles())) {
  const target = join(output, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, { flag: "wx" });
}
