import {
  checkSkillDeployment,
  type SkillCheckOptions,
} from "../../domains/skill/check.js";
import {
  calculateManagedContractHash,
  createManagedTaskContract,
  validateManagedTaskContract,
} from "../../domains/managed-work/contract.js";
import { appendManagedEvent } from "../../domains/managed-work/journal.js";
import { ensureManagedService } from "../../domains/managed-work/service.js";
import {
  createManagedTaskFiles,
  loadManagedRun,
  loadManagedTask,
  loadRegistry,
  saveManagedRun,
  saveManagedTask,
  upsertRegistryEntry,
} from "../../domains/managed-work/storage.js";
import { initManagedRunState } from "../../domains/managed-work/state.js";
import { managedRunDir } from "../../domains/managed-work/paths.js";
import {
  effectiveExecutorInvocations,
  effectiveTotalAgentInvocations,
} from "../../domains/managed-work/state.js";
import { submitExternalHostReviewResult } from "../../domains/managed-work/host-review.js";
import { resolveManagedInput } from "../../domains/managed-work/input.js";
import {
  managedTaskReportPath,
  waitForManagedTask,
} from "../../domains/managed-work/wait.js";
import type {
  ExecutorResult,
  ManagedAgent,
  ManagedBudgets,
  ManagedProfile,
  ManagedRunState,
  ManagedTaskStatus,
  ReviewResult,
} from "../../domains/managed-work/types.js";
import path from "path";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "fs";
import type { Language } from "../../types.js";
import { resolveRuntimeLanguage } from "../../domains/config/cli-help.js";
import { managedText } from "../../domains/managed-work/i18n.js";
import { evaluateCompletion } from "../../domains/managed-work/completion-policy.js";
import { isProcessAlive } from "../../platform/process-liveness.js";
import { assertCodingReadyForPrompt } from "../../domains/sdd-readiness.js";
import { assertManagedAgentPair } from "../../domains/managed-work/pair-admission.js";
import { submitHumanDirectedDelivery } from "../../domains/managed-work/control.js";
import { writeManagedExecutorHandoff } from "../../domains/managed-work/runner.js";

const SKILL_NAME = "superflow-pipeline";
type ManagedAgentSelector = ManagedAgent | "current" | "peer";

export interface PipelineCommandOptions extends SkillCheckOptions {
  managed?: boolean;
  manual?: boolean;
  submitManualDelivery?: string;
  project?: string;
  profile?: ManagedProfile | "auto";
  supervisor?: ManagedAgentSelector;
  executor?: ManagedAgentSelector;
  addDir?: string[];
  dryRun?: boolean;
  resumeTask?: string;
  reopenDelivery?: string;
  replaceExecutorSession?: string;
  resetExecutorSession?: string;
  retryBlockedExecutor?: string;
  providerSwitched?: string;
  creditInfrastructureInvocations?: string;
  maxExecutorInvocations?: string;
  maxReviewRounds?: string;
  maxTotalAgentInvocations?: string;
  budgetOverrideReason?: string;
  unlimitedAgentBudget?: boolean;
  additionalExecutorInvocations?: string;
  submitHostReview?: string;
  language?: string;
}

export async function pipelineCommand(
  request?: string,
  options: PipelineCommandOptions = {},
): Promise<void> {
  const language = resolveRuntimeLanguage(options.language);
  if (options.submitManualDelivery) {
    const delivery = JSON.parse(readFileSync(options.submitManualDelivery, "utf8")) as ExecutorResult;
    const state = await submitHumanDirectedDelivery(
      options.resumeTask ?? "",
      delivery,
    );
    console.log(`人工交付已通过统一门禁，当前状态：${state.status}`);
    return;
  }
  if (options.resumeTask) {
    await resumeManagedTask(options.resumeTask, options, language);
    return;
  }
  if (options.managed || options.manual) {
    await submitManagedTask(request, options, language);
    return;
  }
  checkSkillDeployment(SKILL_NAME, options);
}

async function submitManagedTask(
  request: string | undefined,
  options: PipelineCommandOptions,
  language: Language,
): Promise<void> {
  if (!request?.trim()) {
    throw new Error(
      managedText(
        language,
        "使用 --managed 时必须提供任务内容",
        "A task is required when using --managed",
      ),
    );
  }
  const input = resolveManagedInput(request, {
    projectRoot: options.project,
    relatedProjectRoots: options.addDir,
    profile: options.profile,
    language,
  });
  if (input.source === "sdd" && input.taskPromptPath && !options.dryRun) {
    assertCodingReadyForPrompt(input.taskPromptPath);
  }
  const agents = resolveManagedAgents(options);
  const contract = createManagedTaskContract({
    request: input.request,
    projectRoot: input.projectRoot,
    relatedProjectRoots: input.relatedProjectRoots,
    profile: input.profile,
    supervisorAgent: agents.supervisorAgent,
    executorAgent: agents.executorAgent,
    source: input.source,
    taskPromptPath: input.taskPromptPath,
    language,
    executionMode: options.manual ? "human_directed" : "delegated",
  });
  const state = initManagedRunState(contract);
  if (options.dryRun) {
    console.log(JSON.stringify({ contract, run: state }, null, 2));
    return;
  }

  assertManagedAgentPair(agents.supervisorAgent, agents.executorAgent);

  // CLI and MCP share the same control-plane contract: establish the runtime
  // before persistence, then rely on atomic task/registry rollback on failure.
  const service = options.manual
    ? null
    : ensureManagedService(process.argv[1], process.env, language);
  createManagedTaskFiles(contract, state);
  appendManagedEvent(state, {
    eventType: "run.created",
    actor: "superflow-pipeline",
    role: "runner",
    summary: managedText(
      language,
      options.manual ? "已创建人工执行任务并冻结统一执行合同" : "已创建托管任务并冻结最小任务合同",
      options.manual ? "Created human-directed task and froze the shared execution contract" : "Created managed task and froze the minimal task contract",
    ),
  });
  if (options.manual) {
    const handoff = writeManagedExecutorHandoff(contract, state, []);
    console.log(`请把冻结交接包交给 ${contract.executorAgent} 执行：${handoff}`);
    console.log(`交付 JSON 格式参见：${path.join(contract.projectRoot, ".superflow", "tasks", contract.taskId, "execution-contract.md")}`);
    console.log(`执行完成后，用 --resume-task ${contract.taskId} --submit-manual-delivery <交付JSON> 提交；系统会复用托管门禁与独立评审。`);
    return;
  }
  console.log(
    managedText(
      language,
      `已创建托管任务：${contract.taskId}`,
      `Managed task created: ${contract.taskId}`,
    ),
  );
  console.log(
    managedText(
      language,
      `任务目录：${contract.projectRoot}/.superflow/tasks/${contract.taskId}`,
      `Task directory: ${contract.projectRoot}/.superflow/tasks/${contract.taskId}`,
    ),
  );

  console.log(
    managedText(
      language,
      `后台服务已接收任务，PID：${service!.pid}`,
      `Background service accepted the task, PID: ${service!.pid}`,
    ),
  );
  await waitAndReport(
    contract.projectRoot,
    contract.taskId,
    state.runId,
    language,
  );
}

