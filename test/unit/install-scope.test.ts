import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as stateModule from '../../src/domains/state.js';
import {
  initState,
  readManagedProjects,
  upsertManagedProject,
  removeManagedProject,
  collectManagedProjectTargets,
  type SddState,
} from '../../src/domains/state.js';
import { scopeForAgent } from '../../src/app/commands/uninstall.js';
import { runInit } from '../../src/app/commands/init.js';

function makeState(overrides: Partial<SddState> = {}): SddState {
  const state = initState('0.5.12', 'claude');
  return { ...state, ...overrides };
}

describe('domains/state 受管项目清单', () => {
  it('TC-06: 登记两个项目并幂等更新同一项目，清单不重复', () => {
    const state = makeState();
    const base = { scope: 'project' as const, hooks: [], registeredAt: '2026-09-22T00:00:00Z' };
    upsertManagedProject(state, { ...base, root: '/tmp/pa', agents: ['claude'] });
    upsertManagedProject(state, { ...base, root: '/tmp/pb', agents: ['claude', 'codex'] });
    upsertManagedProject(state, { ...base, root: '/tmp/pa', agents: ['claude', 'codex'], registeredAt: '2026-09-22T01:00:00Z' });
    const projects = readManagedProjects(state);
    expect(projects).toHaveLength(2);
    const pa = projects.find((p) => p.root === '/tmp/pa');
    expect(pa?.agents).toEqual(['claude', 'codex']);
    expect(pa?.registeredAt).toBe('2026-09-22T01:00:00Z');
  });

  it('TC-07: managedProjects 缺失按空清单处理', () => {
    const state = makeState();
    expect(readManagedProjects(state)).toEqual([]);
    expect(readManagedProjects(null)).toEqual([]);
  });

  it('TC-07: managedProjects 损坏按空清单处理并产出警告，不抛错', () => {
    const state = makeState();
    (state as Record<string, unknown>).managedProjects = { projects: 'broken' };
    const warnings: string[] = [];
    expect(readManagedProjects(state, (m) => warnings.push(m))).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
    // 损坏字段不得破坏其余状态
    expect(state.version).toBe('0.5.12');
    expect(state.platforms.claude.skills).toEqual([]);
  });

  it('TC-08 前置: removeManagedProject 按 root 移除，缺失 root 无副作用', () => {
    const state = makeState();
    const base = { scope: 'project' as const, hooks: [], agents: ['claude'], registeredAt: 't' };
    upsertManagedProject(state, { ...base, root: '/tmp/pa' });
    upsertManagedProject(state, { ...base, root: '/tmp/pb' });
    removeManagedProject(state, '/tmp/pa');
    expect(readManagedProjects(state).map((p) => p.root)).toEqual(['/tmp/pb']);
    removeManagedProject(state, '/tmp/missing');
    expect(readManagedProjects(state)).toHaveLength(1);
  });

  it('TC-08: 遍历收集——存在目录的项目进 targets，不存在目录进 staleRoots', () => {
    const existing = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-managed-'));
    try {
      const projects = [
        { root: existing, agents: ['claude' as const], scope: 'project' as const, hooks: [], registeredAt: 't' },
        { root: path.join(existing, 'does-not-exist'), agents: ['codex' as const], scope: 'project' as const, hooks: [], registeredAt: 't' },
      ];
      const { targets, staleRoots } = collectManagedProjectTargets(projects);
      expect(targets.map((t) => t.root)).toEqual([existing]);
      expect(staleRoots).toEqual([path.join(existing, 'does-not-exist')]);
    } finally {
      fs.rmSync(existing, { recursive: true, force: true });
    }
  });
});

describe('commands/uninstall scope 推导', () => {
  it('TC-04: state 记录 scope=project 时推导项目范围', () => {
    const state = makeState();
    state.platforms.claude.scope = 'project';
    expect(scopeForAgent('claude', state)).toBe('project');
  });

  it('TC-05: 无 scope 记录时回落 global 并输出提示', () => {
    const state = makeState();
    const warnings: string[] = [];
    expect(scopeForAgent('claude', state, (m) => warnings.push(m))).toBe('global');
    expect(warnings.length).toBeGreaterThan(0);
    expect(scopeForAgent('claude', null)).toBe('global');
  });
});

describe('commands/init 受管登记链路', () => {
  it('TC-10: project scope init 记录 scope 并登记受管清单', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-managed-init-'));
    const saved: SddState[] = [];
    const resumed = stateModule.initState('0.5.12', 'codex');
    resumed.completedSteps = [1, 2, 3, 4, 5, 6, 7];
    vi.spyOn(stateModule, 'loadState').mockReturnValue(resumed);
    vi.spyOn(stateModule, 'saveState').mockImplementation((_file, state) => {
      saved.push(state);
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await runInit({
        dryRun: false,
        agent: 'codex',
        resume: true,
        noHooks: true,
        noOpenspecInit: true,
        noScan: true,
        yes: true,
        json: true,
        skipExisting: false,
        language: 'zh',
        scope: 'project',
        projectPath: root,
      });
      expect(result.ok).toBe(true);
      const last = saved[saved.length - 1];
      expect(last?.platforms.codex.scope).toBe('project');
      const projects = last?.managedProjects?.projects ?? [];
      const registered = projects.find((p) => p.root === root);
      expect(registered?.agents).toEqual(['codex']);
      expect(registered?.scope).toBe('project');
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
