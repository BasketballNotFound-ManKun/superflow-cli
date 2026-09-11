import { createHash, randomUUID } from "crypto";
import { execFileSync } from "child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import path from "path";
import type {
  AgentInvocation,
  AgentInvocationResult,
  AgentInvoker,
  ExecutorResult,
  ManagedRunState,
  ManagedTaskContract,
  ReviewFinding,
  ReviewResult,
  VerificationCategory,
} from "./types.js";
import {
  appendManagedEvent,
  readManagedEvents,
  verifyManagedJournal,
} from "./journal.js";
import { acquireManagedLock, acquireManagedProjectClaim } from "./lock.js";
import { managedRunDir, managedTaskDir } from "./paths.js";
import { buildExecutorPrompt, buildReviewPrompt } from "./prompts.js";
import { isAcceptedEvidenceCommand } from "./execution-contract.js";
import { writeManagedSchemas } from "./schemas.js";
import { verificationCategories } from "./verification-categories.js";
import { assessReviewConvergence } from "./review-convergence.js";
import {
  ensureManagedWorkspaceBinding,
  managedWorkspaceBindingFingerprint,
} from "./workspace-binding.js";
import {
  appendTaskReport,
  resolveTaskReportBlockers,
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
  computeScopedWorkspaceFingerprint,
  effectiveExecutorInvocations,
  effectiveTotalAgentInvocations,
  snapshotChangedWorkspaceFiles,
} from "./state.js";
import { ASSETS_DIR } from "../../platform/assets.js";
import { notifyManagedTask } from "./notifications.js";
import {
  calculateManagedContractHash,
  validateManagedTaskContract,
  validateManagedTaskPromptSnapshot,
} from "./contract.js";
import { managedAcceptanceContractHash } from "./acceptance-contract.js";
import { managedList, managedText } from "./i18n.js";
import { readManagedHumanMessages } from "./human-messages.js";
import {
  clearManagedControlSignal,
  readManagedControlSignal,
} from "./control-signals.js";
import {
  evaluateCompletion,
  readCompletionTasks,
} from "./completion-policy.js";
import {
  isCommandOutcomeConsistent,
  validateRiskBasedEvidence,
} from "./verification-policy.js";
import { canonicalEvidencePath } from "./evidence-path.js";
import { selectManagedRuleFiles } from "./rule-selection.js";
import {
  buildExecutorPolicy,
  stableExecutorPolicyHash,
} from "./executor-policy.js";
import {
  ensureManagedContextManifest,
  managedContextManifestPath,
} from "./context-manifest.js";
import { writeManagedReviewFacts } from "./review-facts.js";
import { redactManagedLog, redactManagedValue } from "./redaction.js";
import { classifyUnresumableSessionFailure } from "../../platform/agent-process.js";
import {
  classifyManagedFailure,
  ManagedEnvironmentPreparationError,
  ManagedWorkspaceClaimError,
} from "./failure.js";

