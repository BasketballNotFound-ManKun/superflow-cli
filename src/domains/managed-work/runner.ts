import { randomUUID } from "crypto";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type {
  AgentInvocation,
  AgentInvoker,
  ExecutorResult,
  ManagedRunState,
  ManagedTaskContract,
  ReviewFinding,
  ReviewResult,
} from "./types.js";
import {
  appendManagedEvent,
  readManagedEvents,
  verifyManagedJournal,
} from "./journal.js";
import { acquireManagedLock } from "./lock.js";
import { managedRunDir } from "./paths.js";
import { buildExecutorPrompt, buildReviewPrompt } from "./prompts.js";
import { writeManagedSchemas } from "./schemas.js";
import {
  appendTaskReport,
  loadRegistry,
  loadManagedRun,
  loadManagedTask,
  saveManagedRun,
  saveManagedTask,
  upsertRegistryEntry,
  updateTaskReportStatus,
  writeJsonAtomic,
} from "./storage.js";
import {
  activeRunMilliseconds,
  computeWorkspaceFingerprintForRoots,
} from "./state.js";
import { ASSETS_DIR } from "../../platform/assets.js";
import { notifyManagedTask } from "./notifications.js";
import {
  validateManagedTaskContract,
  validateManagedTaskPromptSnapshot,
} from "./contract.js";
import { managedList, managedText } from "./i18n.js";

