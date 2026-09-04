import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildPackageUpdateArgs,
  buildOpenSpecUpdateArgs,
  buildPostPackageRefreshArgs,
  createUpdatePlan,
  detectPackageScope,
  detectInstalledTargets,
  formatDependencyUpdateCommands,
  formatPackageUpdateCommand,
  resolveUpdateLanguage,
  skillsRootForLanguage,
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
    expect(plan.skills.names).toContain('superflow-requirement-review');
    expect(plan.scripts.names).toContain('superflow-hook-guard.sh');
    expect(plan.hooks.names).toContain('codex-auto-backup-hook.sh');
    expect(plan.mcp).toEqual({ enabled: true, agents: ['codex'] });
  });

  it('preserves the installed English language during update', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-update-language-'));
    const state = path.join(root, 'state.json');
    fs.writeFileSync(state, JSON.stringify({
      version: '0.3.1',
      lastInit: new Date().toISOString(),
      language: 'en',
      completedSteps: [],
      platforms: {
        claude: { skills: [], scripts: [], hooks: [] },
        codex: { skills: [], scripts: [], hooks: [] },
      },
      backups: { settingsFiles: [], skills: [] },
      previousVersion: null,
    }));

    expect(resolveUpdateLanguage(undefined, {}, state)).toBe('en');
    expect(resolveUpdateLanguage('zh', { SUPERFLOW_LANG: 'en' }, state)).toBe('zh');
    expect(createUpdatePlan(['codex'], 'global', process.cwd(), false, undefined, 'global', 'en').language)
      .toBe('en');
    expect(skillsRootForLanguage('en')).toMatch(/assets\/skills-en$/);
    expect(skillsRootForLanguage('zh')).toMatch(/assets\/skills$/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('includes npm package update command when requested', () => {
    const plan = createUpdatePlan(['codex'], 'global', process.cwd(), true);
    expect(plan.packageUpdate).toEqual({
      enabled: true,
      commands: [
        'npm install -g @chenmk/superflow@latest --registry https://registry.npmjs.org',
        'npm install -g @fission-ai/openspec@latest --registry https://registry.npmjs.org',
        'codex plugin add superpowers@openai-api-curated',
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
    expect(formatDependencyUpdateCommands(['codex'], 'global')).toContain(
      'codex plugin add superpowers@openai-api-curated'
    );
  });

  it('re-enters the freshly installed CLI for a complete deployment refresh', () => {
    expect(buildPostPackageRefreshArgs({
      cliPath: '/opt/lib/node_modules/@chenmk/superflow/dist/app/cli.js',
      agents: ['codex', 'claude'],
      projectPath: '/workspace/demo',
      requestedScope: 'global',
      language: 'en',
      noHooks: false,
      json: true,
    })).toEqual([
      '/opt/lib/node_modules/@chenmk/superflow/dist/app/cli.js',
      'update',
      '/workspace/demo',
      '--agent',
      'codex,claude',
      '--scope',
      'global',
      '--language',
      'en',
      '--json',
    ]);
  });

  it('将 Claude Superpowers 更新失败纳入带包更新的失败结果', () => {
    const source = fs.readFileSync(
      path.resolve('src/app/commands/update.ts'),
      'utf-8',
    );
    expect(source).toContain(
      'failures.push(`claude superpowers update failed: ${result.error}`)',
    );
    expect(source).not.toContain('Claude Superpowers update skipped');
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
