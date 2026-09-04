import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyExecutorInvocationWindow,
  applyInfrastructureInvocationCredits,
  applyManagedBudgetIncrease,
  applyUnlimitedAgentBudget,
  canResumeManagedTask,
  confirmProviderSwitchForRecovery,
  hasAvailableInvocationBudget,
  hasAvailableReviewBudget,
  reopenAwaitingDelivery,
  recoverStaleRunningExecutor,
  shouldAttachRunningTask,
  replaceExecutorSessionForRecovery,
  resetExecutorSessionForRecovery,
  resolveManagedAgents,
  retryBlockedExecutorForRecovery,
  shouldReopenBlockedReview,
  shouldResumeBlockedExecutor,
  submitExternalHostReview,
} from "../../src/app/commands/pipeline.js";
import {
  calculateManagedContractHash,
  createManagedTaskContract,
} from "../../src/domains/managed-work/contract.js";
import { createManagedTaskFiles } from "../../src/domains/managed-work/storage.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import type { ManagedRunState } from "../../src/domains/managed-work/types.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("pipeline managed task recovery", () => {
  it("resolves current and peer from a Codex host environment", () => {
    expect(
      resolveManagedAgents(
        { supervisor: "current", executor: "peer" },
        { CODEX_THREAD_ID: "thread-1" },
      ),
    ).toEqual({ supervisorAgent: "codex", executorAgent: "claude" });
  });

  it("resolves current and peer from a Claude host environment", () => {
    expect(
      resolveManagedAgents(
        { supervisor: "current", executor: "peer" },
        { CLAUDECODE: "1" },
      ),
    ).toEqual({ supervisorAgent: "claude", executorAgent: "codex" });
  });

  it("requires an explicit host when the environment is ambiguous", () => {
    expect(() =>
      resolveManagedAgents({ supervisor: "current", executor: "peer" }, {}),
    ).toThrow("无法识别当前 Host Agent");
  });

  it("accepts a host review only for the frozen workspace", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "pipeline-host-review-"),
    );
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "修复代码",
      projectRoot: root,
    });
    const state = initManagedRunState(contract);
    state.status = "waiting_for_host_review";
    state.currentStep = "external_supervisor_review_required";
    state.reviewRound = 1;
    state.reviewInvocations = 1;
    state.totalAgentInvocations = 2;
    state.pendingExternalReview = {
      round: 1,
      promptPath: path.join(root, "host-review-1.md"),
      workspaceFingerprint: state.workspaceFingerprint,
      requestedAt: new Date().toISOString(),
    };
    createManagedTaskFiles(contract, state, {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    });
    const reviewRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "pipeline-host-review-result-"),
    );
    roots.push(reviewRoot);
    const reviewPath = path.join(reviewRoot, "review.json");
    fs.writeFileSync(
      reviewPath,
      JSON.stringify({ result: "pass", summary: "检查通过", findings: [] }),
    );

    const resultPath = submitExternalHostReview(
      contract,
      state,
      reviewPath,
      "zh",
      {
        ...process.env,
        SUPERFLOW_HOME: path.join(root, "home"),
      },
    );

    expect(resultPath).toContain("review-result-1.json");
    expect(state.status).toBe("queued");
    expect(state.currentStep).toBe("external_review_received");
    expect(state.pendingExternalReview).toBeNull();
    expect(state.lastReviewResult).toBe(resultPath);
    expect(contract.contractHash).toBe(calculateManagedContractHash(contract));
    const storedReview = JSON.parse(fs.readFileSync(resultPath, "utf-8")) as {
      protocolVersion: string;
      messageType: string;
    };
    expect(storedReview.protocolVersion).toBe("superflow.review.v2");
    expect(storedReview.messageType).toBe("host_review");
  });

  it("rejects a host review submission file inside a target project", () => {
    const fixture = createPendingHostReviewFixture();
    const inside = path.join(fixture.root, "host-review.json");
    fs.writeFileSync(
      inside,
      JSON.stringify({ result: "pass", summary: "检查通过", findings: [] }),
    );

    expect(() =>
      submitExternalHostReview(
        fixture.contract,
        fixture.state,
        inside,
        "zh",
        fixture.env,
      ),
    ).toThrow("项目目录之外");
  });

  it("keeps host review state unchanged when registry persistence fails", () => {
    const fixture = createPendingHostReviewFixture();
    const blockedHome = path.join(fixture.root, "blocked-home");
    fs.writeFileSync(blockedHome, "not a directory");

    expect(() =>
      submitExternalHostReview(
        fixture.contract,
        fixture.state,
        fixture.reviewPath,
        "zh",
        { ...process.env, SUPERFLOW_HOME: blockedHome },
      ),
    ).toThrow();

    const runFile = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      fixture.contract.taskId,
      "runs",
      fixture.state.runId,
      "run-state.json",
    );
    const taskFile = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      fixture.contract.taskId,
      "task.json",
    );
    const persistedRun = JSON.parse(fs.readFileSync(runFile, "utf-8")) as {
      status: string;
      currentStep: string;
      pendingExternalReview: unknown;
    };
    const persistedTask = JSON.parse(fs.readFileSync(taskFile, "utf-8")) as {
      status: string;
    };
    expect(persistedRun.status).toBe("waiting_for_host_review");
    expect(persistedRun.currentStep).toBe(
      "external_supervisor_review_required",
    );
    expect(persistedRun.pendingExternalReview).not.toBeNull();
    expect(persistedTask.status).toBe("queued");
    expect(
      fs.existsSync(
        path.join(path.dirname(runFile), "review-result-1.json"),
      ),
    ).toBe(false);
  });

  it("keeps an executor blocker for supervisor review", () => {
    const state = createState("blocked");

    expect(shouldResumeBlockedExecutor(state)).toBe(false);
  });

  it("retries the original executor after an explicit failure", () => {
    const state = createState("failed");

    expect(shouldResumeBlockedExecutor(state)).toBe(true);
  });

  it("reopens a blocked supervisor review after human recovery", () => {
    const state = createState("ready_for_review");
    const review = path.join(
      path.dirname(state.lastExecutorResult!),
      "review.json",
    );
    fs.writeFileSync(
      review,
      JSON.stringify({ result: "blocked", summary: "缺环境", findings: [] }),
    );
    state.lastReviewResult = review;

    expect(shouldReopenBlockedReview(state)).toBe(true);
  });

  it("keeps a review-ready executor result for supervisor review", () => {
    const state = createState("ready_for_review");

    expect(shouldResumeBlockedExecutor(state)).toBe(false);
  });

  it("replaces an incompatible executor session only during human recovery", () => {
    const state = createState("blocked");
    state.executorSession = {
      agent: "claude",
      sessionId: "284d9929-7a7f-4b1b-b0f6-3bde512d4c60",
      createdAt: "2026-07-21T00:00:00.000Z",
      lastResumedRound: 0,
      status: "active",
    };

    const previous = replaceExecutorSessionForRecovery(
      state,
      "326f078d-ede0-47e7-80a8-5ff993aa314c",
    );

    expect(previous).toBe("284d9929-7a7f-4b1b-b0f6-3bde512d4c60");
    expect(state.executorSession.sessionId).toBe(
      "326f078d-ede0-47e7-80a8-5ff993aa314c",
    );
  });

  it("rejects malformed replacement session ids", () => {
    const state = createState("blocked");

    expect(() => replaceExecutorSessionForRecovery(state, "latest")).toThrow(
      "完整 UUID",
    );
  });

  it("resets an unhealthy executor session during human recovery", () => {
    const state = createState("blocked");
    state.executorSession = {
      agent: "claude",
      sessionId: "326f078d-ede0-47e7-80a8-5ff993aa314c",
      createdAt: "2026-07-21T00:00:00.000Z",
      lastResumedRound: 17,
      status: "active",
    };
    state.consecutiveTransientProviderFailures = 3;

    const reset = resetExecutorSessionForRecovery(
      state,
      "旧会话上下文过大且结构化输出畸形",
    );

    expect(reset).toEqual({
      previousSessionId: "326f078d-ede0-47e7-80a8-5ff993aa314c",
      reason: "旧会话上下文过大且结构化输出畸形",
    });
    expect(state.executorSession.sessionId).toBeNull();
    expect(state.executorSession.createdAt).toBeNull();
    expect(state.executorSession.status).toBe("pending");
    expect(state.consecutiveTransientProviderFailures).toBe(0);
  });

  it("rejects resetting an executor session outside human recovery", () => {
    const state = createState("running");
    state.status = "running";
    state.executorSession = activeExecutorSession();

    expect(() =>
      resetExecutorSessionForRecovery(state, "旧会话异常"),
    ).toThrow("waiting_for_human");
  });

  it("recovers a stale running executor after a host restart", () => {
    const state = createState("running");
    state.status = "running";
    state.runningAgentPid = 34089;
    state.activeSince = "2026-08-01T23:56:25.810Z";

    expect(recoverStaleRunningExecutor(state, () => false)).toEqual({
      pid: 34089,
    });
    expect(state.status).toBe("waiting_for_human");
    expect(state.currentStep).toBe("stale_executor_recovery_required");
    expect(state.runningAgentPid).toBeNull();
    expect(state.activeSince).toBeNull();
  });

  it("does not recover a running executor while its process is alive", () => {
    const state = createState("running");
    state.status = "running";
    state.runningAgentPid = 34089;

    expect(recoverStaleRunningExecutor(state, () => true)).toBeNull();
    expect(state.status).toBe("running");
    expect(state.runningAgentPid).toBe(34089);
  });

  it("attaches to a healthy running task without changing its state", () => {
    const state = createState("running");
    state.status = "running";
    state.currentStep = "executor_implementing";
    state.runningAgentPid = 34089;
    state.activeSince = "2026-08-10T02:25:22.110Z";

    expect(shouldAttachRunningTask(state, () => true)).toBe(true);
    expect(state.status).toBe("running");
    expect(state.currentStep).toBe("executor_implementing");
    expect(state.runningAgentPid).toBe(34089);
    expect(state.activeSince).toBe("2026-08-10T02:25:22.110Z");
  });

  it("fails closed by attaching when a running PID has not been recorded yet", () => {
    const state = createState("running");
    state.status = "running";
    state.runningAgentPid = null;

    expect(shouldAttachRunningTask(state, () => false)).toBe(true);
    expect(state.status).toBe("running");
  });

  it("does not attach when the recorded running PID is confirmed dead", () => {
    const state = createState("running");
    state.status = "running";
    state.runningAgentPid = 34089;

    expect(shouldAttachRunningTask(state, () => false)).toBe(false);
    expect(state.status).toBe("running");
    expect(state.runningAgentPid).toBe(34089);
  });

  it("requires an audit reason when resetting an executor session", () => {
    const state = createState("blocked");
    state.executorSession = activeExecutorSession();

    expect(() =>
      resetExecutorSessionForRecovery(state, "   "),
    ).toThrow("审计原因");
  });

  it("resets provider failure state after an audited provider switch", () => {
    const state = createState("blocked");
    state.currentStep = "provider_change_required";
    state.executorSession = activeExecutorSession();
    state.consecutiveTransientProviderFailures = 3;
    state.executorSession.previousSessionIds = [];

    const result = confirmProviderSwitchForRecovery(
      state,
      "用户已切换到可用供应商",
    );

    expect(result).toEqual({
      previousSessionId: "326f078d-ede0-47e7-80a8-5ff993aa314c",
      reason: "用户已切换到可用供应商",
    });
    expect(state.executorSession.sessionId).toBeNull();
    expect(state.executorSession.previousSessionIds).toContain(
      "326f078d-ede0-47e7-80a8-5ff993aa314c",
    );
    expect(state.consecutiveTransientProviderFailures).toBe(0);
  });

  it("rejects provider-switch recovery outside provider change state", () => {
    const state = createState("blocked");
    state.currentStep = "blocked_review";
    state.executorSession = activeExecutorSession();

    expect(() =>
      confirmProviderSwitchForRecovery(state, "已切换供应商"),
    ).toThrow("provider_change_required");
  });

  it("retries a blocked executor with preserved review findings", () => {
    const state = createState("blocked");
    const review = path.join(
      path.dirname(state.lastExecutorResult!),
      "review-blocked.json",
    );
    fs.writeFileSync(
      review,
      JSON.stringify({
        result: "blocked",
        summary: "缺少外部环境",
        findings: [{ id: "R19-F-001", blocking: true }],
      }),
    );
    state.lastReviewResult = review;
    state.reviewRound = 19;

    const retry = retryBlockedExecutorForRecovery(
      state,
      "清理无关差异并完成本地证据收口",
    );

    expect(retry?.result).toBe("needs_fix");
    expect(retry?.findings).toHaveLength(2);
    expect(retry?.findings[0].id).toBe("R19-F-001");
    expect(retry?.findings[1].id).toBe("HUMAN-RETRY-19");
  });

  it("retries an initial infrastructure failure without a review result", () => {
    const state = createState("blocked");
    state.lastExecutorResult = null;
    state.lastReviewResult = null;
    state.blocker = "claude invocation failed before producing a result";

    const retry = retryBlockedExecutorForRecovery(
      state,
      "启动器已修复并通过回归，继续原任务",
    );

    expect(retry?.result).toBe("needs_fix");
    expect(retry?.findings).toHaveLength(1);
    expect(retry?.findings[0].category).toBe("基础设施恢复");
    expect(retry?.findings[0].evidence).toContain("invocation failed");
  });

  it("retries an executor after an invalid result from needs-fix recovery", () => {
    const state = createState("blocked");
    const review = path.join(
      path.dirname(state.lastExecutorResult!),
      "review-needs-fix.json",
    );
    fs.writeFileSync(
      review,
      JSON.stringify({
        result: "needs_fix",
        summary: "结构化结果无效",
        findings: [{ id: "HUMAN-RETRY-19", blocking: true }],
      }),
    );
    state.lastReviewResult = review;
    state.reviewRound = 19;

    const retry = retryBlockedExecutorForRecovery(
      state,
      "禁止以 H2 替代 MySQL，并清理全部本地差异",
    );

    expect(retry?.result).toBe("needs_fix");
    expect(retry?.findings).toHaveLength(2);
    expect(retry?.findings[1].requiredFix).toContain("禁止以 H2 替代 MySQL");
  });

  it("rejects retrying a non-blocked executor result", () => {
    const state = createState("ready_for_review");
    const review = path.join(
      path.dirname(state.lastExecutorResult!),
      "review-pass.json",
    );
    fs.writeFileSync(
      review,
      JSON.stringify({ result: "pass", summary: "通过", findings: [] }),
    );
    state.lastReviewResult = review;

    expect(() => retryBlockedExecutorForRecovery(state, "继续执行")).toThrow(
      "blocked",
    );
  });

  it("retries a post-review deterministic gate failure", () => {
    const state = createState("ready_for_review");
    const review = path.join(
      path.dirname(state.lastExecutorResult!),
      "review-pass-gate-failed.json",
    );
    fs.writeFileSync(
      review,
      JSON.stringify({ result: "pass", summary: "通过", findings: [] }),
    );
    state.lastReviewResult = review;
    state.blocker = "Host 评审通过，但最后一次执行结果按当前规则重验仍失败：证据泄露";

    const retry = retryBlockedExecutorForRecovery(
      state,
      "删除含凭据的历史调试证据",
    );

    expect(retry?.result).toBe("needs_fix");
    expect(retry?.findings).toHaveLength(1);
    expect(retry?.findings[0].requiredFix).toContain("删除含凭据");
  });

  it("credits infrastructure calls without deleting physical audit counts", () => {
    const state = createState("blocked");
    state.executorInvocations = 7;
    state.totalAgentInvocations = 7;

    const credited = applyInfrastructureInvocationCredits(state, "6");

    expect(credited).toBe(6);
    expect(state.executorInvocations).toBe(7);
    expect(state.executorInvocationCredits).toBe(6);
    expect(state.totalAgentInvocationCredits).toBe(6);
  });

  it("resumes an exhausted task when existing credits restore budget", () => {
    const state = createState("blocked");
    state.executorInvocations = 7;
    state.executorInvocationCredits = 6;
    state.totalAgentInvocations = 7;
    state.totalAgentInvocationCredits = 6;

    expect(
      hasAvailableInvocationBudget(state, {
        budgets: {
          maxExecutorInvocations: 7,
          maxReviewRounds: 5,
          maxTotalAgentInvocations: 12,
          maxWallClockMilliseconds: 1000,
        },
      }),
    ).toBe(true);
  });

  it("resumes review exhaustion without requiring executor budget", () => {
    const state = createState("review_exhausted");
    state.executorInvocations = 7;
    state.totalAgentInvocations = 7;
    state.reviewInvocations = 5;

    expect(
      hasAvailableInvocationBudget(state, {
        budgets: {
          maxExecutorInvocations: 7,
          maxReviewRounds: 10,
          maxTotalAgentInvocations: 12,
          maxWallClockMilliseconds: 1000,
        },
      }),
    ).toBe(false);
    expect(
      hasAvailableReviewBudget(state, {
        budgets: {
          maxExecutorInvocations: 7,
          maxReviewRounds: 10,
          maxTotalAgentInvocations: 12,
          maxWallClockMilliseconds: 1000,
        },
      }),
    ).toBe(true);
  });

  it("increases one task budget and rotates its contract hash", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-budget-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "记录首次托管执行",
      projectRoot: root,
    });
    const state = initManagedRunState(contract);
    const previousHash = contract.contractHash;

    applyManagedBudgetIncrease(contract, state, {
      maxExecutorInvocations: "20",
      maxReviewRounds: "10",
      maxTotalAgentInvocations: "30",
      budgetOverrideReason: "完整记录首次托管执行",
    });

    expect(contract.budgets.maxExecutorInvocations).toBe(20);
    expect(contract.budgets.maxReviewRounds).toBe(10);
    expect(contract.budgets.maxTotalAgentInvocations).toBe(30);
    expect(state.contractHash).toBe(contract.contractHash);
    expect(contract.contractHash).not.toBe(previousHash);
  });

  it("resumes repair_pending only after an auditable budget extension", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-repair-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "同步任务文档",
      projectRoot: root,
    });
    const state = initManagedRunState(contract);
    state.status = "repair_pending";
    state.reviewInvocations = contract.budgets.maxReviewRounds;
    state.executorInvocations = contract.budgets.maxExecutorInvocations;
    state.totalAgentInvocations = contract.budgets.maxTotalAgentInvocations;

    expect(canResumeManagedTask(state, contract, {})).toBe(false);

    applyManagedBudgetIncrease(contract, state, {
      maxExecutorInvocations: String(contract.budgets.maxExecutorInvocations + 1),
      maxReviewRounds: String(contract.budgets.maxReviewRounds + 1),
      maxTotalAgentInvocations: String(contract.budgets.maxTotalAgentInvocations + 2),
      budgetOverrideReason: "用户批准继续完成文档整改",
    });

    expect(canResumeManagedTask(state, contract, {})).toBe(true);
  });

  it("reopens a rejected delivery with a blocking repair finding", () => {
    const state = createState("ready_for_review");
    state.status = "awaiting_git_approval";
    state.reviewRound = 9;
    state.completedAt = "2026-07-22T00:00:00.000Z";

    const review = reopenAwaitingDelivery(state, "OpenSpec 仍有未完成任务");

    expect(state.status).toBe("waiting_for_human");
    expect(state.lastExecutorResult).toBeNull();
    expect(state.completedAt).toBeNull();
    expect(review?.result).toBe("needs_fix");
    expect(review?.findings[0].blocking).toBe(true);
  });

  it("temporarily removes invocation limits with an audit reason", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-unlimited-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "持续完成任务",
      projectRoot: root,
    });
    const state = initManagedRunState(contract);

    const changed = applyUnlimitedAgentBudget(contract, state, {
      unlimitedAgentBudget: true,
      budgetOverrideReason: "完成首次托管交付",
    });

    expect(changed).toBe(true);
    expect(contract.budgets.unlimitedAgentInvocations).toBe(true);
    expect(state.contractHash).toBe(contract.contractHash);
  });

  it("limits Claude to an audited number of additional physical calls", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-window-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "继续完成托管任务",
      projectRoot: root,
    });
    const state = initManagedRunState(contract);
    state.executorInvocations = 24;

    const changed = applyExecutorInvocationWindow(contract, state, {
      additionalExecutorInvocations: "3",
      budgetOverrideReason: "切换模型供应商后短暂恢复",
    });

    expect(changed).toEqual({
      before: 24,
      stopAt: 27,
      count: 3,
      reason: "切换模型供应商后短暂恢复",
    });
    expect(contract.budgets.executorPhysicalStopAt).toBe(27);
    expect(state.contractHash).toBe(contract.contractHash);
  });

  it("reopens an exhausted task with an additional Claude window", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-window-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "继续完成托管任务",
      projectRoot: root,
    });
    const state = initManagedRunState(contract);
    state.status = "budget_exhausted";
    state.executorInvocations = 16;
    state.executorInvocationCredits = 5;
    state.totalAgentInvocations = 16;
    state.totalAgentInvocationCredits = 5;

    applyExecutorInvocationWindow(contract, state, {
      additionalExecutorInvocations: "3",
      budgetOverrideReason: "完成评审整改",
    });

    expect(contract.budgets.executorPhysicalStopAt).toBe(19);
    expect(hasAvailableInvocationBudget(state, contract)).toBe(true);
  });

  it("rejects a non-positive Claude invocation window", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-window-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "继续完成托管任务",
      projectRoot: root,
    });
    const state = initManagedRunState(contract);

    expect(() =>
      applyExecutorInvocationWindow(contract, state, {
        additionalExecutorInvocations: "0",
        budgetOverrideReason: "临时恢复",
      }),
    ).toThrow("正整数");
  });

  it("requires an audit reason for a Claude invocation window", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-window-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "继续完成托管任务",
      projectRoot: root,
    });
    const state = initManagedRunState(contract);

    expect(() =>
      applyExecutorInvocationWindow(contract, state, {
        additionalExecutorInvocations: "3",
      }),
    ).toThrow("审计原因");
  });
});

