import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { readManagedEvents } from "../../src/domains/managed-work/journal.js";
import { runManagedTask } from "../../src/domains/managed-work/runner.js";
import {
  createManagedTaskFiles,
  saveManagedRun,
} from "../../src/domains/managed-work/storage.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import type {
  AgentInvocation,
  AgentInvocationResult,
  AgentInvoker,
  ExecutorResult,
  ReviewResult,
} from "../../src/domains/managed-work/types.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

describe("managed work runner", () => {
  it("runs executor then reviewer and waits for git approval", async () => {
    const fixture = createFixture();
    const invoker = new FakeInvoker([
      executorReady("完成目标"),
      reviewPass("证据完整"),
    ]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("awaiting_git_approval");
    expect(state.executorInvocations).toBe(1);
    expect(state.reviewInvocations).toBe(1);
    expect(state.totalAgentInvocations).toBe(2);
    expect(state.executorSession.sessionId).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(state.supervisorSession.sessionId).toBe(
      "00000000-0000-4000-8000-000000000002",
    );
    const checkOutput = execFileSync(
      process.execPath,
      [
        path.join(
          process.cwd(),
          "assets",
          "scripts",
          "superflow-managed-work-check.mjs",
        ),
        fixture.root,
        fixture.contract.taskId,
      ],
      { encoding: "utf-8" },
    );
    expect(checkOutput).toContain("OK 托管任务状态完整");
  });

  it("keeps English across Agent invocations, reports, and notifications", async () => {
    const fixture = createFixture("quick", "en");
    const invoker = new FakeInvoker([
      executorReady("Task completed"),
      reviewPass("Evidence complete"),
    ]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );
    const runDir = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      fixture.contract.taskId,
      "runs",
      state.runId,
    );
    const report = fs.readFileSync(path.join(runDir, "task-report.md"), "utf-8");
    const notifications = fs.readFileSync(
      path.join(fixture.env.SUPERFLOW_HOME, "managed", "notifications.jsonl"),
      "utf-8",
    );

    expect(invoker.invocations.every((item) => item.language === "en")).toBe(true);
    expect(report).toContain("## Final conclusion");
    expect(report).toContain("waiting for Git commit approval");
    expect(notifications).toContain("Superflow task completed");
  });

  it("resumes both original sessions during repair", async () => {
    const fixture = createFixture();
    const invoker = new FakeInvoker([
      executorReady("第一版"),
      reviewNeedsFix(),
      executorReady("完成整改"),
      reviewPass("整改通过"),
    ]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("awaiting_git_approval");
    expect(state.reviewRound).toBe(2);
    expect(invoker.invocations[2].sessionId).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(invoker.invocations[3].sessionId).toBe(
      "00000000-0000-4000-8000-000000000002",
    );
  });

  it("stops mechanically after the fifth failed review", async () => {
    const fixture = createFixture();
    const outputs: Array<ExecutorResult | ReviewResult> = [];
    for (let round = 0; round < 5; round++) {
      outputs.push(executorReady(`执行 ${round + 1}`), reviewNeedsFix());
    }
    const invoker = new FakeInvoker(outputs);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("review_exhausted");
    expect(state.reviewInvocations).toBe(5);
    expect(state.executorInvocations).toBe(5);
    expect(state.totalAgentInvocations).toBe(10);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "budget.exhausted",
      ),
    ).toBe(true);
  });

  it("rejects engineering delivery with only one verification category", async () => {
    const fixture = createFixture("engineering");
    const result = executorReady("只运行了单元测试");
    result.commands = [
      { command: "npm test", exitCode: 0, result: "测试通过" },
    ];
    const invoker = new FakeInvoker([result]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_human");
    expect(state.blocker).toContain("至少需要两类成功验证证据");
    expect(state.reviewInvocations).toBe(0);
  });

  it("does not record delivery ready when the final integrity check fails", async () => {
    const fixture = createFixture();
    const resultFile = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      fixture.contract.taskId,
      "runs",
      fixture.state.runId,
      "executor-result-1.json",
    );
    const invoker = new FakeInvoker(
      [executorReady("完成目标"), reviewPass("证据完整")],
      (invocation) => {
        if (invocation.role === "supervisor" && fs.existsSync(resultFile)) {
          fs.unlinkSync(resultFile);
        }
      },
    );

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_human");
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "run.delivery_ready",
      ),
    ).toBe(false);
  });

  it("continues from a persisted passing review without another agent call", async () => {
    const fixture = createFixture();
    const runDir = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      fixture.contract.taskId,
      "runs",
      fixture.state.runId,
    );
    const executorFile = path.join(runDir, "executor-result-1.json");
    const reviewFile = path.join(runDir, "review-result-1.json");
    fs.writeFileSync(executorFile, JSON.stringify(executorReady("完成目标")));
    fs.writeFileSync(reviewFile, JSON.stringify(reviewPass("检查已通过")));
    fixture.state.executorInvocations = 1;
    fixture.state.reviewInvocations = 1;
    fixture.state.reviewRound = 1;
    fixture.state.totalAgentInvocations = 2;
    fixture.state.lastExecutorResult = executorFile;
    fixture.state.lastReviewResult = reviewFile;
    fixture.state.executorSession.sessionId = sessionFor("executor");
    fixture.state.supervisorSession.sessionId = sessionFor("supervisor");
    saveManagedRun(fixture.state);
    const invoker = new FakeInvoker([]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("awaiting_git_approval");
    expect(invoker.invocations).toHaveLength(0);
  });

  it("classifies provider connection failures as retryable", async () => {
    const fixture = createFixture();
    const invoker = new FakeInvoker([
      new Error("API Error: Unable to connect to API (ConnectionRefused)"),
    ]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_connectivity");
    expect(state.blocker).toContain("Unable to connect");
  });
});

