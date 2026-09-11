import type { Language } from "../../types.js";

export type ManagedAgent = "codex" | "claude";
export type ManagedProfile = "quick" | "engineering" | "sdd" | "monitor";
export type ManagedSupervisorExecution = "external_host";
export type ManagedExecutionMode = "delegated" | "human_directed";
export type ManagedRetention = "full" | "compact" | "none";
export type ManagedTaskKind = "code" | "docs-only" | "review-only";

/**
 * A Host-frozen statement of what the first execution and review must cover.
 * `targets` are exact, repository-relative existing source paths at start.
 */
export interface ManagedAcceptanceSourceCoverage {
  scope: string;
  targets: string[];
}

export interface ManagedAcceptanceContract {
  businessInvariants: string[];
  sourceCoverage: ManagedAcceptanceSourceCoverage[];
  deliverables: string[];
  verification: string[];
  exclusions: string[];
}

export interface ManagedAcceptanceReviewCoverage {
  reviewed: string[];
}

export type ManagedFailureReason =
  | "environment_prepare_failed"
  | "workspace_busy_timeout"
  | "workspace_ownership_unverified"
  | "executor_delivery_invalid";

export interface ManagedFailure {
  reason: ManagedFailureReason;
  summary: string;
  remediation: string;
  recordedAt: string;
}

export type ManagedTaskStatus =
  | "queued"
  | "running"
  | "waiting_for_connectivity"
  | "waiting_for_provider_change"
  | "waiting_for_host_review"
  | "waiting_for_human"
  | "paused"
  | "review_exhausted"
  | "budget_exhausted"
  | "deadline_exhausted"
  | "repair_pending"
  | "local_delivery_ready"
  | "environment_validation_blocked"
  | "release_ready"
  | "awaiting_git_approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface ManagedBudgets {
  maxReviewRounds: number;
  maxExecutorInvocations: number;
  maxTotalAgentInvocations: number;
  unlimitedAgentInvocations?: boolean;
  executorPhysicalStopAt?: number;
  maxExecutorTokenUnits?: number;
  maxExecutorCostUsd?: number;
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
  externalModelDataDisclosure: {
    approved: boolean;
    approvedBy: string | null;
    approvedAt: string | null;
    scope: string[];
  };
}

export type ManagedTaskCategory =
  | "local_required"
  | "environment_required"
  | "release_required";

export interface ManagedTaskEvidence {
  taskId: string;
  category: ManagedTaskCategory;
  owner: "executor" | "tester" | "dba" | "sre" | "user";
  evidencePaths: string[];
  verificationCommands: string[];
  changedFiles: string[];
}

export interface ManagedDeliveryProgress {
  source: { completed: number; total: number };
  environment: { completed: number; total: number };
  release: { completed: number; total: number };
}

export interface AgentUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  costUsd: number | null;
}

export interface AgentRuntimeTelemetry {
  phase:
    | "model_waiting"
    | "tool_running"
    | "workspace_writing"
    | "awaiting_local_approval";
  model: string | null;
  tools: string[];
  toolUses: string[];
  plugins: string[];
  lastOutputAt: string;
  lastProgressAt: string;
  lastProgressReason: string;
  permissionDenials?: number;
}

export interface ManagedTaskPrompt {
  originalPath: string;
  snapshotPath: string;
  sha256: string;
  /**
   * Older persisted tasks omit this field and are treated as user supplied.
   * A generated standard prompt is still frozen and hashed, but has no
   * external source file to re-read.
   */
  origin?: "user" | "generated_standard";
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
  mandatoryEngineeringRules?: string[];
  taskPrompt: ManagedTaskPrompt | null;
  supervisorAgent: ManagedAgent;
  executorAgent: ManagedAgent;
  supervisorExecution: ManagedSupervisorExecution;
  executionMode?: ManagedExecutionMode;
  /** Deterministic process/artifact retention policy for this task. */
  retention?: ManagedRetention;
  /** Capability class; docs/review tasks must not receive runtime acceptance. */
  taskKind?: ManagedTaskKind;
  /**
   * Required for newly started task-file and SDD work. Older persisted tasks
   * may omit it so they can be inspected and recovered without a rewrite.
   */
  acceptanceContract?: ManagedAcceptanceContract;
  contractHash: string;
  permissions: ManagedPermissions;
  budgets: ManagedBudgets;
  createdAt: string;
  updatedAt: string;
  status: ManagedTaskStatus;
}

export type UnresumableSessionFailureReason =
  | "session_not_found"
  | "session_invalid"
  | "resume_context_limit";

export interface RetiredManagedSession {
  sessionId: string;
  reason: UnresumableSessionFailureReason;
  retiredAt: string;
}

export interface ManagedSession {
  agent: ManagedAgent;
  sessionId: string | null;
  createdAt: string | null;
  lastResumedRound: number;
  status: "pending" | "active" | "lost";
  previousSessionIds?: string[];
  resumingSessionId?: string | null;
  retiredSessions?: RetiredManagedSession[];
}