export async function runManagedTask(
  projectRoot: string,
  taskId: string,
  invoker: AgentInvoker,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ManagedRunState> {
  let contract = loadManagedTask(projectRoot, taskId);
  let state = loadManagedRun(projectRoot, taskId, registryRunId(contract, env));
  const runDir = managedRunDir(projectRoot, taskId, state.runId);
  mkdirSync(runDir, { recursive: true });
  const lock = acquireManagedLock(
    path.join(runDir, "run.lock"),
    randomUUID(),
    contract.language,
  );
  let projectLocks: ReturnType<typeof acquireProjectLocks> = [];

  try {
    projectLocks = acquireProjectLocks(contract);
    validateManagedTaskContract(contract);
    validateManagedTaskPromptSnapshot(contract);
    if (state.contractHash !== contract.contractHash) {
      return finishBlocked(
        contract,
        state,
        mt(contract, "运行状态与任务合同哈希不一致", "Run state and task contract hashes do not match"),
        env,
      );
    }
    if (!verifyManagedJournal(state)) {
      return finishBlocked(
        contract,
        state,
        mt(contract, "事件账本校验失败，拒绝继续", "Event journal verification failed; refusing to continue"),
        env,
      );
    }
    state = transition(contract, state, "running", "preflight", env);
    appendManagedEvent(state, {
      eventType: "run.started",
      actor: "managed-runner",
      role: "runner",
      summary: mt(
        contract,
        "后台开始或恢复托管任务",
        "Background service started or resumed the managed task",
      ),
    });
    const schemas = writeManagedSchemas(state);
    state = reconcileCompletedReview(contract, state, env);

    while (state.status === "running") {
      state = enforceBudgets(contract, state, env);
      if (state.status !== "running") break;

      if (!state.lastExecutorResult) {
        const findings = loadRepairFindings(state);
        state = await executeWorker(
          contract,
          state,
          findings,
          schemas.executor,
          invoker,
          env,
        );
        if (state.status !== "running") break;
      }

      state = await executeReview(
        contract,
        state,
        schemas.reviewer,
        invoker,
        env,
      );
      if (state.status !== "running") break;
      contract = loadManagedTask(projectRoot, taskId);
      validateManagedTaskContract(contract);
    }
    return state;
  } catch (error) {
    const message = (error as Error).message;
    if (state.activeSince) {
      state.activeRunMilliseconds += Math.max(
        0,
        Date.now() - Date.parse(state.activeSince),
      );
      state.activeSince = null;
      saveManagedRun(state);
    }
    if (isConnectivityFailure(message)) {
      state = transition(
        contract,
        state,
        "waiting_for_connectivity",
        "connectivity_wait",
        env,
      );
      state.blocker = message;
      saveManagedRun(state);
      appendManagedEvent(state, {
        eventType: "connectivity.lost",
        actor: "managed-runner",
        role: "system",
        summary: mt(
          contract,
          `网络或模型服务暂时不可用：${message}`,
          `Network or model service is temporarily unavailable: ${message}`,
        ),
      });
      return state;
    }
    return finishBlocked(contract, state, message, env);
  } finally {
    for (const projectLock of projectLocks.reverse()) projectLock.release();
    lock.release();
  }
}

function reconcileCompletedReview(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  env: NodeJS.ProcessEnv,
): ManagedRunState {
  if (!state.lastReviewResult || !existsSync(state.lastReviewResult)) return state;
  if (!state.lastReviewResult.endsWith(`review-result-${state.reviewRound}.json`)) {
    return state;
  }
  const result = JSON.parse(
    readFileSync(state.lastReviewResult, "utf-8"),
  ) as ReviewResult;
  validateReviewResult(result, contract.language);
  const endedReviews = readManagedEvents(state).filter(
    (event) => event.eventType === "review.ended",
  ).length;
  if (endedReviews < state.reviewInvocations) {
    appendTaskReport(state, reviewReportSection(state, result));
    appendManagedEvent(state, {
      eventType: "review.ended",
      actor: contract.supervisorAgent,
      role: "supervisor",
      summary: mt(
        contract,
        `恢复已落盘的检查结果：${result.summary}`,
        `Recovered persisted review result: ${result.summary}`,
      ),
      evidencePaths: [state.lastReviewResult],
    });
  }
  if (result.result === "pass") {
    return finishAwaitingGitApproval(contract, state, result.summary, env);
  }
  if (result.result === "blocked") {
    return finishBlocked(contract, state, result.summary, env);
  }
  if (state.reviewRound >= contract.budgets.maxReviewRounds) {
    return finishReviewExhausted(contract, state, env);
  }
  if (state.executorInvocations <= state.reviewInvocations) {
    state.lastExecutorResult = null;
    state.currentStep = "repair_prompt_ready";
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "recovery.checkpoint_restored",
      actor: "managed-runner",
      role: "runner",
      summary: mt(
        contract,
        "根据已落盘的整改结论恢复到执行者整改步骤",
        "Restored the executor repair step from persisted review findings",
      ),
    });
  }
  return state;
}

