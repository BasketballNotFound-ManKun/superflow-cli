import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

/**
 * 机器侧运行时状态 — Agent 执行过程中的追踪数据。
 * 存储在 `.sdd/run-state.json`，用户不应手动编辑。
 */
export interface RunState {
  /** 唯一运行 ID */
  runId: string;
  /** 当前执行的 Skill 名称 */
  skill: string;
  /** 当前步骤 */
  currentStep: string | null;
  /** 当前迭代轮次 */
  iteration: number;
  /** 重试计数 (key: stepId) */
  retries: Record<string, number>;
  /** 运行状态 */
  status: 'running' | 'waiting' | 'completed' | 'failed';
  /** 上次更新时间 */
  updatedAt: string;
}

const RUN_STATE_FILE = '.sdd/run-state.json';

export function loadRunState(changeDir: string): RunState | null {
  const file = path.join(changeDir, RUN_STATE_FILE);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as RunState;
  } catch {
    return null;
  }
}

export function saveRunState(changeDir: string, state: RunState): void {
  const file = path.join(changeDir, RUN_STATE_FILE);
  const dir = path.dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
}

export function initRunState(skill: string): RunState {
  return {
    runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    skill,
    currentStep: null,
    iteration: 0,
    retries: {},
    status: 'running',
    updatedAt: new Date().toISOString(),
  };
}

/** 增加指定步骤的重试计数 */
export function recordRetry(state: RunState, stepId: string): RunState {
  const retries = { ...state.retries };
  retries[stepId] = (retries[stepId] ?? 0) + 1;
  return { ...state, retries };
}

/** 更新当前步骤并增加迭代计数 */
export function advanceStep(state: RunState, step: string): RunState {
  return {
    ...state,
    currentStep: step,
    iteration: state.iteration + 1,
  };
}
