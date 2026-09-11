import { existsSync, readFileSync } from "fs";
import path from "path";
import {
  calculateManagedContractHash,
  createManagedTaskContract,
} from "./contract.js";
import { appendManagedEvent, readManagedEvents } from "./journal.js";
import { appendManagedHumanMessage } from "./human-messages.js";
import { resolveManagedInput } from "./input.js";
import { managedRunDir } from "./paths.js";
import { ensureManagedService } from "./service.js";
import {
  effectiveExecutorInvocations,
  effectiveTotalAgentInvocations,
  initManagedRunState,
} from "./state.js";
import {
  createManagedTaskFiles,
  loadManagedRun,
  loadManagedTask,
  loadRegistry,
  saveManagedRun,
  saveManagedTask,
  upsertRegistryEntry,
  writeJsonAtomic,
} from "./storage.js";
import type {
  AgentInvocation,
  AgentInvocationResult,
  AgentInvoker,
  ManagedAgent,
  AgentUsage,
  ManagedEvent,
  ManagedProfile,
  ManagedRunState,
  ManagedTaskContract,
  ManagedTaskStatus,
  ManagedFailure,
  ManagedSupervisorExecution,
  ReviewResult,
} from "./types.js";
import type { Language } from "../../types.js";
import { managedText } from "./i18n.js";
import { submitExternalHostReviewResult } from "./host-review.js";
import { assertCodingReadyForPrompt } from "../sdd-readiness.js";
import {
  clearManagedControlSignal,
  readManagedControlSignal,
  requestManagedPause,
} from "./control-signals.js";
import { evaluateCompletion } from "./completion-policy.js";
import type { ExecutorResult } from "./types.js";
import { stopProcessTree } from "../../platform/process-tree.js";
import { assertManagedAgentPair } from "./pair-admission.js";
import { runManagedTask } from "./runner.js";
import { assertManagedAcceptanceContractForStart } from "./acceptance-contract.js";

export interface ManagedControlRuntime {
  env?: NodeJS.ProcessEnv;
  cliPath: string;
  ensureService?: typeof ensureManagedService;
  assertManagedAgentPair?: typeof assertManagedAgentPair;
}

export interface StartManagedTaskInput {
  request: string;
  projectRoot: string;
  relatedProjectRoots?: string[];
  profile?: ManagedProfile | "auto";
  supervisorAgent?: ManagedAgent;
  executorAgent?: ManagedAgent;
  language?: Language;
  mandatoryEngineeringRules?: string[];
  externalModelDataDisclosureApproved?: boolean;
  externalModelDataDisclosureApprovedBy?: string;
  acceptanceContract?: ManagedTaskContract["acceptanceContract"];
}