async function executeWorker(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  findings: ReviewFinding[],
  schemaPath: string,
  invoker: AgentInvoker,
  env: NodeJS.ProcessEnv,
): Promise<ManagedRunState> {
  if (state.executorInvocations >= contract.budgets.maxExecutorInvocations) {
    return finishBudgetExhausted(
      contract,
      state,
      mt(contract, "执行调用次数达到上限", "Executor invocation limit reached"),
      env,
    );
  }
  if (
    state.totalAgentInvocations >= contract.budgets.maxTotalAgentInvocations
  ) {
    return finishBudgetExhausted(
      contract,
      state,
      mt(contract, "总 Agent 调用次数达到上限", "Total Agent invocation limit reached"),
      env,
    );
  }

  state.executorInvocations += 1;
  state.totalAgentInvocations += 1;
  state.currentStep =
    findings.length > 0 ? "executor_repairing" : "executor_implementing";
  state.activeSince = new Date().toISOString();
  saveManagedRun(state);
  appendManagedEvent(state, {
    eventType: "executor.started",
    actor: contract.executorAgent,
    role: "executor",
    summary: mt(
      contract,
      `开始第 ${state.executorInvocations} 次执行调用`,
      `Started executor invocation ${state.executorInvocations}`,
    ),
  });

  const prompt = buildExecutorPrompt(contract, state, findings);
  const promptFile = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    findings.length > 0
      ? `repair-${state.reviewRound}.md`
      : "executor-initial-prompt.md",
  );
  writeFileSync(promptFile, prompt, "utf-8");
  state.lastRepairPrompt =
    findings.length > 0 ? promptFile : state.lastRepairPrompt;
  const started = Date.now();
  const result = await invoker.invoke<ExecutorResult>(
    invocation(
      contract,
      state,
      "executor",
      prompt,
      schemaPath,
      state.executorSession.sessionId,
      (sessionId) => {
        state.executorSession = {
          ...state.executorSession,
          sessionId,
          createdAt:
            state.executorSession.createdAt ?? new Date().toISOString(),
          status: "active",
          lastResumedRound: state.reviewRound,
        };
        saveManagedRun(state);
      },
      (summary) =>
        appendManagedEvent(state, {
          eventType: "executor.progress",
          actor: contract.executorAgent,
          role: "executor",
          summary,
        }),
    ),
  );
  state = closeActiveTime(state, started);
  state.executorSession = {
    ...state.executorSession,
    sessionId: result.sessionId,
    createdAt: state.executorSession.createdAt ?? new Date().toISOString(),
    status: "active",
    lastResumedRound: state.reviewRound,
  };
  validateExecutorResult(contract, result.output);
  const resultFile = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    `executor-result-${state.executorInvocations}.json`,
  );
  writeJsonAtomic(resultFile, result.output);
  const logFiles = writeInvocationLogs(
    state,
    `executor-${state.executorInvocations}`,
    result.stdout,
    result.stderr,
  );
  state.lastExecutorResult = resultFile;
  state.currentStep = "delivery_evidence_checking";
  state.workspaceFingerprint = computeWorkspaceFingerprintForRoots([
    contract.projectRoot,
    ...contract.relatedProjectRoots,
  ]);
  saveManagedRun(state);
  appendTaskReport(state, executorReportSection(state, result.output));
  appendManagedEvent(state, {
    eventType: "executor.ended",
    actor: contract.executorAgent,
    role: "executor",
    summary: result.output.summary,
    evidencePaths: [resultFile, ...logFiles, ...result.output.evidence],
  });

  if (result.output.status === "ready_for_review") return state;
  return finishBlocked(
    contract,
    state,
    managedList(contract.language, result.output.blockers, "", "") || result.output.summary,
    env,
  );
}

