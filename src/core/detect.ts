import { homedir } from 'os';
import path from 'path';
import type { OS, Agent, AgentSelection, InstallScope, PlatformPaths } from '../types.js';

export const DEFAULT_AGENTS: Agent[] = ['claude', 'codex'];
export const ALL_AGENTS: Agent[] = ['claude', 'codex', 'opencode'];

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
    case 'opencode': {
      const root = scope === 'global'
        ? path.join(homedir(), '.config', 'opencode')
        : path.join(projectPath, '.opencode');
      return {
        id: 'opencode',
        name: 'OpenCode',
        skillsDir: path.join(root, 'skills'),
        rulesDir: path.join(root, 'rules'),
        scriptsDir: path.join(root, 'scripts'),
        promptsDir: path.join(root, 'commands'),
        settingsFile: scope === 'global'
          ? path.join(root, 'opencode.json')
          : path.join(projectPath, 'opencode.json'),
      };
    }
    default:
      throw new Error(`Unknown agent: ${agent}. Expected 'claude', 'codex', or 'opencode'.`);
  }
}

export function parseInstallScope(value: unknown): InstallScope {
  if (value === undefined || value === null || value === '') return 'global';
  if (value === 'global' || value === 'project') return value;
  throw new Error(`--scope must be one of: global, project`);
}

export function resolveAgents(selection: AgentSelection): Agent[] {
  if (Array.isArray(selection)) {
    return [...new Set(selection)];
  }
  switch (selection) {
    case 'both':
      return DEFAULT_AGENTS;
    case 'all':
      return ALL_AGENTS;
    case 'claude':
    case 'codex':
    case 'opencode':
      return [selection];
    default:
      throw new Error(`Unknown agent selection: ${selection}`);
  }
}

export function parseAgentSelection(value: unknown): AgentSelection {
  if (value === undefined || value === null || value === '') return 'both';
  if (typeof value !== 'string') {
    throw new Error(`--agent must be one of: claude, codex, opencode, both, all`);
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'both') return 'both';
  if (normalized === 'all') return 'all';
  const parts = normalized
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return 'both';
  const selected = new Set<Agent>();
  for (const part of parts) {
    if (part === 'claude' || part === 'codex' || part === 'opencode') {
      selected.add(part);
    } else {
      throw new Error(`--agent must be one of: claude, codex, opencode, both, all`);
    }
  }
  const agents = [...selected];
  if (agents.length === 1) return agents[0];
  if (agents.length === DEFAULT_AGENTS.length &&
      DEFAULT_AGENTS.every((agent) => selected.has(agent))) {
    return 'both';
  }
  if (agents.length === ALL_AGENTS.length) return 'all';
  return agents;
}
