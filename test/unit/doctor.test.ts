import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectDoctor, countSddHookCommands } from '../../src/app/commands/doctor.js';

describe('commands/doctor', () => {
  it('auto scope checks both project and global scopes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-doctor-'));
    fs.mkdirSync(path.join(root, '.codex', 'skills', 'superflow-pipeline'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, '.codex', 'skills', 'superflow-pipeline', 'SKILL.md'),
      'ok'
    );

    const result = await collectDoctor({
      agent: 'codex',
      scope: 'auto',
      projectPath: root,
    });

    expect(result.scope).toBe('auto');
    expect(result.scopesChecked).toEqual(['project', 'global']);
    expect(result.checks.some((check) =>
      check.check === 'skill:codex:project:superflow-pipeline'
    )).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('checks OpenCode commands without requiring hook registration', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-doctor-opencode-'));
    fs.mkdirSync(path.join(root, 'openspec', 'changes'), { recursive: true });
    fs.mkdirSync(path.join(root, 'openspec', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(root, '.opencode', 'skills', 'superflow-pipeline'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, '.opencode', 'skills', 'superflow-pipeline', 'SKILL.md'),
      'ok'
    );
    fs.mkdirSync(path.join(root, '.opencode', 'commands'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.opencode', 'commands', 'superflow-pipeline.md'),
      'ok'
    );

    const result = await collectDoctor({
      agent: 'opencode',
      scope: 'project',
      projectPath: root,
    });

    expect(result.checks).toContainEqual({
      check: 'hooks:opencode:project',
      status: 'warn',
      message: 'native hook registration is not supported; use command aliases',
    });
    expect(result.checks).toContainEqual({
      check: 'prompt:opencode:project:superflow-pipeline.md',
      status: 'pass',
      message: path.join(root, '.opencode', 'commands', 'superflow-pipeline.md'),
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fails on unknown top-level fields in .sdd state files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-doctor-state-'));
    const stateDir = path.join(root, 'openspec', 'changes', 'demo', '.sdd');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, 'state.yaml'),
      [
        'workflow: full',
        'phase: verify',
        'canonical_spec: openspec-sdd',
        'technical_design: null',
        'build_mode: team-prompt',
        'tdd_mode: tdd',
        'isolation: worktree',
        'verify_mode: full',
        'auto_transition: true',
        'verify_result: pending',
        'verification_report: null',
        'branch_status: pending',
        'archived: false',
        'handoff_context: null',
        'handoff_hash: null',
        'created_at: 2026-06-18',
        'updated_at: 2026-06-18T00:00:00Z',
        'unknown_root_field: true',
        '',
      ].join('\n')
    );

    const result = await collectDoctor({
      agent: 'codex',
      scope: 'project',
      projectPath: root,
    });

    expect(result.failed).toBe(true);
    expect(result.checks).toContainEqual({
      check: 'superflow-state:demo',
      status: 'fail',
      message: expect.stringContaining('unknown_root_field'),
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('counts renamed superflow hook commands', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-doctor-hooks-'));
    const settingsFile = path.join(root, 'hooks.json');
    const hookDir = path.join(root, 'hooks');
    fs.mkdirSync(hookDir, { recursive: true });
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [{
                type: 'command',
                command: path.join(hookDir, 'superflow-enforce-hook.sh'),
              }],
            },
            {
              hooks: [{
                type: 'command',
                command: path.join(hookDir, 'superflow-hook-guard.sh'),
              }],
            },
            {
              hooks: [{
                type: 'command',
                command: path.join(hookDir, 'superflow-contract-hooks.sh'),
              }],
            },
            {
              hooks: [{
                type: 'command',
                command: path.join(hookDir, 'superflow-sql-sync-hook.py'),
              }],
            },
            {
              hooks: [{
                type: 'command',
                command: path.join(hookDir, 'superflow-delivery-check.sh'),
              }],
            },
            {
              hooks: [{
                type: 'command',
                command: path.join(hookDir, 'superflow-integration-evidence-hook.sh'),
              }],
            },
          ],
          UserPromptSubmit: [{
            hooks: [{
              type: 'command',
              command: path.join(hookDir, 'superflow-dependency-update-hook.sh'),
            }],
          }],
          PostToolUse: [{
            hooks: [{
              type: 'command',
              command: path.join(hookDir, 'codex-auto-backup-hook.sh'),
            }],
          }],
        },
      })
    );

    expect(countSddHookCommands(settingsFile, 'codex')).toBe(8);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