export function resolveManagedAgents(
  options: Pick<PipelineCommandOptions, "supervisor" | "executor">,
  env: NodeJS.ProcessEnv = process.env,
): { supervisorAgent: ManagedAgent; executorAgent: ManagedAgent } {
  const supervisorSelector = options.supervisor ?? "current";
  const executorSelector = options.executor;
  const needsCurrent =
    [supervisorSelector, executorSelector].includes("current") ||
    [supervisorSelector, executorSelector].includes("peer") ||
    executorSelector === undefined;
  const current = needsCurrent ? detectCurrentHostAgent(env) : null;
  const supervisorAgent = resolveAgentSelector(supervisorSelector, current);
  const executorAgent = executorSelector
    ? resolveAgentSelector(executorSelector, current)
    : oppositeManagedAgent(supervisorAgent);
  if (supervisorAgent === executorAgent) {
    throw new Error(
      managedText(
        undefined,
        "监督 Agent 和执行 Agent 不能相同",
        "Supervisor and executor agents must be different",
      ),
    );
  }
  return { supervisorAgent, executorAgent };
}

function detectCurrentHostAgent(env: NodeJS.ProcessEnv): ManagedAgent {
  const configured = env.SUPERFLOW_HOST_AGENT?.trim().toLowerCase();
  if (configured === "codex" || configured === "claude") return configured;
  const claude = Boolean(env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT);
  const codex = Boolean(env.CODEX_THREAD_ID || env.CODEX_SANDBOX);
  if (claude !== codex) return claude ? "claude" : "codex";
  throw new Error(
    managedText(
      undefined,
      "无法识别当前 Host Agent；请设置 SUPERFLOW_HOST_AGENT=codex|claude，或显式传入实际角色",
      "Unable to detect the current host Agent; set SUPERFLOW_HOST_AGENT=codex|claude or pass explicit roles",
    ),
  );
}

function resolveAgentSelector(
  selector: ManagedAgentSelector,
  current: ManagedAgent | null,
): ManagedAgent {
  if (selector === "codex" || selector === "claude") return selector;
  if (!current) {
    throw new Error(
      "Current host Agent is required for current/peer selectors",
    );
  }
  return selector === "current" ? current : oppositeManagedAgent(current);
}

function oppositeManagedAgent(agent: ManagedAgent): ManagedAgent {
  return agent === "codex" ? "claude" : "codex";
}

