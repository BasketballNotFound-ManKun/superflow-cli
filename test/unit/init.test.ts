import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as stateModule from '../../src/domains/state.js';
import { parseInitAgentInput, runInit } from '../../src/app/commands/init.js';

describe('commands/init', () => {
  it.each([
    ['project', false, true],
    ['project', true, false],
    ['global', false, false],
  ] as const)('runtime ignore respects scope=%s and dryRun=%s', async (scope, dryRun, expected) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-init-ignore-'));
    const state = stateModule.initState('0.5.8', 'codex');
    state.completedSteps = [1, 2, 3, 4, 5, 6, 7];
    vi.spyOn(stateModule, 'loadState').mockReturnValue(state);
    vi.spyOn(stateModule, 'saveState').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const result = await runInit({
        dryRun, scope, agent: 'codex', resume: true, noHooks: true,
        noOpenspecInit: true, noScan: true, yes: true, json: true,
        skipExisting: false, overwrite: false, language: 'zh', projectPath: root,
      });
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(root, '.gitignore'))).toBe(expected);
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it('parseInitAgentInput 支持默认和 both', () => {
    expect(parseInitAgentInput('')).toBe('both');
    expect(parseInitAgentInput('a')).toBe('both');
    expect(parseInitAgentInput('both')).toBe('both');
  });

  it('parseInitAgentInput 支持序号多选', () => {
    expect(parseInitAgentInput('1')).toBe('claude');
    expect(parseInitAgentInput('2')).toBe('codex');
    expect(parseInitAgentInput('1,2')).toBe('both');
    expect(parseInitAgentInput('1 2')).toBe('both');
  });

  it('parseInitAgentInput 支持名称输入并拒绝未知工具', () => {
    expect(parseInitAgentInput('claude,codex')).toBe('both');
    expect(parseInitAgentInput('codex')).toBe('codex');
    expect(parseInitAgentInput('cursor')).toBeNull();
  });

  it('Claude Superpowers 安装失败会中止完整双端安装', () => {
    const source = fs.readFileSync(
      path.resolve('src/app/commands/init.ts'),
      'utf-8',
    );
    expect(source).toContain(
      'throw new Error(`claude superpowers install failed: ${sup.error}`)',
    );
    expect(source).not.toContain('warn(`[WARN] Claude Superpowers: ${sup.error}`)');
  });
});
