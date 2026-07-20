import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  cliText,
  resolveCliLanguage,
  resolveRuntimeLanguage,
} from '../../src/domains/config/cli-help.js';

describe('core/cli-help', () => {
  it('uses SUPERFLOW_LANG as the default help language', () => {
    expect(resolveCliLanguage(['node', 'superflow'], { SUPERFLOW_LANG: 'en' }))
      .toBe('en');
  });

  it('lets --language override the environment for help text', () => {
    expect(resolveCliLanguage(
      ['node', 'superflow', '--language', 'zh', '--help'],
      { SUPERFLOW_LANG: 'en' }
    )).toBe('zh');
  });

  it('uses the installed language when no argument or environment override exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-language-'));
    const state = path.join(root, 'state.json');
    fs.writeFileSync(state, JSON.stringify({
      version: '0.3.1',
      lastInit: new Date().toISOString(),
      language: 'en',
      completedSteps: [],
      platforms: {},
      backups: { settingsFiles: [], skills: [] },
      previousVersion: null,
    }));

    expect(resolveRuntimeLanguage(undefined, {}, state)).toBe('en');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns English CLI help text', () => {
    const text = cliText('en');
    expect(text.programDescription).toContain('workflow CLI');
    expect(text.initDescription).toContain('Install');
    expect(text.dryRun).toContain('Print');
    expect(text.agentOption).toContain('target');
  });

  it('keeps English CLI help text free of Chinese characters', () => {
    const values = Object.values(cliText('en'));
    expect(values.filter((value) => /[\p{Script=Han}]/u.test(value))).toEqual([]);
  });

  it('returns Chinese CLI help text', () => {
    const text = cliText('zh');
    expect(text.programDescription).toContain('工作流');
    expect(text.initDescription).toContain('一站式安装');
    expect(text.dryRun).toContain('只打印');
    expect(text.agentOption).toContain('目标');
  });
});