export async function runManagedTask(
  projectRoot: string,
  taskId: string,
  invoker: AgentInvoker,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ManagedRunState> {
  const contract = loadManagedTask(projectRoot, taskId);
  let state = loadManagedRun(projectRoot, taskId, registryRunId(contract, env));
  const runDir = managedRunDir(projectRoot, taskId, state.runId);
  mkdirSync(runDir, { recursive: true });
  const lock = acquireManagedLock(
    path.join(runDir, "run.lock"),
    randomUUID(),
    contract.language,
  );
  let projectLocks: Awaited<ReturnType<typeof acquireProjectLocks>> = [];

  try {
    const prepared = await prepareManagedExecution(contract);
    projectLocks = prepared.projectLocks;
    if (migrateLegacyDataDisclosure(contract, state)) {
      appendManagedEvent(state, {
        eventType: "contract.data_disclosure_migrated",
        actor: "managed-runner",
        role: "runner",
        summary: mt(
          contract,
          "历史任务已执行过外部研发 Agent，迁移并冻结原仓库作用域授权",
          "The legacy task already used an external executor; its repository-scoped approval was migrated and frozen",
        ),
      });
    }
    if (state.contractHash !== contract.contractHash) {
      return finishBlocked(
        contract,
        state,
        mt(
          contract,
          "运行状态与任务合同哈希不一致",
          "Run state and task contract hashes do not match",
        ),
        env,
      );
    }
    if (!verifyManagedJournal(state)) {
      return finishBlocked(
        contract,
        state,
        mt(
          contract,
          "事件账本校验失败，拒绝继续",
          "Event journal verification failed; refusing to continue",
        ),
        env,
      );
    }
    if (!contract.permissions.externalModelDataDisclosure.approved) {
      return finishBlocked(
        contract,
        state,
        mt(
          contract,
          "尚未记录外部研发 Agent 读取和处理本地源码的任务级授权；MCP 不会绕过宿主租户 DLP",
          "Task-scoped approval for the external executor to read and process local source code is missing; MCP does not bypass host tenant DLP",
        ),
        env,
      );
    }
    if (migrateLegacySupervision(contract, state)) {
      appendManagedEvent(state, {
        eventType: "contract.supervision_migrated",
        actor: "managed-runner",
        role: "runner",
        summary: mt(
          contract,
          "旧式后台监督已永久迁移为当前 Host 直接评审",
          "Legacy background supervision was permanently migrated to direct host review",
        ),
      });
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
    if (state.executorInvocations === 0 && !state.baselineCapturedAt) {
      state.baselineWorkspaceFiles = snapshotChangedWorkspaceFiles([
        contract.projectRoot,
        ...contract.relatedProjectRoots,
      ]);
      state.baselineCapturedAt = new Date().toISOString();
      saveManagedRun(state);
    }

    while (state.status === "running") {
      state = pauseAtSafeBoundary(contract, state, env);
      if (state.status !== "running") break;
      state = enforceBudgets(contract, state, env);
      if (state.status !== "running") break;

      if (
        !state.lastExecutorResult ||
        hasUndeliveredHumanGuidance(contract, state)
      ) {
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
        state = pauseAtSafeBoundary(contract, state, env);
        if (state.status !== "running") break;
        if (
          !state.lastExecutorResult ||
          hasUndeliveredHumanGuidance(contract, state)
        ) {
          continue;
        }
      }

      state = prepareExternalHostReview(contract, state, env);
      break;
    }
    return state;
  } catch (error) {
    const message = (error as Error).message;
    const failure = classifyManagedFailure(contract, error);
    if (failure) {
      state.failure = failure;
      saveManagedRun(state);
      appendManagedEvent(state, {
        eventType: "run.failure_classified",
        actor: "managed-runner",
        role: "runner",
        summary: `${failure.reason}: ${failure.remediation}`,
      });
    }
    if (state.activeSince) {
      state.activeRunMilliseconds += Math.max(
        0,
        Date.now() - Date.parse(state.activeSince),
      );
      state.activeSince = null;
      saveManagedRun(state);
    }
    const pauseSignal = readManagedControlSignal(contract);
    if (pauseSignal?.pauseRequested) {
      clearManagedControlSignal(contract);
      if (state.currentStep.startsWith("executor_")) {
        state.executorInvocationCredits =
          (state.executorInvocationCredits ?? 0) + 1;
        state.totalAgentInvocationCredits =
          (state.totalAgentInvocationCredits ?? 0) + 1;
      }
      state.runningAgentPid = null;
      state.blocker = pauseSignal.reason;
      state = transition(contract, state, "paused", "paused_by_user", env);
      appendManagedEvent(state, {
        eventType: "human.pause_applied",
        actor: pauseSignal.actor,
        role: "system",
        summary: mt(
          contract,
          `已中断当前研发 Agent 并暂停任务：${pauseSignal.reason}`,
          `Interrupted the current executor and paused the task: ${pauseSignal.reason}`,
        ),
      });
      appendManagedEvent(state, {
        eventType: "budget.interrupted_invocation_credited",
        actor: "managed-runner",
        role: "system",
        summary: mt(
          contract,
          "用户暂停中断的研发调用已抵扣，不消耗有效业务预算",
          "The executor invocation interrupted by user pause was credited and does not consume effective business budget",
        ),
      });
      return state;
    }
    const unresumableSession = unresumableExecutorSessionFailure(error, state);
    if (unresumableSession) {
      state.executorSession = retireExecutorSession(
        state.executorSession,
        unresumableSession,
      );
      appendManagedEvent(state, {
        eventType: "executor.session_retired",
        actor: "managed-runner",
        role: "runner",
        summary: mt(
          contract,
          `研发会话无法安全续接，已退役旧会话：${unresumableSession}`,
          `The executor session cannot be safely resumed and was retired: ${unresumableSession}`,
        ),
      });
      if (unresumableSessionRecoveryCount(state) >= 1) {
        appendManagedEvent(state, {
          eventType: "executor.session_recovery_circuit_open",
          actor: "managed-runner",
          role: "runner",
          summary: mt(
            contract,
            "研发会话第二次无法安全续接，停止自动创建新会话并转 Host 处理",
            "The executor session was unresumable for a second time; fresh-session recovery stopped and the task was escalated to Host",
          ),
        });
        return finishBlocked(
          contract,
          state,
          mt(
            contract,
            "研发会话第二次无法安全续接；已保留退役记录和原始失败证据，请由 Host 检查 Agent 或切换供应商",
            "The executor session was unresumable for a second time; retirement records and raw failure evidence were preserved. Ask Host to inspect the agent or switch provider",
          ),
          env,
        );
      }
      state.runningAgentPid = null;
      state.blocker = null;
      state = transition(
        contract,
        state,
        "queued",
        "executor_session_recovery_queued",
        env,
      );
      appendManagedEvent(state, {
        eventType: "executor.session_recovery_queued",
        actor: "managed-runner",
        role: "runner",
        summary: mt(
          contract,
          "已保留冻结交接包和有效证据，并仅排队一次不带旧 session 的新会话恢复",
          "The frozen handoff and valid evidence were preserved; exactly one fresh recovery without the old session was queued",
        ),
      });
      return state;
    }
    if (isMaxTurnContinuationFailure(message)) {
      const continuation = consecutiveMaxTurnFailures(state);
      const hasWorkspaceProgress =
        changedWorkspaceFilesSinceBaseline(contract, state).length > 0;
      if (!hasWorkspaceProgress && continuation >= 3) {
        state.executorSession = rolloverSession(state.executorSession);
        return finishBlocked(
          contract,
          state,
          mt(
            contract,
            "研发 Agent 连续三次因旧版或外部 max-turn 限制退出且零源码进展，已熔断；请检查执行模型能力、Prompt 规模或外部 CLI 配置",
            "The executor exited three times because of a legacy or external max-turn limit without workspace progress; the circuit opened. Check model capability, prompt size, or external CLI configuration",
          ),
          env,
        );
      }
      if (continuation < 3 && state.executorSession.sessionId) {
        if (!hasWorkspaceProgress) {
          state.executorSession = rolloverSession(state.executorSession);
        }
        state.runningAgentPid = null;
        state.blocker = null;
        state = transition(
          contract,
          state,
          "queued",
          "executor_continuation_queued",
          env,
        );
        appendManagedEvent(state, {
          eventType: "executor.continuation_queued",
          actor: "managed-runner",
          role: "runner",
          summary: mt(
            contract,
            hasWorkspaceProgress
              ? `研发会话受到旧版或外部 max-turn 限制，检测到源码进展，自动续接同一会话（${continuation}/3）`
              : `研发会话受到旧版或外部 max-turn 限制且零源码进展，切换压缩短会话继续（${continuation}/3）`,
            hasWorkspaceProgress
              ? `Executor hit a legacy or external max-turn limit with workspace progress; automatically resuming the same session (${continuation}/3)`
              : `Executor hit a legacy or external max-turn limit with no workspace progress; continuing in a fresh condensed session (${continuation}/3)`,
          ),
        });
        return state;
      }
    }
    if (isExecutorDeliveryProtocolFailure(message)) {
      const recoveryCount = deliveryProtocolRecoveryCount(state);
      if (recoveryCount < 1) {
        state.executorSession = rolloverSession(state.executorSession);
        state.runningAgentPid = null;
        state.blocker = null;
        state = transition(
          contract,
          state,
          "queued",
          "executor_delivery_protocol_recovery_queued",
          env,
        );
        appendManagedEvent(state, {
          eventType: "executor.delivery_protocol_recovery_queued",
          actor: "managed-runner",
          role: "runner",
          summary: mt(
            contract,
            "研发 Agent 已完成调用但未按协议返回 JSON；保留原始日志并自动创建一次新的压缩会话补齐交付与受影响验证（1/1）",
            "The executor completed its call but did not return protocol JSON; raw logs were preserved and one fresh condensed session was queued to complete delivery and affected verification (1/1)",
          ),
        });
        return state;
      }
      return finishBlocked(
        contract,
        state,
        mt(
          contract,
          "研发 Agent 连续两次未按协议返回 JSON；已保留原始日志并停止自动恢复，请检查 Agent/适配器输出",
          "The executor failed to return protocol JSON twice; raw logs were preserved and automatic recovery stopped. Check the agent or adapter output",
        ),
        env,
      );
    }
    if (isPermanentProviderFailure(message)) {
      state = transition(
        contract,
        state,
        "waiting_for_provider_change",
        "provider_change_required",
        env,
      );
      state.blocker = message;
      saveManagedRun(state);
      appendManagedEvent(state, {
        eventType: "provider.permanent_failure",
        actor: contract.executorAgent,
        role: "system",
        summary: mt(
          contract,
          `供应商额度或套餐不可用，禁止自动重试：${message}`,
          `Provider quota or plan is unavailable; automatic retry is forbidden: ${message}`,
        ),
      });
      notifyManagedTask(
        {
          taskId: state.taskId,
          type: "provider_change",
          title: mt(
            contract,
            "Superflow 需要切换模型供应商",
            "Superflow requires a provider change",
          ),
          message: `${state.taskId}: ${message}`,
        },
        env,
      );
      return state;
    }
    if (isConnectivityFailure(message)) {
      const connectivityFailure = recordExecutorConnectivityFailure(
        contract,
        state,
        message,
      );
      const circuitOpen =
        connectivityFailure !== null &&
        connectivityFailure.consecutiveFailures >= 3;
      state = transition(
        contract,
        state,
        circuitOpen ? "waiting_for_human" : "waiting_for_connectivity",
        circuitOpen ? "provider_change_required" : "connectivity_wait",
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
      if (connectivityFailure?.credited) {
        appendManagedEvent(state, {
          eventType: "budget.transient_provider_credited",
          actor: "managed-runner",
          role: "system",
          summary: mt(
            contract,
            `临时供应商错误不计入 Claude 预算：返还第 ${connectivityFailure.invocation} 次物理调用，有效执行抵扣 ${state.executorInvocationCredits} 次${connectivityFailure.stopAt === null ? "" : `，临时窗口顺延至 ${connectivityFailure.stopAt}`}；连续失败 ${connectivityFailure.consecutiveFailures}/3`,
            `Transient provider failure excluded from the Claude budget: credited physical invocation ${connectivityFailure.invocation}, effective executor credits ${state.executorInvocationCredits}${connectivityFailure.stopAt === null ? "" : `, temporary window extended to ${connectivityFailure.stopAt}`}; consecutive failures ${connectivityFailure.consecutiveFailures}/3`,
          ),
        });
      }
      if (circuitOpen) {
        appendManagedEvent(state, {
          eventType: "connectivity.circuit_open",
          actor: "managed-runner",
          role: "system",
          summary: mt(
            contract,
            "临时供应商错误已连续发生 3 次，停止自动重试并等待切换供应商",
            "Transient provider failures occurred 3 consecutive times; automatic retries stopped pending a provider change",
          ),
        });
      }
      return state;
    }
    return finishBlocked(contract, state, message, env);
  } finally {
    for (const projectLock of projectLocks.reverse()) projectLock.release();
    lock.release();
  }
}

function migrateLegacyDataDisclosure(
  contract: ManagedTaskContract,
  state: ManagedRunState,
): boolean {
  if (contract.permissions.externalModelDataDisclosure) return false;
  contract.permissions.externalModelDataDisclosure = {
    approved: state.executorInvocations > 0,
    approvedBy: state.executorInvocations > 0 ? "legacy_migration" : null,
    approvedAt: state.executorInvocations > 0 ? contract.createdAt : null,
    scope: [contract.projectRoot, ...contract.relatedProjectRoots],
  };
  contract.contractHash = calculateManagedContractHash(contract);
  state.contractHash = contract.contractHash;
  saveManagedTask(contract);
  saveManagedRun(state);
  return true;
}

function migrateLegacySupervision(
  contract: ManagedTaskContract,
  state: ManagedRunState,
): boolean {
  const legacy = contract as ManagedTaskContract & {
    supervisorExecution?: string;
  };
  if (legacy.supervisorExecution === "external_host") return false;
  legacy.supervisorExecution = "external_host";
  contract.contractHash = calculateManagedContractHash(contract);
  state.contractHash = contract.contractHash;
  state.supervisorSession = rolloverSession(state.supervisorSession);
  saveManagedTask(contract);
  saveManagedRun(state);
  return true;
}

function reconcileCompletedReview(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  env: NodeJS.ProcessEnv,
): ManagedRunState {
  if (!state.lastReviewResult || !existsSync(state.lastReviewResult))
    return state;
  if (
    !state.lastReviewResult.endsWith(`review-result-${state.reviewRound}.json`)
  ) {
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
    try {
      state = promoteRevalidatedExecutorResult(contract, state);
    } catch (error) {
      return finishBlocked(
        contract,
        state,
        mt(
          contract,
          `Host 评审通过，但最后一次执行结果按当前规则重验仍失败：${(error as Error).message}`,
          `The host review passed, but the latest executor result still failed current deterministic validation: ${(error as Error).message}`,
        ),
        env,
      );
    }
    return finishDeliveryReady(contract, state, result.summary, env);
  }
  if (result.result === "blocked") {
    return finishBlocked(contract, state, result.summary, env);
  }
  const convergence = assessReviewConvergence(readReviewHistory(state));
  if (!convergence.shouldContinue) {
    state.blocker = mt(
      contract,
      `连续 ${convergence.stagnantTransitions} 次评审转换没有关闭既有阻断项，已提前止损并保留整改证据`,
      `${convergence.stagnantTransitions} consecutive review transitions closed no existing blocker; repair stopped early with evidence preserved`,
    );
    state = transition(
      contract,
      state,
      "repair_pending",
      "repair_convergence_stalled",
      env,
    );
    appendManagedEvent(state, {
      eventType: "review.convergence_stalled",
      actor: "managed-runner",
      role: "runner",
      summary: state.blocker ?? "review convergence stalled",
    });
    return state;
  }
  if (
    !hasUnlimitedAgentBudget(contract) &&
    state.reviewRound >= contract.budgets.maxReviewRounds
  ) {
    state.blocker = mt(
      contract,
      "仍有阻断 finding，但当前评审预算已达上限；整改结论已保留，等待用户扩展预算",
      "Blocking findings remain but the review budget is exhausted; the repair decision is preserved pending a user budget extension",
    );
    state = transition(
      contract,
      state,
      "repair_pending",
      "repair_budget_approval_required",
      env,
    );
    appendManagedEvent(state, {
      eventType: "review.repair_pending",
      actor: "managed-runner",
      role: "runner",
      summary: state.blocker ?? "repair pending",
    });
    return state;
  }
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
  return state;
}

function readReviewHistory(state: ManagedRunState): ReviewResult[] {
  const runDir = managedRunDir(state.projectRoot, state.taskId, state.runId);
  if (!existsSync(runDir)) return [];
  return readdirSync(runDir)
    .filter((name) => /^review-result-\d+\.json$/.test(name))
    .sort((left, right) => reviewFileRound(left) - reviewFileRound(right))
    .flatMap((name) => {
      try {
        return [
          JSON.parse(
            readFileSync(path.join(runDir, name), "utf-8"),
          ) as ReviewResult,
        ];
      } catch {
        return [];
      }
    });
}

function reviewFileRound(name: string): number {
  return Number.parseInt(name.match(/\d+/)?.[0] ?? "0", 10);
}

function promoteRevalidatedExecutorResult(
  contract: ManagedTaskContract,
  state: ManagedRunState,
): ManagedRunState {
  const current = state.lastExecutorResult;
  if (!current?.endsWith("-invalid.json")) return state;
  const result = JSON.parse(readFileSync(current, "utf-8")) as ExecutorResult;
  const historical = historicalEngineeringCommands(state, true);
  const reusableHistorical = historical.filter(
    (command) =>
      !isBlockingCommandFailure(command) && isCommandOutcomeConsistent(command),
  );
  const currentCommandCount = result.commands.length;
  const reusableCurrent = result.commands.filter(
    (command) =>
      !isBlockingCommandFailure(command) && isCommandOutcomeConsistent(command),
  );
  result.commands = uniqueCommands([...reusableHistorical, ...reusableCurrent]);
  promoteHostApprovedVerificationMetadata(contract, state, result, current);
  const filteredCount =
    historical.length -
    reusableHistorical.length +
    (currentCommandCount - reusableCurrent.length);
  if (filteredCount > 0) {
    appendManagedEvent(state, {
      eventType: "executor.historical_evidence_filtered",
      actor: "managed-runner",
      role: "runner",
      summary: mt(
        contract,
        `按当前规则过滤 ${filteredCount} 条失效历史命令证据`,
        `Filtered ${filteredCount} stale historical command evidence item(s) under current rules`,
      ),
      evidencePaths: [current],
    });
  }
  validateWorkspaceSecrets(contract, state);
  validateExecutorResult(contract, state, result, { hostApproved: true });
  const accepted = current.replace(/-invalid\.json$/, ".json");
  writeJsonAtomic(accepted, result);
  state.lastExecutorResult = accepted;
  state.deliveryProgress = evaluateCompletion(contract, result).progress;
  saveManagedRun(state);
  appendManagedEvent(state, {
    eventType: "executor.result_revalidated",
    actor: "managed-runner",
    role: "runner",
    summary: mt(
      contract,
      "最后一次执行结果已按当前确定性规则重验并晋升为正式证据",
      "The latest executor result passed current deterministic validation and was promoted to accepted evidence",
    ),
    evidencePaths: [current, accepted],
  });
  return state;
}

function promoteHostApprovedVerificationMetadata(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  result: ExecutorResult,
  invalidResultPath: string,
): void {
  const escalated = readManagedEvents(state).some(
    (event) =>
      event.eventType === "executor.verification_metadata_escalated_to_host" &&
      event.evidencePaths.includes(invalidResultPath),
  );
  if (!escalated) return;
  const command = result.commands.find(
    (item) =>
      item.exitCode === 0 &&
      item.categories?.includes("startup") &&
      item.categories.includes("runtime"),
  );
  if (!command) return;
  command.categories = uniqueCategories([
    ...(command.categories ?? []),
    "invocation",
  ]);
  appendManagedEvent(state, {
    eventType: "executor.verification_metadata_host_promoted",
    actor: contract.supervisorAgent,
    role: "supervisor",
    summary: mt(
      contract,
      "Host 已核对原始运行证据并批准把缺失的真实调用类别审计式晋升，未重跑研发环境",
      "The Host inspected the raw runtime evidence and approved audit promotion of the missing real-invocation category without rerunning the engineering environment",
    ),
    evidencePaths: [invalidResultPath],
  });
}

async function executeWorker(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  findings: ReviewFinding[],
  schemaPath: string,
  invoker: AgentInvoker,
  env: NodeJS.ProcessEnv,
): Promise<ManagedRunState> {
  const deliveryProtocolRecovery =
    state.currentStep === "executor_delivery_protocol_recovery_queued";
  if (
    contract.budgets.executorPhysicalStopAt !== undefined &&
    state.executorInvocations >= contract.budgets.executorPhysicalStopAt
  ) {
    return finishBudgetExhausted(
      contract,
      state,
      mt(
        contract,
        "Claude 临时调用窗口已用尽",
        "The temporary Claude invocation window is exhausted",
      ),
      env,
    );
  }
  const hasActiveExecutorWindow =
    contract.budgets.executorPhysicalStopAt !== undefined &&
    state.executorInvocations < contract.budgets.executorPhysicalStopAt;
  if (
    !hasActiveExecutorWindow &&
    !hasUnlimitedAgentBudget(contract) &&
    effectiveExecutorInvocations(state) >=
      contract.budgets.maxExecutorInvocations
  ) {
    return finishBudgetExhausted(
      contract,
      state,
      mt(contract, "执行调用次数达到上限", "Executor invocation limit reached"),
      env,
    );
  }
  if (
    !hasActiveExecutorWindow &&
    !hasUnlimitedAgentBudget(contract) &&
    effectiveTotalAgentInvocations(state) >=
      contract.budgets.maxTotalAgentInvocations
  ) {
    return finishBudgetExhausted(
      contract,
      state,
      mt(
        contract,
        "总 Agent 调用次数达到上限",
        "Total Agent invocation limit reached",
      ),
      env,
    );
  }

  const resumableSessionId = maxTurnSessionToResume(state);
  if (!resumableSessionId) {
    state.executorSession = rolloverSession(state.executorSession);
  }
  state.executorSession = {
    ...state.executorSession,
    resumingSessionId: resumableSessionId,
  };
  state.executorInvocations += 1;
  state.totalAgentInvocations += 1;
  state.executorStage = initialExecutorStage(findings, state.executorStage);
  state.executorActiveStage = state.executorStage;
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
      `开始第 ${state.executorInvocations} 次执行调用；${contract.executorAgent} 模型 ${contract.executorConfig?.model ?? "未知"}，推理深度 ${contract.executorConfig?.reasoningEffort ?? "未知"}`,
      `Started executor invocation ${state.executorInvocations}; ${contract.executorAgent} model ${contract.executorConfig?.model ?? "unknown"}, reasoning effort ${contract.executorConfig?.reasoningEffort ?? "unknown"}`,
    ),
  });
  appendExecutorStageEvent(contract, state, state.executorStage);

  const handoffFile = writeManagedExecutorHandoff(contract, state, findings);
  const prompt = buildExecutorPrompt(contract, state, findings, handoffFile);
  const promptFile = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    findings.length > 0
      ? `repair-${state.reviewRound}.md`
      : "executor-initial-prompt.md",
  );
  writeFileSync(promptFile, prompt, "utf-8");
  state.lastRepairPrompt =
    findings.length > 0 ? promptFile : state.lastRepairPrompt;
  appendManagedEvent(state, {
    eventType: "executor.dispatch_recorded",
    actor: "managed-runner",
    role: "runner",
    summary: mt(
      contract,
      `已下发第 ${state.executorInvocations} 次执行，handoff hash=${fileHash(handoffFile)}`,
      `Recorded executor dispatch ${state.executorInvocations}, handoff hash=${fileHash(handoffFile)}`,
    ),
    evidencePaths: [handoffFile, promptFile],
  });
  const started = Date.now();
  const result = await invokeWithFailureEvidence<ExecutorResult>(
    state,
    invoker,
    invocation(
      contract,
      state,
      prompt,
      promptFile,
      schemaPath,
      resumableSessionId,
      deliveryProtocolRecovery,
      (sessionId) => {
        if (!acceptsExecutorCallback(state)) return;
        state.executorSession = {
          ...state.executorSession,
          sessionId,
          createdAt:
            state.executorSession.createdAt ?? new Date().toISOString(),
          status: "active",
          lastResumedRound: state.reviewRound,
        };
        saveManagedRun(state);
        recordHumanGuidanceHandoffDelivery(
          contract,
          state,
          handoffFile,
          sessionId,
        );
        if (
          !readManagedEvents(state).some(
            (event) =>
              event.eventType === "executor.handoff_acknowledged" &&
              event.evidencePaths.includes(handoffFile),
          )
        ) {
          appendManagedEvent(state, {
            eventType: "executor.handoff_acknowledged",
            actor: contract.executorAgent,
            role: "executor",
            summary: mt(
              contract,
              `Executor 已确认第 ${state.executorInvocations} 次 handoff 并返回会话标识`,
              `Executor acknowledged handoff for invocation ${state.executorInvocations} with a session identifier`,
            ),
            evidencePaths: [handoffFile],
          });
        }
      },
      (summary) => recordExecutorProgress(contract, state, summary),
    ),
    `executor-${state.executorInvocations}-failed`,
  );
  state.consecutiveTransientProviderFailures = 0;
  state = closeActiveTime(state, started);
  state.executorUsage = mergeAgentUsage(state.executorUsage, result.usage);
  state.runtimeTelemetry = result.telemetry ?? state.runtimeTelemetry ?? null;
  state.runningAgentPid = null;
  state.executorSession = {
    ...state.executorSession,
    sessionId: result.sessionId,
    createdAt: state.executorSession.createdAt ?? new Date().toISOString(),
    status: "active",
    lastResumedRound: state.reviewRound,
    resumingSessionId: null,
  };
  const resultFile = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    `executor-result-${state.executorInvocations}.json`,
  );
  let finalPreflightLogs: string[] = [];
  appendManagedEvent(state, {
    eventType: "executor.delivery_received",
    actor: "managed-runner",
    role: "runner",
    summary: mt(
      contract,
      `Runner 已接收第 ${state.executorInvocations} 次交付，开始确定性校验`,
      `Runner received executor delivery ${state.executorInvocations} and started deterministic validation`,
    ),
  });
  try {
    result.output = redactManagedValue(
      normalizeExecutorResult(contract, state, result.output),
    );
    validateInvocationTelemetry(contract, state, result, result.output);
    validateWorkspaceSecrets(contract, state);
    validateExecutorResult(contract, state, result.output);
    finalPreflightLogs = runExecutorFinalPreflight(
      contract,
      state,
      result.output,
    );
  } catch (error) {
    const invalidFile = path.join(
      managedRunDir(state.projectRoot, state.taskId, state.runId),
      `executor-result-${state.executorInvocations}-invalid.json`,
    );
    writeJsonAtomic(invalidFile, result.output);
    const invalidLogs = writeInvocationLogs(
      state,
      `executor-${state.executorInvocations}-invalid`,
      result.stdout,
      result.stderr,
    );
    const gateLogs =
      error instanceof ExecutorFinalPreflightError ? error.evidencePaths : [];
    appendManagedEvent(state, {
      eventType: "executor.result_rejected",
      actor: contract.executorAgent,
      role: "executor",
      summary: (error as Error).message,
      evidencePaths: [
        invalidFile,
        ...invalidLogs,
        ...finalPreflightLogs,
        ...gateLogs,
      ],
    });
    if (error instanceof VerificationMetadataAmbiguityError) {
      state.lastExecutorResult = invalidFile;
      state.lastReviewResult = null;
      state.currentStep = "verification_metadata_host_review_required";
      saveManagedRun(state);
      appendManagedEvent(state, {
        eventType: "executor.verification_metadata_escalated_to_host",
        actor: "managed-runner",
        role: "runner",
        summary: mt(
          contract,
          `运行证据类别存在结构化歧义，保留原始证据交 Host 语义判断，不启动完整 Executor 整改：${(error as Error).message}`,
          `Verification categories are structurally ambiguous; raw evidence was preserved for Host semantic review without starting a full Executor repair: ${(error as Error).message}`,
        ),
        evidencePaths: [invalidFile, ...invalidLogs],
      });
      return state;
    }
    return queueExecutorSelfRepair(
      contract,
      state,
      (error as Error).message,
      invalidFile,
    );
  }
  writeJsonAtomic(resultFile, result.output);
  const logFiles = writeInvocationLogs(
    state,
    `executor-${state.executorInvocations}`,
    result.stdout,
    result.stderr,
  );
  state.lastExecutorResult = resultFile;
  state.deliveryProgress = evaluateCompletion(contract, result.output).progress;
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
    evidencePaths: [
      resultFile,
      ...logFiles,
      ...finalPreflightLogs,
      ...result.output.evidence,
    ],
  });

  const completionGap = executorCompletionGap(contract, result.output);
  if (result.output.status === "ready_for_review" && completionGap) {
    return queueExecutorSelfRepair(contract, state, completionGap, resultFile);
  }

  if (result.output.status !== "failed") return state;
  return finishBlocked(
    contract,
    state,
    managedList(contract.language, result.output.blockers, "", "") ||
      result.output.summary,
    env,
  );
}