async function resumeManagedTask(
  taskId: string,
  options: PipelineCommandOptions,
  requestedLanguage: Language,
): Promise<void> {
  const registry = loadRegistry();
  const entry = registry.tasks.find((item) => item.taskId === taskId);
  if (!entry) {
    throw new Error(
      managedText(
        requestedLanguage,
        `找不到托管任务：${taskId}`,
        `Managed task not found: ${taskId}`,
      ),
    );
  }
  if (
    options.project &&
    canonicalPath(options.project) !== canonicalPath(entry.projectRoot)
  ) {
    throw new Error(
      managedText(
        requestedLanguage,
        "指定项目目录与任务登记目录不一致",
        "Specified project directory does not match the registered task directory",
      ),
    );
  }
  const contract = loadManagedTask(entry.projectRoot, taskId);
  const language = contract.language ?? requestedLanguage;
  const state = loadManagedRun(entry.projectRoot, taskId, entry.activeRunId);
  if (options.submitHostReview) {
    const resultPath = submitExternalHostReview(
      contract,
      state,
      options.submitHostReview,
      language,
    );
    appendManagedEvent(state, {
      eventType: "review.external_submitted",
      actor: contract.supervisorAgent,
      role: "supervisor",
      summary: managedText(
        language,
        "当前 Host Codex 已提交结构化评审结果；CLI 宿主未暴露本轮 Host usage，按未知记录",
        "The current Codex host submitted a structured review; CLI Host usage is unavailable and recorded as unknown",
      ),
      evidencePaths: [resultPath],
    });
    const service = ensureManagedService(
      process.argv[1],
      process.env,
      language,
    );
    console.log(
      managedText(
        language,
        `已接收 Host 评审并恢复托管任务：${taskId}，后台服务 PID：${service.pid}`,
        `Accepted the host review and resumed task ${taskId}; background service PID: ${service.pid}`,
      ),
    );
    await waitAndReport(entry.projectRoot, taskId, state.runId, language);
    return;
  }
  if (shouldAttachRunningTask(state)) {
    if (hasRunningResumeMutations(options)) {
      throw new Error(
        managedText(
          language,
          "任务仍由存活的 Executor 执行；当前只能安全接入等待，不能同时修改预算、会话或恢复参数",
          "The task still has a live Executor; this command may only attach and wait, not mutate budgets, sessions, or recovery options",
        ),
      );
    }
    const service = ensureManagedService(
      process.argv[1],
      process.env,
      language,
    );
    console.log(
      managedText(
        language,
        `已安全接入正在运行的托管任务：${taskId}，未修改状态；后台服务 PID：${service.pid}`,
        `Safely attached to running task ${taskId} without mutating state; background service PID: ${service.pid}`,
      ),
    );
    await waitAndReport(entry.projectRoot, taskId, state.runId, language);
    return;
  }
  const reopenedDelivery = reopenAwaitingDelivery(
    state,
    options.reopenDelivery,
    language,
  );
  if (reopenedDelivery) {
    const reviewFile = path.join(
      managedRunDir(entry.projectRoot, taskId, state.runId),
      `review-reopen-${state.reviewRound + 1}-${Date.now()}.json`,
    );
    writeFileSync(reviewFile, JSON.stringify(reopenedDelivery, null, 2));
    state.lastReviewResult = reviewFile;
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "run.delivery_reopened",
      actor: "superflow-pipeline",
      role: "runner",
      summary: managedText(
        language,
        `用户驳回交付并要求继续整改：${options.reopenDelivery!.trim()}`,
        `The user rejected the delivery and requested correction: ${options.reopenDelivery!.trim()}`,
      ),
      evidencePaths: [reviewFile],
    });
  }
  const budgetChange = applyManagedBudgetIncrease(
    contract,
    state,
    options,
    language,
  );
  const unlimitedBudgetEnabled = applyUnlimitedAgentBudget(
    contract,
    state,
    options,
    language,
  );
  const executorWindow = applyExecutorInvocationWindow(
    contract,
    state,
    options,
    language,
  );
  if (!canResumeManagedTask(state, contract, options)) {
    throw new Error(
      managedText(
        language,
        `任务当前状态 ${state.status} 不允许恢复`,
        `Task status ${state.status} cannot be resumed`,
      ),
    );
  }
  const staleExecutor = recoverStaleRunningExecutor(state);
  if (staleExecutor) {
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "executor.stale_process_recovered",
      actor: "superflow-pipeline",
      role: "runner",
      summary: managedText(
        language,
        `检测到断电或重启后遗留的运行状态，执行进程 ${staleExecutor.pid} 已不存在；已停止计算中断期间的活跃耗时并进入安全恢复`,
        `Detected a stale running state after shutdown or restart; executor process ${staleExecutor.pid} no longer exists. Interrupted downtime is excluded from active runtime and safe recovery may continue`,
      ),
    });
  }
  const sessionRecoveryOptions = [
    options.replaceExecutorSession,
    options.resetExecutorSession,
    options.providerSwitched,
  ].filter((value) => value !== undefined);
  if (sessionRecoveryOptions.length > 1) {
    throw new Error(
      managedText(
        language,
        "替换会话、重置会话与供应商切换恢复不能同时使用",
        "Session replacement, session reset, and provider-switch recovery cannot be combined",
      ),
    );
  }
  const providerSwitch = confirmProviderSwitchForRecovery(
    state,
    options.providerSwitched,
    language,
  );
  const previousExecutorSession = replaceExecutorSessionForRecovery(
    state,
    options.replaceExecutorSession,
    language,
  );
  const resetExecutorSession = resetExecutorSessionForRecovery(
    state,
    options.resetExecutorSession,
    language,
  );
  const blockedExecutorRetry = retryBlockedExecutorForRecovery(
    state,
    options.retryBlockedExecutor,
    language,
  );
  if (blockedExecutorRetry) {
    const retryFile = path.join(
      managedRunDir(entry.projectRoot, taskId, state.runId),
      `review-human-retry-${state.reviewRound}-${Date.now()}.json`,
    );
    writeFileSync(retryFile, JSON.stringify(blockedExecutorRetry, null, 2));
    state.lastReviewResult = retryFile;
    state.lastExecutorResult = null;
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "executor.blocked_retry_requested",
      actor: "superflow-pipeline",
      role: "runner",
      summary: managedText(
        language,
        `人工要求被阻塞的执行者继续完成可执行工作：${options.retryBlockedExecutor!.trim()}`,
        `Human requested the blocked executor to continue locally executable work: ${options.retryBlockedExecutor!.trim()}`,
      ),
      evidencePaths: [retryFile],
    });
  }
  const credited = applyInfrastructureInvocationCredits(
    state,
    options.creditInfrastructureInvocations,
    language,
  );
  if (credited > 0) {
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "budget.infrastructure_credited",
      actor: "superflow-pipeline",
      role: "runner",
      summary: managedText(
        language,
        `人工确认抵扣 ${credited} 次基础设施执行调用；有效执行 ${effectiveExecutorInvocations(state)}/${contract.budgets.maxExecutorInvocations}，有效总调用 ${effectiveTotalAgentInvocations(state)}/${contract.budgets.maxTotalAgentInvocations}`,
        `Human-approved credit for ${credited} infrastructure executor calls; effective executor ${effectiveExecutorInvocations(state)}/${contract.budgets.maxExecutorInvocations}, effective total ${effectiveTotalAgentInvocations(state)}/${contract.budgets.maxTotalAgentInvocations}`,
      ),
    });
  }
  if (budgetChange) {
    saveManagedRun(state);
    saveManagedTask(contract);
    appendManagedEvent(state, {
      eventType: "budget.limit_increased",
      actor: "superflow-pipeline",
      role: "runner",
      summary: managedText(
        language,
        `人工提高托管预算：执行 ${budgetChange.before.maxExecutorInvocations}→${contract.budgets.maxExecutorInvocations}，评审 ${budgetChange.before.maxReviewRounds}→${contract.budgets.maxReviewRounds}，总调用 ${budgetChange.before.maxTotalAgentInvocations}→${contract.budgets.maxTotalAgentInvocations}；原因：${budgetChange.reason}`,
        `Human-approved managed budget increase: executor ${budgetChange.before.maxExecutorInvocations}→${contract.budgets.maxExecutorInvocations}, review ${budgetChange.before.maxReviewRounds}→${contract.budgets.maxReviewRounds}, total ${budgetChange.before.maxTotalAgentInvocations}→${contract.budgets.maxTotalAgentInvocations}; reason: ${budgetChange.reason}`,
      ),
    });
  }
  if (unlimitedBudgetEnabled) {
    saveManagedRun(state);
    saveManagedTask(contract);
    appendManagedEvent(state, {
      eventType: "budget.unlimited_enabled",
      actor: "superflow-pipeline",
      role: "runner",
      summary: managedText(
        language,
        `人工临时取消 Agent 调用次数限制；原因：${options.budgetOverrideReason!.trim()}`,
        `Human-approved temporary removal of Agent invocation limits; reason: ${options.budgetOverrideReason!.trim()}`,
      ),
    });
  }
  if (executorWindow) {
    saveManagedRun(state);
    saveManagedTask(contract);
    appendManagedEvent(state, {
      eventType: "budget.executor_window_set",
      actor: "superflow-pipeline",
      role: "runner",
      summary: managedText(
        language,
        `人工设置 Claude 临时调用窗口：物理调用 ${executorWindow.before}→${executorWindow.stopAt}，新增 ${executorWindow.count} 次；原因：${executorWindow.reason}`,
        `Human-approved temporary Claude invocation window: physical calls ${executorWindow.before}→${executorWindow.stopAt}, ${executorWindow.count} additional calls; reason: ${executorWindow.reason}`,
      ),
    });
  }
  if (previousExecutorSession) {
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "executor.session_replaced",
      actor: "superflow-pipeline",
      role: "runner",
      summary: managedText(
        language,
        `人工确认跨模型恢复，执行会话从 ${previousExecutorSession} 替换为 ${state.executorSession.sessionId}`,
        `Human-approved cross-model recovery replaced executor session ${previousExecutorSession} with ${state.executorSession.sessionId}`,
      ),
    });
  }
  if (resetExecutorSession) {
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "executor.session_reset",
      actor: "superflow-pipeline",
      role: "runner",
      summary: managedText(
        language,
        `人工确认放弃异常执行会话 ${resetExecutorSession.previousSessionId}，下次调用将创建全新 Claude 会话；原因：${resetExecutorSession.reason}`,
        `Human-approved reset of unhealthy executor session ${resetExecutorSession.previousSessionId}; the next invocation will create a fresh Claude session; reason: ${resetExecutorSession.reason}`,
      ),
    });
  }
  if (providerSwitch) {
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "provider.switch_confirmed",
      actor: "superflow-pipeline",
      role: "runner",
      summary: managedText(
        language,
        `用户确认已切换底层供应商，放弃异常会话 ${providerSwitch.previousSessionId} 并从全新会话恢复；原因：${providerSwitch.reason}`,
        `The user confirmed a provider switch, discarded unhealthy session ${providerSwitch.previousSessionId}, and will recover in a fresh session; reason: ${providerSwitch.reason}`,
      ),
    });
  }
  const recoveredExecutorResult = recoverAcceptedExecutorResult(
    contract,
    state,
  );
  if (recoveredExecutorResult) {
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "executor.result_recovered",
      actor: "superflow-pipeline",
      role: "runner",
      summary: managedText(
        language,
        "已按当前规则重新裁决既有执行结果，无需再次调用研发 Agent",
        "The persisted executor result passed current rules; no new executor invocation is required",
      ),
      evidencePaths: [recoveredExecutorResult],
    });
  }
  const resumeBlockedExecutor = shouldResumeBlockedExecutor(state);
  const reopenBlockedReview = blockedExecutorRetry
    ? false
    : shouldReopenBlockedReview(state);
  state.status = "queued";
  state.currentStep = "recovering";
  state.blocker = null;
  state.activeSince = null;
  if (resumeBlockedExecutor) state.lastExecutorResult = null;
  if (reopenBlockedReview) state.lastReviewResult = null;
  contract.status = "queued";
  saveManagedRun(state);
  saveManagedTask(contract);
  upsertRegistryEntry({
    ...entry,
    status: "queued",
    updatedAt: new Date().toISOString(),
  });
  appendManagedEvent(state, {
    eventType: "recovery.started",
    actor: "superflow-pipeline",
    role: "runner",
    summary: managedText(
      language,
      resumeBlockedExecutor
        ? "已确认人工处理，从当前工作区和全新短会话继续未完成工作"
        : providerSwitch
          ? "已确认供应商切换，从任务记录、当前工作区和全新执行会话继续"
        : resetExecutorSession
          ? "已确认人工处理，将从任务记录、当前工作区和全新执行会话继续"
          : "已请求从任务记录、当前工作区和全新短会话恢复",
      resumeBlockedExecutor
        ? "Human action confirmed; continuing unfinished work from the current workspace in a fresh short session"
        : providerSwitch
          ? "Provider switch confirmed; continuing from task records, the current workspace, and a fresh executor session"
        : resetExecutorSession
          ? "Human action confirmed; continuing from task records, the current workspace, and a fresh executor session"
          : "Requested recovery from task records, the current workspace, and a fresh short session",
    ),
  });
  if (reopenBlockedReview) {
    appendManagedEvent(state, {
      eventType: "review.reopened",
      actor: "superflow-pipeline",
      role: "runner",
      summary: managedText(
        language,
        "人工恢复被阻塞的监督评审，将基于当前工作区与最新门禁重新检查",
        "Human recovery reopened the blocked supervisor review against the current workspace and latest gates",
      ),
    });
  }
  const service = ensureManagedService(process.argv[1], process.env, language);
  console.log(
    managedText(
      language,
      `已恢复托管任务：${taskId}，后台服务 PID：${service.pid}`,
      `Managed task resumed: ${taskId}; background service PID: ${service.pid}`,
    ),
  );
  await waitAndReport(entry.projectRoot, taskId, state.runId, language);
}

