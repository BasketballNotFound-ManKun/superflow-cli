export type OS = 'darwin' | 'linux' | 'windows' | 'mingw' | 'msys' | 'cygwin' | 'unknown';
export type Agent = 'claude' | 'codex' | 'opencode';
export type AgentSelection = Agent | 'both' | 'all' | Agent[];
export type InstallScope = 'global' | 'project';
export type Language = 'en' | 'zh';

export interface SystemInfo {
  os: OS;
  node: string;
  npm: string;
  home: string;
}

export interface PlatformPaths {
  id: Agent;
  name: string;
  skillsDir: string;
  rulesDir: string;
  scriptsDir: string;
  promptsDir: string;
  settingsFile: string;
}

export interface InitStep {
  id: 1 | 2 | 3 | 4;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface SddState {
  version: string;
  lastInit: string;
  language?: Language;
  completedSteps: number[];
  platforms: Record<Agent, PlatformState>;
  backups: {
    settingsFiles: string[];
    skills: string[];
  };
  previousVersion: string | null;
}

export interface PlatformState {
  skills: string[];
  scripts: string[];
  hooks: string[];
}
