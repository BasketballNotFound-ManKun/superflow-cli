import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildInstallMessage,
  isGlobalInstall,
  resolveInstallLanguage,
  runPostinstall,
} from '../../scripts/postinstall.js';
import { migrateGlobalHooks } from '../../src/domains/hook-migration.js';

describe('scripts/postinstall', () => {
  it('detects global install from npm_config_global', () => {
    expect(isGlobalInstall({ npm_config_global: 'true' })).toBe(true);
    expect(isGlobalInstall({ npm_config_global: 'false' })).toBe(false);
    expect(isGlobalInstall({})).toBe(false);
  });

  it('resolves language from SUPERFLOW_LANG', () => {
    expect(resolveInstallLanguage({ SUPERFLOW_LANG: 'en' })).toBe('en');
    expect(resolveInstallLanguage({ SUPERFLOW_LANG: 'zh' })).toBe('zh');
  });

  it('falls back to system locale', () => {
    expect(resolveInstallLanguage({ LANG: 'en_US.UTF-8' })).toBe('en');
    expect(resolveInstallLanguage({ LC_ALL: 'zh_CN.UTF-8' })).toBe('zh');
  });

  it('defaults to Chinese when no locale is set', () => {
    expect(resolveInstallLanguage({})).toBe('zh');
  });

  it('includes version in Chinese install message', () => {
    const message = buildInstallMessage('0.2.3', 'zh');
    expect(message).toContain('@chenmk/superflow v0.2.3');
    expect(message).toContain('安装成功');
    expect(message).toContain('superflow init');
  });

  it('includes version in English install message', () => {
    const message = buildInstallMessage('0.2.3', 'en');
    expect(message).toContain('@chenmk/superflow v0.2.3');
    expect(message).toContain('installed successfully');
    expect(message).toContain('superflow init');
  });

  it('migrates known legacy global Hooks during npm global install', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-postinstall-'));
    const file = path.join(root, '.codex/hooks.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ hooks: { Stop: [{ hooks: [
      { command: 'bash scripts/hooks/stop-compile-check.sh' },
      { command: 'bash scripts/hooks/custom.sh' },
    ] }] } }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const original = fs.readFileSync(file, 'utf8');
      await runPostinstall({ npm_config_global: 'false' },
        { homeRoot: root, migrateGlobalHooks });
      expect(fs.readFileSync(file, 'utf8')).toBe(original);
      await runPostinstall({ npm_config_global: 'true', SUPERFLOW_LANG: 'zh' },
        { homeRoot: root, migrateGlobalHooks });
      const updated = fs.readFileSync(file, 'utf8');
      expect(updated).not.toContain('stop-compile-check.sh');
      expect(updated).toContain('custom.sh');
      const backups = fs.readdirSync(path.dirname(file)).filter((name) =>
        name.includes('.superflow-migrate-'));
      expect(backups).toHaveLength(1);
      await runPostinstall({ npm_config_global: 'true' },
        { homeRoot: root, migrateGlobalHooks });
      expect(fs.readFileSync(file, 'utf8')).toBe(updated);
      expect(fs.readdirSync(path.dirname(file)).filter((name) =>
        name.includes('.superflow-migrate-'))).toEqual(backups);
    } finally {
      log.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails global postinstall on damaged Hook config instead of claiming success', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-postinstall-invalid-'));
    const file = path.join(root, '.codex/hooks.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{broken');
    try {
      await expect(runPostinstall({ npm_config_global: 'true' },
        { homeRoot: root, migrateGlobalHooks })).rejects.toThrow('global Hook migration failed');
      expect(fs.readFileSync(file, 'utf8')).toBe('{broken');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
