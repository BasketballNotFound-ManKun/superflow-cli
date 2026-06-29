import manifestJson from '../../assets/manifest.json' with { type: 'json' };
import type { Agent } from '../types.js';

export interface SddManifest {
  version: string;
  agents: Agent[];
  skills: string[];
  rules?: string[];
  scripts: string[];
  agentScripts: Record<Agent, string[]>;
  hooks: string[];
  agentHooks: Record<Agent, string[]>;
}

const manifest = manifestJson as SddManifest;

export function getManifest(): SddManifest {
  return manifest;
}

export function getManifestSkillNames(): string[] {
  return [...manifest.skills];
}

export function getManifestRules(): string[] {
  return [...(manifest.rules ?? [])];
}

export function getManifestScripts(agent: Agent): string[] {
  return [...manifest.scripts, ...(manifest.agentScripts[agent] ?? [])];
}

export function getManifestHooks(agent: Agent): string[] {
  if (agent === 'opencode') {
    return [...(manifest.agentHooks[agent] ?? [])];
  }
  return [...(manifest.agentHooks[agent] ?? []), ...manifest.hooks];
}
