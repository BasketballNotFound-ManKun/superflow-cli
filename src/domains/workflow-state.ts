import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

/**
 * SDD 工作流状态 — 用户可编辑的字段。
 * 存储在每个 change 的 `.sdd/state.yaml` 中。
 */
export type SddPhase = 'docs' | 'design' | 'implement' | 'verify' | 'archive';
export type WorkflowProfile = 'full' | 'hotfix' | 'tweak';
export type ReviewMode = 'off' | 'standard' | 'thorough';
export type VerifyResult = 'pending' | 'pass' | 'fail';

export interface WorkflowState {
  /** 工作流类型 */
  workflow: WorkflowProfile;
  /** 当前阶段 */
  phase: SddPhase;
  /** 代码审查强度 */
  reviewMode: ReviewMode;
  /** 阶段完成后是否自动流转到下一阶段 */
  autoTransition: boolean;
  /** 设计文档路径 */
  designDoc: string | null;
  /** 实现计划路径 */
  plan: string | null;
  /** 验证结果 */
  verifyResult: VerifyResult;
  /** 验证报告路径 */
  verificationReport: string | null;
  /** 创建时间 */
  createdAt: string;
  /** 归档时间 */
  archivedAt: string | null;
}

export const DEFAULT_WORKFLOW_STATE: WorkflowState = {
  workflow: 'full',
  phase: 'docs',
  reviewMode: 'standard',
  autoTransition: true,
  designDoc: null,
  plan: null,
  verifyResult: 'pending',
  verificationReport: null,
  createdAt: new Date().toISOString(),
  archivedAt: null,
};

const STATE_FILE = '.sdd/state.yaml';

/** 从 change 目录加载工作流状态 */
export function loadWorkflowState(changeDir: string): WorkflowState | null {
  // TODO: YAML 解析 — 当前使用 JSON 兼容格式
  const file = path.join(changeDir, STATE_FILE);
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<WorkflowState>;
    return { ...DEFAULT_WORKFLOW_STATE, ...parsed };
  } catch {
    return null;
  }
}

/** 保存工作流状态到 change 目录 */
export function saveWorkflowState(changeDir: string, state: WorkflowState): void {
  const file = path.join(changeDir, STATE_FILE);
  const dir = path.dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8');
}

/** 初始化一个新的工作流状态 */
export function initWorkflowState(
  overrides: Partial<WorkflowState> = {}
): WorkflowState {
  return {
    ...DEFAULT_WORKFLOW_STATE,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
