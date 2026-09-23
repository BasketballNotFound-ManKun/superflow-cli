import fs from "node:fs";
import path from "node:path";

export interface DocsAuditItem { path: string; ageDays: number | null; deadAnchors: string[]; inboundLinks: number; state: "obsolete" | "redundant" | "trivial" | "current" }

export function auditDocs(root: string): DocsAuditItem[] {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith(".md")) files.push(full);
    }
  };
  visit(root);
  const corpus = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  return files.map((file) => {
    const content = fs.readFileSync(file, "utf8");
    const relative = path.relative(root, file).split(path.sep).join("/");
    const anchors = [...content.matchAll(/`([^`]+\.(?:ts|tsx|js|mjs|py|java|xml))`/g)].map((match) => match[1]);
    const deadAnchors = anchors.filter((anchor) => !fs.existsSync(path.join(root, anchor)));
    const inboundLinks = Math.max(0, (corpus.match(new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length - 1);
    const ageDays = (() => { try { return Math.floor((Date.now() - fs.statSync(file).mtimeMs) / 86400000); } catch { return null; } })();
    const state = deadAnchors.length >= Math.max(2, anchors.length) && anchors.length > 0 ? "obsolete" : content.trim().length < 80 ? "trivial" : "current";
    return { path: relative, ageDays, deadAnchors, inboundLinks, state };
  });
}