export function submitExternalHostReview(
  contract: ReturnType<typeof loadManagedTask>,
  state: ManagedRunState,
  reviewPath: string,
  language: Language = "zh",
  env: NodeJS.ProcessEnv = process.env,
): string {
  const resolvedReviewPath = path.resolve(reviewPath);
  const roots = [contract.projectRoot, ...contract.relatedProjectRoots].map(
    (root) => path.resolve(root),
  );
  if (
    roots.some(
      (root) =>
        resolvedReviewPath === root ||
        resolvedReviewPath.startsWith(`${root}${path.sep}`),
    )
  ) {
    throw new Error(
      managedText(
        language,
        "Host 评审提交文件必须放在全部目标项目目录之外，避免污染 changedFiles",
        "The host review submission file must be outside every target project to avoid polluting changedFiles",
      ),
    );
  }
  const result = JSON.parse(
    readFileSync(resolvedReviewPath, "utf-8"),
  ) as ReviewResult;
  return submitExternalHostReviewResult(contract, state, result, language, env);
}

export function applyInfrastructureInvocationCredits(
  state: ManagedRunState,
  value: string | undefined,
  language: Language = "zh",
): number {
  if (value === undefined) return 0;
  const count = Number(value);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(
      managedText(
        language,
        "基础设施调用抵扣必须是正整数",
        "Infrastructure invocation credits must be a positive integer",
      ),
    );
  }
  const executorCredits = (state.executorInvocationCredits ?? 0) + count;
  const totalCredits = (state.totalAgentInvocationCredits ?? 0) + count;
  if (
    executorCredits > state.executorInvocations ||
    totalCredits > state.totalAgentInvocations
  ) {
    throw new Error(
      managedText(
        language,
        "基础设施调用抵扣不能超过已发生的物理调用数",
        "Infrastructure invocation credits cannot exceed physical calls",
      ),
    );
  }
  state.executorInvocationCredits = executorCredits;
  state.totalAgentInvocationCredits = totalCredits;
  return count;
}