export function submitHumanDirectedDelivery(
  taskId: string,
  delivery: ExecutorResult,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ManagedRunState> {
  const { contract, state } = loadManagedContext(taskId, env);
  if (contract.executionMode !== "human_directed") {
    throw new Error("该任务不是人工执行任务，不能提交人工交付");
  }
  if (state.status !== "waiting_for_human") {
    throw new Error("人工交付只能在等待人工交付时提交");
  }
  contract.status = "queued";
  state.status = "queued";
  state.currentStep = "manual_delivery_validating";
  saveManagedTask(contract);
  saveManagedRun(state);
  appendManagedEvent(state, {
    eventType: "executor.manual_delivery_received",
    actor: contract.executorAgent,
    role: "executor",
    summary: "已收到人工执行交付，开始复用托管门禁",
  });
  return runManagedTask(
    contract.projectRoot,
    contract.taskId,
    new ManualDeliveryInvoker(delivery),
    env,
  );
}

class ManualDeliveryInvoker implements AgentInvoker {
  constructor(private readonly delivery: ExecutorResult) {}

  async invoke<T>(
    _invocation: AgentInvocation,
  ): Promise<AgentInvocationResult<T>> {
    return {
      sessionId: "manual-delivery",
      output: this.delivery as T,
      stdout: JSON.stringify(this.delivery),
      stderr: "",
      exitCode: 0,
    };
  }
}

export interface ManagedTaskSnapshot {
  taskId: string;
  runId: string;
  projectRoot: string;
  relatedProjectRoots: string[];
  profile: ManagedProfile;
  language: Language;
  supervisorAgent: ManagedAgent;
  executorAgent: ManagedAgent;
  supervisorExecution: ManagedSupervisorExecution;
  pauseRequested: boolean;
  status: ManagedTaskStatus;
  currentStep: string;
  reviewRound: number;
  executorInvocations: number;
  effectiveExecutorInvocations: number;
  executorInvocationCredits: number;
  reviewInvocations: number;
  totalAgentInvocations: number;
  effectiveTotalAgentInvocations: number;
  totalAgentInvocationCredits: number;
  executorStage: ManagedRunState["executorStage"];
  executorActiveStage: ManagedRunState["executorActiveStage"];
  connectivityRetryCount: number;
  blocker: string | null;
  failure: ManagedFailure | null;
  attentionRequired: boolean;
  latestSequence: number;
  latestEvents: ManagedEvent[];
  pendingHostReview: {
    round: number;
    promptPath: string;
    prompt: string;
  } | null;
  lastExecutorResult: unknown;
  lastReviewResult: unknown;
  progressPath: string;
  reportPath: string;
  updatedAt: string;
  deliveryProgress: ManagedRunState["deliveryProgress"];
  runtimeTelemetry: ManagedRunState["runtimeTelemetry"];
  executorUsage: ManagedRunState["executorUsage"];
  hostUsage: ManagedRunState["hostUsage"];
  timing: {
    invocationElapsedSeconds: number | null;
    sinceProgressSeconds: number | null;
    warningSeconds: number;
    stalledSeconds: number;
    hardDeadlineSeconds: number;
  };
  dataDisclosure: ManagedTaskContract["permissions"]["externalModelDataDisclosure"];
  frozenTaskPrompt: ManagedTaskContract["taskPrompt"];
}

export interface ManagedTaskWaitSnapshot {
  taskId: string;
  runId: string;
  status: ManagedTaskStatus;
  currentStep: string;
  attentionRequired: boolean;
  attentionReason: string | null;
  recommendedAction: string | null;
  blocker: string | null;
  executorInvocations: number;
  effectiveExecutorInvocations: number;
  executorInvocationCredits: number;
  executorStage: ManagedRunState["executorStage"];
  executorActiveStage: ManagedRunState["executorActiveStage"];
  reviewRound: number;
  latestSequence: number;
  updatedAt: string;
}

export interface ManagedTaskWaitProgress {
  sequence: number;
  eventType: string;
  message: string;
}

const ATTENTION_STATUSES = new Set<ManagedTaskStatus>([
  "waiting_for_host_review",
  "waiting_for_provider_change",
  "waiting_for_human",
  "paused",
  "review_exhausted",
  "repair_pending",
  "budget_exhausted",
  "deadline_exhausted",
  "awaiting_git_approval",
  "local_delivery_ready",
  "environment_validation_blocked",
  "release_ready",
  "completed",
  "failed",
  "cancelled",
]);

const RETRY_REUSABLE_STATUSES = new Set<ManagedTaskStatus>([
  "queued",
  "running",
  "waiting_for_connectivity",
  "waiting_for_provider_change",
  "waiting_for_host_review",
  "waiting_for_human",
  "paused",
  "review_exhausted",
  "budget_exhausted",
  "deadline_exhausted",
  "repair_pending",
]);

export function startManagedTaskFromHost(
  input: StartManagedTaskInput,
  runtime: ManagedControlRuntime,
): ManagedTaskSnapshot {
  const language = input.language ?? "zh";
  const resolved = resolveManagedInput(input.request, {
    projectRoot: input.projectRoot,
    relatedProjectRoots: input.relatedProjectRoots,
    profile: input.profile,
    language,
  });
  const supervisorAgent = input.supervisorAgent ?? "codex";
  const executorAgent = input.executorAgent ?? oppositeAgent(supervisorAgent);
  const env = runtime.env ?? process.env;
  const existingTaskId = findRetryReusableTask(
    resolved,
    input,
    supervisorAgent,
    executorAgent,
    env,
  );
  if (existingTaskId) {
    startService(runtime, language);
    return getManagedTaskSnapshot(existingTaskId, env);
  }
  if (resolved.source === "sdd" && resolved.taskPromptPath) {
    assertCodingReadyForPrompt(resolved.taskPromptPath);
  }
  (runtime.assertManagedAgentPair ?? assertManagedAgentPair)(
    supervisorAgent,
    executorAgent,
  );

  const contract = createManagedTaskContract({
    request: resolved.request,
    projectRoot: resolved.projectRoot,
    relatedProjectRoots: resolved.relatedProjectRoots,
    profile: resolved.profile,
    supervisorAgent,
    executorAgent,
    source: resolved.source,
    taskPromptPath: resolved.taskPromptPath,
    language,
    mandatoryEngineeringRules: input.mandatoryEngineeringRules,
    externalModelDataDisclosure: {
      approved: input.externalModelDataDisclosureApproved === true,
      approvedBy: input.externalModelDataDisclosureApprovedBy,
    },
    acceptanceContract: input.acceptanceContract,
  });
  assertManagedAcceptanceContractForStart(contract);
  // Validate the frozen first-run contract before touching the runtime. The
  // service handshake still happens before task persistence, so a failed
  // runtime upgrade cannot leave a duplicate task behind.
  startService(runtime, language);
  const state = initManagedRunState(contract);
  createManagedTaskFiles(contract, state, env);
  appendManagedEvent(state, {
    eventType: "run.created",
    actor: "superflow-mcp",
    role: "runner",
    summary: managedText(
      language,
      "MCP Host 已创建托管任务；当前主 Agent 直接评审，禁止嵌套 Supervisor CLI",
      "The MCP host created the managed task; the current host reviews directly and nested supervisor CLIs are forbidden",
    ),
  });
  return getManagedTaskSnapshot(contract.taskId, env);
}

export function listManagedTaskSnapshots(
  env: NodeJS.ProcessEnv = process.env,
): ManagedTaskSnapshot[] {
  const snapshots: ManagedTaskSnapshot[] = [];
  for (const entry of loadRegistry(env)
    .tasks.slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))) {
    try {
      snapshots.push(getManagedTaskSnapshot(entry.taskId, env));
    } catch {
      // Registry entries are locators, not a reason to fail the whole control
      // plane. Missing/corrupt workspaces remain on disk for audit and can be
      // repaired separately; healthy tasks must stay listable.
    }
  }
  return snapshots;
}

