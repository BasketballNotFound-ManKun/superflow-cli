import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateCommand } from '../../src/app/commands/update.js';
import { runCommand } from '../../src/platform/process.js';

vi.mock('../../src/platform/process.js', () => ({ runCommand: vi.fn() }));
let root: string;
let cli: string;
const fingerprint = createHash('sha256').update('// new runtime fixture').digest('hex');
function identity(packageRoot = path.join(root, '@chenmk/superflow')) {
  return JSON.stringify({
    schemaVersion: 'superflow.installation.v1', version: '0.6.2',
    packageRoot: fs.realpathSync(packageRoot),
    nodePath: process.execPath, nodeVersion: process.versions.node,
    cliSha256: fingerprint, buildCommit: null,
  });
}
describe('dependency updates run in the new CLI', () => {
  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-update-runtime-')));
    cli = path.join(root, '@chenmk/superflow/dist/app/cli.js');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, '// new runtime fixture');
    fs.writeFileSync(path.join(root, '@chenmk/superflow/package.json'), JSON.stringify({ version: '0.6.2' }));
    vi.mocked(runCommand).mockReset().mockImplementation(async (command, args) => ({
      code: 0, stderr: '', stdout: args.includes('root') ? root : command === 'superflow' ? identity() : '',
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
    expect(calls.map(([command]) => command)).toEqual([process.execPath, process.execPath, process.execPath, 'superflow']);
    expect(calls[0][1][0]).toMatch(/npm-cli\.js$/);
    expect(calls[2][1][0]).toBe(cli);
    expect(calls[2][1]).toContain('--with-dependencies');
    expect(calls[0][2]?.env?.SUPERFLOW_INSTALL_OWNER).toBe('update');
  });
  it('rejects a stale PATH entry after the new package and assets are installed', async () => {
    vi.mocked(runCommand).mockImplementation(async (command, args) => ({
      code: 0, stderr: '', stdout: args.includes('root') ? root
        : command === 'superflow' ? '0.6.0' : '',
    }));
    await expect(updateCommand({ agent: 'codex', scope: 'global', withPackage: true, targetPath: root }))
      .rejects.toThrow(/PATH/);
  });
  it('rejects another installation even when its semantic version is identical', async () => {
    vi.mocked(runCommand).mockImplementation(async (command, args) => ({
      code: 0, stderr: '', stdout: args.includes('root') ? root
        : command === 'superflow' && args[0] === '--version' ? '0.6.2'
        : command === 'superflow' ? JSON.stringify({
          schemaVersion: 'superflow.installation.v1', version: '0.6.2',
          packageRoot: path.join(root, 'other-install'), nodePath: process.execPath,
        }) : '',
    }));
    await expect(updateCommand({ agent: 'codex', scope: 'global', withPackage: true, targetPath: root }))
      .rejects.toThrow(/PATH/);
  });
  it('propagates child dependency failure instead of declaring update complete', async () => {
    vi.mocked(runCommand).mockImplementation(async (command, args) => ({
      code: args[0] === cli ? 1 : 0,
      stdout: args.includes('root') ? root : '', stderr: 'dependency update failed',
    }));
    await expect(updateCommand({ agent: 'codex', scope: 'global', withPackage: true, targetPath: root }))
      .rejects.toThrow('post-package refresh failed');
  });
  it('installs a project package in the selected project and verifies its local entry', async () => {
    const localRoot = path.join(root, 'node_modules/@chenmk/superflow');
    const localCli = path.join(localRoot, 'dist/app/cli.js');
    fs.mkdirSync(path.dirname(localCli), { recursive: true });
    fs.writeFileSync(localCli, '// new runtime fixture');
    fs.writeFileSync(path.join(localRoot, 'package.json'), JSON.stringify({ version: '0.6.2' }));
    vi.mocked(runCommand).mockImplementation(async (_command, args) => ({
      code: 0, stderr: '', stdout: args.includes('--runtime-only') ? identity(localRoot) : '',
    }));
    await updateCommand({ agent: 'codex', scope: 'project', withPackage: true, targetPath: root });
    const calls = vi.mocked(runCommand).mock.calls;
    expect(calls[0][2]?.cwd).toBe(root);
    expect(calls.some(([, args]) => args.includes('root'))).toBe(false);
    expect(calls.at(-1)?.slice(0, 2)).toEqual([process.execPath,
      [localCli, 'doctor', '--runtime-only', '--json']]);
  });
});
