import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildPackageUpdateArgs,
  buildOpenSpecUpdateArgs,
  createUpdatePlan,
  detectPackageScope,
  detectInstalledTargets,
  formatDependencyUpdateCommands,
  formatPackageUpdateCommand,
} from '../../src/app/commands/update.js';

describe('commands/update', () => {
  it('creates a JSON-safe update plan for selected agents', () => {
    const plan = createUpdatePlan(['codex']);
    expect(plan.agents).toEqual(['codex']);
    expect(plan.targets).toContainEqual({
      agent: 'codex',
      scope: 'global',
      projectPath: process.cwd(),
    });
    expect(plan.packageUpdate.enabled).toBe(false);
    expect(plan.skills.total).toBeGreaterThan(10);
    expect(plan.skills.names).toContain('superflow-verify');
    expect(plan.scripts.names).toContain('superflow-hook-guard.sh');
    expect(plan.hooks.names).toContain('codex-auto-backup-hook.sh');
  });

  it('creates an OpenCode update plan without native hooks', () => {
    const plan = createUpdatePlan(['opencode']);
    expect(plan.agents).toEqual(['opencode']);
    expect(plan.scripts.names).toContain('superflow-hook-guard.sh');
    expect(plan.hooks.names).toEqual([]);
  });

  it('includes npm package update command when requested', () => {
    const plan = createUpdatePlan(['codex'], 'global', process.cwd(), true);
    expect(plan.packageUpdate).toEqual({
      enabled: true,
      commands: [
        'npm install -g @chenmk/superflow@latest --registry https://registry.npmjs.org',
        'npm install -g @fission-ai/openspec@latest --registry https://registry.npmjs.org',
        'codex plugin add superpowers@openai-curated',
      ],
    });
  });

  it('builds package update args through official npm registry', () => {
    expect(buildPackageUpdateArgs('global')).toEqual([
      'install',
      '-g',
      '@chenmk/superflow@latest',
      '--registry',
      'https://registry.npmjs.org',
    ]);
    expect(buildPackageUpdateArgs('project')).toEqual([
      'install',
      '@chenmk/superflow@latest',
      '--registry',
      'https://registry.npmjs.org',
    ]);
    expect(formatPackageUpdateCommand('project')).toBe(
      'npm install @chenmk/superflow@latest --registry https://registry.npmjs.org'
    );
    expect(buildOpenSpecUpdateArgs()).toEqual([
      'install',
      '-g',
      '@fission-ai/openspec@latest',
      '--registry',
      'https://registry.npmjs.org',
    ]);
    expect(formatDependencyUpdateCommands(['claude'], 'global')).toContain(
      'claude plugin install superpowers@superpowers-marketplace'
    );
  });

  it('detects package scope from project dependencies', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-package-scope-'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ devDependencies: { '@chenmk/superflow': '^0.1.0' } })
    );

    expect(detectPackageScope(root, path.join(os.tmpdir(), 'global-sdd'))).toBe('project');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('detects installed project targets for update auto mode', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-update-'));
    fs.mkdirSync(path.join(root, '.codex', 'skills', 'superflow-pipeline'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, '.codex', 'skills', 'superflow-pipeline', 'SKILL.md'),
      'ok'
    );

    const targets = detectInstalledTargets(root, ['codex', 'claude']);

    expect(targets).toContainEqual({
      agent: 'codex',
      scope: 'project',
      projectPath: root,
    });
    fs.rmSync(root, { recursive: true, force: true });
  });
});