function maxTurnSessionToResume(state: ManagedRunState): string | null {
  if (state.executorSession.status !== "active") return null;
  if (!state.executorSession.sessionId) return null;
  if (
    state.executorSession.retiredSessions?.some(
      (session) => session.sessionId === state.executorSession.sessionId,
    )
  ) {
    return null;
  }
  const terminal = readManagedEvents(state)
    .slice()
    .reverse()
    .find((event) =>
      ["executor.invocation_failed", "executor.ended"].includes(
        event.eventType,
      ),
    );
  if (
    terminal?.eventType !== "executor.invocation_failed" ||
    !/max[_ -]?turns|maximum number of turns/i.test(terminal.summary)
  ) {
    return null;
  }
  return state.executorSession.sessionId;
}

function isMaxTurnContinuationFailure(message: string): boolean {
  return /max[_ -]?turns|maximum number of turns/i.test(message);
}

function unresumableExecutorSessionFailure(
  error: unknown,
  state: ManagedRunState,
): NonNullable<ReturnType<typeof classifyUnresumableSessionFailure>> | null {
  const sessionId = state.executorSession.resumingSessionId;
  if (!sessionId || state.executorSession.sessionId !== sessionId) return null;
  const raw = error as Error & { stdout?: unknown; stderr?: unknown };
  return classifyUnresumableSessionFailure({
    message: raw.message,
  });
}

function unresumableSessionRecoveryCount(state: ManagedRunState): number {
  return readManagedEvents(state).filter(
    (event) => event.eventType === "executor.session_recovery_queued",
  ).length;
}

function isExecutorDeliveryProtocolFailure(message: string): boolean {
  return /(?:Agent 最终输出不是 JSON|Agent final output is not JSON|Agent 未返回结构化结果|Agent did not return structured output|Agent 输出中缺少可恢复 session ID|Agent output is missing a resumable session ID)/i.test(
    message,
  );
}

function deliveryProtocolRecoveryCount(state: ManagedRunState): number {
  return readManagedEvents(state).filter(
    (event) => event.eventType === "executor.delivery_protocol_recovery_queued",
  ).length;
}

function consecutiveMaxTurnFailures(state: ManagedRunState): number {
  let count = 0;
  for (const event of readManagedEvents(state).slice().reverse()) {
    if (
      [
        "executor.ended",
        "human.pause_applied",
        "human.guidance_resumed",
        "human.resume_requested",
        "provider.permanent_failure",
        "connectivity.lost",
      ].includes(event.eventType)
    ) {
      break;
    }
    if (
      event.eventType === "executor.invocation_failed" &&
      isMaxTurnContinuationFailure(event.summary)
    ) {
      count += 1;
    }
  }
  return count;
}

function recordExecutorProgress(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  summary: string,
): void {
  if (!acceptsExecutorCallback(state)) return;
  if (summary.startsWith("superflow-supervision:")) {
    appendSupervisionCheckpoint(contract, state, summary);
    return;
  }
  recordExecutorRework(contract, state, summary);
  const explicitStage = explicitExecutorStage(summary);
  if (explicitStage && explicitStage !== state.executorActiveStage) {
    state.executorActiveStage = explicitStage;
    saveManagedRun(state);
  }
  const stage = inferExecutorStage(summary, state.executorStage);
  if (stage && stage !== state.executorStage) {
    state.executorStage = stage;
    saveManagedRun(state);
    appendExecutorStageEvent(contract, state, stage);
  }
  const runDir = managedRunDir(state.projectRoot, state.taskId, state.runId);
  const evidenceFile = path.join(
    runDir,
    `executor-progress-${state.executorInvocations}.jsonl`,
  );
  const persistedSummary = redactManagedLog(summary);
  appendFileSync(
    evidenceFile,
    `${JSON.stringify({ timestamp: new Date().toISOString(), summary: persistedSummary })}\n`,
    "utf-8",
  );
  appendManagedEvent(state, {
    eventType: "executor.progress",
    actor: contract.executorAgent,
    role: "executor",
    summary: persistedSummary.slice(0, 240),
    evidencePaths: [evidenceFile],
  });
  const fingerprint = computeWorkspaceFingerprintForRoots([
    contract.projectRoot,
    ...contract.relatedProjectRoots,
  ]);
  if (fingerprint === state.workspaceFingerprint) return;
  state.workspaceFingerprint = fingerprint;
  saveManagedRun(state);
  const diffStats = [contract.projectRoot, ...contract.relatedProjectRoots]
    .map(
      (root) =>
        `${root}\n${safeGitOutput(root, ["diff", "--stat"]) || "无差异统计"}`,
    )
    .join("\n");
  const workspaceFile = path.join(runDir, `workspace-change-${Date.now()}.txt`);
  writeFileSync(workspaceFile, `${diffStats}\n`, "utf-8");
  appendManagedEvent(state, {
    eventType: "workspace.changed",
    actor: contract.executorAgent,
    role: "executor",
    summary: mt(
      contract,
      "检测到目标工作区内容变化，完整 diff stat 已留档",
      "Detected target workspace changes; the full diff stat was persisted",
    ),
    evidencePaths: [workspaceFile],
  });
}

function appendSupervisionCheckpoint(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  summary: string,
): void {
  const events = readManagedEvents(state);
  const latestAttention = events
    .slice()
    .reverse()
    .find(
      (event) => event.eventType === "executor.supervision_attention_required",
    );
  const previous = events
    .slice()
    .reverse()
    .find(
      (event) =>
        event.sequence > (latestAttention?.sequence ?? 0) &&
        (event.eventType === "executor.supervision_checkpoint" ||
          event.eventType === "executor.supervision_checkpoint_idle"),
    );
  const supervisionWindowStart =
    previous?.sequence ?? latestAttention?.sequence ?? 0;
  const recent = events.filter(
    (event) => event.sequence > supervisionWindowStart,
  );
  const stageChanges = recent.filter((event) =>
    ["executor.stage_changed", "executor.stage_rework"].includes(
      event.eventType,
    ),
  ).length;
  const commandCompletions = recent.filter(
    (event) =>
      event.eventType === "executor.progress" &&
      /(?:background command|command).*(?:completed|exit code|完成|退出码)/i.test(
        event.summary,
      ),
  ).length;
  const workspaceChanges = recent.filter(
    (event) => event.eventType === "workspace.changed",
  ).length;
  const raw = summary.slice("superflow-supervision:".length);
  let telemetry = raw;
  try {
    telemetry = JSON.stringify(JSON.parse(raw));
  } catch {
    // Preserve bounded raw telemetry when an older adapter emits plain text.
  }
  const hasEffectiveMilestone = stageChanges + commandCompletions > 0;
  appendManagedEvent(state, {
    eventType: hasEffectiveMilestone
      ? "executor.supervision_checkpoint"
      : "executor.supervision_checkpoint_idle",
    actor: contract.executorAgent,
    role: "executor",
    summary: mt(
      contract,
      `10 分钟监督点：当前阶段 ${state.executorActiveStage ?? state.executorStage ?? "unknown"}；已达里程碑 ${state.executorStage ?? "unknown"}；阶段变化 ${stageChanges}；命令完成 ${commandCompletions}；工作区变化 ${workspaceChanges}；遥测 ${telemetry}`,
      `10-minute supervision checkpoint: active stage ${state.executorActiveStage ?? state.executorStage ?? "unknown"}; reached milestone ${state.executorStage ?? "unknown"}; stage changes ${stageChanges}; command completions ${commandCompletions}; workspace changes ${workspaceChanges}; telemetry ${telemetry}`,
    ).slice(0, 500),
    evidencePaths: [],
  });
  if (
    !hasEffectiveMilestone &&
    previous?.eventType === "executor.supervision_checkpoint_idle"
  ) {
    appendManagedEvent(state, {
      eventType: "executor.supervision_attention_required",
      actor: "managed-runner",
      role: "runner",
      summary: mt(
        contract,
        "连续两个 10 分钟监督点没有阶段推进或权威命令完成，需要 Host 轻量判断是否偏航",
        "Two consecutive 10-minute checkpoints had no stage advance or authoritative command completion; the Host must perform a lightweight drift check",
      ),
      evidencePaths: [],
    });
  }
}

function acceptsExecutorCallback(state: ManagedRunState): boolean {
  const persisted = loadManagedRun(
    state.projectRoot,
    state.taskId,
    state.runId,
  );
  return (
    persisted.status === "running" &&
    persisted.executorInvocations === state.executorInvocations
  );
}

function recordExecutorRework(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  summary: string,
): void {
  const current = state.executorStage;
  const explicit = explicitExecutorStage(summary);
  if (!current || !explicit || explicit === current) return;
  const order: NonNullable<ManagedRunState["executorStage"]>[] = [
    "source_discovery",
    "implementation",
    "unit_test",
    "package",
    "application_startup",
    "http_e2e",
    "cleanup",
    "delivery_self_check",
  ];
  if (order.indexOf(explicit) >= order.indexOf(current)) return;
  const summaryText = mt(
    contract,
    `Executor 在 ${current} 后回到 ${explicit} 修复并重跑受影响验证`,
    `Executor returned from ${current} to ${explicit} to repair and rerun affected validation`,
  );
  const events = readManagedEvents(state);
  let duplicate = false;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.eventType === "executor.stage_changed") break;
    if (
      event.eventType === "executor.stage_rework" &&
      event.summary === summaryText
    ) {
      duplicate = true;
      break;
    }
  }
  if (duplicate) return;
  appendManagedEvent(state, {
    eventType: "executor.stage_rework",
    actor: contract.executorAgent,
    role: "executor",
    summary: summaryText,
    evidencePaths: [],
  });
}

