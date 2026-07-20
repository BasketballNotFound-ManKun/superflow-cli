import { promises as fs } from 'fs';
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
  'superpowers@openai-api-curated';

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
 * 失败阻塞 init（核心 HOW/TDD 依赖；已装视为成功）
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
 * 安装 superpowers（Codex 插件）
 * 失败阻塞 init（核心 HOW/TDD 依赖；已装视为成功）
 */
export async function installCodexSuperpowers(): Promise<InstallResult> {
  const result = await runCommand('codex', [
    'plugin',
    'add',
    CODEX_SUPERPOWERS_PLUGIN,
  ]);
  if (result.code !== 0) {
    const output = `${result.stderr}\n${result.stdout}`;
    if (alreadyInstalled(output)) return { ok: true };
    return { ok: false, error: result.stderr || result.stdout };
  }
  return { ok: true };
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
