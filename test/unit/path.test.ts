import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import { home, claudeSkills, claudeScripts, claudeSettings, stateFile } from '../../src/platform/paths.js';

describe('utils/path', () => {
  it('home 应该是 os.homedir() 的值', () => {
    expect(home).toBe(os.homedir());
  });

  it('claudeSkills 应该是 ~/.claude/skills', () => {
    expect(claudeSkills).toBe(path.join(os.homedir(), '.claude', 'skills'));
  });

  it('claudeScripts 应该是 ~/.claude/scripts', () => {
    expect(claudeScripts).toBe(path.join(os.homedir(), '.claude', 'scripts'));
  });

  it('claudeSettings 应该是 ~/.claude/settings.json', () => {
    expect(claudeSettings).toBe(path.join(os.homedir(), '.claude', 'settings.json'));
  });

  it('stateFile 应该是 ~/.sdd-state.json', () => {
    expect(stateFile).toBe(path.join(os.homedir(), '.sdd-state.json'));
  });
});