function findRetryReusableTask(
  resolved: ReturnType<typeof resolveManagedInput>,
  input: StartManagedTaskInput,
  supervisorAgent: ManagedAgent,
  executorAgent: ManagedAgent,
  env: NodeJS.ProcessEnv,
): string | null {
  const relatedRoots = resolved.relatedProjectRoots;
  const mandatoryRules = input.mandatoryEngineeringRules ?? [];
  for (const entry of loadRegistry(env).tasks) {
    if (!RETRY_REUSABLE_STATUSES.has(entry.status)) continue;
    try {
      const contract = loadManagedTask(entry.projectRoot, entry.taskId);
      if (
        contract.projectRoot === resolved.projectRoot &&
        contract.request === resolved.request &&
        (resolved.profile === undefined ||
          resolved.profile === "auto" ||
          contract.profile === resolved.profile) &&
        contract.supervisorAgent === supervisorAgent &&
        contract.executorAgent === executorAgent &&
        contract.source === resolved.source &&
        sameStrings(contract.relatedProjectRoots, relatedRoots) &&
        sameStrings(contract.mandatoryEngineeringRules ?? [], mandatoryRules) &&
        (contract.taskPrompt?.originalPath ?? null) ===
          (resolved.taskPromptPath ?? null)
      ) {
        return contract.taskId;
      }
    } catch {
      // A stale locator is not reusable and must not block a fresh start.
    }
  }
  return null;
}

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function getManagedTaskSnapshot(
  taskId: string,
  env: NodeJS.ProcessEnv = process.env,
): ManagedTaskSnapshot {
  const { contract, state } = loadManagedContext(taskId, env);
  const events = readManagedEvents(state);
  const pending = state.pendingExternalReview;
  const runDir = managedRunDir(state.projectRoot, state.taskId, state.runId);
  return {
    taskId: state.taskId,
    runId: state.runId,
    projectRoot: contract.projectRoot,
    relatedProjectRoots: contract.relatedProjectRoots,
    profile: contract.profile,
    language: contract.language ?? "zh",
    supervisorAgent: contract.supervisorAgent,
    executorAgent: contract.executorAgent,
    supervisorExecution: contract.supervisorExecution ?? "external_host",
    pauseRequested: readManagedControlSignal(contract)?.pauseRequested === true,
    status: state.status,
    currentStep: state.currentStep,
    reviewRound: state.reviewRound,
    executorInvocations: state.executorInvocations,
    effectiveExecutorInvocations: effectiveExecutorInvocations(state),
    executorInvocationCredits: state.executorInvocationCredits ?? 0,
    reviewInvocations: state.reviewInvocations,
    totalAgentInvocations: state.totalAgentInvocations,
    effectiveTotalAgentInvocations: effectiveTotalAgentInvocations(state),
    totalAgentInvocationCredits: state.totalAgentInvocationCredits ?? 0,
    executorStage: state.executorStage ?? null,
    executorActiveStage:
      state.executorActiveStage ?? state.executorStage ?? null,
    connectivityRetryCount: state.connectivityRetryCount ?? 0,
    blocker: state.blocker,
    failure: state.failure ?? null,
    attentionRequired: ATTENTION_STATUSES.has(state.status),
    latestSequence: events.at(-1)?.sequence ?? 0,
    latestEvents: events.slice(-20),
    pendingHostReview: pending
      ? {
          round: pending.round,
          promptPath: pending.promptPath,
          prompt: readTextIfExists(pending.promptPath),
        }
      : null,
    lastExecutorResult: readJsonIfExists(state.lastExecutorResult),
    lastReviewResult: readJsonIfExists(state.lastReviewResult),
    progressPath: path.join(runDir, "progress.md"),
    reportPath: path.join(runDir, "task-report.md"),
    updatedAt: state.updatedAt,
    deliveryProgress: state.deliveryProgress,
    runtimeTelemetry: state.runtimeTelemetry ?? null,
    executorUsage: state.executorUsage,
    hostUsage: state.hostUsage,
    timing: timingSnapshot(contract, state),
    dataDisclosure: contract.permissions.externalModelDataDisclosure,
    frozenTaskPrompt: contract.taskPrompt,
  };
}

