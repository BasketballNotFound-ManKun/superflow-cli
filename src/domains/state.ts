import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import type {
  SddState,
  Agent,
  PlatformState,
  Language,
  ManagedProjectEntry,
} from '../types.js';

const SUPPORTED_AGENTS: Agent[] = ['claude', 'codex'];

export function loadState(file: string): SddState | null {
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SddState>;
    // 顶层字段验证（防止老版本残留或外部破坏）
    if (!parsed.version || !parsed.platforms || !parsed.completedSteps) {
      throw new Error('state file missing required top-level fields');
    }
    return ensureStatePlatforms(parsed as SddState);
  } catch (err) {
    throw new Error(`Failed to parse state file ${file}: ${(err as Error).message}`);
  }
}

function ensureStatePlatforms(state: SddState): SddState {
  const emptyPlatform = (): PlatformState => ({ skills: [], scripts: [], hooks: [] });
  for (const agent of SUPPORTED_AGENTS) {
    if (!state.platforms[agent]) {
      state.platforms[agent] = emptyPlatform();
    }
  }
  return state;
}

export function saveState(file: string, state: SddState): void {
  const dir = path.dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8');
}

export function initState(version: string, _agent: Agent, language: Language = 'zh'): SddState {
  const emptyPlatform: PlatformState = { skills: [], scripts: [], hooks: [] };
  return {
    version,
    lastInit: new Date().toISOString(),
    language,
    completedSteps: [],
    platforms: {
      claude: { ...emptyPlatform },
      codex: { ...emptyPlatform },
    },
    backups: {
      settingsFiles: [],
      skills: [],
    },
    previousVersion: null,
  };
}

function isManagedProjectEntry(value: unknown): value is ManagedProjectEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ManagedProjectEntry>;
  return typeof entry.root === 'string' && entry.root.length > 0
    && Array.isArray(entry.agents)
    && (entry.scope === 'global' || entry.scope === 'project')
    && Array.isArray(entry.hooks)
    && typeof entry.registeredAt === 'string';
}

/** 读取受管项目清单；缺失/损坏按空清单处理并通过 warn 上报，不抛错。 */
export function readManagedProjects(
  state: SddState | null,
  warn: (message: string) => void = () => {},
): ManagedProjectEntry[] {
  const managed = state?.managedProjects as { projects?: unknown } | undefined;
  if (!managed) return [];
  if (!Array.isArray(managed.projects)) {
    warn('managedProjects format invalid; treating as empty list');
    return [];
  }
  const projects: ManagedProjectEntry[] = [];
  for (const raw of managed.projects) {
    if (isManagedProjectEntry(raw)) {
      projects.push(raw);
    } else {
      warn('managedProjects contains an invalid entry; skipping it');
    }
  }
  return projects;
}

/** 登记或更新受管项目（按 root 幂等去重）。 */
export function upsertManagedProject(state: SddState, entry: ManagedProjectEntry): void {
  if (!state.managedProjects || !Array.isArray(state.managedProjects.projects)) {
    state.managedProjects = { projects: [] };
  }
  const existing = state.managedProjects.projects.find((p) => p.root === entry.root);
  if (existing) {
    Object.assign(existing, entry);
  } else {
    state.managedProjects.projects.push(entry);
  }
}

/** 按 root 移除受管项目；root 不存在时无副作用。 */
export function removeManagedProject(state: SddState, root: string): void {
  const projects = state.managedProjects?.projects;
  if (!Array.isArray(projects)) return;
  state.managedProjects!.projects = projects.filter((p) => p.root !== root);
}

/** 遍历清单：目录存在的进 targets，目录已消失的进 staleRoots（由调用方移除条目）。 */
export function collectManagedProjectTargets(projects: ManagedProjectEntry[]): {
  targets: ManagedProjectEntry[];
  staleRoots: string[];
} {
  const targets: ManagedProjectEntry[] = [];
  const staleRoots: string[] = [];
  for (const project of projects) {
    if (existsSync(project.root)) {
      targets.push(project);
    } else {
      staleRoots.push(project.root);
    }
  }
  return { targets, staleRoots };
}