function explicitExecutorStage(
  summary: string,
): NonNullable<ManagedRunState["executorStage"]> | undefined {
  return summary
    .toLowerCase()
    .match(
      /superflow-stage:(source_discovery|implementation|unit_test|package|application_startup|http_e2e|cleanup|delivery_self_check)/,
    )?.[1] as NonNullable<ManagedRunState["executorStage"]> | undefined;
}

function inferExecutorStage(
  summary: string,
  current: ManagedRunState["executorStage"],
): ManagedRunState["executorStage"] {
  const value = summary.toLowerCase();
  const explicit = value.match(
    /superflow-stage:(source_discovery|implementation|unit_test|package|application_startup|http_e2e|cleanup|delivery_self_check)/,
  )?.[1] as ManagedRunState["executorStage"] | undefined;
  if (explicit) return advanceExecutorStage(current, explicit);
  if (
    /structuredoutput|preflight|diff --check|交付前|final result/.test(value)
  ) {
    return advanceExecutorStage(current, "delivery_self_check");
  }
  if (
    /drop table|redis.*(?:del|exists)|kill|sigterm|pgrep|cleanup|清理|no listener|无监听/.test(
      value,
    )
  ) {
    return advanceExecutorStage(current, "cleanup");
  }
  if (/curl|http|e2e|接口调用/.test(value)) {
    return advanceExecutorStage(current, "http_e2e");
  }
  if (
    /java -jar|spring-boot:run|app(?:lication)? startup|startup.*ports?|wait for application|启动应用/.test(
      value,
    )
  ) {
    return advanceExecutorStage(current, "application_startup");
  }
  if (/mvn.*package|gradle.*build|npm.*build|package jar|打包/.test(value)) {
    return advanceExecutorStage(current, "package");
  }
  if (/mvn.*test|unit test|vitest|jest|pytest|单元测试/.test(value)) {
    return advanceExecutorStage(current, "unit_test");
  }
  if (/\bedit\b|\bwrite\b|workspace_writing|修改源码|编码/.test(value)) {
    return advanceExecutorStage(current, "implementation");
  }
  if (/\bread\b|\brg\b|\bgrep\b|搜索|检索/.test(value)) {
    return current ?? "source_discovery";
  }
  return current;
}

function initialExecutorStage(
  findings: ReviewFinding[],
  current: ManagedRunState["executorStage"],
): NonNullable<ManagedRunState["executorStage"]> {
  if (findings.length === 0) return "source_discovery";
  if (
    findings.some((finding) =>
      /^(?:correctness|security|maintainability|style|code_quality|implementation)$/i.test(
        finding.category,
      ),
    )
  ) {
    return "implementation";
  }
  const content = findings
    .flatMap((finding) => [
      finding.category,
      finding.target,
      finding.evidence,
      finding.requiredFix,
      ...finding.acceptanceChecks,
    ])
    .join("\n");
  return inferRepairStage(content, current);
}

function inferRepairStage(
  content: string,
  current: ManagedRunState["executorStage"],
): NonNullable<ManagedRunState["executorStage"]> {
  const value = content.toLowerCase();
  if (/cleanup|清理|drop table|redis.*del|进程残留/.test(value)) {
    return "cleanup";
  }
  if (/curl|http|e2e|接口|页面测试/.test(value)) return "http_e2e";
  if (/startup|启动|端口|listener/.test(value)) {
    return "application_startup";
  }
  if (/package|build|compile|构建|编译|打包/.test(value)) return "package";
  if (/test|测试|覆盖率/.test(value)) return "unit_test";
  if (/preflight|交付|证据|报告/.test(value)) return "delivery_self_check";
  if (current && current !== "source_discovery") return current;
  return "implementation";
}

function advanceExecutorStage(
  current: ManagedRunState["executorStage"],
  candidate: NonNullable<ManagedRunState["executorStage"]>,
): NonNullable<ManagedRunState["executorStage"]> {
  const order: NonNullable<ManagedRunState["executorStage"]>[] = [
    "source_discovery",
    "implementation",
    "unit_test",
    "package",
    "application_startup",
    "http_e2e",
    "cleanup",
    "delivery_self_check",
  ];
  if (!current) return candidate;
  return order.indexOf(candidate) >= order.indexOf(current)
    ? candidate
    : current;
}

function appendExecutorStageEvent(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  stage: NonNullable<ManagedRunState["executorStage"]>,
): void {
  const labels = {
    source_discovery: ["源码与规则检索", "source and rule discovery"],
    implementation: ["编码实现", "implementation"],
    unit_test: ["单元测试", "unit tests"],
    package: ["构建打包", "build and package"],
    application_startup: ["应用启动", "application startup"],
    http_e2e: ["真实 HTTP E2E", "real HTTP E2E"],
    cleanup: ["环境清理", "environment cleanup"],
    delivery_self_check: [
      "交付前确定性自检",
      "deterministic delivery preflight",
    ],
  } as const;
  appendManagedEvent(state, {
    eventType: "executor.stage_changed",
    actor: contract.executorAgent,
    role: "executor",
    summary: mt(
      contract,
      `研发阶段：${labels[stage][0]}`,
      `Executor stage: ${labels[stage][1]}`,
    ),
    evidencePaths: [],
  });
}

function validateInvocationTelemetry(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  invocationResult: AgentInvocationResult<ExecutorResult>,
  result: ExecutorResult,
): void {
  const telemetry = invocationResult.telemetry;
  if (!telemetry) return;
  if (contract.executorAgent === "claude") {
    if (!telemetry.model || telemetry.tools.length === 0) {
      throw new Error(
        mt(
          contract,
          "Claude system/init 未提供实际模型或工具清单",
          "Claude system/init did not provide the actual model or tool list",
        ),
      );
    }
  }
  if (
    result.changedFiles.length > 0 &&
    !telemetry.toolUses.some((tool) => /write|edit|apply_patch/i.test(tool))
  ) {
    if (
      !declaredFilesChangedSinceBaseline(contract, state, result.changedFiles)
    ) {
      throw new Error(
        mt(
          contract,
          "执行结果声明修改文件，但工作区基线无法证明任何对应变更",
          "The executor reported changed files but the workspace baseline proves no corresponding change",
        ),
      );
    }
    appendManagedEvent(state, {
      eventType: "executor.write_telemetry_inferred",
      actor: "managed-runner",
      role: "runner",
      summary: mt(
        contract,
        "流式事件缺少 Write/Edit，但冻结基线已证明交付文件真实变化；转交 Host 语义评审，不重启 Executor",
        "Write/Edit stream telemetry was absent, but the frozen baseline proves real delivery changes; forwarding to Host review without restarting the Executor",
      ),
      evidencePaths: [],
    });
  }
  const claimsNoTool = [...result.blockers, result.summary].some((item) =>
    /工具.*不可用|no tools?|tool.*unavailable/i.test(item),
  );
  if (
    claimsNoTool &&
    telemetry.tools.length > 0 &&
    telemetry.toolUses.length === 0
  ) {
    throw new Error(
      mt(
        contract,
        "执行者在未尝试已声明工具的情况下声称工具不可用",
        "The executor claimed tools were unavailable without attempting the declared tools",
      ),
    );
  }
}

function declaredFilesChangedSinceBaseline(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  files: string[],
): boolean {
  const roots = [contract.projectRoot, ...contract.relatedProjectRoots].map(
    (root) => path.resolve(root),
  );
  const current = snapshotChangedWorkspaceFiles(roots);
  const baseline = state.baselineWorkspaceFiles ?? {};
  return files.some((file) => {
    const normalized = file.replaceAll("\\", "/");
    return roots.some((root) => {
      const absolute = path.isAbsolute(file)
        ? path.resolve(file)
        : path.resolve(root, file);
      if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
        return false;
      }
      const relative = path.relative(root, absolute).replaceAll("\\", "/");
      if (relative !== normalized && path.isAbsolute(file)) return false;
      const key = `${root}::${relative}`;
      return current[key] !== undefined && baseline[key] !== current[key];
    });
  });
}

function prepareExternalHostReview(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  env: NodeJS.ProcessEnv,
): ManagedRunState {
  if (
    !hasUnlimitedAgentBudget(contract) &&
    state.reviewInvocations >= contract.budgets.maxReviewRounds
  ) {
    return finishReviewExhausted(contract, state, env);
  }
  state.reviewRound += 1;
  state.reviewInvocations += 1;
  const reviewedResult = state.lastExecutorResult
    ? (JSON.parse(
        readFileSync(state.lastExecutorResult, "utf-8"),
      ) as ExecutorResult)
    : null;
  const workspacePaths = hostReviewWorkspacePaths(contract, reviewedResult);
  const promptPath = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    `host-review-${state.reviewRound}.md`,
  );
  const reviewFacts = writeManagedReviewFacts(contract, state);
  state.lastReviewedWorkspaceFiles = reviewFacts.workspaceSnapshot;
  writeFileSync(
    promptPath,
    buildReviewPrompt(contract, state, reviewFacts.jsonPath),
    "utf-8",
  );
  state.pendingExternalReview = {
    round: state.reviewRound,
    promptPath,
    factsPath: reviewFacts.jsonPath,
    workspaceFingerprint: computeScopedWorkspaceFingerprint(
      [contract.projectRoot, ...contract.relatedProjectRoots],
      workspacePaths,
    ),
    requestedAt: new Date().toISOString(),
    workspacePaths,
  };
  const reviewMessage = mt(
    contract,
    `等待当前 Host ${contract.supervisorAgent} 提交评审结果`,
    `Waiting for the current ${contract.supervisorAgent} host to submit its review result`,
  );
  state.blocker = null;
  state = transition(
    contract,
    state,
    "waiting_for_host_review",
    "external_supervisor_review_required",
    env,
  );
  saveManagedRun(state);
  appendManagedEvent(state, {
    eventType: "review.external_requested",
    actor: contract.supervisorAgent,
    role: "supervisor",
    summary: reviewMessage,
    evidencePaths: [promptPath, reviewFacts.jsonPath, reviewFacts.markdownPath],
  });
  if (
    notifyManagedTask(
      {
        taskId: state.taskId,
        type: "review_required",
        title: mt(
          contract,
          "Superflow 等待主 Agent 评审",
          "Superflow is waiting for host review",
        ),
        message: mt(
          contract,
          `${state.taskId} 已完成研发执行，等待第 ${state.reviewRound} 轮全量评审`,
          `${state.taskId} completed executor work and awaits full review round ${state.reviewRound}`,
        ),
      },
      env,
    )
  ) {
    appendManagedEvent(state, {
      eventType: "host.review_required_notified",
      actor: "managed-runner",
      role: "runner",
      summary: `已通知 Host 处理第 ${state.reviewRound} 轮评审`,
      evidencePaths: [promptPath],
    });
  }
  return state;
}

/**
 * Host 验收会重跑已声明的验证命令，因此只允许明确 taskEvidence 指向
 * 的证据文件在评审期间更新；其他源码与合同文件仍必须保持不变。
 */
function hostReviewWorkspacePaths(
  contract: ManagedTaskContract,
  result: ExecutorResult | null,
): string[] {
  if (!result) return [];
  const roots = [contract.projectRoot, ...contract.relatedProjectRoots].map(
    (root) => path.resolve(root),
  );
  const evidencePaths = new Set(
    (result.taskEvidence ?? []).flatMap((item) =>
      item.evidencePaths.flatMap((evidencePath) => {
        const canonicalPath = canonicalEvidencePath(evidencePath);
        return path.isAbsolute(canonicalPath)
          ? [path.resolve(canonicalPath)]
          : roots.map((root) => path.resolve(root, canonicalPath));
      }),
    ),
  );
  return result.changedFiles.filter((changedFile) => {
    const candidates = path.isAbsolute(changedFile)
      ? [path.resolve(changedFile)]
      : roots.map((root) => path.resolve(root, changedFile));
    return !candidates.some((candidate) => evidencePaths.has(candidate));
  });
}

function rolloverSession(
  session: ManagedRunState["executorSession"],
): ManagedRunState["executorSession"] {
  const previousSessionIds = [...(session.previousSessionIds ?? [])];
  if (session.sessionId && !previousSessionIds.includes(session.sessionId)) {
    previousSessionIds.push(session.sessionId);
  }
  return {
    ...session,
    sessionId: null,
    createdAt: null,
    status: "pending",
    previousSessionIds,
    resumingSessionId: null,
  };
}

function retireExecutorSession(
  session: ManagedRunState["executorSession"],
  reason: NonNullable<ReturnType<typeof classifyUnresumableSessionFailure>>,
): ManagedRunState["executorSession"] {
  const sessionId = session.resumingSessionId;
  if (!sessionId) return rolloverSession(session);
  const retiredSessions = [...(session.retiredSessions ?? [])];
  if (!retiredSessions.some((retired) => retired.sessionId === sessionId)) {
    retiredSessions.push({
      sessionId,
      reason,
      retiredAt: new Date().toISOString(),
    });
  }
  return {
    ...rolloverSession(session),
    retiredSessions,
  };
}

