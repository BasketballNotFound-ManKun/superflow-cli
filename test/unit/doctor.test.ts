import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  collectDoctor,
  countSddHookCommands,
} from '../../src/app/commands/doctor.js';
import { hasCodexSuperpowerSkill } from '../../src/domains/deps.js';

describe('commands/doctor', () => {
  it('逐项核验 Codex verify 所需的 Superpower 技能', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-superpowers-'));

    for (const skill of [
      'verification-before-completion',
      'requesting-code-review',
      'finishing-a-development-branch',
    ]) {
      const file = path.join(root, 'market', 'superpowers', 'v1', 'skills', skill, 'SKILL.md');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'ok');
      expect(hasCodexSuperpowerSkill(skill, root)).toBe(true);
    }
    expect(hasCodexSuperpowerSkill('missing-skill', root)).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

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
      language: 'en',
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

  it('checks executable versions and current MCP paths for all supported agents', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-doctor-runtime-'));
    const serverPath = path.join(root, 'mcp', 'server.js');
    fs.mkdirSync(path.dirname(serverPath), { recursive: true });
    fs.writeFileSync(serverPath, 'export {};\n');
    fs.mkdirSync(path.join(root, 'openspec', 'changes'), { recursive: true });
    fs.mkdirSync(path.join(root, 'openspec', 'specs'), { recursive: true });
    const result = await collectDoctor(
      {
        agent: 'both',
        scope: 'project',
        projectPath: root,
        language: 'en',
      },
      {
        mcpServerPath: serverPath,
        runCommand: async (command, args) => {
          if (args[0] === '--version') {
            return { code: 0, stdout: `${command} 1.0.0\n`, stderr: '' };
          }
          return {
            code: 0,
            stdout: `superflow ${serverPath}\n`,
            stderr: '',
          };
        },
      },
    );

    for (const agent of ['codex', 'claude']) {
      expect(result.checks).toContainEqual(
        expect.objectContaining({
          check: `${agent} CLI`,
          status: 'pass',
        }),
      );
      expect(result.checks).toContainEqual({
        check: `managed:mcp:${agent}`,
        status: 'pass',
        message: 'configured with the current runtime path',
      });
    }
    expect(
      result.checks
        .flatMap((check) => [check.message, check.remediation ?? ''])
        .join('\n'),
    ).not.toMatch(/[\p{Script=Han}]/u);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('turns malformed hook settings into an actionable failure', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-doctor-invalid-'));
    fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(root, '.codex', 'hooks.json'), '{invalid');
    const serverPath = path.join(root, 'server.js');
    fs.writeFileSync(serverPath, 'export {};\n');
    const result = await collectDoctor(
      {
        agent: 'codex',
        scope: 'project',
        projectPath: root,
        language: 'zh',
      },
      {
        mcpServerPath: serverPath,
        runCommand: async (command, args) => ({
          code: 0,
          stdout:
            args[0] === '--version'
              ? `${command} 1.0.0\n`
              : `superflow ${serverPath}\n`,
          stderr: '',
        }),
      },
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        check: 'hooks:codex:project',
        status: 'fail',
        message: expect.stringContaining('配置文件无法解析'),
        remediation: '修复配置 JSON 后运行 superflow update',
      }),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
});
