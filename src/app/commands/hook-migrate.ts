import path from "node:path";
import { auditProjectHooks, migrateProjectHooks, type HookHost } from "../../domains/hook-migration.js";

export function hookMigrateCommand(options: { path?: string; agent?: string; apply?: boolean; json?: boolean } = {}): void {
  if (options.agent && !["codex", "claude", "both"].includes(options.agent)) {
    throw new Error(`Unsupported agent: ${options.agent}`);
  }
  const root = path.resolve(options.path ?? process.cwd());
  const hosts: HookHost[] = options.agent === "claude" ? ["claude"] : options.agent === "codex" ? ["codex"] : ["codex", "claude"];
  const result = hosts.map((host) => options.apply ? migrateProjectHooks(root, host) : auditProjectHooks(root, host));
  if (options.json) console.log(JSON.stringify({ projectPath: root, apply: !!options.apply, hosts: result }, null, 2));
  else for (const item of result) {
    const migrated = "changed" in item && Boolean(item.changed);
    const backup = "backup" in item ? item.backup : undefined;
    console.log(`${item.host}: 全局替代=${item.globalReplacement ? "可用" : "缺失"}；${item.autoMigratable} 条可迁移，${item.retained} 条保留${migrated ? `；已备份 ${backup}` : ""}`);
    for (const finding of item.findings) console.log(`  - [${finding.classification}] ${finding.event}/${finding.matcher ?? "*"}: ${finding.command}（${finding.reason}）`);
    if (item.error) console.error(`  error: ${item.error}`);
  }
  if (result.some((item) => item.error)) process.exitCode = 1;
}