function timingSnapshot(
  contract: ManagedTaskContract,
  state: ManagedRunState,
): ManagedTaskSnapshot["timing"] {
  const now = Date.now();
  const activeAt = state.activeSince ? Date.parse(state.activeSince) : null;
  const progressAt = state.runtimeTelemetry?.lastProgressAt
    ? Date.parse(state.runtimeTelemetry.lastProgressAt)
    : null;
  return {
    invocationElapsedSeconds:
      activeAt === null
        ? null
        : Math.max(0, Math.round((now - activeAt) / 1_000)),
    sinceProgressSeconds:
      progressAt === null
        ? null
        : Math.max(0, Math.round((now - progressAt) / 1_000)),
    warningSeconds: contract.budgets.noProgressWarningMinutes * 60,
    stalledSeconds: contract.budgets.stalledTimeoutMinutes * 60,
    hardDeadlineSeconds: contract.budgets.maxSingleInvocationHours * 3_600,
  };
}

export async function waitForManagedTaskChange(
  taskId: string,
  afterSequence: number,
  timeoutSeconds: number,
  runtime: ManagedControlRuntime,
  wakeOnProgress = false,
  onProgress?: (progress: ManagedTaskWaitProgress) => void | Promise<void>,
): Promise<{ timedOut: boolean; snapshot: ManagedTaskWaitSnapshot }> {
  const timeout = Math.min(Math.max(timeoutSeconds, 1), 43_200) * 1_000;
  const deadline = Date.now() + timeout;
  let lastServiceCheck = 0;
  let lastReportedSequence = afterSequence;
  while (true) {
    const snapshot = getManagedTaskSnapshot(taskId, runtime.env);
    const reportable = snapshot.latestEvents
      .filter(
        (event) =>
          event.sequence > lastReportedSequence &&
          isWaitProgressEvent(event.eventType),
      )
      .sort((left, right) => left.sequence - right.sequence);
    for (const event of reportable) {
      await onProgress?.({
        sequence: event.sequence,
        eventType: event.eventType,
        message: event.summary,
      });
      lastReportedSequence = event.sequence;
    }
    const supervisionAttention = snapshot.latestEvents
      .slice()
      .reverse()
      .find(
        (event) =>
          event.sequence > afterSequence &&
          event.eventType === "executor.supervision_attention_required",
      );
    if (
      snapshot.attentionRequired ||
      supervisionAttention ||
      (wakeOnProgress && snapshot.latestSequence > afterSequence)
    ) {
      return {
        timedOut: false,
        snapshot: compactWaitSnapshot(snapshot, supervisionAttention?.summary),
      };
    }
    if (Date.now() >= deadline) {
      return { timedOut: true, snapshot: compactWaitSnapshot(snapshot) };
    }
    if (Date.now() - lastServiceCheck >= 10_000) {
      startService(runtime, snapshot.language);
      lastServiceCheck = Date.now();
    }
    await delay(500);
  }
}