export interface PendingExternalReview {
  round: number;
  promptPath: string;
  factsPath?: string;
  workspaceFingerprint: string;
  requestedAt: string;
  workspacePaths?: string[];
}

export interface ManagedHumanMessage {
  messageId: string;
  timestamp: string;
  actor: string;
  content: string;
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
  executorStage?: ManagedExecutorStage | null;
  executorActiveStage?: ManagedExecutorStage | null;
  reviewRound: number;
  executorInvocations: number;
  executorInvocationCredits?: number;
  consecutiveTransientProviderFailures?: number;
  connectivityRetryCount?: number;
  reviewInvocations: number;
  totalAgentInvocations: number;
  totalAgentInvocationCredits?: number;
  activeRunMilliseconds: number;
  activeSince: string | null;
  supervisorSession: ManagedSession;
  executorSession: ManagedSession;
  baseCommit: string | null;
  workspaceFingerprint: string;
  baselineWorkspaceFiles?: Record<string, string>;
  baselineCapturedAt?: string | null;
  /** Workspace snapshot captured when Host review was requested. */
  lastReviewedWorkspaceFiles?: Record<string, string>;
  contractHash: string;
  lastExecutorResult: string | null;
  lastReviewResult: string | null;
  lastRepairPrompt: string | null;
  servicePid: number | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  blocker: string | null;
  failure?: ManagedFailure | null;
  pendingExternalReview?: PendingExternalReview | null;
  deliveryProgress?: ManagedDeliveryProgress;
  runtimeTelemetry?: AgentRuntimeTelemetry | null;
  executorUsage?: AgentUsage;
  hostUsage?: AgentUsage;
  runningAgentPid?: number | null;
  executorSelfRepairCount?: number;
  executorRejectionCounts?: Record<string, number>;
  retention?: ManagedRetention;
}

export type ManagedExecutorStage =
  | "source_discovery"
  | "implementation"
  | "unit_test"
  | "package"
  | "application_startup"
  | "http_e2e"
  | "cleanup"
  | "delivery_self_check";

export type VerificationCategory =
  | "build"
  | "test"
  | "startup"
  | "invocation"
  | "runtime";

export interface ManagedCommandEvidence {
  command: string;
  exitCode: number;
  result: string;
  categories?: VerificationCategory[];
  assertion?: "positive" | "negative";
}

export interface ExecutorResult {
  protocolVersion?: "superflow.executor.v2";
  messageType?: "executor_delivery";
  status: "ready_for_review" | "blocked" | "failed";
  summary: string;
  changedFiles: string[];
  commands: ManagedCommandEvidence[];
  evidence: string[];
  releasePrerequisites: string[];
  blockers: string[];
  taskEvidence?: ManagedTaskEvidence[];
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
  /** Frozen acceptance-contract references that this finding covers. */
  acceptanceContractRefs?: string[];
}

export interface ReviewResult {
  protocolVersion?: "superflow.review.v2";
  messageType?: "host_review";
  result: "pass" | "needs_fix" | "blocked";
  summary: string;
  findings: ReviewFinding[];
  verificationCommands?: ManagedCommandEvidence[];
  /** Full first-review coverage of the frozen acceptance contract. */
  acceptanceCoverage?: ManagedAcceptanceReviewCoverage;
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
  promptPath?: string;
  schemaPath: string;
  systemPromptPath?: string;
  sessionId: string | null;
  timeout: {
    warningMs: number;
    stalledMs: number;
    hardMs: number;
  };
  onProgress?: (summary: string) => void;
  onSession?: (sessionId: string) => void;
  onTelemetry?: (telemetry: AgentRuntimeTelemetry) => void;
  onProcess?: (pid: number | null) => void;
}

export interface AgentInvocationResult<T> {
  sessionId: string;
  output: T;
  stdout: string;
  stderr: string;
  exitCode: number;
  usage?: AgentUsage;
  telemetry?: AgentRuntimeTelemetry;
}

export interface AgentInvoker {
  invoke<T>(invocation: AgentInvocation): Promise<AgentInvocationResult<T>>;
}

export const HARD_MAX_REVIEW_ROUNDS = 10;
export const HARD_MAX_EXECUTOR_INVOCATIONS = 20;
export const HARD_MAX_TOTAL_AGENT_INVOCATIONS = 30;
export const HARD_MAX_ACTIVE_RUN_HOURS = 24;
export const HARD_MAX_SINGLE_INVOCATION_HOURS = 2;
export const HARD_MAX_EXECUTOR_TOKEN_UNITS = 50_000_000;
export const HARD_MAX_EXECUTOR_COST_USD = 100;

export const DEFAULT_MANAGED_BUDGETS: ManagedBudgets = {
  maxReviewRounds: 5,
  maxExecutorInvocations: 7,
  maxTotalAgentInvocations: 12,
  maxExecutorTokenUnits: 2_000_000,
  activeRunWarningHours: 12,
  maxActiveRunHours: HARD_MAX_ACTIVE_RUN_HOURS,
  noProgressWarningMinutes: 1,
  stalledTimeoutMinutes: 60,
  maxSingleInvocationHours: HARD_MAX_SINGLE_INVOCATION_HOURS,
};