async function executeReview(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  schemaPath: string,
  invoker: AgentInvoker,
  env: NodeJS.ProcessEnv,
): Promise<ManagedRunState> {
  if (state.reviewInvocations >= contract.budgets.maxReviewRounds) {
    return finishReviewExhausted(contract, state, env);
  }
  if (
    state.totalAgentInvocations >= contract.budgets.maxTotalAgentInvocations
  ) {
    return finishBudgetExhausted(
      contract,
      state,
      mt(contract, "总 Agent 调用次数达到上限", "Total Agent invocation limit reached"),
      env,
    );
  }

  const fingerprint = computeWorkspaceFingerprintForRoots([
    contract.projectRoot,
    ...contract.relatedProjectRoots,
  ]);
  state.reviewRound += 1;
  state.reviewInvocations += 1;
  state.totalAgentInvocations += 1;
  state.currentStep = "supervisor_reviewing";
  state.activeSince = new Date().toISOString();
  saveManagedRun(state);
  appendManagedEvent(state, {
    eventType: "review.started",
    actor: contract.supervisorAgent,
    role: "supervisor",
    summary: mt(
      contract,
      `开始第 ${state.reviewRound} 轮正式检查`,
      `Started formal review round ${state.reviewRound}`,
    ),
  });

  const prompt = buildReviewPrompt(contract, state);
  const started = Date.now();
  const result = await invoker.invoke<ReviewResult>(
    invocation(
      contract,
      state,
      "supervisor",
      prompt,
      schemaPath,
      state.supervisorSession.sessionId,
      (sessionId) => {
        state.supervisorSession = {
          ...state.supervisorSession,
          sessionId,
          createdAt:
            state.supervisorSession.createdAt ?? new Date().toISOString(),
          status: "active",
          lastResumedRound: state.reviewRound,
        };
        saveManagedRun(state);
      },
      (summary) =>
        appendManagedEvent(state, {
          eventType: "review.progress",
          actor: contract.supervisorAgent,
          role: "supervisor",
          summary,
        }),
    ),
  );
  state = closeActiveTime(state, started);
  state.supervisorSession = {
    ...state.supervisorSession,
    sessionId: result.sessionId,
    createdAt: state.supervisorSession.createdAt ?? new Date().toISOString(),
    status: "active",
    lastResumedRound: state.reviewRound,
  };
  validateReviewResult(result.output, contract.language);
  if (
    computeWorkspaceFingerprintForRoots([
      contract.projectRoot,
      ...contract.relatedProjectRoots,
    ]) !== fingerprint
  ) {
    return finishBlocked(
      contract,
      state,
      mt(contract, "只读检查期间工作区发生变化", "Workspace changed during read-only review"),
      env,
    );
  }
  const resultFile = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    `review-result-${state.reviewRound}.json`,
  );
  writeJsonAtomic(resultFile, result.output);
  const logFiles = writeInvocationLogs(
    state,
    `review-${state.reviewRound}`,
    result.stdout,
    result.stderr,
  );
  state.lastReviewResult = resultFile;
  saveManagedRun(state);
  appendTaskReport(state, reviewReportSection(state, result.output));
  appendManagedEvent(state, {
    eventType: "review.ended",
    actor: contract.supervisorAgent,
    role: "supervisor",
    summary: result.output.summary,
    evidencePaths: [resultFile, ...logFiles],
  });

  if (result.output.result === "pass") {
    return finishAwaitingGitApproval(
      contract,
      state,
      result.output.summary,
      env,
    );
  }
  if (result.output.result === "blocked") {
    return finishBlocked(contract, state, result.output.summary, env);
  }
  if (state.reviewRound >= contract.budgets.maxReviewRounds) {
    return finishReviewExhausted(contract, state, env);
  }

  state.lastExecutorResult = null;
  state.currentStep = "repair_prompt_ready";
  saveManagedRun(state);
  return state;
}

function invocation(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  role: AgentInvocation["role"],
  prompt: string,
  schemaPath: string,
  sessionId: string | null,
  onSession: (sessionId: string) => void,
  onProgress: (summary: string) => void,
): AgentInvocation {
  return {
    taskId: state.taskId,
    runId: state.runId,
    role,
    language: contract.language,
    agent:
      role === "executor" ? contract.executorAgent : contract.supervisorAgent,
    projectRoot: state.projectRoot,
    writableRoots: contract.relatedProjectRoots,
    prompt,
    schemaPath,
    sessionId,
    timeout: {
      warningMs: contract.budgets.noProgressWarningMinutes * 60_000,
      stalledMs: contract.budgets.stalledTimeoutMinutes * 60_000,
      hardMs: contract.budgets.maxSingleInvocationHours * 3_600_000,
    },
    onSession,
    onProgress,
  };
}

function transition(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  status: ManagedRunState["status"],
  currentStep: string,
  env: NodeJS.ProcessEnv,
): ManagedRunState {
  state = {
    ...state,
    status,
    currentStep,
    servicePid: process.pid,
    updatedAt: new Date().toISOString(),
  };
  contract.status = status;
  saveManagedRun(state);
  saveManagedTask(contract);
  updateRegistry(contract, state, env);
  return state;
}