function isWaitProgressEvent(eventType: string): boolean {
  return [
    "executor.stage_changed",
    "executor.stage_rework",
    "executor.supervision_checkpoint",
    "executor.supervision_checkpoint_idle",
    "executor.supervision_attention_required",
  ].includes(eventType);
}

function compactWaitSnapshot(
  snapshot: ManagedTaskSnapshot,
  supervisionReason?: string,
): ManagedTaskWaitSnapshot {
  return {
    taskId: snapshot.taskId,
    runId: snapshot.runId,
    status: snapshot.status,
    currentStep: snapshot.currentStep,
    attentionRequired: snapshot.attentionRequired || Boolean(supervisionReason),
    attentionReason: supervisionReason ?? attentionReason(snapshot),
    recommendedAction: supervisionReason
      ? managedText(
          snapshot.language,
          "执行一次轻量监督：只检查阶段、权威命令、真实 diff 和重复失败；正常则继续等待，偏航则记录指导或暂停",
          "Perform one lightweight supervision check: inspect only stage, authoritative commands, real diff, and repeated failures; keep waiting when healthy, otherwise record guidance or pause",
        )
      : recommendedAction(snapshot.status, snapshot.language),
    blocker: snapshot.blocker,
    executorInvocations: snapshot.executorInvocations,
    effectiveExecutorInvocations: snapshot.effectiveExecutorInvocations,
    executorInvocationCredits: snapshot.executorInvocationCredits,
    executorStage: snapshot.executorStage,
    executorActiveStage: snapshot.executorActiveStage,
    reviewRound: snapshot.reviewRound,
    latestSequence: snapshot.latestSequence,
    updatedAt: snapshot.updatedAt,
  };
}

function attentionReason(snapshot: ManagedTaskSnapshot): string | null {
  if (!snapshot.attentionRequired) return null;
  return (
    snapshot.blocker ??
    snapshot.currentStep ??
    snapshot.latestEvents.at(-1)?.summary
  );
}

function recommendedAction(
  status: ManagedTaskStatus,
  language: Language,
): string | null {
  if (status === "waiting_for_host_review") {
    return managedText(
      language,
      "读取冻结 Prompt、工作区和证据，提交一次完整 Host 评审",
      "Read the frozen prompt, workspace, and evidence, then submit one complete host review",
    );
  }
  if (status === "budget_exhausted" || status === "review_exhausted") {
    return managedText(
      language,
      "立即通知用户并等待明确授权增加预算",
      "Notify the user immediately and wait for explicit approval to increase the budget",
    );
  }
  if (status === "waiting_for_provider_change") {
    return managedText(
      language,
      "立即通知用户切换或恢复研发 Agent 模型供应商",
      "Notify the user to switch or restore the executor model provider",
    );
  }
  if (status === "waiting_for_human" || status === "repair_pending") {
    return managedText(
      language,
      "读取阻塞原因并向用户请求必要输入",
      "Read the blocker and request the required user input",
    );
  }
  if (status === "paused") {
    return managedText(
      language,
      "保持暂停，等待用户要求继续",
      "Remain paused until the user asks to continue",
    );
  }
  if (
    status === "awaiting_git_approval" ||
    status === "local_delivery_ready" ||
    status === "environment_validation_blocked" ||
    status === "release_ready"
  ) {
    return managedText(
      language,
      "停止自动执行并向用户汇报交付状态，禁止自动提交或发布",
      "Stop automatic execution and report delivery status; do not commit or release automatically",
    );
  }
  if (status === "failed" || status === "deadline_exhausted") {
    return managedText(
      language,
      "立即向用户汇报失败原因和可恢复方案",
      "Report the failure reason and recovery options immediately",
    );
  }
  return null;
}

