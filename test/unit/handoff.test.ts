import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '../..');
const SCRIPT_DIR = path.join(
  ROOT,
  'assets',
  'skills',
  'superflow-pipeline',
  'scripts'
);
const HANDOFF = path.join(SCRIPT_DIR, 'superflow-handoff.sh');
const STATE = path.join(SCRIPT_DIR, 'superflow-state.sh');

let tmp: string;

async function write(file: string, content: string) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content);
}

async function makeChangeDir() {
  const change = path.join(tmp, 'openspec', 'changes', 'coupon-expiry-reminder');
  await write(path.join(change, 'proposal.md'), '# Proposal\n\nAdd coupon expiry reminder.\n');
  await write(
    path.join(change, 'api.md'),
    '# API\n\nPOST /admin/coupon-reminder-config\n'
  );
  await write(
    path.join(change, 'design.md'),
    [
      '# Design',
      '',
      '## Superpowers Technical Design Handoff',
      '',
      'OpenSpec/SDD remains canonical for WHAT and contracts.',
      '## Minimal Design Review',
      'New-item counts: tables 0; fields 0; APIs 0; services/components 0; caches 0; MQ/events 0; scheduled jobs 0; compatibility layers 0.',
      'Reuse evidence: extend the existing coupon service.',
      'Simplest implementation: one synchronous write path.',
      'Removed/rejected complexity: do not add cache, async flow, or compatibility layer.',
      'handoff_hash: pending',
      '',
    ].join('\n')
  );
  await write(
    path.join(change, 'tasks.md'),
    '# Tasks\n\n- [ ] P01 baseline ([prompt/p01.md](prompt/p01.md))\n'
  );
  await write(
    path.join(change, 'tests.md'),
    '# Tests\n\nRED then GREEN. Interface automation command: curl /admin/coupon-reminder-config\n'
  );
  await write(
    path.join(change, 'traceability-matrix.md'),
    '# Traceability\n\n| Requirement | Prompt |\n|---|---|\n| R1 | prompt/p01.md |\n'
  );
  await write(path.join(change, 'review-checklist.md'), '# Review Checklist\n');
  await write(
    path.join(change, 'source-code-audit.md'),
    [
      '# Source Code Audit',
      '',
      '## Source Fact Freeze Card',
      '',
      '| Business conclusion | understand-anything locator | Data model | All writers | Real user entry | Current callers | Legacy conflict | DB check or skip reason | Conclusion level | owner decision |',
      '|---|---|---|---|---|---|---|---|---|---|',
      '| Reuse the current route | graph locator | config row | coupon service | admin UI | current controller | legacy path unmounted | DB check skipped with source evidence | owner-confirmed | owner decision recorded |',
      '',
      'Evidence classifications: current; legacy; unmounted; data-model-only; owner-confirmed; blocked.',
      '',
      '## Question Eligibility Gate',
      '',
      'Source search complete. Mapper and SQL search complete. Frontend mini-program H5 caller search complete. Sibling repo search complete. DB check skip reason recorded.',
      '',
      '## Conflict Audit',
      '',
      'List/orderIds/batchInsert/one-to-many signals were checked against the real entry.',
      '',
    ].join('\n')
  );
  await write(
    path.join(change, 'sdd-quality-gate.md'),
    [
      '# Quality Gate',
      '',
      'Document completeness: proposal.md, api.md, design.md, tasks.md, tests.md.',
      'Minimal Design Review: PASS.',
      'technical_design: docs/superpowers/specs/2026-06-19-coupon-expiry-reminder-technical-design.md',
      'handoff_hash: pending',
      '',
    ].join('\n')
  );
  await write(
    path.join(change, 'test-report.md'),
    [
      '# Test Report',
      '',
      'RED 失败证据: pending.',
      'GREEN 通过证据: pending.',
      '接口自动化: curl pending.',
      'DB 数据库 SELECT pending.',
      'superflow-verify-integration / superflow-delivery-check / superflow-test-report-lint pending.',
      'handoff_hash: pending',
      '',
    ].join('\n')
  );
  await write(path.join(change, 'specs', 'coupon-expiry-reminder', 'spec.md'), '# Spec\n');
  await write(
    path.join(
      change,
      'docs',
      'superpowers',
      'specs',
      '2026-06-19-coupon-expiry-reminder-technical-design.md'
    ),
    [
      '# Superpowers Technical Design',
      '',
      'OpenSpec/SDD remains canonical and must not be overwritten.',
      '',
      '## Minimal Design Review',
      '',
      'New-item counts: tables 0; fields 0; APIs 0; services/components 0; caches 0; MQ/events 0; scheduled jobs 0; compatibility layers 0.',
      'Reuse evidence: extend the existing coupon service.',
      'Simplest implementation: one synchronous write path.',
      'Removed/rejected complexity: do not add cache, async flow, or compatibility layer.',
      '',
      '## Architecture Boundary And Call Direction',
      '',
      '| Flow step | Direction | Owner module | Existing entry/exit | Proposed entry/exit | Allowed? | Evidence anchor | Forbidden shortcut |',
      '|---|---|---|---|---|---|---|---|',
      '| Admin updates config | UI -> API | coupon-service | controller | controller | yes | api.md | gateway orchestration |',
      '',
      '## Field And Status Reverse Impact',
      '',
      '| Field/status | Write/update points | Read/filter points | Derived/sync points |',
      '|---|---|---|---|',
      '| coupon_status | service | mapper | scheduler |',
      '',
    ].join('\n')
  );
  await write(
    path.join(change, 'prompt', 'implementation.md'),
    [
      '# Implementation',
      '',
      'OpenSpec/SDD canonical source boundary.',
      'Superpower 技术详设继承: docs/superpowers/specs/2026-06-19-coupon-expiry-reminder-technical-design.md',
      '字段/状态反向影响面: inherited.',
      '上下文防漂移: handoff_hash pending and sdd-context.',
      '',
    ].join('\n')
  );
  await write(
    path.join(change, 'prompt', 'p01.md'),
    '# P01\n\nSuperpower 技术详设继承. 上下文防漂移 handoff_hash pending.\n'
  );
  return change;
}

