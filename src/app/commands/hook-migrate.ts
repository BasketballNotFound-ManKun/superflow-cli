import os from "node:os";
import path from "node:path";
import { ASSETS_DIR } from "../../platform/assets.js";
import { getPlatformPaths } from "../../platform/paths.js";
import {
  auditLegacyScriptAliases,
  syncLegacyScriptAliases,
} from "../../domains/skill/scripts.js";
import {
  auditProjectGitHook,
  auditGlobalHooks,
  auditProjectHooks,
  migrateGlobalHooks,
  migrateProjectHooks,
  type HookHost,
} from "../../domains/hook-migration.js";

export function hookMigrateCommand(
  options: {
    path?: string;
    agent?: string;
    scope?: string;
    apply?: boolean;
    json?: boolean;
  } = {},
): void {
  if (options.agent && !["codex", "claude", "both"].includes(options.agent)) {
    throw new Error(`Unsupported agent: ${options.agent}`);
  }
  const scope = options.scope ?? "project";
  if (scope !== "project" && scope !== "global") {
    throw new Error(`Unsupported hook scope: ${scope}`);
  }
  if (scope === "global" && options.path) {
    throw new Error("--path only applies to project Hook migration");
  }
  const root =
    scope === "global"
      ? os.homedir()
      : path.resolve(options.path ?? process.cwd());
  const hosts: HookHost[] =
    options.agent === "claude"
      ? ["claude"]
      : options.agent === "codex"
        ? ["codex"]
        : ["codex", "claude"];
  const result = hosts.map((host) =>
    scope === "global"
      ? options.apply
        ? migrateGlobalHooks(root, host)
        : auditGlobalHooks(root, host)
      : options.apply
        ? migrateProjectHooks(root, host)
        : auditProjectHooks(root, host),
  );
  const gitHook = scope === "project" ? auditProjectGitHook(root) : undefined;
  const scriptAliases =
    scope === "global"
      ? hosts.map((host) => {
          const scriptsDir = getPlatformPaths(host).scriptsDir;
          return {
            host,
            aliases: options.apply
              ? syncLegacyScriptAliases(
                  path.join(ASSETS_DIR, "scripts"),
                  scriptsDir,
                  host,
                )
              : auditLegacyScriptAliases(
                  path.join(ASSETS_DIR, "scripts"),
                  scriptsDir,
                  host,
                ),
          };
        })
      : undefined;
  if (options.json)
    console.log(
      JSON.stringify(
        {
          scope,
          ...(scope === "global" ? { homePath: root } : { projectPath: root }),
          apply: !!options.apply,
          hosts: result,
          ...(gitHook ? { gitHook } : {}),
          ...(scriptAliases ? { scriptAliases } : {}),
        },
        null,
        2,
      ),
    );
  else
    for (const item of result) {
      const migrated = "changed" in item && Boolean(item.changed);
      const backup = "backup" in item ? item.backup : undefined;
      const prefix =
        scope === "global"
          ? `${item.autoMigratable} 条已知旧全局 Hook 可清理，${item.retained} 条保留`
          : `全局替代=${item.globalReplacement ? "可用" : "缺失"}；${item.autoMigratable} 条可迁移，${item.retained} 条保留`;
      console.log(
        `${item.host}: ${prefix}${migrated ? `；已备份 ${backup}` : ""}`,
      );
      for (const finding of item.findings)
        console.log(
          `  - [${finding.classification}] ${finding.event}/${finding.matcher ?? "*"}: ${finding.command}（${finding.reason}）`,
        );
      if (item.error) console.error(`  error: ${item.error}`);
    }
  if (!options.json && gitHook) {
    console.log(
      `Git pre-commit: ${gitHook.file ?? "无"}；受管引用 ${gitHook.references.length}；来源不一致 ${gitHook.references.filter((item) => !item.current).length}`,
    );
  }
  if (!options.json && scriptAliases) {
    for (const { host, aliases } of scriptAliases)
      for (const alias of aliases)
        console.log(
          `${host}: ${alias.alias} -> ${alias.target}: ${alias.status}; current=${alias.targetCurrent}${alias.backup ? `；备份 ${alias.backup}` : ""}`,
        );
  }
  if (
    result.some((item) => item.error) ||
    (options.apply &&
      scriptAliases?.some((item) =>
        item.aliases.some(
          (alias) =>
            alias.status !== "custom" &&
            (alias.status !== "delegated" || !alias.targetCurrent),
        ),
      ))
  )
    process.exitCode = 1;
}