export function submitManagedHostReview(
  taskId: string,
  review: ReviewResult,
  runtime: ManagedControlRuntime,
  hostUsage?: AgentUsage,
  hostUsageUnavailableReason?: string,
): ManagedTaskSnapshot {
  const env = runtime.env ?? process.env;
  const { contract, state } = loadManagedContext(taskId, env);
  const resultPath = submitExternalHostReviewResult(
    contract,
    state,
    review,
    contract.language,
    env,
  );
  if (hostUsage) {
    state.hostUsage = mergeUsage(state.hostUsage, hostUsage);
    saveManagedRun(state);
  }
  appendManagedEvent(state, {
    eventType: "review.external_submitted",
    actor: contract.supervisorAgent,
    role: "supervisor",
    summary: hostUsage
      ? managedText(
          contract.language,
          "当前 MCP Host 已提交结构化评审结果和用量",
          "The current MCP host submitted its structured review and usage",
        )
      : managedText(
          contract.language,
          `当前 MCP Host 已提交结构化评审结果；Host 用量不可用：${hostUsageUnavailableReason ?? "未说明"}`,
          `The current MCP host submitted its structured review; Host usage unavailable: ${hostUsageUnavailableReason ?? "unspecified"}`,
        ),
    evidencePaths: [resultPath],
  });
  startService(runtime, contract.language);
  return getManagedTaskSnapshot(taskId, env);
}

export function recordManagedValidation(
  taskId: string,
  category: "environment" | "release",
  summary: string,
  evidencePaths: string[],
  runtime: ManagedControlRuntime,
  actor = "user",
): ManagedTaskSnapshot {
  const env = runtime.env ?? process.env;
  const { contract, state, entry } = loadManagedContext(taskId, env);
  if (
    ![
      "local_delivery_ready",
      "environment_validation_blocked",
      "release_ready",
    ].includes(state.status)
  ) {
    throw new Error(
      managedText(
        contract.language,
        "只有交付阶段允许记录环境或发布验收",
        "Environment or release validation can only be recorded during delivery states",
      ),
    );
  }
  const executor = readJsonIfExists(
    state.lastExecutorResult,
  ) as ExecutorResult | null;
  const decision = evaluateCompletion(contract, executor);
  if (!decision.localReady) {
    throw new Error(
      managedText(
        contract.language,
        "本地源码任务重新出现缺口，必须重新打开研发整改",
        "Local source gaps reappeared; reopen executor repair before recording validation",
      ),
    );
  }
  state.deliveryProgress = decision.progress;
  state.status = !decision.environmentReady
    ? "environment_validation_blocked"
    : !decision.releaseReady
      ? "local_delivery_ready"
      : "release_ready";
  state.currentStep = state.status;
  state.blocker = null;
  contract.status = state.status;
  saveManagedRun(state);
  saveManagedTask(contract);
  upsertRegistryEntry(
    {
      ...entry,
      status: state.status,
      updatedAt: new Date().toISOString(),
    },
    env,
  );
  appendManagedEvent(state, {
    eventType: `validation.${category}_recorded`,
    actor,
    role: "system",
    summary,
    evidencePaths,
  });
  return getManagedTaskSnapshot(taskId, env);
}

