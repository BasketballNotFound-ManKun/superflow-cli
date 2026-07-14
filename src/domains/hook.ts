import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

export interface HookMapEntry {
  event: string;
  matcher?: string;
}
export const HOOK_MAP: Record<string, HookMapEntry> = {
  'claude-auto-backup-hook.sh': { event: 'PostToolUse', matcher: 'Edit|Write|Bash' },
  'codex-auto-backup-hook.sh': { event: 'PostToolUse', matcher: 'Edit|Write|Bash' },
  'superflow-hook-guard.sh': { event: 'PreToolUse', matcher: 'Edit|Write|NotebookEdit' },
  'superflow-enforce-hook.sh': { event: 'PreToolUse', matcher: 'Edit|Write|NotebookEdit' },
  'superflow-contract-hooks.sh': { event: 'PreToolUse', matcher: 'Edit|Write|NotebookEdit' },
  'superflow-dependency-update-hook.sh': { event: 'UserPromptSubmit' },
  'superflow-sql-sync-hook.py': { event: 'PreToolUse', matcher: 'Edit|Write|NotebookEdit' },
  'superflow-delivery-check.sh': { event: 'PreToolUse', matcher: 'Bash' },
  'superflow-integration-evidence-hook.sh': { event: 'PreToolUse', matcher: 'Bash' },
  'superflow-archive-command-hook.sh': { event: 'PreToolUse', matcher: 'Bash' },
};

export type HookPlatform = 'claude' | 'codex';

/**
 * 判定一个 command path 是否是 SuperBridge Flow 体系管理的 hook。
 * - superflow-* 脚本：路径含 /scripts/superflow- 或 /hooks/superflow-
 * - legacy sdd-* 脚本：用于清理旧版本安装残留
 * - auto-backup-hook.sh：路径含 /scripts/ 或 /hooks/ 下的备份 hook
 * 覆盖 `~` 路径和绝对路径两种写法。
 */
function isSuperflowManagedHook(command: string | undefined): boolean {
  if (!command) return false;
  return (
    command.includes('/scripts/superflow-') ||
    command.includes('/hooks/superflow-') ||
    command.includes('/scripts/sdd-') ||
    command.includes('/hooks/sdd-') ||
    command.includes('/scripts/claude-auto-backup-hook.sh') ||
    command.includes('/scripts/claude-auto-backup-hook') ||
    command.includes('/hooks/claude-auto-backup-hook.sh') ||
    command.includes('/hooks/claude-auto-backup-hook') ||
    command.includes('/scripts/codex-auto-backup-hook.sh') ||
    command.includes('/scripts/codex-auto-backup-hook') ||
    command.includes('/hooks/codex-auto-backup-hook.sh') ||
    command.includes('/hooks/codex-auto-backup-hook')
  );
}

/**
 * 清理 settings.json 中所有 SuperBridge Flow 体系管理的 hook。
 * - 保留非 superflow hook（用户手写、UserPromptSubmit system 提示等）
 * - 保留所有其他顶层 key（env / enabledPlugins / extraKnownMarketplaces / statusLine / model / skipDangerousModePermissionPrompt）
 * - 修改前自动备份到 .sdd-backup-<ts>
 * - 返回清理掉的 hook command 数（用于日志）
 *
 * 修法理由：init 之前可能用 `~` 路径注册过，本 CLI 用绝对路径；
 *   registerHook 跳过逻辑只比较 command 字符串严格相等，会导致新旧并存。
 *   用"全量覆盖"策略：先清所有 superflow/legacy sdd hook，再注册新 hook。
 */
export function clearSddHooks(settingsFile: string): number {
  if (!existsSync(settingsFile)) {
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, JSON.stringify({}, null, 2), 'utf-8');
    return 0;
  }

  const settings = JSON.parse(readFileSync(settingsFile, 'utf-8'));
  if (!settings.hooks) return 0;

  // 1. 备份
  const backupPath = settingsFile + '.sdd-backup-' + Date.now();
  writeFileSync(backupPath, JSON.stringify(settings, null, 2), 'utf-8');

  // 2. 清理所有 SuperBridge Flow 体系管理的 hook
  let removed = 0;
  for (const event of Object.keys(settings.hooks)) {
    const entries = settings.hooks[event];
    if (!Array.isArray(entries)) continue;
    const filtered = entries.filter((entry: any) => {
      const cmds: string[] = (entry?.hooks ?? []).map((h: any) => h.command).filter(Boolean);
      const allSuperflow = cmds.length > 0 && cmds.every((c) => isSuperflowManagedHook(c));
      if (allSuperflow) {
        removed += cmds.length;
        return false;  // 整条 entry 全删
      }
      return true;
    });
    if (filtered.length === 0) {
      delete settings.hooks[event];
    } else {
      settings.hooks[event] = filtered;
    }
  }

  // 3. 保留所有其他顶层 key
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
  return removed;
}

/**
 * 注册一个 hook 到 settings.json（read-merge-write）
 * - 备份 settings.json 到 .sdd-backup-<ts>
 * - 保留所有现有 key
 * - 跳过已存在的 hook
 * - 支持 matcherOverride 用于同脚本注册到多 matcher（superflow-sql-sync-hook.py）
 *
 * 注意：本函数只检查精确字符串相等，不会清理 `~` 路径的旧 hook。
 * 配合 clearSddHooks() 使用（init 阶段先 clear 后 register）可避免重复。
 */
export function registerHook(
  settingsFile: string,
  scriptName: string,
  commandPath: string,
  options: { timeout?: number; matcherOverride?: string } = {}
): void {
  if (!existsSync(settingsFile)) {
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, JSON.stringify({}, null, 2), 'utf-8');
  }

  const settings = JSON.parse(readFileSync(settingsFile, 'utf-8'));
  const map = HOOK_MAP[scriptName];
  if (!map) {
    throw new Error(`Unknown hook script: ${scriptName}. Expected one of: ${Object.keys(HOOK_MAP).join(', ')}`);
  }

  const finalMatcher = options.matcherOverride ?? map.matcher;
  const finalEvent = map.event;  // event 不可 override（同一脚本绑定同一 event 不同 matcher）

  // 1. 备份
  const backupPath = settingsFile + '.sdd-backup-' + Date.now();
  writeFileSync(backupPath, JSON.stringify(settings, null, 2), 'utf-8');

  // 2. 合并 hooks
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks[finalEvent]) settings.hooks[finalEvent] = [];

  // 3. 跳过已存在（同 command + 同 matcher）
  const exists = settings.hooks[finalEvent].some((entry: any) => {
    const matcherMatches = finalMatcher === undefined
      ? entry.matcher === undefined
      : entry.matcher === finalMatcher;
    return entry.hooks?.some((h: any) => h.command === commandPath) && matcherMatches;
  });
  if (!exists) {
    const entry: Record<string, unknown> = {
      hooks: [{ type: 'command', command: commandPath, timeout: options.timeout ?? 120 }],
    };
    if (finalMatcher !== undefined) entry.matcher = finalMatcher;
    settings.hooks[finalEvent].push(entry);
  }

  // 4. 保留所有现有 key
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
}
