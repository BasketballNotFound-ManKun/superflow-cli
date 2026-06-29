import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import type { Agent } from '../types.js';

export interface DeploySkillOptions {
  agent?: Agent;
  overwrite?: boolean;
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

  if (existsSync(dest)) {
    if (options.skipExisting) return;
    if (options.overwrite !== true) {
      const ts = Date.now();
      const backup = path.join(skillsDir, `${name}.backup-${ts}`);
      await fs.cp(dest, backup, { recursive: true});
    }
  }

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
    await fs.writeFile(dest, rewriteSkillContent(content, agent), 'utf-8');
    return;
  }
  await fs.copyFile(source, dest);
}

function shouldRewriteSkillFile(file: string): boolean {
  return /\.(md|yaml|yml|json)$/i.test(file);
}

function rewriteSkillContent(content: string, agent: Agent): string {
  if (agent === 'codex') return content;
  if (agent === 'opencode') {
    return content
      .replaceAll('~/.codex/hooks', '~/.opencode/scripts')
      .replaceAll('~/.codex/skills', '~/.opencode/skills')
      .replaceAll('Codex Hooks', 'OpenCode Commands');
  }
  return content
    .replaceAll('~/.codex/hooks', '~/.claude/scripts')
    .replaceAll('~/.codex/skills', '~/.claude/skills')
    .replaceAll('Codex Hooks', 'Claude Code Hooks');
}
