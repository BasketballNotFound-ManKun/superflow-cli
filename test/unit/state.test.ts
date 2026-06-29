import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadState, saveState, initState } from '../../src/core/state.js';

const TEST_STATE = path.join(os.tmpdir(), 'sdd-test-state-' + Date.now() + '.json');

describe('core/state', () => {
  afterEach(() => {
    if (fs.existsSync(TEST_STATE)) fs.unlinkSync(TEST_STATE);
  });

  it('loadState 文件不存在返回 null', () => {
    expect(loadState(TEST_STATE)).toBeNull();
  });

  it('saveState + loadState round-trip', () => {
    const state = initState('0.1.0', 'claude');
    state.platforms.claude.skills = ['superflow-clarify'];
    saveState(TEST_STATE, state);
    const loaded = loadState(TEST_STATE);
    expect(loaded?.version).toBe('0.1.0');
    expect(loaded?.platforms.claude.skills).toContain('superflow-clarify');
  });

  it('initState 创建默认结构', () => {
    const state = initState('1.0.0', 'claude');
    expect(state.version).toBe('1.0.0');
    expect(state.completedSteps).toEqual([]);
    expect(state.platforms.claude.skills).toEqual([]);
    expect(state.backups.settingsFiles).toEqual([]);
    expect(state.backups.skills).toEqual([]);
  });

  it('loadState 顶层字段缺失抛错', () => {
    fs.writeFileSync(TEST_STATE, JSON.stringify({ broken: true }));
    expect(() => loadState(TEST_STATE)).toThrow();
  });
});