class FakeInvoker implements AgentInvoker {
  readonly invocations: AgentInvocation[] = [];
  private index = 0;

  constructor(
    private readonly outputs: Array<ExecutorResult | ReviewResult | Error>,
    private readonly onInvoke?: (invocation: AgentInvocation) => void,
  ) {}

  async invoke<T>(
    invocation: AgentInvocation,
  ): Promise<AgentInvocationResult<T>> {
    this.invocations.push(invocation);
    this.onInvoke?.(invocation);
    const sessionId = invocation.sessionId ?? sessionFor(invocation.role);
    invocation.onSession?.(sessionId);
    const output = this.outputs[this.index++];
    if (!output) throw new Error("fake output exhausted");
    if (output instanceof Error) throw output;
    return {
      sessionId,
      output: output as T,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
}

function createFixture(
  profile: "quick" | "engineering" = "quick",
  language: "zh" | "en" = "zh",
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-runner-"));
  roots.push(root);
  const env = {
    ...process.env,
    SUPERFLOW_HOME: path.join(root, "home"),
    SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1",
  };
  const contract = createManagedTaskContract({
    request: "整理一份任务结果",
    projectRoot: root,
    profile,
    language,
  });
  const state = initManagedRunState(contract);
  createManagedTaskFiles(contract, state, env);
  return { root, env, contract, state };
}

function executorReady(summary: string): ExecutorResult {
  return {
    status: "ready_for_review",
    summary,
    changedFiles: [],
    commands: [],
    evidence: [],
    blockers: [],
  };
}

function reviewPass(summary: string): ReviewResult {
  return { result: "pass", summary, findings: [] };
}

function reviewNeedsFix(): ReviewResult {
  return {
    result: "needs_fix",
    summary: "需要整改",
    findings: [
      {
        id: "R-1",
        severity: "high",
        blocking: true,
        category: "correctness",
        target: "result.txt",
        evidence: "缺少目标内容",
        risk: "任务未完成",
        requiredFix: "补齐内容",
        acceptanceChecks: ["检查文件内容"],
      },
    ],
  };
}

function sessionFor(role: AgentInvocation["role"]): string {
  return role === "executor"
    ? "00000000-0000-4000-8000-000000000001"
    : "00000000-0000-4000-8000-000000000002";
}
