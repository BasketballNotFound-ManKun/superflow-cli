import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateCommand } from '../../src/app/commands/update.js';
import { runCommand } from '../../src/platform/process.js';

vi.mock('../../src/platform/process.js', () => ({ runCommand: vi.fn() }));
let root: string;
let cli: string;
describe('dependency updates run in the new CLI', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-update-runtime-'));
    cli = path.join(root, '@chenmk/superflow/dist/app/cli.js');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, '// new runtime fixture');
    vi.mocked(runCommand).mockReset().mockImplementation(async (_command, args) => ({
      code: 0, stderr: '', stdout: args[0] === 'root' ? root : '',
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  it('does not execute stale plugin logic before the refreshed runtime', async () => {
    await updateCommand({ agent: 'codex', scope: 'global', withPackage: true, targetPath: root });
    const calls = vi.mocked(runCommand).mock.calls;
    expect(calls.map(([command]) => command)).toEqual(['npm', 'npm', process.execPath]);
    expect(calls[2][1][0]).toBe(cli);
    expect(calls[2][1]).toContain('--with-dependencies');
  });
  it('propagates child dependency failure instead of declaring update complete', async () => {
    vi.mocked(runCommand).mockImplementation(async (command, args) => ({
      code: command === process.execPath ? 1 : 0,
      stdout: args[0] === 'root' ? root : '', stderr: 'dependency update failed',
    }));
    await expect(updateCommand({ agent: 'codex', scope: 'global', withPackage: true, targetPath: root }))
      .rejects.toThrow('post-package refresh failed');
  });
});
