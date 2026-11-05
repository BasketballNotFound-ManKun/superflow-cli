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
import { loadState } from '../../src/domains/state.js';
import { migrateGlobalHooks } from '../../src/domains/hook-migration.js';
import { verifyActiveInstallation } from '../../src/platform/npm-runtime.js';

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
        { homeRoot: root, loadState, migrateGlobalHooks, runCommand: async () => ({ code: 1, stdout: "", stderr: "" }) });
      expect(fs.readFileSync(file, 'utf8')).toBe(original);
      await runPostinstall({ npm_config_global: 'true', SUPERFLOW_LANG: 'zh' },
        { homeRoot: root, loadState, migrateGlobalHooks, runCommand: async () => ({ code: 1, stdout: "", stderr: "" }) });
      const updated = fs.readFileSync(file, 'utf8');
      expect(updated).not.toContain('stop-compile-check.sh');
      expect(updated).toContain('custom.sh');
      const backups = fs.readdirSync(path.dirname(file)).filter((name) =>
        name.includes('.superflow-migrate-'));
      expect(backups).toHaveLength(1);
      await runPostinstall({ npm_config_global: 'true' },
        { homeRoot: root, loadState, migrateGlobalHooks, runCommand: async () => ({ code: 1, stdout: "", stderr: "" }) });
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
        { homeRoot: root, loadState, migrateGlobalHooks, runCommand: async () => ({ code: 1, stdout: "", stderr: "" }) })).rejects.toThrow('global Hook migration failed');
      expect(fs.readFileSync(file, 'utf8')).toBe('{broken');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});


describe('npm installation asset handoff', () => {
  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-npm-sync-'));
    const runCommand = vi.fn(async (_command: string, _args: string[], _options?: object) => ({ code: 0, stdout: '', stderr: '' }));
    const runtime = { homeRoot: root, loadState, runCommand, migrateGlobalHooks,
      verifyActiveInstallation: vi.fn(async () => {}) };
    return { root, runCommand, runtime };
  }

  it('automatically initializes only the detected host without touching a project', async () => {
    const f = fixture();
    f.runCommand.mockImplementation(async (command) => ({ code: command === 'codex' ? 1 : 0, stdout: '', stderr: '' }));
    try {
      await runPostinstall({ npm_config_global: 'true', SUPERFLOW_LANG: 'en' }, f.runtime);
      const call = f.runCommand.mock.calls.find(([command]) => command === process.execPath);
      expect(call).toBeDefined();
      expect(call![1]).toEqual(expect.arrayContaining(['init', f.root, '--agent', 'claude', '--scope', 'global', '--language', 'en', '--no-scan', '--no-openspec-init', '--yes']));
      expect(call![1][0]).toMatch(/dist[/\\]app[/\\]cli.js$/);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  });

  it('refreshes registered installations using their language and host selection', async () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, '.sdd-state.json'), JSON.stringify({
      version: '0.6.2', language: 'en', completedSteps: [],
      platforms: { codex: { scope: 'project', skills: ['superflow'], scripts: [], hooks: [] } },
      managedProjects: { projects: [{ root: f.root, agents: ['codex'], scope: 'project', hooks: [], registeredAt: '2026-10-21' }] },
    }));
    try {
      await runPostinstall({ npm_config_global: 'true', LANG: 'zh_CN' }, f.runtime);
      expect(f.runCommand).toHaveBeenCalledWith(process.execPath,
        expect.arrayContaining(['update', '--agent', 'codex', '--scope', 'auto', '--language', 'en', '--with-dependencies']), expect.anything());
      expect(f.runCommand.mock.calls.some(([, args]) => args.includes('init'))).toBe(false);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  });

  it.each([{ npm_command: 'exec' }, { SUPERFLOW_INSTALL_OWNER: 'update' }])('leaves deployment to the caller: %j', async (extra) => {
    const f = fixture();
    try {
      await runPostinstall({ npm_config_global: 'true', ...extra }, f.runtime);
      expect(f.runCommand).not.toHaveBeenCalled();
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  });

  it('does not claim asset synchronization when no host is available', async () => {
    const f = fixture();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    f.runCommand.mockResolvedValue({ code: 1, stdout: '', stderr: '' });
    try {
      await runPostinstall({ npm_config_global: 'true' }, f.runtime);
      expect(f.runCommand.mock.calls.map(([command]) => command)).toEqual(['claude', 'codex']);
      expect(log.mock.calls.flat().join(' ')).toContain('superflow init');
      expect(log.mock.calls.flat().join(' ')).not.toContain('配套组件已同步');
    } finally { log.mockRestore(); fs.rmSync(f.root, { recursive: true, force: true }); }
  });

  it('refuses to replace an unavailable project installation with a global one', async () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, '.sdd-state.json'), JSON.stringify({
      version: '0.6.2', completedSteps: [],
      platforms: { codex: { scope: 'project', skills: ['superflow'] } },
      managedProjects: { projects: [{ root: path.join(f.root, 'missing'), agents: ['codex'], scope: 'project', hooks: [], registeredAt: '2026-10-21' }] },
    }));
    try {
      await expect(runPostinstall({ npm_config_global: 'true' }, f.runtime)).rejects.toThrow(/project unavailable/);
      expect(f.runCommand).not.toHaveBeenCalled();
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  });

  it('reports an incomplete installation when the delegated deployment fails', async () => {
    const f = fixture();
    f.runCommand.mockImplementation(async (command) => ({ code: command === process.execPath ? 1 : 0, stdout: '', stderr: 'deployment failed' }));
    try {
      await expect(runPostinstall({ npm_config_global: 'true' }, f.runtime)).rejects.toThrow(/deployment failed/);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  });
  it('does not deploy host assets when PATH still selects another installation', async () => {
    const f = fixture();
    f.runCommand.mockImplementation(async (command) => ({
      code: 0, stderr: '', stdout: command === 'superflow'
        ? JSON.stringify({ schemaVersion: 'superflow.installation.v1', version: '0.6.2', packageRoot: '/another/installation' }) : '',
    }));
    try {
      await expect(runPostinstall({ npm_config_global: 'true' }, { ...f.runtime, verifyActiveInstallation })).rejects.toThrow(/PATH/);
      expect(f.runCommand.mock.calls.some(([, args]) => args.includes('init') || args.includes('update'))).toBe(false);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  });
});
