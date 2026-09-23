import fs from "node:fs";
import path from "node:path";
import { auditContextFiles } from "../../domains/context-audit.js";

export interface ContextAuditOptions { path?: string; json?: boolean }

export function contextAuditCommand(options: ContextAuditOptions = {}): void {
  const root = path.resolve(options.path ?? process.cwd());
  const candidates = ["CONTEXT.md", "context.md", "docs/CONTEXT.md", "docs/context.md"];
  const files: Array<{ path: string; content: string }> = [];
  const seen = new Set<string>();
  const addFile = (relative: string) => {
    const key = relative.toLowerCase();
    if (seen.has(key)) return;
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) return;
    seen.add(key);
    files.push({ path: relative, content: fs.readFileSync(file, "utf8") });
  };
  for (const relative of candidates) {
    addFile(relative);
  }
  for (const directory of ["adr", "ADR", "docs/adr", "docs/ADR"]) {
    const folder = path.join(root, directory);
    if (!fs.existsSync(folder)) continue;
    for (const entry of fs.readdirSync(folder)) {
      if (entry.endsWith(".md")) {
        const relative = path.join(directory, entry);
        addFile(relative);
      }
    }
  }
  const result = auditContextFiles(files);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Context audit: ${result.ok ? "PASS" : "FAIL"} | terms ${result.terminology.total} | ADR ${result.adr.valid.length}/${result.adrFiles.length}`);
    [...result.terminology.invalid, ...result.adr.invalid, ...result.warnings].forEach((item) => console.log(`- ${item}`));
  }
  if (!result.ok) process.exitCode = 1;
}
