import { describe, it, expect, vi } from 'vitest';
import {
  installOpenspec,
  initializeOpenspec,
  openspecInitArgs,
  installSuperpowers,
  installCodexSuperpowers,
  selectCodexSuperpowers,
  inspectCodexSuperpowers,
  updateClaudeSuperpowers,
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
  it('发现官方新渠道最新版，不选择同名第三方或预发布插件', () => {
    expect(selectCodexSuperpowers({ available: [
      { name: 'superpowers', pluginId: 'superpowers@unknown', marketplaceName: 'unknown', version: '99.0.0' },
      { name: 'superpowers', pluginId: 'superpowers@openai-curated-remote', marketplaceName: 'openai-curated-remote', version: '7.0.0-beta.1' },
      { name: 'superpowers', pluginId: 'superpowers@openai-api-curated', marketplaceName: 'openai-api-curated', version: '6.3.0' },
      { name: 'superpowers', pluginId: 'superpowers@openai-curated-remote', marketplaceName: 'openai-curated-remote', version: '6.4.1' },
    ] })).toMatchObject({ pluginId: 'superpowers@openai-curated-remote', version: '6.4.1' });
    expect(() => selectCodexSuperpowers({ available: [] })).toThrow();
  });

  it('接受官方市场的内容哈希版本，但拒绝不明确的多个哈希', () => {
    const plugin = {
      name: 'superpowers', pluginId: 'superpowers@openai-api-curated',
      marketplaceName: 'openai-api-curated', version: '1dc19589',
      installed: true, enabled: true,
    };
    expect(selectCodexSuperpowers({ installed: [plugin] })).toMatchObject(plugin);
    expect(() => selectCodexSuperpowers({ available: [
      { ...plugin, installed: false, enabled: false },
      { ...plugin, version: 'aaaaaaaa', installed: false, enabled: false },
    ] })).toThrow();
    expect(() => selectCodexSuperpowers({
      installed: [plugin],
      available: [{ ...plugin, version: 'aaaaaaaa', installed: false, enabled: false }],
    })).toThrow();
  });

  it('从官方内容哈希缓存核对 Codex 必备技能', async () => {
    const root = fsSync.mkdtempSync(path.join(os.tmpdir(), 'superflow-plugin-hash-'));
    for (const skill of ['verification-before-completion', 'requesting-code-review', 'finishing-a-development-branch']) {
      const file = path.join(root, 'openai-api-curated/superpowers/1dc19589/skills', skill, 'SKILL.md');
      fsSync.mkdirSync(path.dirname(file), { recursive: true });
      fsSync.writeFileSync(file, 'skill');
    }
    const run = vi.fn().mockResolvedValue({ code: 0, stderr: '', stdout: JSON.stringify({ installed: [{
      name: 'superpowers', pluginId: 'superpowers@openai-api-curated',
      marketplaceName: 'openai-api-curated', version: '1dc19589',
      installed: true, enabled: true,
    }] }) });
    expect((await inspectCodexSuperpowers(run, root)).missing).toEqual([]);
    fsSync.rmSync(root, { recursive: true, force: true });
  });

  it('新版远端插件不需要 config.toml 启用段', async () => {
    const root = fsSync.mkdtempSync(path.join(os.tmpdir(), 'superflow-plugin-new-'));
    for (const skill of ['verification-before-completion', 'requesting-code-review', 'finishing-a-development-branch']) {
      const file = path.join(root, 'openai-curated-remote/superpowers/6.4.1/skills', skill, 'SKILL.md');
      fsSync.mkdirSync(path.dirname(file), { recursive: true });
      fsSync.writeFileSync(file, 'skill');
    }
    expect((await inspectCodexSuperpowers(inventory(), root)).missing).toEqual([]);
    expect((await inspectCodexSuperpowers(inventory(false), root)).missing).toHaveLength(3);
    fsSync.rmSync(root, { recursive: true, force: true });
  });
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

  it('installCodexSuperpowers 不能把未确认版本的已安装提示当成升级成功', async () => {
    mockCodexCatalog();
    vi.mocked(runCommand).mockResolvedValueOnce({
      code: 1,
      stdout: 'plugin already added',
      stderr: '',
    });
    const result = await installCodexSuperpowers();
    expect(result.ok).toBe(false);
  });

  it('installCodexSuperpowers 使用 Codex 官方 marketplace', async () => {
    mockCodexCatalog();
    vi.mocked(runCommand).mockResolvedValueOnce({ code: 0, stderr: '', stdout: JSON.stringify({
      pluginId: 'superpowers@openai-curated-remote', version: '6.4.1',
    }) });
    expect((await installCodexSuperpowers()).ok).toBe(true);
    expect(runCommand).toHaveBeenCalledWith(
      'codex',
      ['plugin', 'add', 'superpowers@openai-curated-remote', '--json']
    );
  });

  it('安装官方哈希版本时核对返回的精确身份', async () => {
    const plugin = {
      name: 'superpowers', pluginId: 'superpowers@openai-api-curated',
      marketplaceName: 'openai-api-curated', version: '1dc19589',
    };
    vi.mocked(runCommand).mockResolvedValueOnce({
      code: 0, stderr: '', stdout: JSON.stringify({ available: [plugin] }),
    });
    vi.mocked(runCommand).mockResolvedValueOnce({
      code: 0, stderr: '', stdout: JSON.stringify({
        pluginId: plugin.pluginId, version: plugin.version,
      }),
    });
    expect((await installCodexSuperpowers()).ok).toBe(true);

    vi.mocked(runCommand).mockResolvedValueOnce({
      code: 0, stderr: '', stdout: JSON.stringify({ available: [plugin] }),
    });
    vi.mocked(runCommand).mockResolvedValueOnce({
      code: 0, stderr: '', stdout: JSON.stringify({
        pluginId: plugin.pluginId, version: 'aaaaaaaa',
      }),
    });
    expect((await installCodexSuperpowers()).ok).toBe(false);
  });

  it('接受官方目录为语义版本而安装回执为内容哈希', async () => {
    mockCodexCatalog();
    vi.mocked(runCommand).mockResolvedValueOnce({
      code: 0, stderr: '', stdout: JSON.stringify({
        pluginId: 'superpowers@openai-curated-remote',
        version: '1dc19589',
      }),
    });
    expect((await installCodexSuperpowers()).ok).toBe(true);
  });

  it('插件清单不可用时不使用旧配置或缓存冒充通过', async () => {
    const failed = vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'offline' });
    expect(await inspectCodexSuperpowers(failed)).toMatchObject({ error: 'offline' });
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
    expect(script).not.toContain('codex plugin add');
    expect(script).toContain(
      'node "$cli" update --agent "$agents" --scope global --with-dependencies'
    );
    expect(script).toContain(
      '自动升级已完整更新 CLI、依赖、Skills、Hooks、规则和托管 MCP'
    );
    expect(script).toContain('rm -f "$STAMP" "$GLOBAL_STAMP"');
    expect(script).not.toContain('superpowers@openai-api-curated');
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

  it('拒绝安装结果比官方目录版本旧', async () => {
    mockCodexCatalog();
    vi.mocked(runCommand).mockResolvedValueOnce({ code: 0, stderr: '', stdout: JSON.stringify({
      pluginId: 'superpowers@openai-curated-remote', version: '6.3.0',
    }) });
    expect((await installCodexSuperpowers()).ok).toBe(false);
  });

  it('已安装插件不在 available 中时仍能升级到新版', async () => {
    vi.mocked(runCommand).mockResolvedValueOnce({ code: 0, stderr: '', stdout: JSON.stringify({
      available: [], installed: [{ name: 'superpowers', pluginId: 'superpowers@openai-curated-remote', marketplaceName: 'openai-curated-remote', version: '6.3.0' }],
    }) });
    vi.mocked(runCommand).mockResolvedValueOnce({ code: 0, stderr: '', stdout: JSON.stringify({
      pluginId: 'superpowers@openai-curated-remote', version: '6.4.1',
    }) });
    expect((await installCodexSuperpowers()).ok).toBe(true);
  });

  it('Claude 已安装时仍执行真正的 plugin update', async () => {
    vi.mocked(runCommand).mockResolvedValueOnce({ code: 1, stdout: 'already installed', stderr: '' });
    expect((await updateClaudeSuperpowers()).ok).toBe(true);
    expect(runCommand).toHaveBeenLastCalledWith('claude', ['plugin', 'update', 'superpowers@superpowers-marketplace']);
  });

  it('新渠道缺技能不能借用旧缓存通过', async () => {
    const root = fsSync.mkdtempSync(path.join(os.tmpdir(), 'superflow-cache-'));
    const oldFile = path.join(root, 'openai-curated-remote/superpowers/6.3.0/skills/verification-before-completion/SKILL.md');
    fsSync.mkdirSync(path.dirname(oldFile), { recursive: true });
    fsSync.writeFileSync(oldFile, 'old');
    const current = path.join(root, 'openai-curated-remote/superpowers/6.4.1');
    fsSync.mkdirSync(current, { recursive: true });
    expect((await inspectCodexSuperpowers(inventory(), root)).missing).toContain('verification-before-completion');
    fsSync.rmSync(root, { recursive: true, force: true });
  });
});

function inventory(enabled = true) {
  return vi.fn().mockResolvedValue({ code: 0, stderr: '', stdout: JSON.stringify({ installed: [{
    name: 'superpowers', pluginId: 'superpowers@openai-curated-remote', marketplaceName: 'openai-curated-remote', version: '6.4.1', installed: true, enabled,
  }] }) });
}

function mockCodexCatalog() {
  vi.mocked(runCommand).mockResolvedValueOnce({ code: 0, stderr: '', stdout: JSON.stringify({ available: [{
    name: 'superpowers', pluginId: 'superpowers@openai-curated-remote', marketplaceName: 'openai-curated-remote', version: '6.4.1',
  }] }) });
}