export function applyManagedBudgetIncrease(
  contract: ReturnType<typeof loadManagedTask>,
  state: ManagedRunState,
  options: Pick<
    PipelineCommandOptions,
    | "maxExecutorInvocations"
    | "maxReviewRounds"
    | "maxTotalAgentInvocations"
    | "budgetOverrideReason"
  >,
  language: Language = "zh",
): { before: ManagedBudgets; reason: string } | null {
  const values = [
    options.maxExecutorInvocations,
    options.maxReviewRounds,
    options.maxTotalAgentInvocations,
  ];
  if (values.every((value) => value === undefined)) return null;
  const reason = options.budgetOverrideReason?.trim();
  if (!reason) {
    throw new Error(
      managedText(
        language,
        "提高托管预算时必须提供审计原因",
        "An audit reason is required when increasing managed task budgets",
      ),
    );
  }
  const before = { ...contract.budgets };
  const next = {
    ...before,
    maxExecutorInvocations: parseIncreasedBudget(
      options.maxExecutorInvocations,
      before.maxExecutorInvocations,
      "maxExecutorInvocations",
      language,
    ),
    maxReviewRounds: parseIncreasedBudget(
      options.maxReviewRounds,
      before.maxReviewRounds,
      "maxReviewRounds",
      language,
    ),
    maxTotalAgentInvocations: parseIncreasedBudget(
      options.maxTotalAgentInvocations,
      before.maxTotalAgentInvocations,
      "maxTotalAgentInvocations",
      language,
    ),
  };
  if (
    next.maxTotalAgentInvocations <
    next.maxExecutorInvocations + next.maxReviewRounds
  ) {
    throw new Error(
      managedText(
        language,
        "总 Agent 调用上限不能小于执行上限与评审上限之和",
        "The total Agent limit cannot be lower than executor plus review limits",
      ),
    );
  }
  contract.budgets = next;
  contract.contractHash = calculateManagedContractHash(contract);
  state.contractHash = contract.contractHash;
  validateManagedTaskContract(contract);
  return { before, reason };
}

export function applyUnlimitedAgentBudget(
  contract: ReturnType<typeof loadManagedTask>,
  state: ManagedRunState,
  options: Pick<
    PipelineCommandOptions,
    "unlimitedAgentBudget" | "budgetOverrideReason"
  >,
  language: Language = "zh",
): boolean {
  if (!options.unlimitedAgentBudget) return false;
  if (contract.budgets.unlimitedAgentInvocations === true) return false;
  const reason = options.budgetOverrideReason?.trim();
  if (!reason) {
    throw new Error(
      managedText(
        language,
        "取消 Agent 调用限制时必须提供审计原因",
        "An audit reason is required when removing Agent invocation limits",
      ),
    );
  }
  contract.budgets = {
    ...contract.budgets,
    unlimitedAgentInvocations: true,
  };
  contract.contractHash = calculateManagedContractHash(contract);
  state.contractHash = contract.contractHash;
  validateManagedTaskContract(contract);
  return true;
}

