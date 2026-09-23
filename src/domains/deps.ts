import {
  existsSync,
  promises as fs,
  readdirSync,
  statSync,
} from 'fs';
import { homedir } from 'os';
import path from 'path';
import { runCommand } from '../platform/process.js';
import { ASSETS_DIR } from '../platform/assets.js';
import type { Agent, InstallScope } from '../types.js';

export interface InstallResult {
  ok: boolean;
  error?: string;
}

export const CODEX_SUPERPOWERS_PLUGIN =
  'superpowers@openai-curated-remote';

const CODEX_SUPERPOWERS_MARKETS = ['openai-curated-remote', 'openai-api-curated'];

interface CodexSuperpowersPlugin {
  name: string;
  pluginId: string;
  marketplaceName: string;
  version: string;
  enabled?: boolean;
  installed?: boolean;
}

export function selectCodexSuperpowers(catalog: {
  available?: CodexSuperpowersPlugin[];
  installed?: CodexSuperpowersPlugin[];
}): CodexSuperpowersPlugin {
  const plugins = [...(catalog.available ?? []), ...(catalog.installed ?? [])].filter((plugin) =>
    plugin.name === 'superpowers' &&
    CODEX_SUPERPOWERS_MARKETS.includes(plugin.marketplaceName) &&
    plugin.pluginId === `superpowers@${plugin.marketplaceName}`,
  );
  const versions = plugins.filter((plugin) => /^\d+\.\d+\.\d+$/.test(plugin.version));
  versions.sort((a, b) => compareVersions(b.version, a.version));
  if (versions[0]) return versions[0];

  const hashes = plugins.filter((plugin) => /^[a-f0-9]{8,64}$/.test(plugin.version));
  const distinct = [...new Set(hashes.map((plugin) => `${plugin.pluginId}@${plugin.version}`))];
  if (distinct.length === 1) {
    return hashes.find((plugin) => plugin.installed === true && plugin.enabled === true)
      ?? hashes[0];
  }
  throw new Error('Cannot confirm the official Superpowers plugin; run codex plugin list --available --json');
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

export const REQUIRED_CODEX_SUPERPOWER_SKILLS = [
  'verification-before-completion',
  'requesting-code-review',
  'finishing-a-development-branch',
] as const;

export function hasCodexSuperpowerSkill(
  skill: string,
  root: string,
): boolean {
  if (!root || !existsSync(root)) return false;
  const expected = path.join('skills', skill, 'SKILL.md');
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry);
      if (full.endsWith(expected) && existsSync(full)) return true;
      if (stack.length < 200) {
        try {
          if (statSync(full).isDirectory()) stack.push(full);
        } catch {
          continue;
        }
      }
    }
  }
  return false;
}

export async function inspectCodexSuperpowers(
  run: typeof runCommand = runCommand,
  cacheRoot = path.join(homedir(), '.codex/plugins/cache'),
): Promise<{ plugin?: CodexSuperpowersPlugin; missing: string[]; error?: string }> {
  try {
    // Remote plugin enablement is account-backed, not necessarily in config.toml.
    const result = await run('codex', ['plugin', 'list', '--json']);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    const installed = JSON.parse(result.stdout).installed;
    if (!Array.isArray(installed)) throw new Error('Invalid Codex plugin inventory');
    const plugin = selectCodexSuperpowers({ installed: installed.filter((item) => item.installed === true && item.enabled === true) });
    const root = path.join(cacheRoot, plugin.marketplaceName, 'superpowers', plugin.version);
    const missing = REQUIRED_CODEX_SUPERPOWER_SKILLS.filter((skill) =>
      !hasCodexSuperpowerSkill(skill, root),
    );
    return { plugin, missing };
  } catch (error) {
    return { missing: [...REQUIRED_CODEX_SUPERPOWER_SKILLS], error: (error as Error).message };
  }
}

function alreadyInstalled(output: string): boolean {
  return /already\s+(installed|exists)|is\s+already\s+installed|already\s+added/i.test(output);
}

/**
 * 安装 openspec CLI（npm 全局）
 * 失败阻塞 init（核心依赖）
 */
export async function installOpenspec(): Promise<InstallResult> {
  const result = await runCommand('npm', ['install', '-g', '@fission-ai/openspec@latest']);
  if (result.code !== 0) {
    return { ok: false, error: `npm install failed: ${result.stderr}` };
  }
  return { ok: true };
}

export function openspecInitArgs(
  projectPath: string,
  agents: Agent[],
  _scope: InstallScope,
  includeProfile = true
): string[] {
  const args = ['init', projectPath, '--tools', agents.join(',')];
  if (includeProfile) {
    args.push('--profile', 'custom');
  }
  return args;
}