function finishAwaitingGitApproval(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  summary: string,
  env: NodeJS.ProcessEnv,
): ManagedRunState {
  state = transition(
    contract,
    state,
    "awaiting_git_approval",
    "awaiting_git_approval",
    env,
  );
  state.completedAt = new Date().toISOString();
  state.workspaceFingerprint = computeWorkspaceFingerprintForRoots([
    contract.projectRoot,
    ...contract.relatedProjectRoots,
  ]);
  saveManagedRun(state);
  runManagedDeliveryCheck(state, true);
  appendTaskReport(
    state,
    mt(
      contract,
      `\n## 最终结论\n\n${summary}\n\n状态：等待用户批准 Git 提交。\n`,
      `\n## Final conclusion\n\n${summary}\n\nStatus: waiting for user approval to commit Git changes.\n`,
    ),
  );
  updateTaskReportStatus(
    state,
    mt(contract, "等待用户批准 Git 提交", "waiting for Git commit approval"),
  );
  appendManagedEvent(state, {
    eventType: "run.delivery_ready",
    actor: "managed-runner",
    role: "runner",
    summary: mt(
      contract,
      "任务已通过检查，等待用户批准 Git 提交",
      "Task passed review and is waiting for user approval to commit Git changes",
    ),
  });
  notifyManagedTask(
    {
      taskId: state.taskId,
      type: "delivery_ready",
      title: mt(contract, "Superflow 任务已完成", "Superflow task completed"),
      message: mt(
        contract,
        `${state.taskId} 已通过检查，等待 Git 提交批准`,
        `${state.taskId} passed review and is waiting for Git commit approval`,
      ),
    },
    env,
  );
  return state;
}

function finishBlocked(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  blocker: string,
  env: NodeJS.ProcessEnv,
): ManagedRunState {
  state = transition(
    contract,
    state,
    "waiting_for_human",
    "waiting_for_human",
    env,
  );
  state.blocker = blocker;
  state.completedAt = null;
  saveManagedRun(state);
  appendTaskReport(
    state,
    mt(
      contract,
      `\n## 当前阻塞\n\n${blocker}\n`,
      `\n## Current blocker\n\n${blocker}\n`,
    ),
  );
  updateTaskReportStatus(
    state,
    mt(contract, "等待人工处理", "waiting for human action"),
  );
  appendManagedEvent(state, {
    eventType: "human_input.required",
    actor: "managed-runner",
    role: "runner",
    summary: blocker,
  });
  notifyManagedTask(
    {
      taskId: state.taskId,
      type: "human_required",
      title: mt(contract, "Superflow 任务需要处理", "Superflow task needs attention"),
      message: `${state.taskId}: ${blocker}`,
    },
    env,
  );
  return state;
}

function finishReviewExhausted(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  env: NodeJS.ProcessEnv,
): ManagedRunState {
  state = transition(
    contract,
    state,
    "review_exhausted",
    "review_exhausted",
    env,
  );
  state.blocker = mt(
    contract,
    "正式检查达到五轮上限",
    "Formal review reached the five-round limit",
  );
  saveManagedRun(state);
  updateTaskReportStatus(
    state,
    mt(contract, "检查轮次耗尽", "review rounds exhausted"),
  );
  appendManagedEvent(state, {
    eventType: "budget.exhausted",
    actor: "managed-runner",
    role: "runner",
    summary: state.blocker,
  });
  notifyManagedTask(
    {
      taskId: state.taskId,
      type: "budget_exhausted",
      title: mt(
        contract,
        "Superflow 检查轮次已耗尽",
        "Superflow review rounds exhausted",
      ),
      message: `${state.taskId}: ${state.blocker}`,
    },
    env,
  );
  return state;
}