function createState(
  status: "blocked" | "failed" | "ready_for_review" | "running",
): ManagedRunState {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-resume-"));
  roots.push(root);
  const result = path.join(root, "executor-result.json");
  fs.writeFileSync(result, JSON.stringify({ status }));
  return {
    status: "waiting_for_human",
    lastExecutorResult: result,
  } as ManagedRunState;
}

function activeExecutorSession(): ManagedRunState["executorSession"] {
  return {
    agent: "claude",
    sessionId: "326f078d-ede0-47e7-80a8-5ff993aa314c",
    createdAt: "2026-07-21T00:00:00.000Z",
    lastResumedRound: 17,
    status: "active",
  };
}

function createPendingHostReviewFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-host-review-"));
  roots.push(root);
  const env = {
    ...process.env,
    SUPERFLOW_HOME: path.join(root, "home"),
  };
  const contract = createManagedTaskContract({
    request: "修复代码",
    projectRoot: root,
  });
  const state = initManagedRunState(contract);
  state.status = "waiting_for_host_review";
  state.currentStep = "external_supervisor_review_required";
  state.reviewRound = 1;
  state.reviewInvocations = 1;
  state.pendingExternalReview = {
    round: 1,
    promptPath: path.join(root, "host-review-1.md"),
    workspaceFingerprint: state.workspaceFingerprint,
    requestedAt: new Date().toISOString(),
  };
  createManagedTaskFiles(contract, state, env);
  const reviewRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "pipeline-host-review-result-"),
  );
  roots.push(reviewRoot);
  const reviewPath = path.join(reviewRoot, "review.json");
  fs.writeFileSync(
    reviewPath,
    JSON.stringify({ result: "pass", summary: "检查通过", findings: [] }),
  );
  return { root, contract, state, env, reviewPath };
}