export function authorizeManagedExecutor(
  taskId: string,
  approvedBy: string,
  runtime: ManagedControlRuntime,
): ManagedTaskSnapshot {
  const env = runtime.env ?? process.env;
  const { contract, state, entry } = loadManagedContext(taskId, env);
  contract.permissions.externalModelDataDisclosure = {
    approved: true,
    approvedBy,
    approvedAt: new Date().toISOString(),
    scope: [contract.projectRoot, ...contract.relatedProjectRoots],
  };
  contract.contractHash = calculateManagedContractHash(contract);
  state.contractHash = contract.contractHash;
  if (state.status === "waiting_for_human") {
    state.status = "queued";
    state.currentStep = "data_disclosure_authorized";
    state.blocker = null;
    contract.status = "queued";
  }
  saveManagedTask(contract);
  saveManagedRun(state);
  upsertRegistryEntry(
    {
      ...entry,
      status: state.status,
      updatedAt: new Date().toISOString(),
    },
    env,
  );
  appendManagedEvent(state, {
    eventType: "contract.data_disclosure_authorized",
    actor: approvedBy,
    role: "system",
    summary: managedText(
      contract.language,
      `已授权 ${contract.executorAgent} 在冻结仓库作用域内处理源码；宿主 DLP 仍独立生效`,
      `${contract.executorAgent} was authorized to process source within the frozen repository scope; host DLP remains independently enforced`,
    ),
  });
  startService(runtime, contract.language);
  return getManagedTaskSnapshot(taskId, env);
}

function mergeUsage(
  current: AgentUsage | undefined,
  next: AgentUsage,
): AgentUsage {
  const sum = (
    left: number | null | undefined,
    right: number | null,
  ): number | null =>
    left == null && right == null ? null : (left ?? 0) + (right ?? 0);
  return {
    inputTokens: sum(current?.inputTokens, next.inputTokens),
    outputTokens: sum(current?.outputTokens, next.outputTokens),
    cacheReadTokens: sum(current?.cacheReadTokens, next.cacheReadTokens),
    cacheWriteTokens: sum(current?.cacheWriteTokens, next.cacheWriteTokens),
    costUsd: sum(current?.costUsd, next.costUsd),
  };
}

export function addManagedHumanGuidance(
  taskId: string,
  content: string,
  runtime: ManagedControlRuntime,
  actor = "user",
): ManagedTaskSnapshot {
  const env = runtime.env ?? process.env;
  const { contract, state, entry } = loadManagedContext(taskId, env);
  const message = appendManagedHumanMessage(contract, content, actor);
  if (
    [
      "waiting_for_human",
      "waiting_for_provider_change",
      "paused",
      "awaiting_git_approval",
      "local_delivery_ready",
      "environment_validation_blocked",
      "release_ready",
      "repair_pending",
    ].includes(state.status)
  ) {
    const review = humanGuidanceReview(
      state,
      message.content,
      contract.language,
    );
    const resultPath = path.join(
      managedRunDir(state.projectRoot, state.taskId, state.runId),
      `human-guidance-${Date.now()}.json`,
    );
    writeJsonAtomic(resultPath, review);
    state.lastReviewResult = resultPath;
    state.lastExecutorResult = null;
    state.status = "queued";
    state.currentStep = "human_guidance_received";
    state.blocker = null;
    state.completedAt = null;
    state.activeSince = null;
    contract.status = "queued";
    saveManagedRun(state);
    saveManagedTask(contract);
    upsertRegistryEntry(
      {
        ...entry,
        status: "queued",
        updatedAt: new Date().toISOString(),
      },
      env,
    );
    appendManagedEvent(state, {
      eventType: "human.guidance_resumed",
      actor: message.actor,
      role: "system",
      summary: managedText(
        contract.language,
        `用户补充要求并恢复任务：${message.content}`,
        `User guidance resumed the task: ${message.content}`,
      ),
      evidencePaths: [resultPath],
    });
    startService(runtime, contract.language);
  }
  return getManagedTaskSnapshot(taskId, env);
}

export function pauseManagedTask(
  taskId: string,
  reason: string,
  runtime: ManagedControlRuntime,
  actor = "user",
): ManagedTaskSnapshot {
  const env = runtime.env ?? process.env;
  const { contract, state, entry } = loadManagedContext(taskId, env);
  const signal = requestManagedPause(contract, reason, actor);
  if (state.status === "running" && state.runningAgentPid) {
    stopProcessTree(state.runningAgentPid);
  }
  if (!["running", "queued"].includes(state.status)) {
    state.status = "paused";
    state.currentStep = "paused_by_user";
    state.blocker = signal.reason;
    state.activeSince = null;
    contract.status = "paused";
    saveManagedRun(state);
    saveManagedTask(contract);
    upsertRegistryEntry(
      {
        ...entry,
        status: "paused",
        updatedAt: new Date().toISOString(),
      },
      env,
    );
    appendManagedEvent(state, {
      eventType: "human.pause_applied",
      actor: signal.actor,
      role: "system",
      summary: signal.reason,
    });
  }
  return getManagedTaskSnapshot(taskId, env);
}

