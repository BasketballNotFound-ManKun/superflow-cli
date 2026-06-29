import { homedir } from 'os';
import path from 'path';
import type { OS, Agent, AgentSelection, InstallScope, PlatformPaths } from '../types.js';

export function detectOS(): OS {
  const platform = process.platform;
  if (platform === 'darwin' || platform === 'linux') return platform;
  if (platform === 'win32') {
    // Git Bash / MSYS / Cygwin 在 process.platform 都是 win32
    // 区分要靠 SHELL 或 MSYSTEM env
    if (process.env.MSYSTEM) return 'msys';
    if (process.env.SHELL?.includes('bash')) return 'mingw';
    return 'windows';
  }
  return 'unknown';
}

export function getPlatformPaths(
  agent: Agent,
  scope: InstallScope = 'global',
  projectPath = process.cwd()
): PlatformPaths {
  const base = scope === 'global' ? homedir() : projectPath;
  switch (agent) {
    case 'claude':
      return {
        id: 'claude',
        name: 'Claude Code',
        skillsDir: path.join(base, '.claude', 'skills'),
        rulesDir: path.join(base, '.claude', 'rules'),
        scriptsDir: path.join(base, '.claude', 'scripts'),
        promptsDir: path.join(base, '.claude', 'commands'),
        settingsFile: path.join(base, '.claude', 'settings.json'),
      };
    case 'codex':
      return {
        id: 'codex',
        name: 'Codex',
        skillsDir: path.join(base, '.codex', 'skills'),
        rulesDir: path.join(base, '.codex', 'rules'),
        scriptsDir: path.join(base, '.codex', 'hooks'),
        promptsDir: path.join(base, '.codex', 'prompts'),
        settingsFile: path.join(base, '.codex', 'hooks.json'),
      };
    default:
      throw new Error(`Unknown agent: ${agent}. Expected 'claude' or 'codex'.`);
  }
}

export function parseInstallScope(value: unknown): InstallScope {
  if (value === undefined || value === null || value === '') return 'global';
  if (value === 'global' || value === 'project') return value;
  throw new Error(`--scope must be one of: global, project`);
}

export function resolveAgents(selection: AgentSelection): Agent[] {
  switch (selection) {
    case 'both':
      return ['claude', 'codex'];
    case 'claude':
    case 'codex':
      return [selection];
    default:
      throw new Error(`Unknown agent selection: ${selection}`);
  }
}

export function parseAgentSelection(value: unknown): AgentSelection {
  if (value === undefined || value === null || value === '') return 'both';
  if (value === 'claude' || value === 'codex' || value === 'both') {
    return value;
  }
  throw new Error(`--agent must be one of: claude, codex, both`);
}
