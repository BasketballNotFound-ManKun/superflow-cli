import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import {
  createManagedTaskFiles,
  loadManagedRun,
  loadManagedTask,
} from "../../src/domains/managed-work/storage.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import { AgentInvocationFailure } from "../../src/platform/agent-process.js";
import { runManagedTask } from "../../src/domains/managed-work/runner.js";
import { submitExternalHostReviewResult } from "../../src/domains/managed-work/host-review.js";
import type {
  AgentInvocation,
  AgentInvoker,
  ExecutorResult,
  ManagedBudgets,
  ManagedRunState,
} from "../../src/domains/managed-work/types.js";
const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => fs.rmSync(root, { recursive: true, force: true })),
);
function fixture(
  budgets: Partial<ManagedBudgets>,
  initialize?: (state: ManagedRunState) => void,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-budget-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  const env = {
    ...process.env,
    SUPERFLOW_HOME: path.join(root, "home"),
    SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1",
  };
  const contract = createManagedTaskContract({
    request: "核实用户目标",
    projectRoot: root,
    profile: "native",
    budgets,
  });
  const state = initManagedRunState(contract);
  initialize?.(state);
  createManagedTaskFiles(contract, state, env);
  const calls: AgentInvocation[] = [];
  const invoker: AgentInvoker = {
    invoke: async <T>(invocation: AgentInvocation) => {
      calls.push(invocation);
      invocation.onSession?.("native-budget-session");
      return {
        sessionId: "native-budget-session",
        output: {
          status: "ready_for_review",
          summary: "请 Host 评审",
          changedFiles: [],
          commands: [],
          evidence: [],
          releasePrerequisites: [],
          blockers: [],
        } as ExecutorResult as T,
        stdout: "response",
        stderr: "",
        exitCode: 0,
      };
    },
  };
  return { root, env, contract, calls, invoker };
}
async function requestCorrection(f: ReturnType<typeof fixture>) {
  const state = await runManagedTask(
    f.root,
    f.contract.taskId,
    f.invoker,
    f.env,
  );
  expect(state.status).toBe("waiting_for_host_review");
  submitExternalHostReviewResult(
    loadManagedTask(f.root, f.contract.taskId),
    loadManagedRun(f.root, f.contract.taskId, state.runId),
    {
      result: "needs_fix",
      summary: "尚有目标未完成",
      findings: [
        {
          id: "B-1",
          severity: "high",
          blocking: true,
          category: "scope",
          target: "用户目标",
          evidence: "未完整交付",
          risk: "目标缺失",
          requiredFix: "继续",
          acceptanceChecks: ["完整目标"],
        },
      ],
    },
    "zh",
    f.env,
  );
  return runManagedTask(f.root, f.contract.taskId, f.invoker, f.env);
}
describe("native explicit runner budgets", () => {
  it.each(["maxExecutorInvocations", "maxTotalAgentInvocations"] as const)(
    "keeps positive %s independent from a larger physical window",
    async (field) => {
      const f = fixture({ [field]: 1, executorPhysicalStopAt: 5 });
      const state = await requestCorrection(f);
      expect(state.status).toBe("budget_exhausted");
      expect(f.calls).toHaveLength(1);
    },
  );
  it("treats a zero physical stop point as unset", async () => {
    const f = fixture({ executorPhysicalStopAt: 0 });
    const state = await requestCorrection(f);
    expect(state.status).toBe("waiting_for_host_review");
    expect(f.calls).toHaveLength(2);
  });
  it("keeps an unset physical window unset after a credited provider failure", async () => {
    const f = fixture({ executorPhysicalStopAt: 0 });
    const failure: AgentInvoker = {
      invoke: async () => {
        throw new AgentInvocationFailure(
          "connection reset",
          "",
          "",
          "native-budget-session",
        );
      },
    };
    const failed = await runManagedTask(
      f.root,
      f.contract.taskId,
      failure,
      f.env,
    );
    expect(failed.status).toBe("waiting_for_connectivity");
    expect(
      loadManagedTask(f.root, f.contract.taskId).budgets.executorPhysicalStopAt,
    ).toBe(0);
    const resumed = await runManagedTask(
      f.root,
      f.contract.taskId,
      f.invoker,
      f.env,
    );
    expect(resumed.status).toBe("waiting_for_host_review");
  });
  it("honors a positive review budget despite the unlimited default flag", async () => {
    const f = fixture({ maxReviewRounds: 1 });
    const state = await requestCorrection(f);
    expect(state.status).toBe("repair_pending");
    expect(state.currentStep).toBe("repair_budget_approval_required");
    expect(f.calls).toHaveLength(1);
  });
  it.each([
    [{ maxExecutorTokenUnits: 1 }, "budget_exhausted"],
    [{ maxExecutorCostUsd: 1 }, "budget_exhausted"],
    [{ maxActiveRunHours: 1 }, "deadline_exhausted"],
    [
      { maxExecutorTokenUnits: 0, maxExecutorCostUsd: 0, maxActiveRunHours: 0 },
      "waiting_for_host_review",
    ],
  ] as const)(
    "enforces positive usage and duration caps, with zero unset: %j",
    async (budgets, expected) => {
      const f = fixture(budgets, (state) => {
        state.activeRunMilliseconds = 3_600_000;
        state.executorUsage = {
          inputTokens: 10,
          outputTokens: 2,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: 2,
        };
      });
      const state = await runManagedTask(
        f.root,
        f.contract.taskId,
        f.invoker,
        f.env,
      );
      expect(state.status).toBe(expected);
      expect(f.calls).toHaveLength(
        expected === "waiting_for_host_review" ? 1 : 0,
      );
    },
  );
});