export function writeManagedExecutorHandoff(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  findings: ReviewFinding[],
): string {
  const runDir = managedRunDir(state.projectRoot, state.taskId, state.runId);
  const reportPath = path.join(runDir, "task-report.md");
  const report = existsSync(reportPath)
    ? readFileSync(reportPath, "utf-8").slice(-6_000)
    : "";
  const lastResult = state.lastExecutorResult
    ? (JSON.parse(
        readFileSync(state.lastExecutorResult, "utf-8"),
      ) as ExecutorResult)
    : null;
  const progress = readOpenSpecTaskProgress(
    contract,
    completionResultWithHistory(state, lastResult),
  );
  const diffStat = safeGitOutput(contract.projectRoot, ["diff", "--stat"]);
  const changedFiles = changedWorkspaceFilesSinceBaseline(contract, state).map(
    ({ root, relative }) =>
      path.resolve(root) === path.resolve(contract.projectRoot)
        ? relative.replaceAll("\\", "/")
        : path.join(root, relative).replaceAll("\\", "/"),
  );
  const evidenceTasks = readCompletionTasks(
    contract,
    completionResultWithHistory(state, lastResult),
  ).filter((task) => task.completed && task.category === "local_required");
  const humanMessages = undeliveredHumanGuidance(contract, state);
  const displayedHumanMessages = humanMessages.slice(-20);
  const deliveryMessageIds = humanMessages.map((message) => message.messageId);
  const contextManifest = ensureManagedContextManifest(contract);
  const ruleSelection = frozenRuleSelection(contract, contextManifest);
  const ruleFiles = ruleSelection.files;
  const preflightCommand = [
    process.execPath,
    path.join(
      ASSETS_DIR,
      "scripts",
      "superflow-managed-executor-preflight.mjs",
    ),
    contract.projectRoot,
    state.taskId,
  ].join(" ");
  const file = path.join(
    runDir,
    `executor-handoff-${state.executorInvocations}.md`,
  );
  const machineFile = path.join(
    runDir,
    `executor-handoff-${state.executorInvocations}.json`,
  );
  writeJsonAtomic(machineFile, {
    protocolVersion: "superflow.handoff.v2",
    messageType: "executor_handoff",
    taskId: state.taskId,
    runId: state.runId,
    invocation: state.executorInvocations,
    language: contract.language ?? "zh",
    frozenPrompt: {
      path: contract.taskPrompt?.snapshotPath ?? null,
      sha256: contract.taskPrompt?.sha256 ?? null,
    },
    acceptanceContract: contract.acceptanceContract
      ? {
          path: path.join(
            managedTaskDir(contract.projectRoot, contract.taskId),
            "acceptance-contract.md",
          ),
          sha256: managedAcceptanceContractHash(contract.acceptanceContract),
        }
      : null,
    workspace: { changedFiles, diffStat: diffStat || null },
    executionHints: {
      stablePolicySha256: stableExecutorPolicyHash(),
      contextManifest: {
        path: managedContextManifestPath(contract),
        sha256: contextManifest.manifestHash,
      },
      ruleScenarios: ruleSelection.scenarios,
      applicableRuleFiles: ruleFiles,
      mandatoryEngineeringRules: contract.mandatoryEngineeringRules ?? [],
      deterministicPreflightCommand: preflightCommand,
    },
    tasks: {
      total: progress.total,
      completed: progress.completed,
      localPending: progress.localPending,
      externalPending: progress.externalPending,
      checkedLocalTaskIds: evidenceTasks.map((task) => task.taskId),
    },
    findings,
    humanGuidance: {
      messages: humanMessages,
      deliveryMessageIds,
    },
    budget: {
      executorInvocations: state.executorInvocations,
      effectiveExecutorInvocations: effectiveExecutorInvocations(state),
      maxExecutorInvocations: contract.budgets.maxExecutorInvocations,
      tokenUnitsUsed: executorOutputTokenUnits(state),
      maxExecutorTokenUnits: contract.budgets.maxExecutorTokenUnits ?? null,
      outputTokensUsed: executorOutputTokenUnits(state),
      maxExecutorOutputTokens: contract.budgets.maxExecutorTokenUnits ?? null,
      costUsdUsed: state.executorUsage?.costUsd ?? null,
      maxExecutorCostUsd: contract.budgets.maxExecutorCostUsd ?? null,
    },
  });
  const lines =
    contract.language === "en"
      ? [
          "# Condensed Executor Handoff",
          "",
          `Task: ${state.taskId}`,
          `Frozen prompt: ${contract.taskPrompt?.snapshotPath ?? "none"}`,
          `Prompt SHA-256: ${contract.taskPrompt?.sha256 ?? "none"}`,
          `Frozen acceptance contract: ${contract.acceptanceContract ? path.join(managedTaskDir(contract.projectRoot, contract.taskId), "acceptance-contract.md") : "none"}`,
          `Machine handoff: ${machineFile}`,
          `Applicable rule files: ${ruleFiles.join(", ") || "none"}`,
          `Mandatory host rules: ${contract.mandatoryEngineeringRules?.join("; ") || "none"}`,
          `Deterministic delivery preflight: ${preflightCommand}`,
          `Task progress: ${progress.completed}/${progress.total}; local pending ${progress.localPending.length}; external pending ${progress.externalPending.length}`,
          `Current diff stat:\n${diffStat || "none"}`,
          "",
          "## Required Complete changedFiles",
          "The Runner owns the authoritative changedFiles list below. The executor may report hints, but must not spend a repair round reproducing this list.",
          ...(changedFiles.length > 0
            ? changedFiles.map((changedFile) => `- ${changedFile}`)
            : ["none"]),
          "",
          "## Required Exact taskEvidence IDs",
          "The Runner derives baseline evidence for every exact ID below from tasks.md, workspace changes, and successful commands. Add taskEvidence only when a task needs distinct evidence; do not duplicate entries merely to satisfy formatting.",
          ...(evidenceTasks.length > 0
            ? evidenceTasks.map((task) => `- ${task.taskId}: ${task.text}`)
            : ["none"]),
          "",
          "## Current Findings",
          ...handoffFindingLines(findings, "en"),
          "",
          "## Latest User Guidance",
          ...(displayedHumanMessages.length > 0
            ? displayedHumanMessages.map(
                (message) =>
                  `- ${message.timestamp} [${message.actor}] ${message.content}`,
              )
            : ["none"]),
          "",
          "## Local Pending Tasks",
          ...(progress.localPending.length > 0
            ? progress.localPending
            : ["none"]),
          "",
          "## External Prerequisites",
          ...(progress.externalPending.length > 0
            ? progress.externalPending
            : ["none"]),
          "",
          "## Recent Persisted Report",
          report || "none",
        ]
      : [
          "# 研发执行压缩交接包",
          "",
          `任务：${state.taskId}`,
          `冻结 Prompt：${contract.taskPrompt?.snapshotPath ?? "无"}`,
          `Prompt SHA-256：${contract.taskPrompt?.sha256 ?? "无"}`,
          `冻结验收合同：${contract.acceptanceContract ? path.join(managedTaskDir(contract.projectRoot, contract.taskId), "acceptance-contract.md") : "无"}`,
          `机器交接协议：${machineFile}`,
          `适用规则文件：${ruleFiles.join("、") || "无"}`,
          `Host 强制规则：${contract.mandatoryEngineeringRules?.join("；") || "无"}`,
          `交付前确定性门禁：${preflightCommand}`,
          `任务进度：${progress.completed}/${progress.total}；本地剩余 ${progress.localPending.length}；外部前置 ${progress.externalPending.length}`,
          `当前差异统计：\n${diffStat || "无"}`,
          "",
          "## 必须完整上报的 changedFiles",
          "以下 changedFiles 由 Runner 负责生成并作为事实源；Executor 可提供提示，但不得为重复抄写本清单消耗整改轮次。",
          ...(changedFiles.length > 0
            ? changedFiles.map((changedFile) => `- ${changedFile}`)
            : ["无"]),
          "",
          "## 必须逐项上报的精确 taskEvidence ID",
          "Runner 会根据 tasks.md、工作区差异和成功命令为以下精确 ID 推导基础证据。只有某项需要独立证据时才补充 taskEvidence，禁止为了满足格式重复填写全部任务。",
          ...(evidenceTasks.length > 0
            ? evidenceTasks.map((task) => `- ${task.taskId}: ${task.text}`)
            : ["无"]),
          "",
          "## 本轮全部 Finding",
          ...handoffFindingLines(findings, "zh"),
          "",
          "## 用户最新补充",
          ...(displayedHumanMessages.length > 0
            ? displayedHumanMessages.map(
                (message) =>
                  `- ${message.timestamp} [${message.actor}] ${message.content}`,
              )
            : ["无"]),
          "",
          "## 本地剩余任务",
          ...(progress.localPending.length > 0
            ? progress.localPending
            : ["无"]),
          "",
          "## 外部发布前置",
          ...(progress.externalPending.length > 0
            ? progress.externalPending
            : ["无"]),
          "",
          "## 最近落盘报告",
          report || "无",
        ];
  writeFileSync(file, `${lines.join("\n")}\n`, "utf-8");
  appendManagedEvent(state, {
    eventType: "executor.handoff_created",
    actor: "managed-runner",
    role: "runner",
    summary: mt(
      contract,
      `已生成第 ${state.executorInvocations} 次研发执行压缩交接包`,
      `Created condensed handoff for executor invocation ${state.executorInvocations}`,
    ),
    evidencePaths: [file, machineFile],
  });
  return file;
}

function hasUndeliveredHumanGuidance(
  contract: ManagedTaskContract,
  state: ManagedRunState,
): boolean {
  return undeliveredHumanGuidance(contract, state).length > 0;
}

function undeliveredHumanGuidance(
  contract: ManagedTaskContract,
  state: ManagedRunState,
) {
  const delivered = deliveredHumanGuidanceIds(state);
  return readManagedHumanMessages(contract).filter(
    (message) => !delivered.has(message.messageId),
  );
}

function deliveredHumanGuidanceIds(state: ManagedRunState): Set<string> {
  const runDir = managedRunDir(state.projectRoot, state.taskId, state.runId);
  if (!existsSync(runDir)) return new Set();
  const delivered = new Set<string>();
  for (const file of readdirSync(runDir)) {
    if (!/^executor-guidance-delivery-\d+\.json$/.test(file)) continue;
    try {
      const receipt = JSON.parse(
        readFileSync(path.join(runDir, file), "utf-8"),
      ) as { messageIds?: unknown };
      if (!Array.isArray(receipt.messageIds)) continue;
      for (const messageId of receipt.messageIds) {
        if (typeof messageId === "string") delivered.add(messageId);
      }
    } catch {
      // A malformed receipt is not proof of delivery and is therefore retried.
    }
  }
  return delivered;
}

function recordHumanGuidanceHandoffDelivery(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  handoffFile: string,
  sessionId: string,
): void {
  const machineFile = handoffFile.replace(/\.md$/, ".json");
  const handoff = JSON.parse(readFileSync(machineFile, "utf-8")) as {
    humanGuidance?: { deliveryMessageIds?: unknown };
  };
  const messageIds = handoff.humanGuidance?.deliveryMessageIds;
  if (!Array.isArray(messageIds) || messageIds.length === 0) return;
  const validIds = messageIds.filter(
    (messageId): messageId is string => typeof messageId === "string",
  );
  if (validIds.length === 0) return;
  const runDir = managedRunDir(state.projectRoot, state.taskId, state.runId);
  const receiptFile = path.join(
    runDir,
    `executor-guidance-delivery-${state.executorInvocations}.json`,
  );
  if (existsSync(receiptFile)) return;
  writeJsonAtomic(receiptFile, {
    protocolVersion: "superflow.guidance-receipt.v1",
    taskId: state.taskId,
    runId: state.runId,
    invocation: state.executorInvocations,
    handoffFile,
    sessionId,
    messageIds: validIds,
    deliveredAt: new Date().toISOString(),
  });
  appendManagedEvent(state, {
    eventType: "executor.guidance_handoff_delivered",
    actor: contract.executorAgent,
    role: "executor",
    summary: mt(
      contract,
      `Executor 已确认接收 ${validIds.length} 条运行中补充指导`,
      `Executor acknowledged ${validIds.length} in-flight guidance message(s)`,
    ),
    evidencePaths: [machineFile, receiptFile],
  });
}

function handoffFindingLines(
  findings: ReviewFinding[],
  language: "zh" | "en",
): string[] {
  if (findings.length === 0) return [language === "en" ? "none" : "无"];
  return findings.map((finding) =>
    language === "en"
      ? `- ${finding.id} ${finding.target}: ${finding.requiredFix}; checks: ${finding.acceptanceChecks.join("; ")}`
      : `- ${finding.id} ${finding.target}：${finding.requiredFix}；验收：${finding.acceptanceChecks.join("；")}`,
  );
}

function executorCompletionGap(
  contract: ManagedTaskContract,
  result: ExecutorResult,
): string | null {
  if (contract.source !== "sdd") return null;
  const decision = evaluateCompletion(contract, result);
  if (decision.localGaps.length > 0) {
    return mt(
      contract,
      `本地交付裁决未通过：${decision.localGaps.join("；")}`,
      `Local completion policy failed: ${decision.localGaps.join("; ")}`,
    );
  }
  const tasksFile = findOpenSpecTasksFile(contract);
  if (tasksFile) {
    const report = path.join(path.dirname(tasksFile), "test-report.md");
    if (!existsSync(report)) {
      return mt(
        contract,
        "SDD 任务缺少 test-report.md，研发 Agent 必须填写真实测试和运行证据",
        "The SDD task is missing test-report.md; the executor must record real test and runtime evidence",
      );
    }
  }
  return null;
}

function readOpenSpecTaskProgress(
  contract: ManagedTaskContract,
  result?: ExecutorResult | null,
): {
  total: number;
  completed: number;
  localPending: string[];
  externalPending: string[];
} {
  const tasks = readCompletionTasks(contract, result);
  if (tasks.length === 0) {
    return { total: 0, completed: 0, localPending: [], externalPending: [] };
  }
  const pending = tasks.filter((task) => !task.completed);
  return {
    total: tasks.length,
    completed: tasks.length - pending.length,
    localPending: pending
      .filter((task) => task.category === "local_required")
      .map((task) => `${task.taskId}: ${task.text}`),
    externalPending: pending
      .filter((task) => task.category !== "local_required")
      .map((task) => `${task.taskId}: ${task.text}`),
  };
}