async function replacePendingHash(change: string) {
  const hash = fs
    .readFileSync(path.join(change, '.sdd', 'handoff', 'sdd-context.sha256'), 'utf8')
    .trim();
  for (const rel of [
    'design.md',
    'sdd-quality-gate.md',
    'test-report.md',
    'prompt/implementation.md',
    'prompt/p01.md',
  ]) {
    const file = path.join(change, rel);
    const text = fs.readFileSync(file, 'utf8').replaceAll('pending', hash);
    fs.writeFileSync(file, text);
  }
}

describe('superflow-handoff.sh', () => {
  beforeEach(async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'superflow-handoff-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it('preserves contract design_doc when technical_design exists', async () => {
    const change = await makeChangeDir();
    await execFileAsync('bash', [STATE, 'init', change, 'docs']);
    await execFileAsync('bash', [STATE, 'set', change, 'design_doc', 'design.md']);

    await execFileAsync('bash', [HANDOFF, change, '--write']);

    const designDoc = await execFileAsync('bash', [STATE, 'get', change, 'design_doc']);
    const technicalDesign = await execFileAsync('bash', [
      STATE,
      'get',
      change,
      'technical_design',
    ]);
    expect(designDoc.stdout.trim()).toBe('design.md');
    expect(technicalDesign.stdout.trim()).toContain('docs/superpowers/specs/');
  });

  it('refreshes handoff and runs guard self-check when hash is already recorded', async () => {
    const change = await makeChangeDir();
    await execFileAsync('bash', [HANDOFF, change, '--write']);
    await replacePendingHash(change);

    const result = await execFileAsync('bash', [HANDOFF, change, '--refresh']);

    expect(result.stdout).toContain('wrote ');
    expect(result.stdout).toContain('guard docs passed');
    const designDoc = await execFileAsync('bash', [STATE, 'get', change, 'design_doc']);
    expect(designDoc.stdout.trim()).toBe('design.md');
  });

  it('refreshes docs-only handoff without a technical design directory', async () => {
    const change = await makeChangeDir();
    await fs.promises.rm(path.join(change, 'docs'), {
      recursive: true,
      force: true,
    });
    await execFileAsync('bash', [HANDOFF, change, '--write']);
    await replacePendingHash(change);

    const result = await execFileAsync('bash', [HANDOFF, change, '--refresh']);

    expect(result.stdout).toContain('guard docs passed');
    const technicalDesign = await execFileAsync('bash', [
      STATE,
      'get',
      change,
      'technical_design',
    ]);
    expect(technicalDesign.stdout.trim()).toBe('null');
  });
});