function finishBudgetExhausted(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  reason: string,
  env: NodeJS.ProcessEnv,
): ManagedRunState {
  state = transition(
    contract,
    state,
    "budget_exhausted",
    "budget_exhausted",
    env,
  );
  state.blocker = reason;
  saveManagedRun(state);
  updateTaskReportStatus(
    state,
    mt(contract, "调用预算耗尽", "invocation budget exhausted"),
  );
  appendManagedEvent(state, {
    eventType: "budget.exhausted",
    actor: "managed-runner",
    role: "runner",
    summary: reason,
  });
  notifyManagedTask(
    {
      taskId: state.taskId,
      type: "budget_exhausted",
      title: mt(
        contract,
        "Superflow 调用预算已耗尽",
        "Superflow invocation budget exhausted",
      ),
      message: `${state.taskId}: ${reason}`,
    },
    env,
  );
  return state;
}

function enforceBudgets(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  env: NodeJS.ProcessEnv,
): ManagedRunState {
  const activeHours = activeRunMilliseconds(state) / 3_600_000;
  if (
    activeHours >= contract.budgets.activeRunWarningHours &&
    !readManagedEvents(state).some(
      (event) => event.eventType === "deadline.warning",
    )
  ) {
    appendManagedEvent(state, {
      eventType: "deadline.warning",
      actor: "managed-runner",
      role: "runner",
      summary: mt(
        contract,
        `实际工作时间已达到 ${contract.budgets.activeRunWarningHours} 小时，任务继续运行但已接近兜底上限`,
        `Active work time reached ${contract.budgets.activeRunWarningHours} hours; the task continues but is approaching the safety limit`,
      ),
    });
  }
  if (activeHours >= contract.budgets.maxActiveRunHours) {
    state = transition(
      contract,
      state,
      "deadline_exhausted",
      "deadline_exhausted",
      env,
    );
    state.blocker = mt(
      contract,
      "实际工作时间达到防失控上限",
      "Active work time reached the safety limit",
    );
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "deadline.exhausted",
      actor: "managed-runner",
      role: "runner",
      summary: state.blocker,
    });
  }
  return state;
}

function closeActiveTime(
  state: ManagedRunState,
  started: number,
): ManagedRunState {
  state.activeRunMilliseconds += Math.max(0, Date.now() - started);
  state.activeSince = null;
  saveManagedRun(state);
  return state;
}

function loadRepairFindings(state: ManagedRunState): ReviewFinding[] {
  if (!state.lastReviewResult || !existsSync(state.lastReviewResult)) return [];
  const result = JSON.parse(
    readFileSync(state.lastReviewResult, "utf-8"),
  ) as ReviewResult;
  return result.findings.filter((finding) => finding.blocking);
}

function validateExecutorResult(
  contract: ManagedTaskContract,
  result: ExecutorResult,
): void {
  if (!["ready_for_review", "blocked", "failed"].includes(result.status)) {
    throw new Error(mt(contract, "执行 Agent 返回了非法状态", "Executor Agent returned an invalid status"));
  }
  if (
    !Array.isArray(result.changedFiles) ||
    !Array.isArray(result.commands) ||
    !Array.isArray(result.evidence) ||
    !Array.isArray(result.blockers)
  ) {
    throw new Error(mt(contract, "执行 Agent 结果缺少文件、命令、证据或阻塞列表", "Executor Agent result is missing files, commands, evidence, or blockers"));
  }
  if (!result.summary.trim()) {
    throw new Error(mt(contract, "执行 Agent 结果缺少摘要", "Executor Agent result is missing a summary"));
  }
  if (result.status !== "ready_for_review") {
    if (result.blockers.length === 0) {
      throw new Error(mt(contract, "执行 Agent 声明阻塞或失败，但没有提供阻塞原因", "Executor Agent reported blocked or failed without a blocker"));
    }
    return;
  }
  if (result.blockers.length > 0) {
    throw new Error(mt(contract, "执行 Agent 声明可检查，但仍存在阻塞项", "Executor Agent reported ready for review while blockers remain"));
  }
  if (result.commands.some((command) => command.exitCode !== 0)) {
    throw new Error(mt(contract, "执行 Agent 声明可检查，但命令证据中仍有失败项", "Executor Agent reported ready for review while command evidence still contains failures"));
  }
  if (contract.profile === "engineering" || contract.profile === "sdd") {
    validateEngineeringEvidence(result.commands, contract);
  }
}