export function applyExecutorInvocationWindow(
  contract: ReturnType<typeof loadManagedTask>,
  state: ManagedRunState,
  options: Pick<
    PipelineCommandOptions,
    "additionalExecutorInvocations" | "budgetOverrideReason"
  >,
  language: Language = "zh",
): { before: number; stopAt: number; count: number; reason: string } | null {
  if (options.additionalExecutorInvocations === undefined) return null;
  const count = Number(options.additionalExecutorInvocations);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(
      managedText(
        language,
        "新增 Claude 调用窗口必须是正整数",
        "The additional Claude invocation window must be a positive integer",
      ),
    );
  }
  const reason = options.budgetOverrideReason?.trim();
  if (!reason) {
    throw new Error(
      managedText(
        language,
        "设置 Claude 调用窗口时必须提供审计原因",
        "An audit reason is required when setting a Claude invocation window",
      ),
    );
  }
  const before = state.executorInvocations;
  const stopAt = before + count;
  contract.budgets = {
    ...contract.budgets,
    executorPhysicalStopAt: stopAt,
  };
  contract.contractHash = calculateManagedContractHash(contract);
  state.contractHash = contract.contractHash;
  validateManagedTaskContract(contract);
  return { before, stopAt, count, reason };
}

function parseIncreasedBudget(
  value: string | undefined,
  current: number,
  name: string,
  language: Language,
): number {
  if (value === undefined) return current;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < current) {
    throw new Error(
      managedText(
        language,
        `${name} 必须是大于或等于当前值 ${current} 的整数`,
        `${name} must be an integer greater than or equal to ${current}`,
      ),
    );
  }
  return parsed;
}

export function hasAvailableInvocationBudget(
  state: ManagedRunState,
  contract: Pick<ReturnType<typeof loadManagedTask>, "budgets">,
): boolean {
  if (contract.budgets.unlimitedAgentInvocations === true) return true;
  if (
    contract.budgets.executorPhysicalStopAt !== undefined &&
    state.executorInvocations < contract.budgets.executorPhysicalStopAt
  ) {
    return true;
  }
  return (
    effectiveExecutorInvocations(state) <
      contract.budgets.maxExecutorInvocations &&
    effectiveTotalAgentInvocations(state) <
      contract.budgets.maxTotalAgentInvocations
  );
}

export function hasAvailableReviewBudget(
  state: ManagedRunState,
  contract: Pick<ReturnType<typeof loadManagedTask>, "budgets">,
): boolean {
  return state.reviewInvocations < contract.budgets.maxReviewRounds;
}

export function canResumeManagedTask(
  state: ManagedRunState,
  contract: Pick<ReturnType<typeof loadManagedTask>, "budgets">,
  options: Pick<
    PipelineCommandOptions,
    "creditInfrastructureInvocations" | "unlimitedAgentBudget"
  >,
): boolean {
  const normallyResumable: ManagedTaskStatus[] = [
    "queued",
    "waiting_for_human",
    "waiting_for_connectivity",
    "paused",
    "running",
  ];
  if (normallyResumable.includes(state.status)) return true;
  const budgetAvailable = Boolean(options.creditInfrastructureInvocations) ||
    hasAvailableInvocationBudget(state, contract) ||
    hasAvailableReviewBudget(state, contract) ||
    options.unlimitedAgentBudget === true;
  if (!budgetAvailable) return false;
  return ["budget_exhausted", "review_exhausted", "repair_pending"].includes(
    state.status,
  );
}

export function replaceExecutorSessionForRecovery(
  state: ManagedRunState,
  replacement: string | undefined,
  language: Language = "zh",
): string | null {
  if (!replacement) return null;
  if (state.status !== "waiting_for_human") {
    throw new Error(
      managedText(
        language,
        "只有 waiting_for_human 状态允许替换执行会话",
        "The executor session can only be replaced from waiting_for_human",
      ),
    );
  }
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(replacement)) {
    throw new Error(
      managedText(
        language,
        "替换执行会话必须使用完整 UUID",
        "The replacement executor session must be a complete UUID",
      ),
    );
  }
  const previous = state.executorSession.sessionId;
  if (!previous || previous === replacement) return null;
  state.executorSession = {
    ...state.executorSession,
    sessionId: replacement,
    createdAt: new Date().toISOString(),
    lastResumedRound: state.reviewRound,
    status: "active",
  };
  return previous;
}

export function resetExecutorSessionForRecovery(
  state: ManagedRunState,
  auditReason: string | undefined,
  language: Language = "zh",
): { previousSessionId: string; reason: string } | null {
  if (auditReason === undefined) return null;
  if (state.status !== "waiting_for_human") {
    throw new Error(
      managedText(
        language,
        "只有 waiting_for_human 状态允许重置执行会话",
        "The executor session can only be reset from waiting_for_human",
      ),
    );
  }
  const reason = auditReason.trim();
  if (!reason) {
    throw new Error(
      managedText(
        language,
        "重置执行会话时必须提供审计原因",
        "An audit reason is required when resetting the executor session",
      ),
    );
  }
  const previousSessionId = state.executorSession.sessionId;
  if (!previousSessionId) {
    throw new Error(
      managedText(
        language,
        "当前没有可重置的执行会话",
        "There is no executor session to reset",
      ),
    );
  }
  state.executorSession = {
    ...state.executorSession,
    sessionId: null,
    createdAt: null,
    status: "pending",
  };
  state.consecutiveTransientProviderFailures = 0;
  return { previousSessionId, reason };
}

