export type OS = 'darwin' | 'linux' | 'windows' | 'mingw' | 'msys' | 'cygwin' | 'unknown';
export type Agent = 'claude' | 'codex';
export type AgentSelection = Agent | 'both' | Agent[];
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
  /** 受管项目清单（向后兼容：缺失/损坏按空清单处理） */
  managedProjects?: ManagedProjects;
}

export interface PlatformState {
  skills: string[];
  scripts: string[];
  hooks: string[];
  /** init 记录的安装范围；uninstall/update 读取以保持目标一致，缺失回落 global */
  scope?: InstallScope;
}

export interface ManagedProjectEntry {
  root: string;
  agents: Agent[];
  scope: InstallScope;
  hooks: string[];
  registeredAt: string;
}

export interface ManagedProjects {
  projects: ManagedProjectEntry[];
}