function validateEngineeringEvidence(
  commands: ExecutorResult["commands"],
  contract: ManagedTaskContract,
): void {
  const successful = commands.filter((command) => command.exitCode === 0);
  const categories = new Set(
    successful.flatMap((command) => verificationCategories(command.command)),
  );
  if (categories.size < 2) {
    throw new Error(
      mt(
        contract,
        "工程任务至少需要两类成功验证证据（构建、测试、启动或真实调用），只编译或只跑单测不能交付",
        "Engineering tasks require at least two successful evidence categories (build, tests, startup, or real calls); compilation-only or unit-test-only evidence cannot be delivered",
      ),
    );
  }
}

function verificationCategories(command: string): string[] {
  const normalized = command.toLowerCase();
  const categories: string[] = [];
  if (
    /(^|\s)(test|vitest|jest|pytest|phpunit|go\s+test|cargo\s+test)(\s|$)/.test(
      normalized,
    ) ||
    /(?:npm|pnpm|yarn)\s+(?:run\s+)?test/.test(normalized) ||
    /mvn(?:\s+[^\s]+)*\s+test/.test(normalized) ||
    /gradle\w*\s+test/.test(normalized)
  ) {
    categories.push("test");
  }
  if (
    /(?:npm|pnpm|yarn)\s+(?:run\s+)?build/.test(normalized) ||
    /(^|\s)(tsc|make|cmake|compile)(\s|$)/.test(normalized) ||
    /mvn(?:\s+[^\s]+)*\s+(?:compile|package|verify)/.test(normalized) ||
    /gradle\w*\s+(?:build|assemble)/.test(normalized) ||
    /cargo\s+build|go\s+build/.test(normalized)
  ) {
    categories.push("build");
  }
  if (
    /(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:start|dev|serve)/.test(normalized) ||
    /spring-boot:run|docker\s+compose\s+up|(^|\s)(curl|wget)(\s|$)/.test(
      normalized,
    ) ||
    /health(?:check)?|integration|e2e/.test(normalized)
  ) {
    categories.push("runtime");
  }
  return categories;
}

function validateReviewResult(
  result: ReviewResult,
  language: ManagedTaskContract["language"] = "zh",
): void {
  if (!["pass", "needs_fix", "blocked"].includes(result.result)) {
    throw new Error(managedText(language, "监督 Agent 返回了非法状态", "Supervisor Agent returned an invalid status"));
  }
  if (!Array.isArray(result.findings))
    throw new Error(managedText(language, "监督 Agent 结果缺少 findings", "Supervisor Agent result is missing findings"));
  if (
    result.result === "pass" &&
    result.findings.some((finding) => finding.blocking)
  ) {
    throw new Error(managedText(language, "监督结果声明通过，但仍存在阻断 finding", "Supervisor result reported pass while blocking findings remain"));
  }
  if (
    result.result === "needs_fix" &&
    !result.findings.some((finding) => finding.blocking)
  ) {
    throw new Error(managedText(language, "监督结果要求整改，但没有提供阻断 finding", "Supervisor result requested fixes without a blocking finding"));
  }
}

function executorReportSection(
  state: ManagedRunState,
  result: ExecutorResult,
): string {
  if (state.language === "en") {
    return [
      `## Executor invocation ${state.executorInvocations}`,
      "",
      `Status: ${result.status}`,
      `Summary: ${result.summary}`,
      `Changed files: ${result.changedFiles.join(", ") || "none"}`,
      `Blockers: ${result.blockers.join("; ") || "none"}`,
    ].join("\n");
  }
  return [
    `## 执行调用 ${state.executorInvocations}`,
    "",
    `状态：${result.status}`,
    `摘要：${result.summary}`,
    `修改文件：${result.changedFiles.join("、") || "无"}`,
    `阻塞：${result.blockers.join("；") || "无"}`,
  ].join("\n");
}

