import { homedir } from 'os';
import path from 'path';
import type { Agent, InstallScope, PlatformPaths } from '../types.js';

export const home = homedir();

/** legacy path constants — prefer getPlatformPaths() for new code */
export const claudeSkills = path.join(home, '.claude', 'skills');
export const claudeScripts = path.join(home, '.claude', 'scripts');
export const claudeSettings = path.join(home, '.claude', 'settings.json');
export const codexSkills = path.join(home, '.codex', 'skills');
export const codexHooks = path.join(home, '.codex', 'hooks');
export const codexHooksFile = path.join(home, '.codex', 'hooks.json');
export const stateFile = path.join(home, '.sdd-state.json');

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