export function recoverStaleRunningExecutor(
  state: ManagedRunState,
  processAlive: (pid: number) => boolean = isProcessAlive,
): { pid: number } | null {
  const pid = state.runningAgentPid;
  if (state.status !== "running" || !pid || processAlive(pid)) return null;

  state.status = "waiting_for_human";
  state.currentStep = "stale_executor_recovery_required";
  state.blocker = `Executor process ${pid} is no longer running`;
  state.runningAgentPid = null;
  state.activeSince = null;
  return { pid };
}

export function shouldAttachRunningTask(
  state: ManagedRunState,
  processAlive: (pid: number) => boolean = isProcessAlive,
): boolean {
  if (state.status !== "running") return false;
  if (!state.runningAgentPid) return true;
  return processAlive(state.runningAgentPid);
}

function hasRunningResumeMutations(options: PipelineCommandOptions): boolean {
  return [
    options.reopenDelivery,
    options.replaceExecutorSession,
    options.resetExecutorSession,
    options.retryBlockedExecutor,
    options.providerSwitched,
    options.creditInfrastructureInvocations,
    options.maxExecutorInvocations,
    options.maxReviewRounds,
    options.maxTotalAgentInvocations,
    options.budgetOverrideReason,
    options.additionalExecutorInvocations,
  ].some((value) => value !== undefined) || options.unlimitedAgentBudget === true;
}

export function confirmProviderSwitchForRecovery(
  state: ManagedRunState,
  auditReason: string | undefined,
  language: Language = "zh",
): { previousSessionId: string; reason: string } | null {
  if (auditReason === undefined) return null;
  if (
    state.status !== "waiting_for_human"
    || state.currentStep !== "provider_change_required"
  ) {
    throw new Error(
      managedText(
        language,
        "只有 provider_change_required 状态允许确认供应商切换",
        "A provider switch can only be confirmed from provider_change_required",
      ),
    );
  }
  const reason = auditReason.trim();
  if (!reason) {
    throw new Error(
      managedText(
        language,
        "供应商切换恢复必须提供审计原因",
        "Provider-switch recovery requires an audit reason",
      ),
    );
  }
  const previousSessionId = state.executorSession.sessionId;
  if (!previousSessionId) {
    throw new Error(
      managedText(
        language,
        "当前没有可放弃的执行会话",
        "There is no executor session to discard",
      ),
    );
  }
  state.executorSession = {
    ...state.executorSession,
    sessionId: null,
    createdAt: null,
    status: "pending",
    previousSessionIds: [
      ...(state.executorSession.previousSessionIds ?? []),
      previousSessionId,
    ],
  };
  state.consecutiveTransientProviderFailures = 0;
  return { previousSessionId, reason };
}

export function retryBlockedExecutorForRecovery(
  state: ManagedRunState,
  reason: string | undefined,
  language: Language = "zh",
): ReviewResult | null {
  if (reason === undefined) return null;
  if (state.status !== "waiting_for_human") {
    throw new Error(
      managedText(
        language,
        "只有 waiting_for_human 状态允许重试被阻塞的执行者",
        "A blocked executor can only be retried from waiting_for_human",
      ),
    );
  }
  const auditReason = reason.trim();
  if (!auditReason) {
    throw new Error(
      managedText(
        language,
        "重试被阻塞的执行者时必须提供审计原因",
        "An audit reason is required when retrying a blocked executor",
      ),
    );
  }
  if (!state.lastReviewResult || !existsSync(state.lastReviewResult)) {
    if (!state.lastExecutorResult && state.blocker) {
      return {
        result: "needs_fix",
        summary: auditReason,
        findings: [
          {
            id: `HUMAN-RETRY-${state.reviewRound}`,
            severity: "high",
            blocking: true,
            category: "基础设施恢复",
            target: "Agent 启动与当前工作区",
            evidence: state.blocker,
            risk: managedText(
              language,
              "首次调用失败后若无法恢复，任务会在尚未产生研发结果时永久停止",
              "Without recovery after an initial invocation failure, the task remains stopped before producing any development result",
            ),
            requiredFix: auditReason,
            acceptanceChecks: [auditReason],
          },
        ],
      };
    }
    throw new Error(
      managedText(
        language,
        "没有可用于重试的阻塞评审结果",
        "No blocked review result is available for retry",
      ),
    );
  }
  const previous = JSON.parse(
    readFileSync(state.lastReviewResult, "utf-8"),
  ) as ReviewResult;
  const postReviewGateFailure =
    previous.result === "pass" &&
    /(?:Host 评审通过|Host review passed)[\s\S]*(?:重验仍失败|revalidation still failed)/i.test(
      state.blocker ?? "",
    );
  if (
    !["blocked", "needs_fix"].includes(previous.result) &&
    !postReviewGateFailure
  ) {
    throw new Error(
      managedText(
        language,
        "仅允许基于 blocked 或 needs_fix 评审结果重试执行者",
        "The executor can only be retried from a blocked or needs_fix review result",
      ),
    );
  }
  return {
    result: "needs_fix",
    summary: auditReason,
    findings: [
      ...previous.findings,
      {
        id: `HUMAN-RETRY-${state.reviewRound}`,
        severity: "high",
        blocking: true,
        category: "人工恢复",
        target: "当前工作区与交付证据",
        evidence: auditReason,
        risk: managedText(
          language,
          "若不继续执行，可在仍有本地收口工作时错误停止",
          "Stopping now could leave locally executable delivery work unfinished",
        ),
        requiredFix: auditReason,
        acceptanceChecks: [auditReason],
      },
    ],
  };
}