export function resumeManagedTaskFromHost(
  taskId: string,
  runtime: ManagedControlRuntime,
): ManagedTaskSnapshot {
  const env = runtime.env ?? process.env;
  const { contract, state, entry } = loadManagedContext(taskId, env);
  const recoveringEscalatedReview = canRecoverEscalatedHostReview(state);
  if (state.status !== "paused" && !recoveringEscalatedReview) {
    throw new Error(
      managedText(
        contract.language,
        "只有 paused 或可安全恢复的 Host 评审升级状态允许恢复",
        "Only a paused task or safely recoverable Host-review escalation can be resumed",
      ),
    );
  }
  clearManagedControlSignal(contract);
  state.status = "queued";
  state.currentStep = recoveringEscalatedReview
    ? "recovering_host_review_escalation"
    : "resuming_after_pause";
  state.blocker = null;
  state.activeSince = null;
  contract.status = "queued";
  saveManagedRun(state);
  saveManagedTask(contract);
  upsertRegistryEntry(
    {
      ...entry,
      status: "queued",
      updatedAt: new Date().toISOString(),
    },
    env,
  );
  appendManagedEvent(state, {
    eventType: recoveringEscalatedReview
      ? "review.escalation_recovery_requested"
      : "human.resume_requested",
    actor: recoveringEscalatedReview ? "managed-runner" : "user",
    role: "system",
    summary: managedText(
      contract.language,
      recoveringEscalatedReview
        ? "恢复已留存的 Host 评审升级；将重建事实包，不重新调用研发 Agent"
        : "用户恢复托管任务",
      recoveringEscalatedReview
        ? "Recovering persisted Host-review escalation; rebuilding facts without invoking the executor"
        : "The user resumed the managed task",
    ),
  });
  startService(runtime, contract.language);
  return getManagedTaskSnapshot(taskId, env);
}

function canRecoverEscalatedHostReview(state: ManagedRunState): boolean {
  if (state.status !== "waiting_for_human") return false;
  if (!state.lastExecutorResult?.endsWith("-invalid.json")) return false;
  return readManagedEvents(state).some(
    (event) => event.eventType === "executor.rejection_escalated_to_host",
  );
}

function loadManagedContext(
  taskId: string,
  env: NodeJS.ProcessEnv,
): {
  contract: ManagedTaskContract;
  state: ManagedRunState;
  entry: ReturnType<typeof loadRegistry>["tasks"][number];
} {
  const registry = loadRegistry(env);
  const entry = registry.tasks.find((item) => item.taskId === taskId);
  if (!entry) throw new Error(`Managed task not found: ${taskId}`);
  const contract = loadManagedTask(entry.projectRoot, taskId);
  const state = loadManagedRun(entry.projectRoot, taskId, entry.activeRunId);
  return { contract, state, entry };
}

function startService(
  runtime: ManagedControlRuntime,
  language?: Language,
): void {
  const ensure = runtime.ensureService ?? ensureManagedService;
  ensure(runtime.cliPath, runtime.env ?? process.env, language);
}

function humanGuidanceReview(
  state: ManagedRunState,
  content: string,
  language: Language = "zh",
): ReviewResult {
  return {
    result: "needs_fix",
    summary: content,
    findings: [
      {
        id: `HUMAN-GUIDANCE-${state.reviewRound + 1}`,
        severity: "high",
        blocking: true,
        category: "human_guidance",
        target: "当前托管任务",
        evidence: content,
        risk: managedText(
          language,
          "忽略用户最新补充会导致交付偏离当前目标",
          "Ignoring the latest user guidance would make the delivery diverge from the current goal",
        ),
        requiredFix: content,
        acceptanceChecks: [content],
      },
    ],
  };
}

function readJsonIfExists(file: string | null): unknown {
  if (!file || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf-8"));
}

function readTextIfExists(file: string): string {
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf-8");
}

function oppositeAgent(agent: ManagedAgent): ManagedAgent {
  return agent === "codex" ? "claude" : "codex";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