export async function initializeOpenspec(
  projectPath: string,
  agents: Agent[],
  scope: InstallScope
): Promise<InstallResult> {
  const args = openspecInitArgs(projectPath, agents, scope);
  const result = await runCommand('openspec', args, {
    cwd: projectPath,
    timeout: 120_000,
  });
  if (result.code === 0) return { ok: true };

  const stderr = result.stderr || result.stdout;
  if (stderr.includes('unknown option') && stderr.includes('--profile')) {
    const fallback = await runCommand(
      'openspec',
      openspecInitArgs(projectPath, agents, scope, false),
      { cwd: projectPath, timeout: 120_000 }
    );
    if (fallback.code === 0) return { ok: true };
    return { ok: false, error: fallback.stderr || fallback.stdout };
  }

  return { ok: false, error: stderr };
}

/**
 * 安装 superpowers（claude 插件）
 * 它是 Superflow verify 阶段的硬依赖；安装失败必须阻止初始化或带包更新。
 */
export async function installSuperpowers(): Promise<InstallResult> {
  const result = await runCommand('claude', [
    'plugin',
    'install',
    'superpowers@superpowers-marketplace',
  ]);
  if (result.code !== 0) {
    const output = `${result.stderr}\n${result.stdout}`;
    if (alreadyInstalled(output)) return { ok: true };
    return { ok: false, error: result.stderr };
  }
  return { ok: true };
}

/**
 * 安装 Superpowers（Codex 插件）。
 * 它是 verify 阶段的硬依赖；已装视为成功，安装失败必须阻止初始化或更新。
 */
export async function installCodexSuperpowers(
  verifySkills = false,
): Promise<InstallResult> {
  try {
    const catalog = await runCommand('codex', ['plugin', 'list', '--available', '--json']);
    if (catalog.code !== 0) return { ok: false, error: catalog.stderr || catalog.stdout };
    const plugin = selectCodexSuperpowers(JSON.parse(catalog.stdout));
    const result = await runCommand('codex', ['plugin', 'add', plugin.pluginId, '--json']);
    if (result.code !== 0) return { ok: false, error: result.stderr || result.stdout };
    const installed = JSON.parse(result.stdout);
    const versionConfirmed = /^\d+\.\d+\.\d+$/.test(plugin.version)
      ? (/^\d+\.\d+\.\d+$/.test(installed.version ?? '') &&
          compareVersions(installed.version, plugin.version) >= 0) ||
        /^[a-f0-9]{8,64}$/.test(installed.version ?? '')
      : installed.version === plugin.version;
    if (installed.pluginId !== plugin.pluginId || !versionConfirmed) {
      return { ok: false, error: `Superpowers installation did not confirm ${plugin.pluginId}@${plugin.version}` };
    }
    return verifiedCodexSuperpowers(verifySkills);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function updateClaudeSuperpowers(): Promise<InstallResult> {
  const installed = await installSuperpowers();
  if (!installed.ok) return installed;
  const result = await runCommand('claude', ['plugin', 'update', 'superpowers@superpowers-marketplace']);
  return result.code === 0 ? { ok: true } : { ok: false, error: result.stderr || result.stdout };
}

async function verifiedCodexSuperpowers(verifySkills: boolean): Promise<InstallResult> {
  if (!verifySkills) return { ok: true };
  const { missing, error } = await inspectCodexSuperpowers();
  if (error) return { ok: false, error };
  if (missing.length === 0) return { ok: true };
  return { ok: false, error: `required skills missing: ${missing.join(', ')}` };
}

/**
 * 安装 understand-anything（claude 插件）
 */
export async function installUnderstand(): Promise<InstallResult> {
  const result = await runCommand('claude', [
    'plugin',
    'install',
    'understand-anything@understand-anything',
  ]);
  if (result.code !== 0) {
    return { ok: false, error: result.stderr };
  }
  return { ok: true };
}

/**
 * 安装 understand-anything（Codex / agents 技能链接）
 */
export async function installCodexUnderstand(): Promise<InstallResult> {
  const script = path.join(homedir(), '.understand-anything', 'repo', 'install.sh');
  const result = await runCommand('bash', [script, 'codex']);
  if (result.code !== 0) {
    const fallback = await linkCodexUnderstandSkills();
    if (fallback.ok) return fallback;
    return { ok: false, error: `${result.stderr || result.stdout}\n${fallback.error}` };
  }
  return { ok: true };
}

async function linkCodexUnderstandSkills(): Promise<InstallResult> {
  const sourceRoot = path.join(
    homedir(),
    '.understand-anything',
    'repo',
    'understand-anything-plugin',
    'skills'
  );
  const targetRoot = path.join(homedir(), '.agents', 'skills');
  try {
    const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
    await fs.mkdir(targetRoot, { recursive: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const source = path.join(sourceRoot, entry.name);
      const target = path.join(targetRoot, entry.name);
      await fs.rm(target, { recursive: true, force: true });
      await fs.symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir');
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `understand-anything fallback failed: ${(err as Error).message}` };
  }
}

/**
 * 安装 api-doc-changelog（直接复制）
 */
export async function installApiDocChangelog(
  skillsDir = path.join(homedir(), '.claude', 'skills')
): Promise<InstallResult> {
  const source = path.join(ASSETS_DIR, 'skills', 'api-doc-changelog');
  const dest = path.join(skillsDir, 'api-doc-changelog');
  try {
    await fs.cp(source, dest, { recursive: true, force: true});
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