export function shouldResumeBlockedExecutor(state: ManagedRunState): boolean {
  if (state.status !== "waiting_for_human" || !state.lastExecutorResult) {
    return false;
  }
  try {
    const result = JSON.parse(
      readFileSync(state.lastExecutorResult, "utf-8"),
    ) as ExecutorResult;
    return result.status === "failed";
  } catch {
    return false;
  }
}

function recoverAcceptedExecutorResult(
  contract: ReturnType<typeof loadManagedTask>,
  state: ManagedRunState,
): string | null {
  if (state.lastExecutorResult || state.executorInvocations <= 0) return null;
  const resultPath = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    `executor-result-${state.executorInvocations}.json`,
  );
  if (!existsSync(resultPath)) return null;
  try {
    const result = JSON.parse(readFileSync(resultPath, "utf-8")) as ExecutorResult;
    if (result.status !== "ready_for_review") return null;
    const decision = evaluateCompletion(contract, result);
    if (!decision.localReady) return null;
    state.lastExecutorResult = resultPath;
    state.deliveryProgress = decision.progress;
    return resultPath;
  } catch {
    return null;
  }
}

export function shouldReopenBlockedReview(state: ManagedRunState): boolean {
  if (state.status !== "waiting_for_human" || !state.lastReviewResult) {
    return false;
  }
  try {
    const result = JSON.parse(
      readFileSync(state.lastReviewResult, "utf-8"),
    ) as ReviewResult;
    return result.result === "blocked";
  } catch {
    return false;
  }
}

export function reopenAwaitingDelivery(
  state: ManagedRunState,
  reason: string | undefined,
  language: Language = "zh",
): ReviewResult | null {
  if (reason === undefined) return null;
  if (
    ![
      "awaiting_git_approval",
      "local_delivery_ready",
      "environment_validation_blocked",
      "release_ready",
    ].includes(state.status)
  ) {
    throw new Error(
      managedText(
        language,
        "只有交付就绪状态允许重新打开交付",
        "Only a delivery-ready state can be reopened",
      ),
    );
  }
  if (!reason.trim()) {
    throw new Error(
      managedText(
        language,
        "重新打开交付必须提供整改原因",
        "Reopening a delivery requires a correction reason",
      ),
    );
  }
  state.status = "waiting_for_human";
  state.currentStep = "repair_prompt_ready";
  state.completedAt = null;
  state.lastExecutorResult = null;
  state.blocker = reason.trim();
  return {
    result: "needs_fix",
    summary: reason.trim(),
    findings: [
      {
        id: `HUMAN-REOPEN-${state.reviewRound + 1}`,
        severity: "high",
        blocking: true,
        category: "completion",
        target: "OpenSpec tasks.md",
        evidence: reason.trim(),
        risk: managedText(
          language,
          "任务可能在 OpenSpec 清单仍有未完成项时被错误交付",
          "The task may have been delivered while OpenSpec checklist items remained incomplete",
        ),
        requiredFix: managedText(
          language,
          "运行 openspec instructions apply，逐项核对未完成任务；已完成项补证据并勾选，本地未完成项继续实现，真实环境项保持诚实阻塞",
          "Run openspec instructions apply and audit every pending task; check off evidenced work, complete remaining local work, and keep real-environment items honestly blocked",
        ),
        acceptanceChecks: [
          managedText(
            language,
            "OpenSpec 进度与源码、测试及阻塞证据一致",
            "OpenSpec progress matches source, test, and blocker evidence",
          ),
          managedText(
            language,
            "不存在未完成却被宣称完成的本地任务",
            "No incomplete local task is claimed complete",
          ),
        ],
      },
    ],
  };
}

function canonicalPath(value: string): string {
  const resolved = path.resolve(value);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

async function waitAndReport(
  projectRoot: string,
  taskId: string,
  runId: string,
  language: Language,
): Promise<void> {
  const result = await waitForManagedTask(projectRoot, taskId, runId, {
    ensureService: () =>
      ensureManagedService(process.argv[1], process.env, language),
    onProgress: (state) => {
      console.log(
        managedText(
          language,
          `[${state.status}] ${state.currentStep} | 当前 ${state.executorActiveStage ?? state.executorStage ?? "-"} | 里程碑 ${state.executorStage ?? "-"} | Host ${state.reviewRound} | 有效研发 ${effectiveExecutorInvocations(state)} | 物理 ${state.executorInvocations} | 抵扣 ${state.executorInvocationCredits ?? 0}`,
          `[${state.status}] ${state.currentStep} | active ${state.executorActiveStage ?? state.executorStage ?? "-"} | milestone ${state.executorStage ?? "-"} | Host ${state.reviewRound} | effective executor ${effectiveExecutorInvocations(state)} | physical ${state.executorInvocations} | credited ${state.executorInvocationCredits ?? 0}`,
        ),
      );
    },
  });
  console.log(
    managedText(
      language,
      `任务状态：${result.status}`,
      `Task status: ${result.status}`,
    ),
  );
  if (result.blocker) {
    console.log(
      managedText(
        language,
        `阻塞：${result.blocker}`,
        `Blocker: ${result.blocker}`,
      ),
    );
  }
  if (result.pendingExternalReview) {
    console.log(
      managedText(
        language,
        `Host 评审 Prompt：${result.pendingExternalReview.promptPath}`,
        `Host review prompt: ${result.pendingExternalReview.promptPath}`,
      ),
    );
  }
  console.log(
    managedText(
      language,
      `任务报告：${managedTaskReportPath(result)}`,
      `Task report: ${managedTaskReportPath(result)}`,
    ),
  );
}
