import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectStatus } from '../../src/app/commands/status.js';

describe('commands/status', () => {
  it('collects active SDD changes with phase, tasks, and next skill', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-status-'));
    const changeDir = path.join(root, 'openspec', 'changes', 'demo');
    fs.mkdirSync(path.join(changeDir, '.sdd'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '- [x] done\n- [ ] pending\n');
    fs.writeFileSync(path.join(changeDir, '.sdd', 'state.yaml'), [
      'workflow: full',
      'phase: implement',
      'build_mode: team-prompt',
      'verify_mode: null',
      'verify_result: pending',
      'archived: false',
      '',
    ].join('\n'));

    const result = await collectStatus(root);

    expect(result.changes).toEqual([
      expect.objectContaining({
        name: 'demo',
        phase: 'implement',
        tasksCompleted: 1,
        tasksTotal: 2,
        nextCommand: 'superflow implement demo',
        nextReason: '当前处于 implement 阶段，还有 1 个任务未完成。',
        risks: expect.arrayContaining([
          expect.objectContaining({ code: 'REVIEW_MODE_MISSING' }),
          expect.objectContaining({ code: 'TASKS_INCOMPLETE' }),
        ]),
      }),
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('routes design phase to superflow design command', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-status-design-'));
    const changeDir = path.join(root, 'openspec', 'changes', 'demo');
    fs.mkdirSync(path.join(changeDir, '.sdd'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '- [ ] design pending\n');
    fs.writeFileSync(path.join(changeDir, '.sdd', 'state.yaml'), [
      'workflow: full',
      'phase: design',
      'build_mode: null',
      'review_mode: standard',
      'verify_mode: null',
      'verify_result: pending',
      'archived: false',
      '',
    ].join('\n'));

    const result = await collectStatus(root);

    expect(result.changes).toEqual([
      expect.objectContaining({
        name: 'demo',
        phase: 'design',
        nextCommand: 'superflow design demo',
      }),
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
