import type { Agent } from '../../types.js';
import {
  getManifestHooks,
  getManifestRules,
  getManifestScripts,
  getManifestSkillNames,
} from '../config/manifest.js';

export const ALL_SKILLS = getManifestSkillNames();
export const ALL_RULES = getManifestRules();

export const CODEX_PROMPTS = [
  'superflow-pipeline.md',
  'superflow-clarify.md',
  'superflow-docs.md',
  'superflow-design.md',
  'superflow-implement.md',
  'superflow-verify.md',
  'superflow-archive.md',
];

export const LEGACY_CODEX_PROMPTS = [
  'sdd.md',
  'sdd-spec-pipeline.md',
];

export const COMMON_SCRIPTS = getManifestScripts('codex')
  .filter((script) => script !== 'codex-auto-backup-hook.sh');

export const COMMON_HOOK_SCRIPTS = getManifestHooks('codex')
  .filter((script) => script !== 'codex-auto-backup-hook.sh');

export function scriptsForAgent(agent: Agent): string[] {
  return getManifestScripts(agent);
}

export function hookScriptsForAgent(agent: Agent): string[] {
  return getManifestHooks(agent);
}
