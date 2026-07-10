import type { Agent, AgentSelection, InstallScope } from '../types.js';

export const DEFAULT_AGENTS: Agent[] = ['claude', 'codex'];
export const ALL_AGENTS: Agent[] = ['claude', 'codex', 'opencode'];

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
