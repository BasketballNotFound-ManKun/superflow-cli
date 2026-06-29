import { homedir } from 'os';
import path from 'path';

export const home = homedir();
export const claudeSkills = path.join(home, '.claude', 'skills');
export const claudeScripts = path.join(home, '.claude', 'scripts');
export const claudeSettings = path.join(home, '.claude', 'settings.json');
export const stateFile = path.join(home, '.sdd-state.json');

export const codexSkills = path.join(home, '.codex', 'skills');
export const codexHooks = path.join(home, '.codex', 'hooks');
export const codexHooksFile = path.join(home, '.codex', 'hooks.json');
