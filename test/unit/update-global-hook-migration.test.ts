import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as stateModule from '../../src/domains/state.js';
import { updateCommand } from '../../src/app/commands/update.js';

vi.mock('../../src/app/commands/mcp.js', () => ({
  manageMcpIntegration: vi.fn(),
}));

describe('global update legacy Hook migration', () => {
  it('clears known old registrations for both hosts and is idempotent', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-global-hook-update-'));
    const codex = path.join(root, '.codex/hooks.json');
    const claude = path.join(root, '.claude/settings.json');
    for (const file of [codex, claude]) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ hooks: { Stop: [{ hooks: [
        { command: 'bash scripts/hooks/stop-compile-check.sh' },
        { command: 'bash scripts/hooks/company-check.sh' },
      ] }] } }));
    }
    vi.stubEnv('HOME', root);
    vi.spyOn(stateModule, 'loadState').mockReturnValue(null);
    vi.spyOn(stateModule, 'saveState').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await updateCommand({ agent: 'both', scope: 'global', targetPath: root, json: true });
      for (const file of [codex, claude]) {
        const config = JSON.parse(fs.readFileSync(file, 'utf8'));
        const commands = Object.values(config.hooks).flatMap((entries: any) =>
          entries.flatMap((entry: any) => entry.hooks.map((hook: any) => hook.command)));
        expect(commands).not.toContain('bash scripts/hooks/stop-compile-check.sh');
        expect(commands).toContain('bash scripts/hooks/company-check.sh');
        expect(fs.readdirSync(path.dirname(file)).some((name) => name.includes('.superflow-migrate-'))).toBe(true);
      }
      const before = [codex, claude].map((file) => fs.readFileSync(file, 'utf8'));
      const backups = [codex, claude].map((file) =>
        fs.readdirSync(path.dirname(file)).filter((name) => name.includes('.superflow-migrate-')).length);
      await updateCommand({ agent: 'both', scope: 'global', targetPath: root, json: true });
      expect([codex, claude].map((file) => fs.readFileSync(file, 'utf8'))).toEqual(before);
      expect([codex, claude].map((file) =>
        fs.readdirSync(path.dirname(file)).filter((name) => name.includes('.superflow-migrate-')).length)).toEqual(backups);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('project update cleans global stale hooks without deleting project custom hooks', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-project-hook-update-'));
    const project = path.join(root, 'project');
    const globalFile = path.join(root, '.codex/hooks.json');
    const projectFile = path.join(project, '.codex/hooks.json');
    for (const file of [globalFile, projectFile]) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    }
    fs.writeFileSync(globalFile, JSON.stringify({ hooks: { Stop: [{ hooks: [
      { command: 'bash scripts/hooks/stop-compile-check.sh' },
      { command: 'bash scripts/hooks/global-custom.sh' },
    ] }] } }));
    fs.writeFileSync(projectFile, JSON.stringify({ hooks: { Stop: [{ hooks: [
      { command: 'bash scripts/hooks/project-custom.sh' },
    ] }] } }));
    vi.stubEnv('HOME', root);
    vi.spyOn(stateModule, 'loadState').mockReturnValue(null);
    vi.spyOn(stateModule, 'saveState').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await updateCommand({ agent: 'codex', scope: 'project', targetPath: project, json: true });
      expect(fs.readFileSync(globalFile, 'utf8')).not.toContain('stop-compile-check.sh');
      expect(fs.readFileSync(globalFile, 'utf8')).toContain('global-custom.sh');
      expect(fs.readFileSync(projectFile, 'utf8')).toContain('project-custom.sh');
      expect(fs.readFileSync(projectFile, 'utf8')).toContain('superflow-java-stop-hook.sh');
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails update when global migration cannot safely read the Hook config', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-invalid-hook-update-'));
    const project = path.join(root, 'project');
    fs.mkdirSync(project);
    const file = path.join(root, '.codex/hooks.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{broken');
    vi.stubEnv('HOME', root);
    vi.spyOn(stateModule, 'loadState').mockReturnValue(null);
    vi.spyOn(stateModule, 'saveState').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await expect(updateCommand({ agent: 'codex', scope: 'project', targetPath: project, json: true }))
        .rejects.toThrow('global codex Hook migration failed');
      expect(fs.readFileSync(file, 'utf8')).toBe('{broken');
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('honors explicit no-hooks without changing legacy global registrations', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-no-hooks-update-'));
    const file = path.join(root, '.codex/hooks.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const original = JSON.stringify({ hooks: { Stop: [{ hooks: [
      { command: 'bash scripts/hooks/stop-compile-check.sh' },
    ] }] } });
    fs.writeFileSync(file, original);
    vi.stubEnv('HOME', root);
    vi.spyOn(stateModule, 'loadState').mockReturnValue(null);
    vi.spyOn(stateModule, 'saveState').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await updateCommand({ agent: 'codex', scope: 'global', targetPath: root, noHooks: true, json: true });
      expect(fs.readFileSync(file, 'utf8')).toBe(original);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