function reviewReportSection(
  state: ManagedRunState,
  result: ReviewResult,
): string {
  if (state.language === "en") {
    return [
      `## Formal review R${state.reviewRound}`,
      "",
      `Result: ${result.result}`,
      `Summary: ${result.summary}`,
      `Blocking findings: ${result.findings.filter((finding) => finding.blocking).length}`,
    ].join("\n");
  }
  return [
    `## 正式检查 R${state.reviewRound}`,
    "",
    `结果：${result.result}`,
    `摘要：${result.summary}`,
    `阻断问题：${result.findings.filter((finding) => finding.blocking).length}`,
  ].join("\n");
}

function updateRegistry(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  env: NodeJS.ProcessEnv,
): void {
  upsertRegistryEntry(
    {
      taskId: contract.taskId,
      projectRoot: contract.projectRoot,
      status: state.status,
      profile: state.profile,
      language: contract.language,
      activeRunId: state.runId,
      createdAt: contract.createdAt,
      updatedAt: new Date().toISOString(),
      servicePid: state.servicePid,
    },
    env,
  );
}

function registryRunId(
  contract: ManagedTaskContract,
  env: NodeJS.ProcessEnv,
): string {
  const registry = loadRegistry(env);
  const entry = registry.tasks.find((item) => item.taskId === contract.taskId);
  if (!entry) {
    throw new Error(
      mt(
        contract,
        `全局任务索引缺少 ${contract.taskId}`,
        `Global task registry is missing ${contract.taskId}`,
      ),
    );
  }
  return entry.activeRunId;
}

function isConnectivityFailure(message: string): boolean {
  return /(network|socket|connect(?:ion|ed|ing)?|unable to connect|server_error|timed?\s*out|rate.?limit|overloaded|busy|429|503|ECONN|连接|限流|繁忙)/i.test(
    message,
  );
}

function acquireProjectLocks(contract: ManagedTaskContract) {
  const acquired = [];
  try {
    for (const root of [
      contract.projectRoot,
      ...contract.relatedProjectRoots,
    ].sort()) {
      acquired.push(
        acquireManagedLock(
          path.join(root, ".superflow", "managed-project.lock"),
          `${contract.taskId}:${randomUUID()}`,
          contract.language,
        ),
      );
    }
    return acquired;
  } catch (error) {
    for (const lock of acquired.reverse()) lock.release();
    throw error;
  }
}

function runManagedDeliveryCheck(
  state: ManagedRunState,
  beforeReadyEvent = false,
): void {
  const script = path.join(
    ASSETS_DIR,
    "scripts",
    "superflow-managed-work-check.mjs",
  );
  const args = [script, state.projectRoot, state.taskId];
  if (beforeReadyEvent) args.push("--before-ready-event");
  execFileSync(process.execPath, args, {
    cwd: state.projectRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function writeInvocationLogs(
  state: ManagedRunState,
  prefix: string,
  stdout: string,
  stderr: string,
): string[] {
  const runDir = managedRunDir(state.projectRoot, state.taskId, state.runId);
  const files: string[] = [];
  if (stdout) {
    const file = path.join(runDir, `${prefix}-events.jsonl`);
    writeFileSync(file, redactManagedLog(stdout), "utf-8");
    files.push(file);
  }
  if (stderr) {
    const file = path.join(runDir, `${prefix}-stderr.log`);
    writeFileSync(file, redactManagedLog(stderr), "utf-8");
    files.push(file);
  }
  return files;
}

export function redactManagedLog(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi, "$1<redacted>")
    .replace(
      /(["']?(?:token|password|secret|cookie|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
      "$1<redacted>",
    )
    .replace(/(https?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, "$1<redacted>@");
}

function mt(
  contract: ManagedTaskContract,
  zh: string,
  en: string,
): string {
  return managedText(contract.language, zh, en);
}