export function isExternalPendingTask(line: string): boolean {
  return /\[(?:environment_required|release_required)\]/i.test(line);
}

function findOpenSpecTasksFile(contract: ManagedTaskContract): string | null {
  if (!contract.taskPrompt?.originalPath) return null;
  let current = path.dirname(path.resolve(contract.taskPrompt.originalPath));
  const projectRoot = path.resolve(contract.projectRoot);
  while (current.startsWith(projectRoot)) {
    const file = path.join(current, "tasks.md");
    if (existsSync(file)) return file;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function safeGitOutput(projectRoot: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function invocation(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  prompt: string,
  promptPath: string,
  schemaPath: string,
  sessionId: string | null,
  deliveryProtocolRecovery: boolean,
  onSession: (sessionId: string) => void,
  onProgress: (summary: string) => void,
): AgentInvocation {
  const freshMaxTurnRecovery =
    !sessionId && consecutiveMaxTurnFailures(state) > 0;
  const policyPath = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    "managed-executor-policy.md",
  );
  const contextManifest = ensureManagedContextManifest(contract);
  const ruleSelection = frozenRuleSelection(contract, contextManifest);
  const preflightScript = path.join(
    ASSETS_DIR,
    "scripts",
    "superflow-managed-executor-preflight.mjs",
  );
  const ownerTemplate = path.join(
    ASSETS_DIR,
    "scripts",
    "superflow-managed-owner-verification.sh",
  );
  const preflightCommand = [
    process.execPath,
    preflightScript,
    contract.projectRoot,
    state.taskId,
  ].join(" ");
  writeFileSync(
    policyPath,
    buildExecutorPolicy({
      ruleSelection,
      toolchainFacts: managedToolchainFacts(),
      ownerTemplate,
      preflightCommand,
      compatibilityContinuation: Boolean(sessionId),
      freshRecovery: freshMaxTurnRecovery,
      deliveryProtocolRecovery,
    }),
    "utf-8",
  );
  return {
    taskId: state.taskId,
    runId: state.runId,
    role: "executor",
    language: contract.language,
    agent: contract.executorAgent,
    model: contract.executorConfig?.model,
    reasoningEffort: contract.executorConfig?.reasoningEffort,
    projectRoot: state.projectRoot,
    writableRoots: contract.relatedProjectRoots,
    prompt,
    promptPath,
    schemaPath,
    systemPromptPath: policyPath,
    sessionId,
    timeout: {
      warningMs: contract.budgets.noProgressWarningMinutes * 60_000,
      stalledMs: contract.budgets.stalledTimeoutMinutes * 60_000,
      hardMs: contract.budgets.maxSingleInvocationHours * 3_600_000,
    },
    onSession,
    onProgress,
    onTelemetry: (telemetry) => {
      if (!acceptsExecutorCallback(state)) return;
      state.runtimeTelemetry = telemetry;
      saveManagedRun(state);
    },
    onProcess: (pid) => {
      if (!acceptsExecutorCallback(state)) return;
      state.runningAgentPid = pid;
      saveManagedRun(state);
    },
  };
}

function managedToolchainFacts(): string[] {
  const facts = [
    [
      "java",
      process.env.JAVA_HOME
        ? path.join(process.env.JAVA_HOME, "bin", "java")
        : executablePath("java"),
    ],
    ["maven", executablePath("mvn")],
    ["node", executablePath("node")],
    ["npm", executablePath("npm")],
  ]
    .filter((item): item is [string, string] => Boolean(item[1]))
    .map(([name, executable]) => `- ${name}: ${executable}`);
  if (facts.length === 0) return [];
  return [
    "Superflow preflight found these executable paths. Use them directly instead of spending turns searching for the toolchain:",
    ...facts,
  ];
}

function frozenRuleSelection(
  contract: ManagedTaskContract,
  manifest: ReturnType<typeof ensureManagedContextManifest>,
): ReturnType<typeof selectManagedRuleFiles> {
  const selected = selectManagedRuleFiles(contract);
  const frozenRules = new Set(
    manifest.entries
      .filter((entry) => entry.role === "rule")
      .map((entry) => path.resolve(entry.path)),
  );
  return {
    scenarios: selected.scenarios,
    files: selected.files.filter((file) => frozenRules.has(path.resolve(file))),
  };
}

function executablePath(command: string): string {
  try {
    return execFileSync("which", [command], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function executorOutputTokenUnits(state: ManagedRunState): number | null {
  return state.executorUsage?.outputTokens ?? null;
}

function mergeAgentUsage(
  current: ManagedRunState["executorUsage"],
  next: AgentInvocationResult<unknown>["usage"],
): ManagedRunState["executorUsage"] {
  if (!next) return current;
  return {
    inputTokens: sumNullable(current?.inputTokens, next.inputTokens),
    outputTokens: sumNullable(current?.outputTokens, next.outputTokens),
    cacheReadTokens: sumNullable(
      current?.cacheReadTokens,
      next.cacheReadTokens,
    ),
    cacheWriteTokens: sumNullable(
      current?.cacheWriteTokens,
      next.cacheWriteTokens,
    ),
    costUsd: sumNullable(current?.costUsd, next.costUsd),
  };
}

function sumNullable(
  left: number | null | undefined,
  right: number | null | undefined,
): number | null {
  if (left == null) return right ?? null;
  if (right == null) return null;
  return left + right;
}

async function invokeWithFailureEvidence<T>(
  state: ManagedRunState,
  invoker: AgentInvoker,
  agentInvocation: AgentInvocation,
  prefix: string,
): Promise<AgentInvocationResult<T>> {
  try {
    return await invoker.invoke<T>(agentInvocation);
  } catch (error) {
    const raw = error as Error & { stdout?: unknown; stderr?: unknown };
    const stdout = typeof raw.stdout === "string" ? raw.stdout : "";
    const stderr = typeof raw.stderr === "string" ? raw.stderr : "";
    const logs =
      stdout || stderr
        ? writeInvocationLogs(state, prefix, stdout, stderr)
        : [];
    appendManagedEvent(state, {
      eventType: "executor.invocation_failed",
      actor: agentInvocation.agent,
      role: "executor",
      summary: raw.message,
      evidencePaths: logs,
    });
    throw error;
  }
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
    blocker: status === "running" ? null : state.blocker,
    failure: status === "running" ? null : (state.failure ?? null),
    servicePid: process.pid,
    updatedAt: new Date().toISOString(),
  };
  contract.status = status;
  saveManagedRun(state);
  saveManagedTask(contract);
  updateRegistry(contract, state, env);
  return state;
}

function pauseAtSafeBoundary(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  env: NodeJS.ProcessEnv,
): ManagedRunState {
  const signal = readManagedControlSignal(contract);
  if (!signal?.pauseRequested) return state;
  clearManagedControlSignal(contract);
  state.blocker = signal.reason;
  state.activeSince = null;
  state = transition(contract, state, "paused", "paused_by_user", env);
  appendManagedEvent(state, {
    eventType: "human.pause_applied",
    actor: signal.actor,
    role: "system",
    summary: mt(
      contract,
      `已在安全边界暂停：${signal.reason}`,
      `Paused at a safe boundary: ${signal.reason}`,
    ),
  });
  return state;
}

function finishDeliveryReady(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  summary: string,
  env: NodeJS.ProcessEnv,
): ManagedRunState {
  const executorResult = state.lastExecutorResult
    ? (JSON.parse(
        readFileSync(state.lastExecutorResult, "utf-8"),
      ) as ExecutorResult)
    : null;
  const decision = evaluateCompletion(
    contract,
    completionResultWithHistory(state, executorResult),
  );
  if (!decision.localReady) {
    return finishBlocked(contract, state, decision.localGaps.join("；"), env);
  }
  state.deliveryProgress = decision.progress;
  const status = !decision.environmentReady
    ? "environment_validation_blocked"
    : !decision.releaseReady
      ? "local_delivery_ready"
      : "release_ready";
  state.workspaceFingerprint = computeWorkspaceFingerprintForRoots([
    contract.projectRoot,
    ...contract.relatedProjectRoots,
  ]);
  runManagedDeliveryCheck(state, true);
  state = transition(contract, state, status, status, env);
  state.completedAt = new Date().toISOString();
  saveManagedRun(state);
  appendTaskReport(
    state,
    mt(
      contract,
      `\n## 最终结论\n\n${summary}\n\n状态：${status}。\n`,
      `\n## Final conclusion\n\n${summary}\n\nStatus: ${status}.\n`,
    ),
  );
  resolveTaskReportBlockers(state);
  updateTaskReportStatus(state, status);
  appendManagedEvent(state, {
    eventType: "run.delivery_ready",
    actor: "managed-runner",
    role: "runner",
    summary: mt(
      contract,
      `任务已通过本地检查，进入 ${status}`,
      `Task passed local review and entered ${status}`,
    ),
  });
  if (
    notifyManagedTask(
      {
        taskId: state.taskId,
        type: "delivery_ready",
        title: mt(contract, "Superflow 任务已完成", "Superflow task completed"),
        message: mt(
          contract,
          `${state.taskId} 已通过本地检查并进入 ${status}；Git、环境和发布动作仍需用户批准`,
          `${state.taskId} passed local review and entered ${status}; Git, environment, and release actions still require user approval`,
        ),
      },
      env,
    )
  ) {
    appendManagedEvent(state, {
      eventType: "host.delivery_ready_notified",
      actor: "managed-runner",
      role: "runner",
      summary: mt(
        contract,
        "已发送可交付通知",
        "Recorded delivery-ready notification",
      ),
    });
  }
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
  if (
    notifyManagedTask(
      {
        taskId: state.taskId,
        type: "human_required",
        title: mt(
          contract,
          "Superflow 任务需要处理",
          "Superflow task needs attention",
        ),
        message: `${state.taskId}: ${blocker}`,
      },
      env,
    )
  ) {
    appendManagedEvent(state, {
      eventType: "host.attention_notified",
      actor: "managed-runner",
      role: "runner",
      summary: mt(
        contract,
        "已发送人工处理通知",
        "Recorded attention notification",
      ),
    });
  }
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
  if (!hasUnlimitedAgentBudget(contract)) {
    const usage = state.executorUsage;
    const outputTokens = executorOutputTokenUnits(state);
    if (
      contract.budgets.maxExecutorTokenUnits !== undefined &&
      outputTokens !== null &&
      outputTokens >= contract.budgets.maxExecutorTokenUnits
    ) {
      return finishBudgetExhausted(
        contract,
        state,
        mt(
          contract,
          `研发 Agent 输出 Token 熔断：累计 ${outputTokens}，上限 ${contract.budgets.maxExecutorTokenUnits}`,
          `Executor output-token circuit opened at ${outputTokens}; limit ${contract.budgets.maxExecutorTokenUnits}`,
        ),
        env,
      );
    }
    if (
      contract.budgets.maxExecutorCostUsd !== undefined &&
      usage?.costUsd !== null &&
      usage?.costUsd !== undefined &&
      usage.costUsd >= contract.budgets.maxExecutorCostUsd
    ) {
      return finishBudgetExhausted(
        contract,
        state,
        mt(
          contract,
          `研发 Agent 成本熔断：累计 $${usage?.costUsd?.toFixed(2)}，上限 $${contract.budgets.maxExecutorCostUsd.toFixed(2)}`,
          `Executor cost circuit opened at $${usage?.costUsd?.toFixed(2)}; limit $${contract.budgets.maxExecutorCostUsd.toFixed(2)}`,
        ),
        env,
      );
    }
  }
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

function hasUnlimitedAgentBudget(contract: ManagedTaskContract): boolean {
  return contract.budgets.unlimitedAgentInvocations === true;
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
  state: ManagedRunState,
  result: ExecutorResult,
  options: { hostApproved?: boolean } = {},
): void {
  if (!["ready_for_review", "blocked", "failed"].includes(result.status)) {
    throw new Error(
      mt(
        contract,
        "执行 Agent 返回了非法状态",
        "Executor Agent returned an invalid status",
      ),
    );
  }
  if (
    !Array.isArray(result.changedFiles) ||
    !Array.isArray(result.commands) ||
    !Array.isArray(result.evidence) ||
    !Array.isArray(result.releasePrerequisites) ||
    !Array.isArray(result.blockers)
  ) {
    throw new Error(
      mt(
        contract,
        "执行 Agent 结果缺少文件、命令、证据、发布前置条件或阻塞列表",
        "Executor Agent result is missing files, commands, evidence, release prerequisites, or blockers",
      ),
    );
  }
  if (!result.summary.trim()) {
    throw new Error(
      mt(
        contract,
        "执行 Agent 结果缺少摘要",
        "Executor Agent result is missing a summary",
      ),
    );
  }
  if (result.status !== "ready_for_review") {
    if (result.blockers.length === 0) {
      throw new Error(
        mt(
          contract,
          "执行 Agent 声明阻塞或失败，但没有提供阻塞原因",
          "Executor Agent reported blocked or failed without a blocker",
        ),
      );
    }
    return;
  }
  if (result.blockers.length > 0) {
    throw new Error(
      mt(
        contract,
        "执行 Agent 声明可检查，但仍存在阻塞项",
        "Executor Agent reported ready for review while blockers remain",
      ),
    );
  }
  const blockingCommands = result.commands.filter(isBlockingCommandFailure);
  if (
    blockingCommands.length > 0 &&
    blockingCommands.every((command) => command.assertion === "negative")
  ) {
    throw new Error(
      mt(
        contract,
        "负向命令证据不符合检查型断言协议，需要 Host 判断原始失败是否为预期行为",
        "Negative command evidence violates the inspection-only assertion protocol and requires Host judgment of whether the raw failure was expected",
      ),
    );
  }
  if (blockingCommands.length > 0) {
    throw new Error(
      mt(
        contract,
        "执行 Agent 声明可检查，但命令证据中仍有失败项",
        "Executor Agent reported ready for review while command evidence still contains failures",
      ),
    );
  }
  if (contract.profile === "engineering" || contract.profile === "sdd") {
    validateDeclaredChangedFiles(contract, state, result, options);
    validateEngineeringEvidence(result, contract, state);
    // Risk-based evidence sufficiency is intentionally semantic: after the
    // external Host has inspected the raw evidence and returned pass, the
    // Runner must not overrule that decision with command-text heuristics.
    // Schema, changed files, command outcomes, and engineering categories
    // remain deterministic gates above.
    if (!options.hostApproved) validateRiskBasedEvidence(contract, result);
  }
}

function normalizeExecutorResult(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  result: ExecutorResult,
): ExecutorResult {
  if (!result || typeof result !== "object") return result;
  result.protocolVersion = "superflow.executor.v2";
  result.messageType = "executor_delivery";
  const machineChangedFiles = changedWorkspaceFilesSinceBaseline(
    contract,
    state,
  ).map(({ root, relative }) =>
    path.resolve(root) === path.resolve(contract.projectRoot)
      ? relative.replaceAll("\\", "/")
      : path.join(root, relative).replaceAll("\\", "/"),
  );
  result.changedFiles = uniqueStrings([
    ...(Array.isArray(result.changedFiles) ? result.changedFiles : []),
    ...machineChangedFiles,
  ]);
  result.blockers = normalizedStrings(result.blockers);
  result.releasePrerequisites = normalizedStrings(result.releasePrerequisites);
  result.evidence = normalizedStrings(result.evidence);
  if (Array.isArray(result.commands)) {
    const currentCommands = result.commands.map((command) => ({
      ...command,
      categories: uniqueCategories([
        ...(command.categories ?? []),
        ...verificationCategories(command.command, command.result),
      ]),
    }));
    result.commands = uniqueCommands([
      ...historicalEngineeringCommands(state, true).filter(
        (command) =>
          !isBlockingCommandFailure(command) &&
          isCommandOutcomeConsistent(command),
      ),
      ...currentCommands,
    ]);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizedStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return uniqueStrings(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim()),
  );
}

function uniqueCategories(
  values: NonNullable<ExecutorResult["commands"][number]["categories"]>,
): NonNullable<ExecutorResult["commands"][number]["categories"]> {
  return [...new Set(values)];
}

function uniqueCommands(
  commands: ExecutorResult["commands"],
): ExecutorResult["commands"] {
  const seen = new Set<string>();
  return commands.filter((command) => {
    const key = JSON.stringify([
      command.command,
      command.exitCode,
      command.result,
      command.assertion ?? "positive",
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isBlockingCommandFailure(
  command: ExecutorResult["commands"][number],
): boolean {
  if (isAcceptedEvidenceCommand(command)) return false;
  if (isExpectedStartupShutdown(command)) return false;
  return true;
}

function isExpectedStartupShutdown(
  command: ExecutorResult["commands"][number],
): boolean {
  if (command.exitCode !== 143 || !command.categories?.includes("startup")) {
    return false;
  }
  return (
    /(?:started|undertow.*port|application.*started)/i.test(command.result) &&
    /(?:sigterm|exit(?:\s*code)?\s*=?\s*143|退出码\s*=?\s*143)/i.test(
      command.result,
    )
  );
}

function validateWorkspaceSecrets(
  contract: ManagedTaskContract,
  state: ManagedRunState,
): void {
  const leaked = changedWorkspaceFilesSinceBaseline(contract, state)
    .map(({ root, relative }) => ({
      relative,
      absolute: path.join(root, relative),
    }))
    .filter(({ absolute }) => existsSync(absolute))
    .filter(({ absolute }) => {
      try {
        const content = readFileSync(absolute, "utf-8");
        return containsPlaintextCredential(content);
      } catch {
        return false;
      }
    })
    .map(({ relative }) => relative.replaceAll("\\", "/"));
  if (leaked.length === 0) return;
  throw new Error(
    mt(
      contract,
      `工作区存在疑似明文凭据：${leaked.slice(0, 10).join("、")}`,
      `Workspace contains suspected plaintext credentials: ${leaked
        .slice(0, 10)
        .join(", ")}`,
    ),
  );
}

export function containsPlaintextCredential(value: string): boolean {
  const literal =
    /\b(?:[a-z0-9]+_)*(?:password|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*["']([^"']+)["']/gi;
  for (const match of value.matchAll(literal)) {
    if (isPlaintextSecretValue(match[1])) return true;
  }
  const mysqlPassword =
    /(?:\s-p(?:'([^']*)'|"([^"]*)"|([^\s'"-][^\s]*))|--password=(?:'([^']*)'|"([^"]*)"|([^\s]+)))/g;
  for (const match of value.matchAll(mysqlPassword)) {
    const secret = match.slice(1).find((item) => item !== undefined) ?? "";
    if (isPlaintextSecretValue(secret)) {
      return true;
    }
  }
  return /authorization\s*[:=]\s*bearer\s+(?!<redacted>)[^\s"']+/i.test(value);
}

function isPlaintextSecretValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length >= 6 &&
    !normalized.includes("<redacted>") &&
    !isDocumentationSecretPlaceholder(normalized) &&
    !normalized.startsWith("$") &&
    !isNonceDerivedTemporarySecret(normalized)
  );
}

function isDocumentationSecretPlaceholder(value: string): boolean {
  return /^<(?:pass(?:word)?|secret|api[_-]?key|access[_-]?token|auth[_-]?token)>$/i.test(
    value,
  );
}

function isNonceDerivedTemporarySecret(value: string): boolean {
  return /^[a-z0-9_-]*\$(?:\{[a-z0-9_]*nonce\}|[a-z0-9_]*nonce)$/.test(value);
}

function validateDeclaredChangedFiles(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  result: ExecutorResult,
  options: { hostApproved?: boolean } = {},
): void {
  // Host approval judges the Executor's delivery at the Host-review snapshot.
  // The Host may create later acceptance reports while independently verifying
  // the delivery; those reports are not omitted Executor changes. Normal
  // Executor intake still compares the live workspace against its baseline.
  const reviewedSnapshot =
    options.hostApproved && state.lastReviewedWorkspaceFiles
      ? state.lastReviewedWorkspaceFiles
      : undefined;
  const changed = changedWorkspaceFilesSinceBaseline(
    contract,
    state,
    reviewedSnapshot,
  ).map(({ key }) => key);
  const declared = result.changedFiles.map((file) =>
    file.replaceAll("\\", "/"),
  );
  const missing = changed.filter((key) => {
    const [root, relative] = key.split("::");
    const absolute = path.join(root, relative).replaceAll("\\", "/");
    return (
      !declared.includes(relative.replaceAll("\\", "/")) &&
      !declared.includes(absolute)
    );
  });
  if (missing.length > 0) {
    throw new Error(
      mt(
        contract,
        `执行结果漏报真实工作区变更：${missing.join("、")}`,
        `Executor result omitted real workspace changes: ${missing.join(", ")}`,
      ),
    );
  }
}

function changedWorkspaceFilesSinceBaseline(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  snapshot?: Record<string, string>,
): Array<{ key: string; root: string; relative: string }> {
  const current =
    snapshot ??
    snapshotChangedWorkspaceFiles([
      contract.projectRoot,
      ...contract.relatedProjectRoots,
    ]);
  const baseline = state.baselineWorkspaceFiles ?? {};
  return Object.entries(current)
    .filter(([key, hash]) => baseline[key] !== hash)
    .map(([key]) => {
      const separator = key.indexOf("::");
      return {
        key,
        root: key.slice(0, separator),
        relative: key.slice(separator + 2),
      };
    });
}

function validateEngineeringEvidence(
  result: ExecutorResult,
  contract: ManagedTaskContract,
  state: ManagedRunState,
): void {
  const commands = result.commands;
  const allCommands = [...historicalEngineeringCommands(state), ...commands];
  const successful = allCommands.filter(
    (command) => command.exitCode === 0 || isExpectedStartupShutdown(command),
  );
  const categories = new Set(
    successful.flatMap(
      (command) =>
        command.categories ??
        verificationCategories(command.command, command.result),
    ),
  );
  const requiredCategories = requiredVerificationCategories(
    contract.projectRoot,
  );
  if (categories.size < requiredCategories) {
    throw new Error(
      mt(
        contract,
        "工程任务至少需要两类成功验证证据（构建、测试、启动或真实调用），只编译或只跑单测不能交付",
        "Engineering tasks require at least two successful evidence categories (build, tests, startup, or real calls); compilation-only or unit-test-only evidence cannot be delivered",
      ),
    );
  }
  if (isSpringBootProject(contract.projectRoot)) {
    const missing = [
      !categories.has("startup") ? "startup" : null,
      !categories.has("invocation") ? "invocation" : null,
    ].filter((value): value is VerificationCategory => value !== null);
    if (missing.length > 0) {
      const labels = missing.map((category) =>
        category === "startup"
          ? mt(contract, "启动应用", "application startup")
          : mt(contract, "真实 HTTP 调用", "real HTTP invocation"),
      );
      const message = mt(
        contract,
        `Spring Boot 工程交付前必须完成启动应用和真实 HTTP 调用，当前缺少：${labels.join("、")}`,
        `Spring Boot delivery requires application startup and a real HTTP invocation; missing: ${labels.join(", ")}`,
      );
      if (
        missing.length === 1 &&
        missing[0] === "invocation" &&
        categories.has("startup") &&
        categories.has("runtime") &&
        result.evidence.length > 0
      ) {
        throw new VerificationMetadataAmbiguityError(message);
      }
      throw new Error(message);
    }
  }
}

class VerificationMetadataAmbiguityError extends Error {}

function historicalEngineeringCommands(
  state: ManagedRunState,
  includeInvalid = false,
): ExecutorResult["commands"] {
  const runDir = managedRunDir(state.projectRoot, state.taskId, state.runId);
  if (!existsSync(runDir)) return [];
  const resultPattern = includeInvalid
    ? /^executor-result-\d+(?:-invalid)?\.json$/
    : /^executor-result-\d+\.json$/;
  return readdirSync(runDir)
    .filter((name) => resultPattern.test(name))
    .flatMap((name) => {
      try {
        const result = JSON.parse(
          readFileSync(path.join(runDir, name), "utf-8"),
        ) as ExecutorResult;
        return Array.isArray(result.commands) ? result.commands : [];
      } catch {
        return [];
      }
    });
}

function completionResultWithHistory(
  state: ManagedRunState,
  current: ExecutorResult | null,
): ExecutorResult | null {
  if (!current) return null;
  const runDir = managedRunDir(state.projectRoot, state.taskId, state.runId);
  const history = existsSync(runDir)
    ? readdirSync(runDir)
        .filter((name) => /^executor-result-\d+(?:-invalid)?\.json$/.test(name))
        .flatMap((name) => {
          try {
            return [
              JSON.parse(
                readFileSync(path.join(runDir, name), "utf-8"),
              ) as ExecutorResult,
            ];
          } catch {
            return [];
          }
        })
    : [];
  const results = [...history, current];
  const commands = uniqueCommands(
    results
      .flatMap((result) => result.commands)
      .filter(
        (command) =>
          !isBlockingCommandFailure(command) &&
          isCommandOutcomeConsistent(command),
      ),
  );
  return {
    ...current,
    changedFiles: [
      ...new Set(results.flatMap((result) => result.changedFiles)),
    ],
    commands,
    evidence: [...new Set(results.flatMap((result) => result.evidence))],
  };
}

function requiredVerificationCategories(projectRoot: string): number {
  const packageFile = path.join(projectRoot, "package.json");
  if (!existsSync(packageFile)) return 2;
  try {
    const packageJson = JSON.parse(readFileSync(packageFile, "utf-8")) as {
      scripts?: Record<string, unknown>;
    };
    const scripts = packageJson.scripts ?? {};
    const hasTest = typeof scripts.test === "string";
    const hasRunnableTarget = ["build", "start", "dev", "serve"].some(
      (name) => typeof scripts[name] === "string",
    );
    return hasTest && !hasRunnableTarget ? 1 : 2;
  } catch {
    return 2;
  }
}

function isSpringBootProject(projectRoot: string): boolean {
  const pom = path.join(projectRoot, "pom.xml");
  return existsSync(pom) && /spring-boot/i.test(readFileSync(pom, "utf-8"));
}

function queueExecutorSelfRepair(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  message: string,
  evidencePath: string,
): ManagedRunState {
  const rejectionKey = executorRejectionKey(message);
  const rejectionCounts = state.executorRejectionCounts ?? {};
  const repeated = (rejectionCounts[rejectionKey] ?? 0) >= 1;
  const repairCount = state.executorSelfRepairCount ?? 0;
  const permissionBlocked =
    (state.runtimeTelemetry?.permissionDenials ?? 0) >= 3;
  const semanticHostJudgment =
    /疑似明文凭据|suspected plaintext credentials/i.test(message);
  const structuredMetadataFailure =
    /JSON|Expected ',' or '}'|structured (?:output|metadata)|结构化.{0,12}(?:格式|解析)/i.test(
      message,
    );
  const protocolEvidenceFailure =
    /负向命令证据不符合检查型断言协议|Negative command evidence violates the inspection-only assertion protocol/i.test(
      message,
    );
  state.executorRejectionCounts = {
    ...rejectionCounts,
    [rejectionKey]: (rejectionCounts[rejectionKey] ?? 0) + 1,
  };
  if (
    semanticHostJudgment ||
    structuredMetadataFailure ||
    protocolEvidenceFailure ||
    permissionBlocked ||
    repeated ||
    repairCount >= 2
  ) {
    const stopReason = semanticHostJudgment
      ? mt(
          contract,
          "（需要语义判断）",
          " because semantic judgment is required",
        )
      : structuredMetadataFailure
        ? mt(
            contract,
            "（结构化元数据不得触发完整研发重跑）",
            " because structured metadata must not trigger a full engineering rerun",
          )
        : protocolEvidenceFailure
          ? mt(
              contract,
              "（预期失败证据需要 Host 语义判断，不得触发完整研发重跑）",
              " because expected-failure evidence requires Host semantic judgment and must not trigger a full engineering rerun",
            )
          : repeated
            ? mt(
                contract,
                "（同类机械退回已达上限）",
                " after the same rejection repeated",
              )
            : permissionBlocked
              ? mt(
                  contract,
                  "（本轮权限拒绝过多）",
                  " after repeated permission denials",
                )
              : mt(
                  contract,
                  "（自动整改已达上限）",
                  " after automatic repairs were exhausted",
                );
    state.lastExecutorResult = evidencePath;
    state.lastReviewResult = null;
    state.currentStep = "executor_rejection_escalated";
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "executor.rejection_escalated_to_host",
      actor: "managed-runner",
      role: "runner",
      summary: semanticHostJudgment
        ? mt(
            contract,
            `脚本不裁决疑似语义问题${stopReason}，转交 Host 判断：${message}`,
            `The script does not decide ambiguous semantic issues${stopReason}; escalated to the host: ${message}`,
          )
        : structuredMetadataFailure
          ? mt(
              contract,
              `结构化元数据无法由 Runner 本地恢复${stopReason}，转交 Host 判断：${message}`,
              `The runner could not recover structured metadata locally${stopReason}; escalated to the host: ${message}`,
            )
          : protocolEvidenceFailure
            ? mt(
                contract,
                `负向命令协议违规已止损${stopReason}，转交 Host 核对原始日志：${message}`,
                `The negative-command protocol violation was stopped${stopReason} and escalated to the Host for raw-log review: ${message}`,
              )
            : mt(
                contract,
                `自动整改已止损${stopReason}，转交 Host 判断：${message}`,
                `Automatic repair stopped${stopReason} and escalated to the host: ${message}`,
              ),
      evidencePaths: [evidencePath],
    });
    return state;
  }
  const result: ReviewResult = {
    result: "needs_fix",
    summary: message,
    findings: [
      {
        id: `AUTO-EXECUTOR-${state.executorInvocations}`,
        severity: "high",
        blocking: true,
        category: "delivery_gate",
        target: "完整研发交付与验证证据",
        evidence: message,
        risk: mt(
          contract,
          "研发 Agent 过早返回会增加评审轮次并留下未完成任务",
          "An early executor return increases review rounds and leaves work incomplete",
        ),
        requiredFix: mt(
          contract,
          "继续完成全部本地任务、验证和测试报告后再返回 ready_for_review",
          "Continue all local work, verification, and test reporting before returning ready_for_review",
        ),
        acceptanceChecks: [message],
      },
    ],
  };
  const file = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    `executor-self-repair-${state.executorInvocations}.json`,
  );
  writeJsonAtomic(file, result);
  state.lastReviewResult = file;
  state.lastExecutorResult = null;
  state.executorSelfRepairCount = repairCount + 1;
  state.currentStep = "executor_self_repair_required";
  saveManagedRun(state);
  appendManagedEvent(state, {
    eventType: "executor.self_repair_queued",
    actor: contract.executorAgent,
    role: "executor",
    summary: message,
    evidencePaths: [evidencePath, file],
  });
  return state;
}

function executorRejectionKey(message: string): string {
  if (/漏报真实工作区变更|omitted real workspace changes/i.test(message)) {
    return "changed_files";
  }
  if (/结构化证据|taskEvidence|completion policy/i.test(message)) {
    return "task_evidence";
  }
  if (/至少需要两类|evidence categories|启动应用|real HTTP/i.test(message)) {
    return "verification_categories";
  }
  if (/命令证据中仍有失败|command evidence.*fail/i.test(message)) {
    return "command_failure";
  }
  if (/写入工具调用|write tool use/i.test(message)) return "write_telemetry";
  return message.replace(/\d+/g, "#").slice(0, 160);
}

export function validateReviewResult(
  result: ReviewResult,
  language: ManagedTaskContract["language"] = "zh",
): void {
  if (!["pass", "needs_fix", "blocked"].includes(result.result)) {
    throw new Error(
      managedText(
        language,
        "监督 Agent 返回了非法状态",
        "Supervisor Agent returned an invalid status",
      ),
    );
  }
  if (!Array.isArray(result.findings))
    throw new Error(
      managedText(
        language,
        "监督 Agent 结果缺少 findings",
        "Supervisor Agent result is missing findings",
      ),
    );
  if (
    result.result === "pass" &&
    result.findings.some((finding) => finding.blocking)
  ) {
    throw new Error(
      managedText(
        language,
        "监督结果声明通过，但仍存在阻断 finding",
        "Supervisor result reported pass while blocking findings remain",
      ),
    );
  }
  if (
    result.result === "needs_fix" &&
    !result.findings.some((finding) => finding.blocking)
  ) {
    throw new Error(
      managedText(
        language,
        "监督结果要求整改，但没有提供阻断 finding",
        "Supervisor result requested fixes without a blocking finding",
      ),
    );
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
      `Release prerequisites: ${result.releasePrerequisites.join("; ") || "none"}`,
      `Blockers: ${result.blockers.join("; ") || "none"}`,
      `Source progress: ${formatProgress(state.deliveryProgress?.source)}`,
      `Environment progress: ${formatProgress(state.deliveryProgress?.environment)}`,
      `Release progress: ${formatProgress(state.deliveryProgress?.release)}`,
    ].join("\n");
  }
  return [
    `## 执行调用 ${state.executorInvocations}`,
    "",
    `状态：${result.status}`,
    `摘要：${result.summary}`,
    `修改文件：${result.changedFiles.join("、") || "无"}`,
    `发布前置条件：${result.releasePrerequisites.join("；") || "无"}`,
    `阻塞：${result.blockers.join("；") || "无"}`,
    `源码任务进度：${formatProgress(state.deliveryProgress?.source)}`,
    `环境验收进度：${formatProgress(state.deliveryProgress?.environment)}`,
    `发布签收进度：${formatProgress(state.deliveryProgress?.release)}`,
  ].join("\n");
}

function formatProgress(
  progress: { completed: number; total: number } | undefined,
): string {
  return `${progress?.completed ?? 0}/${progress?.total ?? 0}`;
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
  return /(network|socket|unable to connect|connection (?:refused|reset|closed)|server_error|timed?\s*out|rate.?limit|overloaded|busy|\b(?:429|503|529)\b|\bECONN[A-Z]*\b|网络|无法连接|连接被拒绝|限流|繁忙)/i.test(
    message,
  );
}

export function isPermanentProviderFailure(message: string): boolean {
  return /(token plan|用量上限|套餐|quota.?exhaust|insufficient.?quota|error.?code\s*2056|\b2056\b|billing|payment required)/i.test(
    message,
  );
}

function recordExecutorConnectivityFailure(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  message: string,
): {
  invocation: number;
  stopAt: number | null;
  consecutiveFailures: number;
  credited: boolean;
} | null {
  if (!state.currentStep.startsWith("executor_")) return null;
  const credited = isCreditableTransientProviderFailure(message);
  if (credited) {
    state.executorInvocationCredits =
      (state.executorInvocationCredits ?? 0) + 1;
    state.totalAgentInvocationCredits =
      (state.totalAgentInvocationCredits ?? 0) + 1;
  }
  state.consecutiveTransientProviderFailures =
    (state.consecutiveTransientProviderFailures ?? 0) + 1;
  state.connectivityRetryCount = (state.connectivityRetryCount ?? 0) + 1;
  let stopAt: number | null = null;
  if (credited && contract.budgets.executorPhysicalStopAt !== undefined) {
    stopAt = contract.budgets.executorPhysicalStopAt + 1;
    contract.budgets = {
      ...contract.budgets,
      executorPhysicalStopAt: stopAt,
    };
    contract.contractHash = calculateManagedContractHash(contract);
    state.contractHash = contract.contractHash;
    saveManagedTask(contract);
  }
  saveManagedRun(state);
  return {
    invocation: state.executorInvocations,
    stopAt,
    consecutiveFailures: state.consecutiveTransientProviderFailures,
    credited,
  };
}

function isCreditableTransientProviderFailure(message: string): boolean {
  if (
    /(token plan|用量上限|套餐|quota.?exhaust|insufficient.?quota|error.?code\s*2056|\b2056\b)/i.test(
      message,
    )
  ) {
    return false;
  }
  return /(\b429\b|\b529\b|rate.?limit|overloaded|访问量过大|暂时.*限流|temporar(?:y|ily).*(?:busy|unavailable)|connection (?:refused|reset|closed)|unable to connect|socket hang up|\bECONN[A-Z]*\b|连接(?:被拒绝|重置|关闭)|无法连接)/i.test(
    message,
  );
}

async function acquireProjectLocks(
  contract: ManagedTaskContract,
  binding: ReturnType<typeof ensureManagedWorkspaceBinding>,
) {
  const acquired = [];
  try {
    for (const root of [
      contract.projectRoot,
      ...contract.relatedProjectRoots,
    ].sort()) {
      acquired.push(
        await acquireManagedProjectClaim(
          path.join(root, ".superflow", "managed-project.lock"),
          {
            taskId: contract.taskId,
            projectRoot: root,
            bindingFingerprint: managedWorkspaceBindingFingerprint(binding),
            token: `${contract.taskId}:${randomUUID()}`,
            language: contract.language,
          },
        ),
      );
    }
    return acquired;
  } catch (error) {
    for (const lock of acquired.reverse()) lock.release();
    throw error;
  }
}

async function prepareManagedExecution(contract: ManagedTaskContract): Promise<{
  workspaceBinding: ReturnType<typeof ensureManagedWorkspaceBinding>;
  projectLocks: Awaited<ReturnType<typeof acquireProjectLocks>>;
}> {
  let projectLocks: Awaited<ReturnType<typeof acquireProjectLocks>> = [];
  let stage = "workspace_binding";
  try {
    const workspaceBinding = ensureManagedWorkspaceBinding(contract);
    stage = "project_claim";
    projectLocks = await acquireProjectLocks(contract, workspaceBinding);
    stage = "contract_validation";
    validateManagedTaskContract(contract);
    stage = "frozen_prompt_validation";
    validateManagedTaskPromptSnapshot(contract);
    stage = "context_manifest";
    ensureManagedContextManifest(contract);
    return { workspaceBinding, projectLocks };
  } catch (error) {
    for (const projectLock of projectLocks.reverse()) projectLock.release();
    if (error instanceof ManagedWorkspaceClaimError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ManagedEnvironmentPreparationError(message, stage);
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

class ExecutorFinalPreflightError extends Error {
  constructor(
    message: string,
    readonly evidencePaths: string[],
  ) {
    super(message);
  }
}

function runExecutorFinalPreflight(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  result: ExecutorResult,
): string[] {
  if (
    result.status !== "ready_for_review" ||
    safeGitOutput(contract.projectRoot, [
      "rev-parse",
      "--is-inside-work-tree",
    ]) !== "true"
  ) {
    return [];
  }
  const script = path.join(
    ASSETS_DIR,
    "scripts",
    "superflow-managed-executor-preflight.mjs",
  );
  const prefix = `executor-${state.executorInvocations}-final-preflight`;
  try {
    const stdout = execFileSync(
      process.execPath,
      [script, contract.projectRoot, state.taskId],
      {
        cwd: contract.projectRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return writeInvocationLogs(state, prefix, stdout, "");
  } catch (error) {
    const execution = error as {
      stdout?: string;
      stderr?: string;
      message: string;
    };
    const logs = writeInvocationLogs(
      state,
      prefix,
      execution.stdout ?? "",
      execution.stderr ?? "",
    );
    const detail = (execution.stderr ?? execution.message).trim();
    throw new ExecutorFinalPreflightError(
      mt(
        contract,
        `Runner 最终交付前门禁失败：${detail}`,
        `Runner final delivery preflight failed: ${detail}`,
      ),
      logs,
    );
  }
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
    files.push(
      ...writeManagedLogParts(
        runDir,
        `${prefix}-events`,
        "jsonl",
        redactManagedLog(stdout),
      ),
    );
  }
  if (stderr) {
    files.push(
      ...writeManagedLogParts(
        runDir,
        `${prefix}-stderr`,
        "log",
        redactManagedLog(stderr),
      ),
    );
  }
  return files;
}

function fileHash(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const MANAGED_LOG_PART_BYTES = 8 * 1024 * 1024;

export function writeManagedLogParts(
  directory: string,
  basename: string,
  extension: string,
  content: string,
): string[] {
  const bytes = Buffer.from(content, "utf-8");
  if (bytes.length <= MANAGED_LOG_PART_BYTES) {
    const file = path.join(directory, `${basename}.${extension}`);
    writeFileSync(file, bytes);
    return [file];
  }
  const files: string[] = [];
  for (let offset = 0, part = 1; offset < bytes.length; part += 1) {
    let end = Math.min(offset + MANAGED_LOG_PART_BYTES, bytes.length);
    if (end < bytes.length) {
      const newline = bytes.lastIndexOf(10, end);
      if (newline > offset) end = newline + 1;
    }
    const file = path.join(
      directory,
      `${basename}-part-${String(part).padStart(3, "0")}.${extension}`,
    );
    writeFileSync(file, bytes.subarray(offset, end));
    files.push(file);
    offset = end;
  }
  return files;
}

export { redactManagedLog, redactManagedValue } from "./redaction.js";

function mt(contract: ManagedTaskContract, zh: string, en: string): string {
  return managedText(contract.language, zh, en);
}
