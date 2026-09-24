import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HOOK_MAP } from "./hook.js";

export type HookHost = "codex" | "claude";
export type HookClassification = "legacy-ake" | "legacy-superflow" | "custom";
export interface HookFinding {
  event: string;
  matcher: string | null;
  command: string;
  classification: HookClassification;
  reason: string;
}
export interface HookAudit {
  host: HookHost;
  file: string;
  provenance: boolean;
  globalReplacement: boolean;
  findings: HookFinding[];
  autoMigratable: number;
  retained: number;
  error?: string;
}
export interface HookMigrationResult extends HookAudit {
  changed: boolean;
  backup?: string;
}

const LEGACY_AKE_NAMES = new Set([
  "auto-sync.sh", "usage-collector.sh", "block-no-verify.sh",
  "commit-quality.sh", "auto-tmux-dev.sh", "mybatis-injection-check.sh",
  "java-edit-accumulator.sh", "loop-detection.sh", "console-warn.sh",
  "stop-compile-check.sh", "stop-quality-gate.sh", "circuit-breaker.sh",
  "session-reflection.sh", "java-compile-check.sh", "config-protection.sh",
]);

export function hookConfigPath(root: string, host: HookHost): string {
  return path.join(root, host === "codex" ? ".codex/hooks.json" : ".claude/settings.json");
}

function hasAkeProvenance(root: string): boolean {
  return [
    ".claude/.ake-install-state.json",
    ".claude/ake-harness-version.txt",
    ".ake/manifest.json",
  ].some((relative) => fs.existsSync(path.join(root, relative)));
}

function classify(command: string, provenance: boolean): Pick<HookFinding, "classification" | "reason"> {
  const normalized = command.replaceAll("\\", "/");
  if (/(^|\/)superflow-[^\s/'";|]+\.(sh|py|mjs|js)(?=\s|$|['";|])/.test(normalized) ||
      /(^|\/)sdd-[^\s/'";|]+\.(sh|py|mjs|js)(?=\s|$|['";|])/.test(normalized)) {
    return { classification: "legacy-superflow", reason: "命中 Superflow/SDD 管理脚本名" };
  }
  const match = normalized.match(/(?:^|\s)(?:bash|sh|python3?|node)\s+scripts\/hooks\/([^\s/'";|]+)/);
  if (provenance && match && LEGACY_AKE_NAMES.has(match[1])) {
    return { classification: "legacy-ake", reason: "项目有 ake 安装标记，且命中已知旧 Hook 名称" };
  }
  return { classification: "custom", reason: "来源不确定或属于项目自定义 Hook，保留" };
}

function readConfig(root: string, host: HookHost): { file: string; data: any; error?: string } {
  const file = hookConfigPath(root, host);
  if (!fs.existsSync(file)) return { file, data: null };
  try {
    if (fs.lstatSync(file).isSymbolicLink()) {
      return { file, data: null, error: "Hook 配置是符号链接；拒绝自动迁移" };
    }
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data) ||
        (data.hooks !== undefined && (typeof data.hooks !== "object" || Array.isArray(data.hooks)))) {
      return { file, data: null, error: "Hook 配置结构无效" };
    }
    return { file, data };
  } catch (error) {
    return { file, data: null, error: `Hook 配置无法解析：${(error as Error).message}` };
  }
}

export function auditProjectHooks(root: string, host: HookHost): HookAudit {
  const provenance = hasAkeProvenance(root);
  const { file, data, error } = readConfig(root, host);
  const findings: HookFinding[] = [];
  if (data) {
    for (const [event, entries] of Object.entries(data.hooks ?? {})) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries as any[]) {
        if (!Array.isArray(entry?.hooks)) continue;
        for (const hook of entry.hooks) {
          if (typeof hook?.command !== "string") continue;
          findings.push({ event, matcher: typeof entry.matcher === "string" ? entry.matcher : null,
            command: hook.command, ...classify(hook.command, provenance) });
        }
      }
    }
  }
  return { host, file, provenance, findings,
    globalReplacement: hasGlobalReplacement(host),
    autoMigratable: findings.filter((item) => item.classification !== "custom").length,
    retained: findings.filter((item) => item.classification === "custom").length,
    ...(error ? { error } : {}) };
}

function hasGlobalReplacement(host: HookHost): boolean {
  const { data } = readConfig(os.homedir(), host);
  const commands = Object.values(data?.hooks ?? {}).flatMap((entries) =>
    Array.isArray(entries) ? entries.flatMap((entry: any) =>
      Array.isArray(entry?.hooks) ? entry.hooks.map((hook: any) => hook?.command) : []) : []);
  const expected = Object.keys(HOOK_MAP).filter((name) =>
    !name.startsWith(host === "codex" ? "claude-auto-" : "codex-auto-"));
  return expected.every((name) => commands.some((command) =>
    typeof command === "string" && command.endsWith(`/${name}`) &&
    fs.existsSync(command)));
}

export function migrateProjectHooks(
  root: string,
  host: HookHost,
  options: { replacementAvailable?: boolean } = {},
): HookMigrationResult {
  if (path.resolve(root) === path.resolve(os.homedir())) {
    return { ...auditProjectHooks(root, host), changed: false,
      error: "拒绝把全局配置当作项目 Hook 迁移" };
  }
  const audit = auditProjectHooks(root, host);
  if (audit.error || audit.autoMigratable === 0) return { ...audit, changed: false };
  if (!(options.replacementAvailable ?? audit.globalReplacement)) {
    return { ...audit, changed: false,
      error: "未发现当前全局 Superflow Hook；拒绝移除项目旧护栏" };
  }
  const { file, data, error } = readConfig(root, host);
  if (error || !data) return { ...audit, changed: false, error: error ?? "配置不存在" };
  for (const [event, entries] of Object.entries(data.hooks ?? {})) {
    if (!Array.isArray(entries)) continue;
    const kept = (entries as any[]).map((entry) => {
      if (!Array.isArray(entry?.hooks)) return entry;
      return { ...entry, hooks: entry.hooks.filter((hook: any) =>
        typeof hook?.command !== "string" || classify(hook.command, audit.provenance).classification === "custom") };
    }).filter((entry) => !Array.isArray(entry?.hooks) || entry.hooks.length > 0);
    if (kept.length) data.hooks[event] = kept;
    else delete data.hooks[event];
  }
  const backup = `${file}.superflow-migrate-${Date.now()}.bak`;
  fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  const temporary = `${file}.superflow-migrate-${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
  return { ...audit, changed: true, backup };
}
