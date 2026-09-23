import path from "node:path";
import { auditMap } from "../../domains/map-audit.js";

export function mapAuditCommand(options: { path?: string; query?: string; limit?: string; json?: boolean } = {}): void {
  const result = auditMap(path.resolve(options.path ?? process.cwd()), options.query ?? "", Number(options.limit ?? 8));
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`Map audit: ${result.graphStatus} | full=${result.modes.full} | topK=${result.modes.topK.length} | skeleton=${result.modes.skeleton.length}\n${result.fallback}`);
}
