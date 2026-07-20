import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createUninstallPlan,
  detectInstalledUninstallTargets,
  runUninstall,
} from '../../src/app/commands/uninstall.js';

describe('commands/uninstall', () => {
  it('plans uninstall targets under the provided project path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-uninstall-plan-'));
    const plan = createUninstallPlan(['codex'], false, 'project', root);

    expect(plan.projectPath).toBe(root);
    expect(plan.targets).toContain(
      path.join(root, '.codex', 'rules', 'superflow-phase-guard.md')
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('plans Codex Superpowers removal with the official marketplace', () => {
    const plan = createUninstallPlan(
      ['codex'],
      true,
      'global',
      process.cwd()
    );

    expect(plan.dependencyCommands).toContain(
      'codex plugin remove superpowers@openai-api-curated'
    );
  });

  it('detects only actually installed uninstall targets in auto mode', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-uninstall-auto-'));
    const skill = path.join(root, '.codex', 'skills', 'superflow-pipeline', 'SKILL.md');
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, 'ok');

    const targets = detectInstalledUninstallTargets(root, ['codex', 'claude']);

    expect(targets).toContainEqual(
      { agent: 'codex', scope: 'project', projectPath: root },
    );
    expect(targets).not.toContainEqual(
      { agent: 'claude', scope: 'project', projectPath: root },
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('detects OpenCode command aliases during uninstall auto mode', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-uninstall-opencode-'));
    const command = path.join(root, '.opencode', 'commands', 'superflow-pipeline.md');
    fs.mkdirSync(path.dirname(command), { recursive: true });
    fs.writeFileSync(command, 'ok');

    const targets = detectInstalledUninstallTargets(root, ['opencode']);

    expect(targets).toContainEqual(
      { agent: 'opencode', scope: 'project', projectPath: root },
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('detects legacy sdd skills so uninstall can clean old slash commands', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-uninstall-legacy-'));
    const skill = path.join(root, '.codex', 'skills', 'sdd-spec-pipeline', 'SKILL.md');
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, 'ok');

    const targets = detectInstalledUninstallTargets(root, ['codex']);

    expect(targets).toContainEqual(
      { agent: 'codex', scope: 'project', projectPath: root },
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns JSON-safe execution result for actual uninstall', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-uninstall-'));
    const target = path.join(root, '.codex', 'rules', 'superflow-phase-guard.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'rule');

    const result = await runUninstall({
      agents: ['codex'],
      scope: 'project',
      projectPath: root,
      dryRun: false,
      withDeps: false,
      quiet: true,
    });

    expect(result.ok).toBe(true);
    expect(result.summary.targetsProcessed).toBe(1);
    expect(result.summary.totalRemoved).toBeGreaterThan(0);
    expect(result.removed).toContain(target);
    expect(fs.existsSync(target)).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('removes legacy skill backup directories during uninstall', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-uninstall-backups-'));
    const backup = path.join(
      root,
      '.codex',
      'skills',
      'sdd-spec-pipeline.backup-123',
      'SKILL.md'
    );
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, 'ok');

    const result = await runUninstall({
      agents: ['codex'],
      scope: 'project',
      projectPath: root,
      dryRun: false,
      withDeps: false,
      quiet: true,
    });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.dirname(backup))).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('removes legacy Codex prompt aliases during uninstall', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-uninstall-prompts-'));
    const prompt = path.join(root, '.codex', 'prompts', 'sdd.md');
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.writeFileSync(prompt, 'old');

    const result = await runUninstall({
      agents: ['codex'],
      scope: 'project',
      projectPath: root,
      dryRun: false,
      withDeps: false,
      quiet: true,
    });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(prompt)).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('removes OpenCode command aliases during uninstall', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-uninstall-opencode-commands-'));
    const command = path.join(root, '.opencode', 'commands', 'superflow-pipeline.md');
    fs.mkdirSync(path.dirname(command), { recursive: true });
    fs.writeFileSync(command, 'ok');

    const result = await runUninstall({
      agents: ['opencode'],
      scope: 'project',
      projectPath: root,
      dryRun: false,
      withDeps: false,
      quiet: true,
    });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(command)).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
