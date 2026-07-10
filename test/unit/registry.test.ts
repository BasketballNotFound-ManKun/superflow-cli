import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { registerHook, clearSddHooks, HOOK_MAP } from '../../src/domains/hook.js';
import { hookScriptsForAgent } from '../../src/domains/skill/assets.js';

const TMP = path.join(os.tmpdir(), 'sdd-test-registry-' + Date.now());
const SETTINGS = path.join(TMP, 'settings.json');

describe('core/registry', () => {
  beforeEach(() => {
    fs.mkdirSync(TMP, { recursive: true });
    fs.copyFileSync(
      path.join(process.cwd(), 'test', 'fixture', 'settings-template.json'),
      SETTINGS
    );
  });

  afterEach(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('HOOK_MAP 含 9 个 hook 脚本', () => {
    expect(Object.keys(HOOK_MAP).length).toBe(9);
    expect(HOOK_MAP['superflow-enforce-hook.sh']).toBeDefined();
    expect(HOOK_MAP['superflow-hook-guard.sh']).toBeDefined();
    expect(HOOK_MAP['superflow-dependency-update-hook.sh'].event).toBe('UserPromptSubmit');
    expect(HOOK_MAP['codex-auto-backup-hook.sh']).toBeDefined();
    // sql-sync-hook.py 的 Bash 注册通过 registerHook 第二次调用（matcherOverride）实现
    // 不在 HOOK_MAP 默认 matcher 里
    expect(HOOK_MAP['superflow-sql-sync-hook.py'].matcher).toBe('Edit|Write|NotebookEdit');
  });

  it('registerHook 添加新 hook 但保留现有 key', () => {
    registerHook(SETTINGS, 'superflow-enforce-hook.sh', '/home/test/.claude/scripts/superflow-enforce-hook.sh');
    const result = JSON.parse(fs.readFileSync(SETTINGS, 'utf-8'));
    expect(result.enabledPlugins['test@test']).toBe(true);
    expect(result.env.FOO).toBe('bar');
    expect(result.hooks.PreToolUse.length).toBe(1);
    expect(result.hooks.PreToolUse[0].matcher).toBe('Edit|Write|NotebookEdit');
  });

  it('registerHook 重复调用不重复添加', () => {
    const cmd = '/home/test/.claude/scripts/superflow-enforce-hook.sh';
    registerHook(SETTINGS, 'superflow-enforce-hook.sh', cmd);
    registerHook(SETTINGS, 'superflow-enforce-hook.sh', cmd);
    const result = JSON.parse(fs.readFileSync(SETTINGS, 'utf-8'));
    expect(result.hooks.PreToolUse.length).toBe(1);
  });

  it('registerHook matcherOverride 允许同脚本注册到多 matcher', () => {
    const cmd = '/home/test/.claude/scripts/superflow-sql-sync-hook.py';
    registerHook(SETTINGS, 'superflow-sql-sync-hook.py', cmd);
    registerHook(SETTINGS, 'superflow-sql-sync-hook.py', cmd, { matcherOverride: 'Bash' });
    const result = JSON.parse(fs.readFileSync(SETTINGS, 'utf-8'));
    const entries = result.hooks.PreToolUse;
    expect(entries.length).toBe(2);
    expect(entries.map((e: any) => e.matcher).sort()).toEqual(['Bash', 'Edit|Write|NotebookEdit']);
  });

  it('registerHook 支持 UserPromptSubmit 无 matcher hook', () => {
    const cmd = '/home/test/.claude/scripts/superflow-dependency-update-hook.sh';
    registerHook(SETTINGS, 'superflow-dependency-update-hook.sh', cmd);
    const result = JSON.parse(fs.readFileSync(SETTINGS, 'utf-8'));
    expect(result.hooks.UserPromptSubmit.length).toBe(1);
    expect(result.hooks.UserPromptSubmit[0].matcher).toBeUndefined();
    expect(result.hooks.UserPromptSubmit[0].hooks[0].command).toBe(cmd);
  });

  it('registerHook 产生备份文件', () => {
    registerHook(SETTINGS, 'superflow-enforce-hook.sh', '/x.sh');
    const backups = fs.readdirSync(TMP).filter(f => f.includes('sdd-backup'));
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });

  // ===== clearSddHooks 全量覆盖测试 =====

  it('clearSddHooks 清掉所有 superflow/legacy sdd hook（含 ~ 路径和绝对路径）', () => {
    // 模拟"反复 init"产生的旧 `~` 路径 hook
    fs.writeFileSync(SETTINGS, JSON.stringify({
      hooks: {
        PostToolUse: [
          { matcher: 'Edit|Write|Bash', hooks: [{ type: 'command', command: '~/.claude/scripts/claude-auto-backup-hook.sh' }] },
          { matcher: 'Edit|Write|Bash', hooks: [{ type: 'command', command: '/Users/test/.claude/scripts/claude-auto-backup-hook.sh' }] },
        ],
        PreToolUse: [
          { matcher: 'Edit|Write|NotebookEdit', hooks: [{ type: 'command', command: '~/.claude/scripts/superflow-enforce-hook.sh' }] },
          { matcher: 'Edit|Write|NotebookEdit', hooks: [{ type: 'command', command: '/Users/test/.claude/scripts/superflow-enforce-hook.sh' }] },
          { matcher: 'Edit|Write|NotebookEdit', hooks: [{ type: 'command', command: '~/.claude/scripts/superflow-contract-hooks.sh' }] },
        ],
        UserPromptSubmit: [
          { matcher: 'sql|数据库', hooks: [{ type: 'command', command: 'echo "non-superflow system prompt"' }] },
        ],
      },
    }, null, 2));

    const cleared = clearSddHooks(SETTINGS);
    expect(cleared).toBe(5);

    const result = JSON.parse(fs.readFileSync(SETTINGS, 'utf-8'));
    // PostToolUse 和 PreToolUse 应被全删
    expect(result.hooks.PostToolUse).toBeUndefined();
    expect(result.hooks.PreToolUse).toBeUndefined();
    // UserPromptSubmit 应保留（非 superflow hook）
    expect(result.hooks.UserPromptSubmit).toBeDefined();
    expect(result.hooks.UserPromptSubmit[0].hooks[0].command).toBe('echo "non-superflow system prompt"');
  });

  it('clearSddHooks 保留所有顶层 key', () => {
    fs.writeFileSync(SETTINGS, JSON.stringify({
      enabledPlugins: { 'superpowers@superpowers-marketplace': true },
      env: { FOO: 'bar' },
      extraKnownMarketplaces: {},
      hooks: {
        PostToolUse: [
          { matcher: 'Edit', hooks: [{ type: 'command', command: '~/.claude/scripts/claude-auto-backup-hook.sh' }] },
        ],
      },
      model: 'haiku',
    }, null, 2));

    clearSddHooks(SETTINGS);

    const result = JSON.parse(fs.readFileSync(SETTINGS, 'utf-8'));
    expect(result.enabledPlugins['superpowers@superpowers-marketplace']).toBe(true);
    expect(result.env.FOO).toBe('bar');
    expect(result.extraKnownMarketplaces).toBeDefined();
    expect(result.model).toBe('haiku');
  });

  it('clearSddHooks 文件不存在时创建空配置', () => {
    const file = path.join(TMP, 'nested', 'settings.json');
    expect(clearSddHooks(file)).toBe(0);
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({});
  });

  it('clearSddHooks 后 registerHook 是幂等的（跑 2 遍数量不变）', () => {
    fs.writeFileSync(SETTINGS, JSON.stringify({ hooks: {} }, null, 2));

    const runInitLike = () => {
      clearSddHooks(SETTINGS);
      for (const script of hookScriptsForAgent('claude')) {
        const command = path.join('/home/test', '.claude', 'scripts', script);
        registerHook(SETTINGS, script, command);
        if (script === 'superflow-sql-sync-hook.py') {
          registerHook(SETTINGS, script, command, { matcherOverride: 'Bash' });
        }
      }
    };
    const countSuperflowCommands = (file: string) => {
      const r = JSON.parse(fs.readFileSync(file, 'utf-8'));
      let c = 0;
      for (const entries of Object.values(r.hooks) as any[]) {
        for (const e of entries) {
          for (const h of e.hooks ?? []) {
            if (h.command?.includes('/scripts/superflow-') ||
                h.command?.includes('/scripts/sdd-') ||
                h.command?.includes('claude-auto-backup')) c++;
          }
        }
      }
      return c;
    };

    // 第一次 init
    runInitLike();
    expect(countSuperflowCommands(SETTINGS)).toBe(9);  // 8 hook 脚本 + sql-sync 双注册

    // 第二次 init（幂等性：数量应不变）
    runInitLike();
    expect(countSuperflowCommands(SETTINGS)).toBe(9);
  });
});
