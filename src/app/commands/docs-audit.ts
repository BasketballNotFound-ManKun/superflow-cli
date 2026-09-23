import path from "node:path";
import { auditDocs } from "../../domains/docs-audit.js";

export function docsAuditCommand(options: { path?: string; json?: boolean } = {}): void {
  const result = auditDocs(path.resolve(options.path ?? process.cwd()));
  if (options.json) console.log(JSON.stringify({ items: result }, null, 2));
  else for (const item of result) console.log(`${item.state}\t${item.path}\tage=${item.ageDays ?? "?"}d\tinbound=${item.inboundLinks}\tdead=${item.deadAnchors.length}`);
}
