import path from "node:path";
import { auditCleanup } from "../../domains/cleanup-audit.js";

export function cleanupAuditCommand(options: { path?: string; json?: boolean } = {}): void {
  const candidates = auditCleanup(path.resolve(options.path ?? process.cwd()));
  if (options.json) console.log(JSON.stringify({ candidates, modified: false }, null, 2));
  else { console.log(`Cleanup audit: ${candidates.length} candidates | modified=false`); for (const item of candidates) console.log(`${item.kind}\t${item.path}\t${item.evidence}\troute=${item.route}`); }
}
