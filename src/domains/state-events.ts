import { appendFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import type { SddPhase } from './workflow-state.js';

/**
 * 审计日志 — 记录每次状态变更。
 * 追加写入 `.sdd/state-events.jsonl`，每行一个 JSON 事件。
 */

export type StateEventType =
  | 'phase-transition'
  | 'review-mode-changed'
  | 'auto-transition-toggled'
  | 'run-started'
  | 'run-completed'
  | 'run-failed'
  | 'retry-recorded';

export interface StateEvent {
  timestamp: string;
  type: StateEventType;
  change?: string;
  detail: Record<string, unknown>;
}

const EVENTS_FILE = '.sdd/state-events.jsonl';

function ensureDir(changeDir: string): void {
  const sddDir = path.join(changeDir, '.sdd');
  if (!existsSync(sddDir)) mkdirSync(sddDir, { recursive: true });
}

/** 追加一条审计事件 */
export function appendStateEvent(
  changeDir: string,
  type: StateEventType,
  detail: Record<string, unknown> = {}
): void {
  ensureDir(changeDir);
  const event: StateEvent = {
    timestamp: new Date().toISOString(),
    type,
    detail,
  };
  const file = path.join(changeDir, EVENTS_FILE);
  appendFileSync(file, JSON.stringify(event) + '\n', 'utf-8');
}

/** 记录阶段转换 */
export function logPhaseTransition(
  changeDir: string,
  from: SddPhase,
  to: SddPhase,
  trigger: 'auto' | 'manual' = 'auto'
): void {
  appendStateEvent(changeDir, 'phase-transition', { from, to, trigger });
}

/** 记录 review_mode 变更 */
export function logReviewModeChange(
  changeDir: string,
  from: string,
  to: string
): void {
  appendStateEvent(changeDir, 'review-mode-changed', { from, to });
}

/** 记录 auto_transition 切换 */
export function logAutoTransitionToggle(
  changeDir: string,
  enabled: boolean
): void {
  appendStateEvent(changeDir, 'auto-transition-toggled', { enabled });
}
