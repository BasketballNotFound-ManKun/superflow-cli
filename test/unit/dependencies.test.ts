import { describe, it, expect, vi } from 'vitest';
import {
  installOpenspec,
  initializeOpenspec,
  openspecInitArgs,
  installSuperpowers,
  installCodexSuperpowers,
  isCodexSuperpowersEnabled,
  installUnderstand,
  installApiDocChangelog,
} from '../../src/domains/deps.js';
import { runCommand } from '../../src/platform/process.js';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import os from 'os';
import path from 'path';

vi.mock('../../src/platform/process.js', () => ({
  runCommand: vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
}));

describe('core/dependencies', () => {
  it('installOpenspec 调用 npm install -g @fission-ai/openspec@latest', async () => {
    await installOpenspec();
    expect(runCommand).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', '@fission-ai/openspec@latest']
    );
  });

  it('openspecInitArgs 按 scope 和 agent 生成 init 参数', () => {
    const args = openspecInitArgs('/repo/demo', ['claude', 'codex'], 'project');
    expect(args).toEqual([
      'init',
      '/repo/demo',
      '--tools',
      'claude,codex',
      '--profile',
      'custom',
    ]);
  });

  it('initializeOpenspec 调用 openspec init 并传入工具列表', async () => {
    await initializeOpenspec('/repo/demo', ['codex'], 'project');
    expect(runCommand).toHaveBeenCalledWith(
      'openspec',
      ['init', '/repo/demo', '--tools', 'codex', '--profile', 'custom'],
      { cwd: '/repo/demo', timeout: 120_000 }
    );
  });

  it('initializeOpenspec 在旧版不支持 profile 时回退', async () => {
    vi.mocked(runCommand)
      .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'unknown option --profile' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });
    const result = await initializeOpenspec('/repo/demo', ['claude'], 'project');
    expect(result.ok).toBe(true);
    expect(runCommand).toHaveBeenLastCalledWith(
      'openspec',
      ['init', '/repo/demo', '--tools', 'claude'],
      { cwd: '/repo/demo', timeout: 120_000 }
    );
  });

  it('installSuperpowers 失败时返回 ok=false', async () => {
    vi.mocked(runCommand).mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'plugin not found' });
    const result = await installSuperpowers();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('plugin not found');
  });

  it('installSuperpowers 已安装时视为成功', async () => {
    vi.mocked(runCommand).mockResolvedValueOnce({
      code: 1,
      stdout: '',
      stderr: 'plugin already installed',
    });
    const result = await installSuperpowers();
    expect(result.ok).toBe(true);
  });

  it('installCodexSuperpowers 已安装时视为成功', async () => {
    vi.mocked(runCommand).mockResolvedValueOnce({
      code: 1,
      stdout: 'plugin already added',
      stderr: '',
    });
    const result = await installCodexSuperpowers();
    expect(result.ok).toBe(true);
  });

  it('installCodexSuperpowers 使用 Codex 官方 marketplace', async () => {
    await installCodexSuperpowers();
    expect(runCommand).toHaveBeenCalledWith(
      'codex',
      ['plugin', 'add', 'superpowers@openai-api-curated']
    );
  });

  it('仅当 Codex 配置中启用插件时才确认 Superpowers 已安装', () => {
    const root = fsSync.mkdtempSync(path.join(os.tmpdir(), 'superflow-plugin-config-'));
    const config = path.join(root, 'config.toml');
    fsSync.writeFileSync(
      config,
      '[plugins."superpowers@openai-api-curated"]\nenabled = true\n',
    );
    expect(isCodexSuperpowersEnabled(config)).toBe(true);
    fsSync.writeFileSync(config, '[plugins."superpowers@openai-api-curated"]\nenabled = false\n');
    expect(isCodexSuperpowersEnabled(config)).toBe(false);
    fsSync.rmSync(root, { recursive: true, force: true });
  });

  it('Codex 验证依赖插件不可用时阻塞初始化', async () => {
    const source = await fs.readFile(
      path.resolve('src/app/commands/init.ts'),
      'utf-8'
    );
    expect(source).toContain('throw new Error(`codex superpowers install failed');
    expect(source).not.toContain('继续部署 Superflow 核心能力');
  });

  it('依赖更新脚本使用 Codex 官方 marketplace', async () => {
    const script = await fs.readFile(
      path.resolve('assets/scripts/superflow-dependency-update-hook.sh'),
      'utf-8'
    );
    expect(script).toContain(
      'codex plugin add superpowers@openai-api-curated'
    );
    expect(script).toContain(
      'superflow update --agent "$agents" --scope global'
    );
    expect(script).toContain(
      '自动升级已完整更新 CLI、依赖、Skills、Hooks、规则和托管 MCP'
    );
    expect(script).toContain('rm -f "$STAMP" "$GLOBAL_STAMP"');
    expect(script).not.toContain('superpowers@openai-curated');
  });

  it('installUnderstand 失败时返回 ok=false', async () => {
    vi.mocked(runCommand).mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'plugin error' });
    const result = await installUnderstand();
    expect(result.ok).toBe(false);
  });

  it('installApiDocChangelog 用 fs.cp 复制', async () => {
    const spy = vi.spyOn(fs, 'cp').mockResolvedValue(undefined);
    await installApiDocChangelog();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
