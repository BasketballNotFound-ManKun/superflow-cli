import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import type { Agent } from '../../types.js';
import { computeDirHash, hashFile } from '../../platform/fs.js';
import registry from '../../../assets/skill-registry.json' with { type: 'json' };

export interface DeploySkillOptions {
  agent?: Agent;
  skipExisting?: boolean;
}

export async function deploySkill(
  name: string,
  assetsDir: string,
  skillsDir: string,
  options: DeploySkillOptions = {}
): Promise<void> {
  const source = path.join(assetsDir, name);
  const dest = path.join(skillsDir, name);

  if (options.skipExisting && existsSync(dest)) return;

  await fs.rm(dest, { recursive: true, force: true });
  await copySkillTree(source, dest, options.agent ?? 'codex');
}

export async function listDeployedSkills(skillsDir: string): Promise<string[]> {
  if (!existsSync(skillsDir)) return [];
  const entries = await fs.readdir(skillsDir, {withFileTypes: true});
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);
}

async function copySkillTree(source: string, dest: string, agent: Agent): Promise<void> {
  const stat = await fs.stat(source);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await copySkillTree(
        path.join(source, entry.name),
        path.join(dest, entry.name),
        agent
      );
    }
    return;
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (shouldRewriteSkillFile(source)) {
    const content = await fs.readFile(source, 'utf-8');
    await fs.writeFile(dest, rewriteSkillContent(content, agent, path.basename(source) === 'SKILL.md'), 'utf-8');
    return;
  }
  await fs.copyFile(source, dest);
}

function shouldRewriteSkillFile(file: string): boolean {
  return /\.(md|yaml|yml|json)$/i.test(file);
}

function rewriteSkillContent(content: string, agent: Agent, skillFile: boolean): string {
  if (agent === 'codex') return content;
  const name = content.match(/^name: ([a-z0-9-]+)$/m)?.[1];
  const internal = skillFile && registry.contracts.some(
    (contract) => contract.name === name && contract.visibility === 'internal'
  );
  const adapted = internal && content.startsWith('---\n')
    ? content.replace(/^---\n/, '---\nuser-invocable: false\n')
    : content;
  return adapted
    .replaceAll('~/.codex/hooks', '~/.claude/scripts')
    .replaceAll('~/.codex/skills', '~/.claude/skills')
    .replaceAll('Codex Hooks', 'Claude Code Hooks');
}

/** Move only fingerprinted original assets out of host discovery directories. */
export async function retireSkillAssets(
  root: string,
  retired: Record<string, string[]>,
): Promise<{ removed: string[]; preserved: string[] }> {
  const result = { removed: [] as string[], preserved: [] as string[] };
  for (const [name, knownHashes] of Object.entries(retired)) {
    if (!/^[a-z0-9-]+(?:\.md)?$/.test(name)) {
      throw new Error(`Invalid retired asset name: ${name}`);
    }
    const source = path.join(root, name);
    const stat = await fs.lstat(source).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat) continue;
    if (stat.isSymbolicLink() || (stat.isDirectory() && await hasSymlink(source))) {
      result.preserved.push(name);
      continue;
    }
    const hash = stat.isDirectory() ? computeDirHash(source) : hashFile(source);
    if (!knownHashes.includes(hash)) {
      result.preserved.push(name);
      continue;
    }
    const backup = path.join(path.dirname(root), '.superflow-retired-assets', hash, name);
    if (existsSync(backup)) {
      const saved = await fs.lstat(backup);
      const safe = !saved.isSymbolicLink() &&
        (!saved.isDirectory() || !await hasSymlink(backup));
      const savedHash = safe
        ? (saved.isDirectory() ? computeDirHash(backup) : hashFile(backup))
        : null;
      if (savedHash !== hash) {
        result.preserved.push(name);
        continue;
      }
      await fs.rm(source, { recursive: stat.isDirectory() });
      result.removed.push(name);
      continue;
    }
    await fs.mkdir(path.dirname(backup), { recursive: true });
    await fs.rename(source, backup);
    result.removed.push(name);
  }
  return result;
}

async function hasSymlink(root: string): Promise<boolean> {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) return true;
    if (entry.isDirectory() && await hasSymlink(path.join(root, entry.name))) {
      return true;
    }
  }
  return false;
}
