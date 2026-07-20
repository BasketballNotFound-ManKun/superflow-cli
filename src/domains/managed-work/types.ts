import type { Language } from "../../types.js";

export type ManagedAgent = "codex" | "claude";
export type ManagedProfile = "quick" | "engineering" | "sdd" | "monitor";

export type ManagedTaskStatus =
  | "queued"
  | "running"
  | "waiting_for_connectivity"
  | "waiting_for_human"
  | "paused"
  | "review_exhausted"
  | "budget_exhausted"
  | "deadline_exhausted"
  | "awaiting_git_approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface ManagedBudgets {
  maxReviewRounds: number;
  maxExecutorInvocations: number;
  maxTotalAgentInvocations: number;
  activeRunWarningHours: number;
  maxActiveRunHours: number;
  noProgressWarningMinutes: number;
  stalledTimeoutMinutes: number;
  maxSingleInvocationHours: number;
}

export interface ManagedPermissions {
  autonomy: "maximum_within_safe_scope";
  gitCommit: false;
  gitPush: false;
  productionWrites: false;
  bypassSandbox: false;
}

export interface ManagedTaskPrompt {
  originalPath: string;
  snapshotPath: string;
  sha256: string;
}

export interface ManagedTaskContract {
  schemaVersion: 1;
  taskId: string;
  request: string;
  source: "direct_prompt" | "task_file" | "sdd";
  projectRoot: string;
  relatedProjectRoots: string[];
  profile: ManagedProfile;
  language?: Language;
  objective: string;
  doneCriteria: string[];
  taskPrompt: ManagedTaskPrompt | null;
  supervisorAgent: ManagedAgent;
  executorAgent: ManagedAgent;
  contractHash: string;
  permissions: ManagedPermissions;
  budgets: ManagedBudgets;
  createdAt: string;
  updatedAt: string;
  status: ManagedTaskStatus;
}

export interface ManagedSession {
  agent: ManagedAgent;
  sessionId: string | null;
  createdAt: string | null;
  lastResumedRound: number;
  status: "pending" | "active" | "lost";
}

export interface ManagedRunState {
  schemaVersion: 1;
  runId: string;
  taskId: string;
  projectRoot: string;
  profile: ManagedProfile;
  language?: Language;
  status: ManagedTaskStatus;
  currentStep: string;
  reviewRound: number;
  executorInvocations: number;
  reviewInvocations: number;
  totalAgentInvocations: number;
  activeRunMilliseconds: number;
  activeSince: string | null;
  supervisorSession: ManagedSession;
  executorSession: ManagedSession;
  baseCommit: string | null;
  workspaceFingerprint: string;
  contractHash: string;
  lastExecutorResult: string | null;
  lastReviewResult: string | null;
  lastRepairPrompt: string | null;
  servicePid: number | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  blocker: string | null;
}

export interface ManagedCommandEvidence {
  command: string;
  exitCode: number;
  result: string;
}

export interface ExecutorResult {
  status: "ready_for_review" | "blocked" | "failed";
  summary: string;
  changedFiles: string[];
  commands: ManagedCommandEvidence[];
  evidence: string[];
  blockers: string[];
}

export interface ReviewFinding {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  blocking: boolean;
  category: string;
  target: string;
  evidence: string;
  risk: string;
  requiredFix: string;
  acceptanceChecks: string[];
}

export interface ReviewResult {
  result: "pass" | "needs_fix" | "blocked";
  summary: string;
  findings: ReviewFinding[];
}

export interface ManagedEvent {
  sequence: number;
  eventId: string;
  eventType: string;
  actor: string;
  role: "runner" | "supervisor" | "executor" | "system";
  timestamp: string;
  status: ManagedTaskStatus;
  summary: string;
  evidencePaths: string[];
  previousEventHash: string | null;
  eventHash: string;
}

export interface ManagedRegistryEntry {
  taskId: string;
  projectRoot: string;
  status: ManagedTaskStatus;
  profile: ManagedProfile;
  language?: Language;
  activeRunId: string;
  createdAt: string;
  updatedAt: string;
  servicePid: number | null;
}

export interface ManagedRegistry {
  schemaVersion: 1;
  tasks: ManagedRegistryEntry[];
}

export interface AgentInvocation {
  taskId: string;
  runId: string;
  role: "supervisor" | "executor";
  language?: Language;
  agent: ManagedAgent;
  projectRoot: string;
  writableRoots: string[];
  prompt: string;
  schemaPath: string;
  sessionId: string | null;
  timeout: {
    warningMs: number;
    stalledMs: number;
    hardMs: number;
  };
  onProgress?: (summary: string) => void;
  onSession?: (sessionId: string) => void;
}

export interface AgentInvocationResult<T> {
  sessionId: string;
  output: T;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface AgentInvoker {
  invoke<T>(invocation: AgentInvocation): Promise<AgentInvocationResult<T>>;
}

export const HARD_MAX_REVIEW_ROUNDS = 5;
export const HARD_MAX_EXECUTOR_INVOCATIONS = 7;
export const HARD_MAX_TOTAL_AGENT_INVOCATIONS = 12;
export const HARD_MAX_ACTIVE_RUN_HOURS = 24;
export const HARD_MAX_SINGLE_INVOCATION_HOURS = 3;

export const DEFAULT_MANAGED_BUDGETS: ManagedBudgets = {
  maxReviewRounds: HARD_MAX_REVIEW_ROUNDS,
  maxExecutorInvocations: HARD_MAX_EXECUTOR_INVOCATIONS,
  maxTotalAgentInvocations: HARD_MAX_TOTAL_AGENT_INVOCATIONS,
  activeRunWarningHours: 12,
  maxActiveRunHours: HARD_MAX_ACTIVE_RUN_HOURS,
  noProgressWarningMinutes: 20,
  stalledTimeoutMinutes: 40,
  maxSingleInvocationHours: HARD_MAX_SINGLE_INVOCATION_HOURS,
};
