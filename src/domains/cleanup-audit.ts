import fs from "node:fs";
import path from "node:path";

export interface CleanupCandidate { path: string; kind: "duplicate-name" | "large-file" | "todo-hotspot"; evidence: string; route: "simplify" | "review" | "manual" }

export function auditCleanup(root: string): CleanupCandidate[] {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist" || entry.name === "target") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(ts|tsx|js|mjs|java|py|go)$/.test(entry.name)) files.push(full);
    }
  };
  visit(root);
  const byName = new Map<string, string[]>();
  for (const file of files) { const name = path.basename(file); byName.set(name, [...(byName.get(name) ?? []), file]); }
  const result: CleanupCandidate[] = [];
  for (const [name, paths] of byName) if (paths.length > 1) result.push({ path: paths.map((file) => path.relative(root, file)).join(", "), kind: "duplicate-name", evidence: `${name} 出现 ${paths.length} 份，需核对职责与消费者`, route: "manual" });
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const relative = path.relative(root, file).split(path.sep).join("/");
    const lines = content.split(/\r?\n/).length;
    if (lines > 500) result.push({ path: relative, kind: "large-file", evidence: `${lines} 行，仅作为复杂度线索`, route: "simplify" });
    const todos = (content.match(/\bTODO\b|\bFIXME\b/g) ?? []).length;
    if (todos > 2) result.push({ path: relative, kind: "todo-hotspot", evidence: `${todos} 个 TODO/FIXME，需要人工确认是否仍有效`, route: "review" });
  }
  return result;
}
