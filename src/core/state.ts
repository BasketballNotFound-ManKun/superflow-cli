import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import type { SddState, Agent, PlatformState, Language } from '../types.js';

export function loadState(file: string): SddState | null {
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SddState>;
    // 顶层字段验证（防止老版本残留或外部破坏）
    if (!parsed.version || !parsed.platforms || !parsed.completedSteps) {
      throw new Error('state file missing required top-level fields');
    }
    return parsed as SddState;
  } catch (err) {
    throw new Error(`Failed to parse state file ${file}: ${(err as Error).message}`);
  }
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
