import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  calculateManagedContractHash,
  createManagedTaskContract,
} from "../../src/domains/managed-work/contract.js";
import {
  appendManagedEvent,
  readManagedEvents,
} from "../../src/domains/managed-work/journal.js";
import { appendManagedHumanMessage } from "../../src/domains/managed-work/human-messages.js";
import {
  isExternalPendingTask,
  runManagedTask,
  writeManagedLogParts,
} from "../../src/domains/managed-work/runner.js";
import {
  createManagedTaskFiles,
  loadManagedRun,
  loadManagedTask,
  saveManagedRun,
  saveManagedTask,
} from "../../src/domains/managed-work/storage.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import { submitExternalHostReviewResult } from "../../src/domains/managed-work/host-review.js";
import { AgentInvocationFailure } from "../../src/platform/agent-process.js";
import { writeManagedContextManifest } from "../../src/domains/managed-work/context-manifest.js";
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
  it("splits large raw logs without dropping audit bytes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-log-parts-"));
    roots.push(root);
    const content = `${"x".repeat(9 * 1024 * 1024)}\nend\n`;

    const files = writeManagedLogParts(
      root,
      "executor-1-events",
      "jsonl",
      content,
    );

    expect(files).toHaveLength(2);
    expect(
      files
        .map((file) => fs.readFileSync(file))
        .reduce((total, value) => total + value.length, 0),
    ).toBe(Buffer.byteLength(content));
  });

  it("records an explicit rework event without regressing the public stage", async () => {
    const fixture = createFixture();
    const invoker = new FakeInvoker(
      [executorReady("完成目标"), reviewPass("通过")],
      (invocation) => {
        invocation.onProgress?.("superflow-stage:cleanup");
        invocation.onProgress?.("superflow-stage:implementation");
        invocation.onProgress?.("superflow-stage:implementation");
      },
    );

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.executorStage).toBe("cleanup");
    expect(state.executorActiveStage).toBe("implementation");
    expect(
      readManagedEvents(state).filter(
        (event) => event.eventType === "executor.stage_rework",
      ),
    ).toHaveLength(1);
  });

  it("redacts sensitive executor progress before it reaches task artifacts", async () => {
    const fixture = createFixture();
    const secret = "callback-progress-secret";
    const invoker = new FakeInvoker(
      [executorReady("完成目标")],
      (invocation) => {
        invocation.onProgress?.(`R38_DB_PASSWORD=${secret} bash verify.sh`);
      },
    );

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
    const progress = fs.readFileSync(
      path.join(runDir, "executor-progress-1.jsonl"),
      "utf-8",
    );
    const journal = fs.readFileSync(
      path.join(runDir, "progress.jsonl"),
      "utf-8",
    );

    expect(progress).not.toContain(secret);
    expect(journal).not.toContain(secret);
    expect(progress).toContain("R38_DB_PASSWORD=<redacted>");
    expect(journal).toContain("R38_DB_PASSWORD=<redacted>");
  });

  it("records the dispatch, executor acknowledgement, delivery receipt, and Host notice once", async () => {
    const fixture = createFixture();
    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([executorReady("完成目标")]),
      fixture.env,
    );
    const events = readManagedEvents(state);
    const types = events.map((event) => event.eventType);

    expect(types).toContain("executor.dispatch_recorded");
    expect(types).toContain("executor.handoff_acknowledged");
    expect(types).toContain("executor.delivery_received");
    expect(types).toContain("host.review_required_notified");
    expect(types.indexOf("executor.dispatch_recorded")).toBeLessThan(
      types.indexOf("executor.delivery_received"),
    );
  });

  it("delivers guidance added during an invocation once before Host review", async () => {
    const fixture = createFixture();
    const invoker = new FakeInvoker(
      [executorReady("首轮交付"), executorReady("已纳入补充要求")],
      (invocation) => {
        if (invocation.role === "executor" && invoker.invocations.length === 1) {
          appendManagedHumanMessage(fixture.contract, "补充一项验收断言");
        }
      },
    );

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
    const secondHandoff = JSON.parse(
      fs.readFileSync(path.join(runDir, "executor-handoff-2.json"), "utf-8"),
    );
    const guidanceEvents = readManagedEvents(state).filter(
      (event) => event.eventType === "executor.guidance_handoff_delivered",
    );

    expect(state.status).toBe("waiting_for_host_review");
    expect(invoker.invocations).toHaveLength(2);
    expect(secondHandoff.humanGuidance.deliveryMessageIds).toHaveLength(1);
    expect(guidanceEvents).toHaveLength(1);
  });

  it("raises Host attention only after two idle supervision checkpoints", async () => {
    const fixture = createFixture();
    const invoker = new FakeInvoker(
      [executorReady("完成目标")],
      (invocation) => {
        invocation.onProgress?.("superflow-supervision:{}");
        invocation.onProgress?.("superflow-supervision:{}");
        invocation.onProgress?.("superflow-supervision:{}");
        invocation.onProgress?.("superflow-supervision:{}");
        invocation.onProgress?.("superflow-supervision:{}");
      },
    );

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );
    const events = readManagedEvents(state);

    expect(state.status).toBe("waiting_for_host_review");
    expect(
      events.filter(
        (event) => event.eventType === "executor.supervision_checkpoint_idle",
      ),
    ).toHaveLength(4);
    expect(
      events.filter(
        (event) =>
          event.eventType === "executor.supervision_attention_required",
      ),
    ).toHaveLength(2);
  });

  it("distinguishes external database prerequisites from local runtime work", () => {
    expect(
      isExternalPendingTask(
        "- [ ] 1.6 [environment_required] 使用只读账号执行 SHOW CREATE TABLE 和 SHOW INDEX",
      ),
    ).toBe(true);
    expect(
      isExternalPendingTask(
        "- [ ] 1.7 [release_required] 核对测试和生产环境真实菜单码、角色码",
      ),
    ).toBe(true);
    expect(
      isExternalPendingTask("- [ ] 8.4 启动应用后用真实 HTTP 调用核对接口日志"),
    ).toBe(false);
  });

  it("runs executor then current host review and waits for git approval", async () => {
    const fixture = createFixture();
    const invoker = new FakeInvoker([
      executorReady("完成目标"),
      reviewPass("证据完整"),
    ]);

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("release_ready");
    expect(state.executorInvocations).toBe(1);
    expect(state.reviewInvocations).toBe(1);
    expect(state.totalAgentInvocations).toBe(1);
    expect(state.executorSession.sessionId).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(state.supervisorSession.sessionId).toBeNull();
    fs.mkdirSync(
      path.join(
        fixture.root,
        ".superflow",
        "tasks",
        fixture.contract.taskId,
        "runs",
        fixture.contract.taskId,
        "evidence",
      ),
      { recursive: true },
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

  it("keeps release prerequisites without blocking source review", async () => {
    const fixture = createFixture();
    const result = executorReady("源码交付完成");
    result.releasePrerequisites = ["由 DBA 在发布窗口执行迁移对账"];
    const invoker = new FakeInvoker([result, reviewPass("源码评审通过")]);

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );
    const report = fs.readFileSync(
      path.join(
        fixture.root,
        ".superflow",
        "tasks",
        fixture.contract.taskId,
        "runs",
        state.runId,
        "task-report.md",
      ),
      "utf-8",
    );

    expect(state.status).toBe("local_delivery_ready");
    expect(report).toContain("发布前置条件：由 DBA 在发布窗口执行迁移对账");
  });

  it("allows only external OpenSpec tasks to remain before git approval", async () => {
    const fixture = createSddFixture([
      "- [x] 1.1 [local_required] 完成本地实现",
      "- [ ] 1.6 [environment_required] 使用只读账号执行 SHOW CREATE TABLE 和 SHOW INDEX",
      "- [ ] 1.7 [release_required] 核对测试和生产环境真实菜单码、角色码",
    ]);
    const result = executorReady("本地交付完成");
    result.commands = [
      { command: "npm test", exitCode: 0, result: "测试通过" },
      { command: "npm run build", exitCode: 0, result: "构建通过" },
    ];
    result.releasePrerequisites = [
      "DBA 使用只读账号核对真实表结构、菜单码和角色码",
    ];
    result.changedFiles = ["src/demo.ts"];
    fs.mkdirSync(path.join(fixture.root, "src"), { recursive: true });
    fs.writeFileSync(path.join(fixture.root, "src", "demo.ts"), "export {};\n");
    result.taskEvidence = [
      {
        taskId: "1.1",
        category: "local_required",
        owner: "executor",
        evidencePaths: ["test-report.md"],
        verificationCommands: ["npm test", "npm run build"],
        changedFiles: ["src/demo.ts"],
      },
    ];
    const sddReview = reviewPass("源码评审通过");
    sddReview.verificationCommands = [
      {
        command: "openspec instructions apply --change demo",
        exitCode: 0,
        result: "任务合同已核对",
      },
    ];

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([result, sddReview]),
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe(
      "environment_validation_blocked",
    );
    const handoff = fs.readFileSync(
      path.join(
        fixture.root,
        ".superflow",
        "tasks",
        fixture.contract.taskId,
        "runs",
        state.runId,
        "executor-handoff-1.md",
      ),
      "utf-8",
    );
    expect(handoff).toContain("机器交接协议");
    expect(handoff).toContain("Runner 会根据 tasks.md");
    expect(handoff).toContain("- 1.1: 1.1 [local_required] 完成本地实现");
    expect(handoff).not.toContain("- 1.6: 1.6 [environment_required]");
    const machineHandoff = JSON.parse(
      fs.readFileSync(
        path.join(
          fixture.root,
          ".superflow",
          "tasks",
          fixture.contract.taskId,
          "runs",
          state.runId,
          "executor-handoff-1.json",
        ),
        "utf-8",
      ),
    ) as {
      protocolVersion: string;
      messageType: string;
      tasks: { checkedLocalTaskIds: string[] };
    };
    expect(machineHandoff.protocolVersion).toBe("superflow.handoff.v2");
    expect(machineHandoff.messageType).toBe("executor_handoff");
    expect(machineHandoff.tasks.checkedLocalTaskIds).toContain("1.1");
    const output = execFileSync(
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
    expect(output).toContain("OK 托管任务状态完整");
  });

  it("reruns deterministic preflight before admitting an SDD delivery to Host review", async () => {
    const fixture = createSddFixture(
      ["- [ ] 1.1 [local_required] 完成本地实现"],
      true,
    );
    fs.mkdirSync(path.join(fixture.root, "src"), { recursive: true });
    fs.writeFileSync(path.join(fixture.root, "src", "demo.ts"), "export {};\n");
    const first = executorReady("漏回填任务清单");
    first.changedFiles = ["src/demo.ts"];
    first.commands = [
      { command: "npm test", exitCode: 0, result: "测试通过" },
      { command: "npm run build", exitCode: 0, result: "构建通过" },
    ];

    const invoker = new FakeInvoker([
      first,
      executorBlocked("按最终门禁回填 tasks.md 后再交付"),
    ]);
    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(invoker.invocations).toHaveLength(2);
    expect(state.status).toBe("waiting_for_host_review");
    expect(invoker.invocations[1].prompt).toContain(
      "仍有 1 个 local_required 任务未勾选",
    );
    expect(
      readManagedEvents(state).some(
        (event) =>
          event.eventType === "executor.result_rejected" &&
          event.summary.includes("最终交付前门禁失败"),
      ),
    ).toBe(true);
  });

  it("keeps English across Agent invocations, reports, and notifications", async () => {
    const fixture = createFixture("quick", "en");
    const invoker = new FakeInvoker([
      executorReady("Task completed"),
      reviewPass("Evidence complete"),
    ]);

    const state = await runManagedTaskWithHostReviews(
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
    const report = fs.readFileSync(
      path.join(runDir, "task-report.md"),
      "utf-8",
    );
    const notifications = fs.readFileSync(
      path.join(fixture.env.SUPERFLOW_HOME, "managed", "notifications.jsonl"),
      "utf-8",
    );

    expect(invoker.invocations.every((item) => item.language === "en")).toBe(
      true,
    );
    expect(report).toContain("## Final conclusion");
    expect(report).toContain("Status: release_ready");
    expect(notifications).toContain("Superflow task completed");
  });

  it("rolls over to fresh short sessions during repair", async () => {
    const fixture = createFixture();
    const invoker = new FakeInvoker([
      executorReady("第一版"),
      reviewNeedsFix(),
      executorReady("完成整改"),
      reviewPass("整改通过"),
    ]);

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("release_ready");
    expect(state.reviewRound).toBe(2);
    expect(invoker.invocations.every((item) => item.sessionId === null)).toBe(
      true,
    );
    expect(state.executorSession.previousSessionIds).toContain(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(state.supervisorSession.previousSessionIds).toEqual([]);
    expect(
      readManagedEvents(state).some(
        (event) =>
          event.eventType === "executor.stage_changed" &&
          event.summary.includes("编码实现"),
      ),
    ).toBe(true);
  });

  it("automatically resumes the same session after max turns", async () => {
    const fixture = createFixture("engineering");
    const failure = new AgentInvocationFailure(
      "claude 调用失败: max_turns, Reached maximum number of turns (40)",
      '{"type":"result","subtype":"error_max_turns"}\n',
      "",
      sessionFor("executor"),
    );
    const first: AgentInvoker = {
      invoke: async <T>(
        invocation: AgentInvocation,
      ): Promise<AgentInvocationResult<T>> => {
        invocation.onSession?.(sessionFor("executor"));
        fs.writeFileSync(path.join(fixture.root, "partial.txt"), "started\n");
        throw failure;
      },
    };

    const failed = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      first,
      fixture.env,
    );
    expect(failed.status).toBe("queued");
    expect(failed.currentStep).toBe("executor_continuation_queued");
    const sessionId = failed.executorSession.sessionId;
    expect(sessionId).not.toBeNull();
    expect(
      readManagedEvents(failed).some(
        (event) => event.eventType === "executor.continuation_queued",
      ),
    ).toBe(true);
    const output = executorReady("继续原会话完成");
    output.commands = [
      { command: "npm test", exitCode: 0, result: "测试通过" },
      { command: "npm run build", exitCode: 0, result: "构建通过" },
    ];
    const resumed = new FakeInvoker([output]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      resumed,
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
    expect(resumed.invocations[0].sessionId).toBe(sessionId);
  });

  it("does not resume a lost session after a max-turn event", async () => {
    const fixture = createFixture("engineering");
    const persisted = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      fixture.state.runId,
    );
    persisted.executorSession = {
      ...persisted.executorSession,
      sessionId: sessionFor("executor"),
      status: "lost",
    };
    appendManagedEvent(persisted, {
      eventType: "executor.invocation_failed",
      actor: "claude",
      role: "executor",
      summary: "maximum number of turns",
    });
    saveManagedRun(persisted);
    const invoker = new FakeInvoker([executorReady("fresh recovery completed")]);

    await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(invoker.invocations[0].sessionId).toBeNull();
  });

  it("retires an unresumable resumed session and queues one fresh recovery", async () => {
    const fixture = createFixture("engineering");
    const maxTurn: AgentInvoker = {
      invoke: async <T>(
        invocation: AgentInvocation,
      ): Promise<AgentInvocationResult<T>> => {
        invocation.onSession?.(sessionFor("executor"));
        fs.writeFileSync(path.join(fixture.root, "partial.txt"), "started\n");
        throw new AgentInvocationFailure(
          "claude 调用失败: maximum number of turns",
          '{"type":"result","subtype":"error_max_turns"}\n',
          "",
          sessionFor("executor"),
        );
      },
    };
    await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      maxTurn,
      fixture.env,
    );
    const resumed = new FakeInvoker([
      new AgentInvocationFailure(
        "failed to resume: session not found",
        "",
        "",
        sessionFor("executor"),
      ),
    ]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      resumed,
      fixture.env,
    );

    expect(resumed.invocations[0].sessionId).toBe(sessionFor("executor"));
    expect(state.status).toBe("queued");
    expect(state.currentStep).toBe("executor_session_recovery_queued");
    expect(state.executorSession.sessionId).toBeNull();
    expect(state.executorSession.retiredSessions).toEqual([
      expect.objectContaining({
        sessionId: sessionFor("executor"),
        reason: "session_not_found",
      }),
    ]);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "executor.session_recovery_queued",
      ),
    ).toBe(true);

    const recovered = new FakeInvoker([
      executorReady("fresh session recovery completed"),
    ]);
    const recoveredState = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      recovered,
      fixture.env,
    );

    expect(recovered.invocations[0].sessionId).toBeNull();
    expect(recoveredState.status).toBe("waiting_for_host_review");
  });

  it("stops after a second unresumable resumed-session failure", async () => {
    const fixture = createFixture("engineering");
    const persisted = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      fixture.state.runId,
    );
    persisted.executorSession = {
      ...persisted.executorSession,
      sessionId: sessionFor("executor"),
      status: "active",
      retiredSessions: [
        {
          sessionId: "00000000-0000-4000-8000-000000000099",
          reason: "session_invalid",
          retiredAt: new Date().toISOString(),
        },
      ],
    };
    appendManagedEvent(persisted, {
      eventType: "executor.session_recovery_queued",
      actor: "managed-runner",
      role: "runner",
      summary: "已有一次恢复",
    });
    appendManagedEvent(persisted, {
      eventType: "executor.invocation_failed",
      actor: "claude",
      role: "executor",
      summary: "maximum number of turns",
    });
    saveManagedRun(persisted);
    const invoker = new FakeInvoker([
      new AgentInvocationFailure(
        "resume rejected: invalid session id",
        "",
        "",
        sessionFor("executor"),
      ),
    ]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(invoker.invocations[0].sessionId).toBe(sessionFor("executor"));
    expect(state.status).toBe("waiting_for_human");
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "executor.session_recovery_circuit_open",
      ),
    ).toBe(true);
  });

  it("keeps missing output and cost usage unknown in the handoff", async () => {
    const fixture = createFixture("engineering");
    const persisted = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      fixture.state.runId,
    );
    persisted.executorUsage = {
      inputTokens: 100,
      outputTokens: null,
      cacheReadTokens: 10_000,
      cacheWriteTokens: null,
      costUsd: null,
    };
    saveManagedRun(persisted);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([executorReady("unknown usage remains truthful")]),
      fixture.env,
    );
    const handoff = JSON.parse(
      fs.readFileSync(
        path.join(
          fixture.root,
          ".superflow",
          "tasks",
          fixture.contract.taskId,
          "runs",
          state.runId,
          "executor-handoff-1.json",
        ),
        "utf-8",
      ),
    ) as {
      budget: {
        outputTokensUsed?: number | null;
        tokenUnitsUsed: number | null;
        maxExecutorOutputTokens?: number | null;
        costUsdUsed: number | null;
      };
    };

    expect(state.status).toBe("waiting_for_host_review");
    expect(handoff.budget.outputTokensUsed).toBeNull();
    expect(handoff.budget.tokenUnitsUsed).toBeNull();
    expect(handoff.budget.maxExecutorOutputTokens).toBe(2_000_000);
    expect(handoff.budget.costUsdUsed).toBeNull();
  });

  it("does not retain a known usage total after a later unknown result", async () => {
    const fixture = createFixture("engineering");
    const persisted = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      fixture.state.runId,
    );
    persisted.executorUsage = {
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 1,
    };
    saveManagedRun(persisted);
    const invoker: AgentInvoker = {
      invoke: async <T>(): Promise<AgentInvocationResult<T>> => ({
        sessionId: sessionFor("executor"),
        output: executorReady("provider omitted usage") as T,
        stdout: "",
        stderr: "",
        exitCode: 0,
        usage: {
          inputTokens: null,
          outputTokens: null,
          cacheReadTokens: null,
          cacheWriteTokens: null,
          costUsd: null,
        },
      }),
    };

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.executorUsage?.outputTokens).toBeNull();
    expect(state.executorUsage?.costUsd).toBeNull();
  });

  it("rolls over to a fresh session when max turns made no changes", async () => {
    const fixture = createFixture("engineering");
    const first = new FakeInvoker([
      new AgentInvocationFailure(
        "claude 调用失败: max_turns, Reached maximum number of turns (40)",
        '{"type":"result","subtype":"error_max_turns"}\n',
        "",
        sessionFor("executor"),
      ),
    ]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      first,
      fixture.env,
    );

    expect(state.status).toBe("queued");
    expect(state.executorSession.sessionId).toBeNull();
    expect(state.executorSession.previousSessionIds).toContain(
      "00000000-0000-4000-8000-000000000001",
    );
  });

  it("stops after three max-turn sessions with no workspace progress", async () => {
    const fixture = createFixture("engineering");
    const maxTurnFailure = () =>
      new AgentInvocationFailure(
        "claude 调用失败: max_turns, Reached maximum number of turns (40)",
        '{"type":"result","subtype":"error_max_turns"}\n',
        "",
        sessionFor("executor"),
      );

    let state = fixture.state;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      state = await runManagedTask(
        fixture.root,
        fixture.contract.taskId,
        new FakeInvoker([maxTurnFailure()]),
        fixture.env,
      );
    }

    expect(state.status, state.blocker ?? "").toBe("waiting_for_human");
    expect(state.executorInvocations).toBe(3);
    expect(state.blocker).toContain("零源码进展");
  });

  it("resets max-turn streak after a human pause boundary", async () => {
    const fixture = createFixture("engineering");
    const failure = () =>
      new AgentInvocationFailure(
        "claude 调用失败: max_turns, Reached maximum number of turns (40)",
        '{"type":"result","subtype":"error_max_turns"}\n',
        "",
        sessionFor("executor"),
      );
    let state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([failure()]),
      fixture.env,
    );
    appendManagedEvent(state, {
      eventType: "human.pause_applied",
      actor: "user",
      role: "system",
      summary: "用户切换模型",
    });
    state.status = "queued";
    saveManagedRun(state);
    fixture.contract.status = "queued";
    saveManagedTask(fixture.contract);

    state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([failure()]),
      fixture.env,
    );

    expect(state.status).toBe("queued");
    expect(state.currentStep).toBe("executor_continuation_queued");
  });

  it("hands review to the current host without launching Codex CLI", async () => {
    const fixture = createFixture();
    const invoker = new FakeInvoker([executorReady("完成目标")]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
    expect(state.currentStep).toBe("external_supervisor_review_required");
    expect(state.pendingExternalReview?.promptPath).toContain(
      "host-review-1.md",
    );
    expect(state.totalAgentInvocations).toBe(1);
    expect(invoker.invocations).toHaveLength(1);
    expect(invoker.invocations[0].role).toBe("executor");
  });

  it("allows declared evidence updates during Host review", async () => {
    const fixture = createFixture("engineering");
    fs.mkdirSync(path.join(fixture.root, "reports"), { recursive: true });
    fs.mkdirSync(path.join(fixture.root, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.root, "reports", "e2e.json"),
      "before\n",
    );
    fs.writeFileSync(path.join(fixture.root, "src", "ticket.ts"), "before\n");
    const result = executorReady("完成目标");
    result.changedFiles = ["src/ticket.ts", "reports/e2e.json"];
    result.taskEvidence = [
      {
        taskId: "task-1",
        category: "local_required",
        owner: "executor",
        evidencePaths: ["reports/e2e.json"],
        verificationCommands: ["npm test"],
        changedFiles: ["src/ticket.ts"],
      },
    ];
    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([result]),
      fixture.env,
    );
    const contract = loadManagedTask(fixture.root, fixture.contract.taskId);
    const persisted = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      state.runId,
    );

    fs.writeFileSync(path.join(fixture.root, "reports", "e2e.json"), "after\n");
    expect(() =>
      submitExternalHostReviewResult(
        contract,
        persisted,
        reviewPass("证据复验通过"),
        contract.language,
        fixture.env,
      ),
    ).not.toThrow();

    await expect(
      runManagedTask(
        fixture.root,
        fixture.contract.taskId,
        new FakeInvoker([]),
        fixture.env,
      ),
    ).resolves.toMatchObject({ status: "release_ready" });
  });

  it("does not treat a Host-created acceptance report as an Executor omission", async () => {
    const fixture = createFixture("engineering");
    fs.mkdirSync(path.join(fixture.root, "reports"), { recursive: true });
    fs.mkdirSync(path.join(fixture.root, "src"), { recursive: true });
    fs.writeFileSync(path.join(fixture.root, "src", "ticket.ts"), "done\n");
    fs.writeFileSync(
      path.join(fixture.root, "reports", "executor-e2e.log"),
      "executor evidence\n",
    );
    const result = executorReady("完成目标并保留失败注入原始证据");
    result.changedFiles = ["src/ticket.ts", "reports/executor-e2e.log"];
    result.taskEvidence = [
      {
        taskId: "task-1",
        category: "local_required",
        owner: "executor",
        evidencePaths: ["reports/executor-e2e.log"],
        verificationCommands: ["npm test"],
        changedFiles: ["src/ticket.ts"],
      },
    ];
    result.commands.push({
      command: "bash scripts/acceptance-failure-drill.sh",
      exitCode: 1,
      result: "failure injection exited as expected",
      assertion: "negative",
    });
    const waitingForReview = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([result]),
      fixture.env,
    );
    expect(waitingForReview.status).toBe("waiting_for_host_review");
    const contract = loadManagedTask(fixture.root, fixture.contract.taskId);
    const persisted = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      waitingForReview.runId,
    );

    fs.writeFileSync(
      path.join(fixture.root, "reports", "host-independent-e2e.log"),
      "Host independently reran acceptance\n",
    );
    submitExternalHostReviewResult(
      contract,
      persisted,
      reviewPass("独立验收通过"),
      contract.language,
      fixture.env,
    );

    await expect(
      runManagedTask(
        fixture.root,
        fixture.contract.taskId,
        new FakeInvoker([]),
        fixture.env,
      ),
    ).resolves.toMatchObject({ status: "release_ready" });
  });

  it("rejects source changes during Host review", async () => {
    const fixture = createFixture("engineering");
    fs.mkdirSync(path.join(fixture.root, "reports"), { recursive: true });
    fs.mkdirSync(path.join(fixture.root, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.root, "reports", "e2e.json"),
      "before\n",
    );
    fs.writeFileSync(path.join(fixture.root, "src", "ticket.ts"), "before\n");
    const result = executorReady("完成目标");
    result.changedFiles = ["src/ticket.ts", "reports/e2e.json"];
    result.taskEvidence = [
      {
        taskId: "task-1",
        category: "local_required",
        owner: "executor",
        evidencePaths: ["reports/e2e.json"],
        verificationCommands: ["npm test"],
        changedFiles: ["src/ticket.ts"],
      },
    ];
    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([result]),
      fixture.env,
    );
    const contract = loadManagedTask(fixture.root, fixture.contract.taskId);
    const persisted = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      state.runId,
    );

    fs.writeFileSync(path.join(fixture.root, "src", "ticket.ts"), "after\n");
    expect(() =>
      submitExternalHostReviewResult(
        contract,
        persisted,
        reviewPass("证据复验通过"),
        contract.language,
        fixture.env,
      ),
    ).toThrow("Host 评审期间工作区已变化");
  });

  it("migrates a legacy contract without supervisor execution to host review", async () => {
    const fixture = createFixture();
    delete fixture.contract.supervisorExecution;
    fixture.contract.contractHash = calculateManagedContractHash(
      fixture.contract,
    );
    fixture.state.contractHash = fixture.contract.contractHash;
    saveManagedTask(fixture.contract);
    saveManagedRun(fixture.state);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([executorReady("完成目标")]),
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
    expect(state.currentStep).toBe("external_supervisor_review_required");
  });

  it("migrates an explicit legacy managed CLI contract without launching a supervisor", async () => {
    const fixture = createFixture();
    const legacy = fixture.contract as typeof fixture.contract & {
      supervisorExecution: string;
    };
    legacy.supervisorExecution = "managed_cli";
    fixture.contract.contractHash = calculateManagedContractHash(
      fixture.contract,
    );
    fixture.state.contractHash = fixture.contract.contractHash;
    saveManagedTask(fixture.contract);
    saveManagedRun(fixture.state);
    const invoker = new FakeInvoker([executorReady("完成目标")]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );
    const migrated = loadManagedTask(fixture.root, fixture.contract.taskId);

    expect(state.status).toBe("waiting_for_host_review");
    expect(migrated.supervisorExecution).toBe("external_host");
    expect(invoker.invocations.map((item) => item.role)).toEqual(["executor"]);
  });

  it("lets the current host review executor blockers before asking a human", async () => {
    const fixture = createFixture();
    const invoker = new FakeInvoker([
      executorBlocked("仍有环境和本地问题"),
      reviewNeedsFix(),
      executorReady("完成本地整改"),
      reviewPass("本地整改通过"),
    ]);

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("release_ready");
    expect(state.executorInvocations).toBe(2);
    expect(state.reviewInvocations).toBe(2);
    expect(invoker.invocations.every((item) => item.role === "executor")).toBe(
      true,
    );
  });

  it("stops early after three identical failed reviews", async () => {
    const fixture = createFixture();
    const outputs: Array<ExecutorResult | ReviewResult> = [];
    for (let round = 0; round < 5; round++) {
      outputs.push(executorReady(`执行 ${round + 1}`), reviewNeedsFix());
    }
    const invoker = new FakeInvoker(outputs);

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("repair_pending");
    expect(state.reviewInvocations).toBe(3);
    expect(state.executorInvocations).toBe(3);
    expect(state.totalAgentInvocations).toBe(3);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "review.convergence_stalled",
      ),
    ).toBe(true);
  });

  it("retains the hard review cap while findings keep converging", async () => {
    const fixture = createFixture();
    const outputs: Array<ExecutorResult | ReviewResult> = [];
    for (let round = 0; round < 5; round += 1) {
      const review = reviewNeedsFix();
      review.findings[0].id = `R-${round + 1}`;
      review.findings[0].target = `result-${round + 1}.txt`;
      outputs.push(executorReady(`执行 ${round + 1}`), review);
    }
    const invoker = new FakeInvoker(outputs);

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("repair_pending");
    expect(state.reviewInvocations).toBe(5);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "review.repair_pending",
      ),
    ).toBe(true);
  });

  it("automatically returns incomplete evidence to the executor", async () => {
    const fixture = createFixture("engineering");
    const incomplete = executorReady("只运行了单元测试");
    incomplete.commands = [
      { command: "npm test", exitCode: 0, result: "测试通过" },
      {
        command: "mysql -uuser -p'dev-secret' -e 'SELECT 1'",
        exitCode: 0,
        result: "数据库检查通过",
      },
    ];
    const complete = executorReady("测试和构建均已完成");
    complete.commands = [
      { command: "npm test", exitCode: 0, result: "测试通过" },
      { command: "npm run build", exitCode: 0, result: "构建通过" },
    ];
    const invoker = new FakeInvoker([
      incomplete,
      complete,
      reviewPass("证据完整"),
    ]);

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("release_ready");
    expect(state.executorInvocations).toBe(2);
    expect(state.reviewInvocations).toBe(1);
    const invalidFile = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      fixture.contract.taskId,
      "runs",
      state.runId,
      "executor-result-1-invalid.json",
    );
    expect(fs.existsSync(invalidFile)).toBe(true);
    const invalidResult = fs.readFileSync(invalidFile, "utf-8");
    expect(invalidResult).not.toContain("dev-secret");
    expect(invalidResult).toContain("<redacted>");
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "executor.self_repair_queued",
      ),
    ).toBe(true);
  });

  it("normalizes blank executor blockers without launching a repair", async () => {
    const fixture = createFixture("engineering");
    const output = executorReady("实现和验证均已完成");
    output.blockers = ["", "   "];
    output.commands = [
      { command: "npm test", exitCode: 0, result: "测试通过" },
      { command: "npm run build", exitCode: 0, result: "构建通过" },
    ];

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([output]),
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(1);
    expect(state.executorSelfRepairCount).toBe(0);
  });

  it("accepts a positive pgrep inspection that proves no process remains", async () => {
    const fixture = createFixture("engineering");
    const output = executorReady("实现和验证均已完成");
    output.commands = [
      { command: "npm test", exitCode: 0, result: "测试通过" },
      { command: "npm run build", exitCode: 0, result: "构建通过" },
      {
        command: "pgrep -fl 'superflow.r29.nonce'",
        exitCode: 1,
        result: "no R29 JVM processes remain",
        assertion: "positive",
      },
    ];

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([output]),
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(1);
    expect(state.executorSelfRepairCount).toBe(0);
  });

  it("opens the token circuit before another executor invocation", async () => {
    const fixture = createFixture("engineering");
    const persisted = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      fixture.state.runId,
    );
    persisted.executorUsage = {
      inputTokens: 9_000_000,
      outputTokens: 2_000_000,
      cacheReadTokens: 1_400_000,
      cacheWriteTokens: 0,
      costUsd: 4,
    };
    saveManagedRun(persisted);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([]),
      fixture.env,
    );

    expect(state.status).toBe("budget_exhausted");
    expect(state.executorInvocations).toBe(0);
    expect(state.blocker).toContain("Token 熔断");
  });

  it("does not count repeated input context as active token circuit usage", async () => {
    const fixture = createFixture("engineering");
    const persisted = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      fixture.state.runId,
    );
    persisted.executorUsage = {
      inputTokens: 9_000_000,
      outputTokens: 100_000,
      cacheReadTokens: 20_000_000,
      cacheWriteTokens: 0,
      costUsd: null,
    };
    saveManagedRun(persisted);

    const output = executorReady("长上下文复用后完成");
    output.commands = [
      { command: "npm test", exitCode: 0, result: "真实模块测试通过" },
      { command: "npm run build", exitCode: 0, result: "构建通过" },
    ];
    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([output]),
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(1);
  });

  it("forwards real workspace changes to Host when write telemetry is absent", async () => {
    const fixture = createFixture("engineering");
    fs.writeFileSync(path.join(fixture.root, "prompt.md"), "frozen\n");
    const stateBefore = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      fixture.state.runId,
    );
    stateBefore.baselineWorkspaceFiles = {
      ...stateBefore.baselineWorkspaceFiles,
      [`${fixture.root}::prompt.md`]: createHash("sha256")
        .update("frozen\n")
        .digest("hex"),
    };
    saveManagedRun(stateBefore);
    const invoker: AgentInvoker = {
      invoke: async <T>(): Promise<AgentInvocationResult<T>> => {
        fs.writeFileSync(path.join(fixture.root, "result.txt"), "done\n");
        const output = executorReady("通过 Bash 完成实现和验证");
        output.changedFiles = ["prompt.md", "result.txt"];
        output.commands = [
          { command: "npm test", exitCode: 0, result: "passed" },
          { command: "npm run build", exitCode: 0, result: "passed" },
        ];
        const now = new Date().toISOString();
        return {
          sessionId: sessionFor("executor"),
          output: output as T,
          stdout: "",
          stderr: "",
          exitCode: 0,
          telemetry: {
            phase: "tool_running",
            model: "test-model",
            tools: ["Read", "Bash", "StructuredOutput"],
            toolUses: ["Read", "Bash", "StructuredOutput"],
            plugins: [],
            lastOutputAt: now,
            lastProgressAt: now,
            lastProgressReason: "agent_result",
            permissionDenials: 0,
          },
        };
      },
    };

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(1);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "executor.write_telemetry_inferred",
      ),
    ).toBe(true);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "executor.self_repair_queued",
      ),
    ).toBe(false);
  });

  it("does not count cache reads as active token circuit usage", async () => {
    const fixture = createFixture("engineering");
    fs.writeFileSync(
      path.join(fixture.root, "package.json"),
      JSON.stringify({ scripts: { test: "node --test" } }),
    );
    const persisted = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      fixture.state.runId,
    );
    persisted.executorUsage = {
      inputTokens: 100_000,
      outputTokens: 40_000,
      cacheReadTokens: 8_000_000,
      cacheWriteTokens: 0,
      costUsd: 5,
    };
    saveManagedRun(persisted);

    const output = executorReady("缓存复用后完成");
    output.commands = [
      { command: "npm test", exitCode: 0, result: "真实模块测试通过" },
    ];
    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([output]),
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(1);
  });

  it("fills omitted changedFiles from the frozen workspace baseline", async () => {
    const fixture = createFixture("engineering");
    let invocation = 0;
    const invoker: AgentInvoker = {
      invoke: async <T>(): Promise<AgentInvocationResult<T>> => {
        invocation += 1;
        if (invocation === 1) {
          fs.writeFileSync(path.join(fixture.root, "result.txt"), "done\n");
        }
        const output = executorReady("完成并验证");
        output.changedFiles = [];
        output.commands = [
          { command: "npm test", exitCode: 0, result: "passed" },
          { command: "npm run build", exitCode: 0, result: "passed" },
        ];
        return {
          sessionId: sessionFor("executor"),
          output: output as T,
          stdout: "",
          stderr: "",
          exitCode: 0,
        };
      },
    };

    let state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );
    while (state.status === "running") {
      state = await runManagedTask(
        fixture.root,
        fixture.contract.taskId,
        invoker,
        fixture.env,
      );
    }

    expect(state.status).toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(1);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "executor.result_rejected",
      ),
    ).toBe(false);
    const result = JSON.parse(
      fs.readFileSync(state.lastExecutorResult!, "utf-8"),
    ) as ExecutorResult;
    expect(result.changedFiles).toContain("result.txt");
  });

  it("escalates a repeated mechanical rejection to the host", async () => {
    const fixture = createFixture("engineering");
    const incomplete = executorReady("只运行了单元测试");
    incomplete.commands = [
      { command: "npm test", exitCode: 0, result: "测试通过" },
    ];
    const invoker = new FakeInvoker([incomplete, incomplete]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(2);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "executor.rejection_escalated_to_host",
      ),
    ).toBe(true);
  });

  it("does not retry after repeated executor permission denials", async () => {
    const fixture = createFixture("engineering");
    const incomplete = executorReady("权限受限，只完成单元测试");
    incomplete.commands = [
      { command: "npm test", exitCode: 0, result: "测试通过" },
    ];
    const now = new Date().toISOString();
    const invoker: AgentInvoker = {
      invoke: async <T>(): Promise<AgentInvocationResult<T>> => ({
        sessionId: sessionFor("executor"),
        output: incomplete as T,
        stdout: "",
        stderr: "",
        exitCode: 0,
        telemetry: {
          phase: "tool_running",
          model: "test-model",
          tools: ["Read", "Bash", "StructuredOutput"],
          toolUses: ["Bash"],
          plugins: [],
          lastOutputAt: now,
          lastProgressAt: now,
          lastProgressReason: "structured_output",
          permissionDenials: 3,
        },
      }),
    };

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(1);
    expect(
      readManagedEvents(state).some(
        (event) =>
          event.eventType === "executor.rejection_escalated_to_host" &&
          event.summary.includes("权限拒绝过多"),
      ),
    ).toBe(true);
  });

  it("accepts one real test category for an explicit pure library", async () => {
    const fixture = createFixture("engineering");
    fs.writeFileSync(
      path.join(fixture.root, "package.json"),
      JSON.stringify({ scripts: { test: "node --test" } }),
    );
    const output = executorReady("纯函数库测试完成");
    output.commands = [
      {
        command: "npm test",
        exitCode: 0,
        result: "真实加载模块并完成函数断言",
        categories: ["test"],
      },
    ];
    const invoker = new FakeInvoker([output, reviewPass("纯函数库评审通过")]);

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("release_ready");
    expect(state.executorInvocations).toBe(1);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "executor.result_rejected",
      ),
    ).toBe(false);
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

  it("accepts protocol-approved no-match inspection exit codes", async () => {
    const fixture = createFixture("engineering");
    const output = executorReady("验证完成且没有残留进程");
    output.commands = [
      { command: "npm test", exitCode: 0, result: "测试通过" },
      { command: "npm run build", exitCode: 0, result: "构建通过" },
      {
        command: "pgrep -f 'node src/server'",
        exitCode: 1,
        result: "none — no orphan processes",
      },
      {
        command: "lsof -i :19260 && lsof -i :19360",
        exitCode: 1,
        result: "empty output — no process bound",
      },
    ];

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([output]),
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(1);
  });

  it("rejects plaintext credentials written into changed artifacts", async () => {
    const fixture = createFixture("engineering");
    const output = executorReady("验证完成");
    output.commands = [
      { command: "npm test", exitCode: 0, result: "测试通过" },
      { command: "npm run build", exitCode: 0, result: "构建通过" },
    ];

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([output], () => {
        fs.writeFileSync(
          path.join(fixture.root, "test-report.md"),
          "mysql -uuser -p'workspace-secret' -e 'SELECT 1'\n",
          "utf-8",
        );
      }),
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_host_review");
    expect(state.executorSelfRepairCount).toBe(0);
    const events = readManagedEvents(state);
    expect(
      events.some((event) => event.summary.includes("工作区存在疑似明文凭据")),
    ).toBe(true);
    const invalid = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      fixture.contract.taskId,
      "runs",
      state.runId,
      "executor-result-1-invalid.json",
    );
    expect(fs.readFileSync(invalid, "utf-8")).not.toContain("workspace-secret");
  });

  it("accepts an E2E evidence directory for Host review", async () => {
    const fixture = createFixture("engineering");
    const output = executorReady("真实 HTTP E2E 已完成");
    output.evidence = ["e2e-results"];

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([output], () => {
        fs.writeFileSync(path.join(fixture.root, "result.txt"), "done\n");
        const evidence = path.join(fixture.root, "e2e-results");
        fs.mkdirSync(evidence);
        fs.writeFileSync(path.join(evidence, "response.json"), "{}\n");
      }),
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(1);
  });

  it("accepts recovery results for changes written by an earlier invocation", async () => {
    const fixture = createFixture("engineering");
    const persisted = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      fixture.state.runId,
    );
    persisted.baselineCapturedAt = new Date().toISOString();
    persisted.executorInvocations = 1;
    persisted.totalAgentInvocations = 1;
    saveManagedRun(persisted);
    fs.writeFileSync(path.join(fixture.root, "result.txt"), "done\n");
    const output = executorReady("恢复会话复核既有改动并完成验证");
    output.changedFiles = ["result.txt"];
    output.commands = [
      { command: "npm test", exitCode: 0, result: "passed" },
      { command: "npm run build", exitCode: 0, result: "passed" },
    ];
    const now = new Date().toISOString();
    const invoker: AgentInvoker = {
      invoke: async <T>(): Promise<AgentInvocationResult<T>> => ({
        sessionId: sessionFor("executor"),
        output: output as T,
        stdout: "",
        stderr: "",
        exitCode: 0,
        telemetry: {
          phase: "tool_running",
          model: "test-model",
          tools: ["Read", "Bash", "StructuredOutput"],
          toolUses: ["Read", "Bash"],
          plugins: [],
          lastOutputAt: now,
          lastProgressAt: now,
          lastProgressReason: "structured_output",
        },
      }),
    };

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    const events = readManagedEvents(state);
    expect(
      state.status,
      events.map((event) => `${event.eventType}: ${event.summary}`).join("\n"),
    ).toBe("waiting_for_host_review");
    expect(
      events.some((event) => event.eventType === "executor.result_rejected"),
    ).toBe(false);
    const handoff = fs.readFileSync(
      path.join(
        fixture.root,
        ".superflow",
        "tasks",
        fixture.contract.taskId,
        "runs",
        state.runId,
        "executor-handoff-2.md",
      ),
      "utf-8",
    );
    expect(handoff).toContain("必须完整上报的 changedFiles");
    expect(handoff).toContain("- result.txt");
  });

  it("refreshes the managed executor policy on every invocation", async () => {
    const fixture = createFixture();
    const policy = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      fixture.contract.taskId,
      "runs",
      fixture.state.runId,
      "managed-executor-policy.md",
    );
    fs.writeFileSync(policy, "stale policy\n");
    fs.writeFileSync(path.join(fixture.root, "pom.xml"), "<project />\n");
    fs.writeFileSync(path.join(fixture.root, "AGENTS.md"), "# rules\n");
    fs.mkdirSync(path.join(fixture.root, ".claude", "rules"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(fixture.root, ".claude", "rules", "java.md"),
      "# java\n",
    );
    writeManagedContextManifest(fixture.contract);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([executorReady("完成目标")]),
      fixture.env,
    );

    const refreshed = fs.readFileSync(policy, "utf-8");
    expect(refreshed).not.toContain("stale policy");
    expect(refreshed).toContain("no Superflow max-turn limit");
    expect(refreshed).toContain("# Compact Instructions");
    expect(refreshed).toContain("Selected rule scenarios: core, java");
    expect(refreshed).toContain("frozen prompt path and hash");
    expect(refreshed).toContain("executable paths");
    expect(refreshed).toContain("do not probe tool availability");
    expect(refreshed).toContain("successful gate evidence only");
    expect(refreshed).toContain(path.join(fixture.root, "AGENTS.md"));
    expect(refreshed).toContain(
      path.join(fixture.root, ".claude", "rules", "java.md"),
    );
    expect(refreshed).toContain("superflow-managed-executor-preflight.mjs");
    expect(
      readManagedEvents(state).some(
        (event) =>
          event.eventType === "executor.stage_changed" &&
          event.summary.includes("源码与规则检索"),
      ),
    ).toBe(true);
  });

  it("accepts one integration test command as test, startup, and HTTP evidence", async () => {
    const fixture = createFixture("engineering");
    const output = executorReady("真实进程接口测试完成");
    output.commands = [
      {
        command: "npm test",
        exitCode: 0,
        result:
          "16 pass; spawned real node application process and completed real TCP HTTP 200/400 requests",
      },
    ];

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([output]),
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
  });

  it("recognizes dynamic-port curl integration evidence", async () => {
    const fixture = createFixture("engineering");
    const output = executorReady("动态端口真实 curl 验证完成");
    output.commands = [
      {
        command: "npm test",
        exitCode: 0,
        result:
          "16/16 pass; L3 uses dynamic port to start node server and real curl HTTP 200/400 responses",
      },
    ];

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      new FakeInvoker([output]),
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
    const stored = JSON.parse(
      fs.readFileSync(state.lastExecutorResult!, "utf-8"),
    ) as ExecutorResult;
    expect(stored.commands[0].categories).toEqual(
      expect.arrayContaining(["test", "startup", "invocation"]),
    );
  });

  it("requires Spring Boot startup and a real HTTP invocation", async () => {
    const fixture = createFixture("engineering");
    fs.writeFileSync(
      path.join(fixture.root, "pom.xml"),
      "<project><artifactId>spring-boot-starter-web</artifactId></project>",
    );
    const incomplete = executorReady("测试和编译完成");
    incomplete.commands = [
      { command: "mvn test", exitCode: 0, result: "Tests run: 8" },
      { command: "mvn compile", exitCode: 0, result: "BUILD SUCCESS" },
    ];
    const complete = executorReady("启动和接口调用完成");
    complete.commands = [
      ...incomplete.commands,
      {
        command: "mvn spring-boot:run",
        exitCode: 0,
        result: "Started Application",
      },
      {
        command: "curl http://127.0.0.1:8080/health",
        exitCode: 0,
        result: "HTTP 200",
      },
    ];
    const invoker = new FakeInvoker([
      incomplete,
      complete,
      reviewPass("运行证据完整"),
    ]);

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("release_ready");
    expect(state.executorInvocations).toBe(2);
    expect(
      readManagedEvents(state).some(
        (event) =>
          event.eventType === "executor.self_repair_queued" &&
          event.summary.includes("启动应用"),
      ),
    ).toBe(true);
  });

  it("routes an invocation-category ambiguity to Host without another executor call", async () => {
    const fixture = createFixture("engineering");
    fs.writeFileSync(
      path.join(fixture.root, "pom.xml"),
      "<project><artifactId>spring-boot-starter-web</artifactId></project>",
    );
    const evidence = path.join(fixture.root, "acceptance.log");
    fs.writeFileSync(evidence, "real HTTP acceptance completed\n", "utf-8");
    const output = executorReady("单命令真实验收完成");
    output.commands = [
      {
        command: "bash scripts/acceptance.sh",
        exitCode: 0,
        result: "acceptance GREEN and zero residue confirmed",
        categories: ["build", "test", "startup", "runtime"],
      },
    ];
    output.evidence = [evidence];
    const invoker = new FakeInvoker([
      output,
      reviewPass("原始日志证明真实 HTTP 已完成，批准审计式晋升"),
    ]);

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("release_ready");
    expect(state.executorInvocations).toBe(1);
    expect(state.executorSelfRepairCount).toBe(0);
    expect(state.reviewInvocations).toBe(1);
    expect(
      readManagedEvents(state).some(
        (event) =>
          event.eventType ===
          "executor.verification_metadata_escalated_to_host",
      ),
    ).toBe(true);
    expect(
      readManagedEvents(state).some(
        (event) =>
          event.eventType === "executor.verification_metadata_host_promoted",
      ),
    ).toBe(true);
    const accepted = JSON.parse(
      fs.readFileSync(state.lastExecutorResult!, "utf-8"),
    ) as ExecutorResult;
    expect(accepted.commands[0].categories).toContain("invocation");
  });

  it("reuses valid Spring Boot evidence after review repair", async () => {
    const fixture = createFixture("engineering");
    fs.writeFileSync(
      path.join(fixture.root, "pom.xml"),
      "<project><artifactId>spring-boot-starter-web</artifactId></project>",
    );
    const initial = executorReady("首轮端到端验证完成");
    initial.commands = [
      {
        command: "mvn spring-boot:run",
        exitCode: 0,
        result: "Started Application",
      },
      {
        command: "curl http://127.0.0.1:8080/health",
        exitCode: 0,
        result: "HTTP 200",
      },
    ];
    const repaired = executorReady("完成代码评审整改和回归单测");
    repaired.commands = [
      { command: "mvn test", exitCode: 0, result: "Tests run: 8" },
    ];
    const invoker = new FakeInvoker([
      initial,
      reviewNeedsFix(),
      repaired,
      reviewPass("整改通过"),
    ]);

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("release_ready");
    expect(state.executorInvocations).toBe(2);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "executor.result_rejected",
      ),
    ).toBe(false);
  });

  it("merges valid evidence from a rejected executor result", async () => {
    const fixture = createFixture("engineering");
    fs.writeFileSync(
      path.join(fixture.root, "pom.xml"),
      "<project><artifactId>spring-boot-starter-web</artifactId></project>",
    );
    const initial = executorReady("端到端验证完成但清理证据格式错误");
    initial.commands = [
      {
        command: "java -jar app.jar",
        exitCode: 143,
        result: "Application started; SIGTERM exit code 143",
        categories: ["startup"],
      },
      {
        command: "curl http://127.0.0.1:8080/api/demo",
        exitCode: 0,
        result: "HTTP 200",
        categories: ["invocation"],
      },
      {
        command: "ps -ef | grep app.jar",
        exitCode: 1,
        result: "unexpected command failure",
      },
    ];
    const repaired = executorReady("移除错误的清理命令");
    repaired.commands = [
      { command: "mvn test", exitCode: 0, result: "Tests run: 8" },
      { command: "mvn package", exitCode: 0, result: "BUILD SUCCESS" },
    ];
    const invoker = new FakeInvoker([
      initial,
      repaired,
      reviewPass("历史运行证据与当前测试均通过"),
    ]);

    const state = await runManagedTaskWithHostReviews(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("release_ready");
    expect(state.executorInvocations).toBe(2);
    const accepted = JSON.parse(
      fs.readFileSync(state.lastExecutorResult!, "utf-8"),
    ) as ExecutorResult;
    expect(accepted.commands.flatMap((command) => command.categories)).toEqual(
      expect.arrayContaining(["startup", "invocation"]),
    );
    expect(
      accepted.commands.some((command) => command.command.startsWith("ps ")),
    ).toBe(false);
  });

  it("accepts an explicit negative process assertion", async () => {
    const fixture = createFixture();
    const result = executorReady("清理验证完成");
    result.commands.push({
      command: "ps -ef | grep app.jar",
      exitCode: 1,
      result: "未发现残留进程",
      assertion: "negative",
    });
    const invoker = new FakeInvoker([result]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(1);
  });

  it("accepts explicit no-residue evidence from a legacy ls pipe assertion", async () => {
    const fixture = createFixture();
    const result = executorReady("清理验证完成");
    result.commands.push({
      command: "ls /private/tmp | grep managed-r42",
      exitCode: 1,
      result: "no-residue: managed-r42 is absent",
      assertion: "positive",
    });
    const invoker = new FakeInvoker([result]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(1);
  });

  it("does not let a negative assertion hide a failed build", async () => {
    const fixture = createFixture();
    const result = executorReady("构建失败");
    result.commands = [
      {
        command: "npm run build",
        exitCode: 1,
        result: "BUILD FAILED",
        assertion: "negative",
      },
    ];
    const invoker = new FakeInvoker([result]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(1);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "executor.rejection_escalated_to_host",
      ),
    ).toBe(true);
  });

  it("does not rerun Executor for raw expected-failure evidence", async () => {
    const fixture = createFixture();
    const result = executorReady("失败注入验证完成");
    result.commands.push({
      command: "bash scripts/acceptance.sh fail-http",
      exitCode: 1,
      result: "预期 HTTP 断言失败，cleanup 已完成",
      assertion: "negative",
    });
    const invoker = new FakeInvoker([result]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(1);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "executor.rejection_escalated_to_host",
      ),
    ).toBe(true);
  });

  it("preserves raw logs and queues one bounded recovery when delivery JSON cannot be parsed", async () => {
    const fixture = createFixture();
    const failure = Object.assign(new Error("Agent 最终输出不是 JSON"), {
      stdout: "模型已经修改文件，但最终只返回了自然语言",
      stderr: "schema parse failed",
    });
    const invoker = new FakeInvoker([failure, executorReady("补齐结构化交付")]);

    let state = await runManagedTask(
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

    expect(state.status).toBe("queued");
    expect(
      fs.readFileSync(
        path.join(runDir, "executor-1-failed-events.jsonl"),
        "utf-8",
      ),
    ).toContain("模型已经修改文件");
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "executor.invocation_failed",
      ),
    ).toBe(true);
    expect(
      readManagedEvents(state).some(
        (event) =>
          event.eventType === "executor.delivery_protocol_recovery_queued",
      ),
    ).toBe(true);

    state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_host_review");
    expect(state.executorInvocations).toBe(2);
  });

  it("stops after the bounded delivery JSON recovery is exhausted", async () => {
    const fixture = createFixture();
    const failure = () =>
      Object.assign(new Error("Agent 最终输出不是 JSON"), {
        stdout: "模型只返回自然语言",
        stderr: "schema parse failed",
      });
    const invoker = new FakeInvoker([failure(), failure()]);

    let state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );
    expect(state.status).toBe("queued");

    state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_human");
    expect(state.blocker).toContain("连续两次");
  });

  it("ignores telemetry and progress delivered after an invocation failure", async () => {
    const fixture = createFixture();
    const failure = new AgentInvocationFailure(
      "Single Agent invocation exceeded 7200000ms",
      "",
      "",
      "00000000-0000-4000-8000-000000000001",
    );
    const invoker = new FakeInvoker([failure], (invocation) => {
      setTimeout(() => {
        invocation.onTelemetry?.({
          phase: "tool_running",
          model: "late-model",
          tools: ["Bash"],
          toolUses: ["Bash"],
          plugins: [],
          lastOutputAt: new Date().toISOString(),
          lastProgressAt: new Date().toISOString(),
          lastProgressReason: "late_callback",
          permissionDenials: 0,
        });
        invocation.onProgress?.("superflow-stage:implementation");
      }, 0);
    });

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    const persisted = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      state.runId,
    );

    expect(persisted.status).toBe("waiting_for_human");
    expect(persisted.currentStep).toBe("waiting_for_human");
    expect(persisted.runtimeTelemetry?.lastProgressReason).not.toBe(
      "late_callback",
    );
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
    const invoker = new FakeInvoker([
      executorReady("完成目标"),
      reviewPass("证据完整"),
    ]);

    let state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );
    fs.unlinkSync(resultFile);
    const contract = loadManagedTask(fixture.root, fixture.contract.taskId);
    const persisted = loadManagedRun(
      fixture.root,
      fixture.contract.taskId,
      state.runId,
    );
    persisted.lastExecutorResult = path.join(
      path.dirname(resultFile),
      "executor-result-e503-local-missing.json",
    );
    submitExternalHostReviewResult(
      contract,
      persisted,
      invoker.nextReview(),
      contract.language,
      fixture.env,
    );

    state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status, state.blocker ?? "").toBe("waiting_for_human");
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

    expect(state.status).toBe("release_ready");
    expect(invoker.invocations).toHaveLength(0);
  });

  it("revalidates an invalid executor artifact after a passing host review", async () => {
    const fixture = createFixture();
    const runDir = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      fixture.contract.taskId,
      "runs",
      fixture.state.runId,
    );
    const invalidFile = path.join(runDir, "executor-result-1-invalid.json");
    const acceptedFile = path.join(runDir, "executor-result-1.json");
    const reviewFile = path.join(runDir, "review-result-1.json");
    const invalidResult = executorReady("完成目标");
    fs.writeFileSync(path.join(fixture.root, "Feature.vue"), "<template />\n");
    invalidResult.changedFiles = ["Feature.vue"];
    invalidResult.commands.push({
      command: "bash scripts/acceptance.sh",
      exitCode: 0,
      result: "前端 dev server 与 Playwright E2E 已由 Host 核对通过",
      categories: ["startup", "test", "invocation"],
    });
    invalidResult.commands.push({
      command: "bash scripts/acceptance.sh fail-http",
      exitCode: 1,
      result: "预期失败已由验收入口捕获",
      assertion: "negative",
    });
    fs.writeFileSync(invalidFile, JSON.stringify(invalidResult));
    fs.writeFileSync(reviewFile, JSON.stringify(reviewPass("检查已通过")));
    fixture.state.executorInvocations = 1;
    fixture.state.reviewInvocations = 1;
    fixture.state.reviewRound = 1;
    fixture.state.totalAgentInvocations = 1;
    fixture.state.lastExecutorResult = invalidFile;
    fixture.state.lastReviewResult = reviewFile;
    fixture.state.executorSession.sessionId = sessionFor("executor");
    fs.appendFileSync(
      path.join(runDir, "task-report.md"),
      "\n## 当前阻塞\n\n旧的机械门禁已转 Host。\n",
    );
    saveManagedRun(fixture.state);
    const invoker = new FakeInvoker([]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("release_ready");
    expect(state.lastExecutorResult).toBe(acceptedFile);
    expect(fs.existsSync(acceptedFile)).toBe(true);
    expect(invoker.invocations).toHaveLength(0);
    const accepted = JSON.parse(
      fs.readFileSync(acceptedFile, "utf-8"),
    ) as ExecutorResult;
    expect(accepted.commands.some((command) => command.exitCode !== 0)).toBe(
      false,
    );
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "executor.result_revalidated",
      ),
    ).toBe(true);
    const report = fs.readFileSync(
      path.join(runDir, "task-report.md"),
      "utf-8",
    );
    expect(report).not.toContain("## 当前阻塞");
    expect(report).toContain("## 历史阻塞（已解除）");
  });

  it("revalidates external host evidence across invalid executor rounds", async () => {
    const fixture = createFixture("sdd");
    fs.writeFileSync(path.join(fixture.root, "pom.xml"), "<project/>");
    const runDir = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      fixture.contract.taskId,
      "runs",
      fixture.state.runId,
    );
    const runtimeResult = executorReady("真实运行完成");
    runtimeResult.commands = [
      {
        command: "ls /tmp/nonexistent-round-* 2>/dev/null || echo ABSENT",
        exitCode: 2,
        result: "旧轮次错误记录了内部 ls 退出码",
        assertion: "negative",
      },
      {
        command: "java -jar app.jar",
        exitCode: 143,
        result: "Spring Boot application started; SIGTERM exit code 143",
        categories: ["startup"],
      },
      {
        command: "curl http://127.0.0.1:8080/api/demo",
        exitCode: 0,
        result: "HTTP 200",
        categories: ["invocation"],
      },
    ];
    const repairResult = executorReady("本地整改完成");
    repairResult.changedFiles = ["pom.xml"];
    repairResult.commands = [
      {
        command: "mvn test",
        exitCode: 0,
        result: "Tests passed",
        categories: ["test"],
      },
      {
        command: "mvn package",
        exitCode: 0,
        result: "Build passed",
        categories: ["build"],
      },
    ];
    const firstInvalid = path.join(runDir, "executor-result-1-invalid.json");
    const secondInvalid = path.join(runDir, "executor-result-2-invalid.json");
    const accepted = path.join(runDir, "executor-result-2.json");
    const reviewFile = path.join(runDir, "review-result-1.json");
    fs.writeFileSync(firstInvalid, JSON.stringify(runtimeResult));
    fs.writeFileSync(secondInvalid, JSON.stringify(repairResult));
    fs.writeFileSync(reviewFile, JSON.stringify(reviewPass("检查已通过")));
    fixture.state.executorInvocations = 2;
    fixture.state.reviewInvocations = 1;
    fixture.state.reviewRound = 1;
    fixture.state.totalAgentInvocations = 2;
    fixture.state.lastExecutorResult = secondInvalid;
    fixture.state.lastReviewResult = reviewFile;
    fixture.state.executorSession.sessionId = sessionFor("executor");
    saveManagedRun(fixture.state);
    const invoker = new FakeInvoker([]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("release_ready");
    expect(state.lastExecutorResult).toBe(accepted);
    const acceptedResult = JSON.parse(
      fs.readFileSync(accepted, "utf-8"),
    ) as ExecutorResult;
    expect(
      acceptedResult.commands.flatMap((command) => command.categories),
    ).toEqual(
      expect.arrayContaining(["startup", "invocation", "test", "build"]),
    );
    expect(
      acceptedResult.commands.some((command) =>
        command.command.startsWith("ls "),
      ),
    ).toBe(false);
    expect(invoker.invocations).toHaveLength(0);
  });

  it("aggregates verification evidence from all executor results", async () => {
    const fixture = createFixture("engineering");
    const runDir = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      fixture.contract.taskId,
      "runs",
      fixture.state.runId,
    );
    const firstResult = executorBlocked("测试已通过，仍需构建");
    firstResult.commands = [
      { command: "npm test", exitCode: 0, result: "测试通过" },
    ];
    const finalResult = executorBlocked("构建已通过，环境联调待发布前完成");
    finalResult.commands = [
      {
        command: "./node_modules/.bin/vite build --mode production",
        exitCode: 0,
        result: "构建通过",
      },
    ];
    const firstExecutorFile = path.join(runDir, "executor-result-1.json");
    const finalExecutorFile = path.join(runDir, "executor-result-2.json");
    const reviewFile = path.join(runDir, "review-result-1.json");
    fs.writeFileSync(firstExecutorFile, JSON.stringify(firstResult));
    fs.writeFileSync(finalExecutorFile, JSON.stringify(finalResult));
    fs.writeFileSync(reviewFile, JSON.stringify(reviewPass("源码交付通过")));
    fixture.state.executorInvocations = 2;
    fixture.state.reviewInvocations = 1;
    fixture.state.reviewRound = 1;
    fixture.state.totalAgentInvocations = 3;
    fixture.state.lastExecutorResult = finalExecutorFile;
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

    expect(state.status, state.blocker ?? "").toBe("release_ready");
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

  it("credits temporary connection failures while still opening the circuit after three attempts", async () => {
    const fixture = createFixture();
    let state = fixture.state;

    for (let attempt = 0; attempt < 3; attempt++) {
      state = await runManagedTask(
        fixture.root,
        fixture.contract.taskId,
        new FakeInvoker([
          new Error("API Error: Unable to connect to API (ConnectionRefused)"),
        ]),
        fixture.env,
      );
    }

    expect(state.status).toBe("waiting_for_human");
    expect(state.currentStep).toBe("provider_change_required");
    expect(state.consecutiveTransientProviderFailures).toBe(3);
    expect(state.connectivityRetryCount).toBe(3);
    expect(state.executorInvocationCredits).toBe(3);
    expect(state.totalAgentInvocationCredits).toBe(3);
    expect(
      readManagedEvents(state).filter(
        (event) => event.eventType === "budget.transient_provider_credited",
      ),
    ).toHaveLength(3);
  });

  it("credits a temporary provider overload and extends the Claude window", async () => {
    const fixture = createFixture();
    fixture.contract.budgets.executorPhysicalStopAt = 3;
    fixture.contract.contractHash = calculateManagedContractHash(
      fixture.contract,
    );
    fixture.state.contractHash = fixture.contract.contractHash;
    saveManagedTask(fixture.contract);
    saveManagedRun(fixture.state);
    const invoker = new FakeInvoker([
      new Error("API Error: 529 model overloaded, try again later"),
    ]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_connectivity");
    expect(state.executorInvocations).toBe(1);
    expect(state.executorInvocationCredits).toBe(1);
    expect(state.totalAgentInvocationCredits).toBe(1);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "budget.transient_provider_credited",
      ),
    ).toBe(true);
    const task = JSON.parse(
      fs.readFileSync(
        path.join(
          fixture.root,
          ".superflow",
          "tasks",
          fixture.contract.taskId,
          "task.json",
        ),
        "utf-8",
      ),
    );
    expect(task.budgets.executorPhysicalStopAt).toBe(4);
    expect(state.contractHash).toBe(task.contractHash);
  });

  it("does not credit a permanent Token Plan exhaustion", async () => {
    const fixture = createFixture();
    fixture.contract.budgets.executorPhysicalStopAt = 3;
    fixture.contract.contractHash = calculateManagedContractHash(
      fixture.contract,
    );
    fixture.state.contractHash = fixture.contract.contractHash;
    saveManagedTask(fixture.contract);
    saveManagedRun(fixture.state);
    const invoker = new FakeInvoker([
      new Error("HTTP 429 Token Plan 用量上限，错误码 2056"),
    ]);

    const state = await runManagedTask(
      fixture.root,
      fixture.contract.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("waiting_for_provider_change");
    expect(state.executorInvocationCredits).toBe(0);
    expect(state.totalAgentInvocationCredits).toBe(0);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "budget.transient_provider_credited",
      ),
    ).toBe(false);
  });

  it("opens a circuit after three consecutive transient provider failures", async () => {
    const fixture = createFixture();
    fixture.contract.budgets.executorPhysicalStopAt = 3;
    fixture.contract.contractHash = calculateManagedContractHash(
      fixture.contract,
    );
    fixture.state.contractHash = fixture.contract.contractHash;
    saveManagedTask(fixture.contract);
    saveManagedRun(fixture.state);

    let state = fixture.state;
    for (let attempt = 0; attempt < 3; attempt++) {
      state = await runManagedTask(
        fixture.root,
        fixture.contract.taskId,
        new FakeInvoker([new Error("API Error: 529 model overloaded")]),
        fixture.env,
      );
    }

    expect(state.status).toBe("waiting_for_human");
    expect(state.currentStep).toBe("provider_change_required");
    expect(state.consecutiveTransientProviderFailures).toBe(3);
    expect(state.executorInvocations).toBe(3);
    expect(state.executorInvocationCredits).toBe(3);
    expect(
      readManagedEvents(state).some(
        (event) => event.eventType === "connectivity.circuit_open",
      ),
    ).toBe(true);
  });
});

class FakeInvoker implements AgentInvoker {
  readonly invocations: AgentInvocation[] = [];
  private readonly executorOutputs: Array<ExecutorResult | Error>;
  private readonly reviews: ReviewResult[];
  private index = 0;

  constructor(
    outputs: Array<ExecutorResult | ReviewResult | Error>,
    private readonly onInvoke?: (invocation: AgentInvocation) => void,
  ) {
    this.executorOutputs = outputs.filter(
      (output): output is ExecutorResult | Error =>
        output instanceof Error || !("result" in output),
    );
    this.reviews = outputs.filter(
      (output): output is ReviewResult =>
        !(output instanceof Error) && "result" in output,
    );
  }

  async invoke<T>(
    invocation: AgentInvocation,
  ): Promise<AgentInvocationResult<T>> {
    this.invocations.push(invocation);
    this.onInvoke?.(invocation);
    const sessionId = invocation.sessionId ?? sessionFor(invocation.role);
    invocation.onSession?.(sessionId);
    const output = this.executorOutputs[this.index++];
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

  nextReview(): ReviewResult {
    const review = this.reviews.shift();
    if (!review) throw new Error("fake host review exhausted");
    return review;
  }
}

async function runManagedTaskWithHostReviews(
  projectRoot: string,
  taskId: string,
  invoker: FakeInvoker,
  env: NodeJS.ProcessEnv,
): Promise<ManagedRunState> {
  let state = await runManagedTask(projectRoot, taskId, invoker, env);
  while (state.status === "waiting_for_host_review") {
    const contract = loadManagedTask(projectRoot, taskId);
    const persisted = loadManagedRun(projectRoot, taskId, state.runId);
    submitExternalHostReviewResult(
      contract,
      persisted,
      invoker.nextReview(),
      contract.language,
      env,
    );
    state = await runManagedTask(projectRoot, taskId, invoker, env);
  }
  return state;
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
  fs.writeFileSync(path.join(root, "evidence.md"), "# evidence\n");
  const contract = createManagedTaskContract({
    request: "整理一份任务结果",
    projectRoot: root,
    profile,
    language,
    mandatoryEngineeringRules: ["所有新增代码每行不得超过 80 字符"],
  });
  const state = initManagedRunState(contract);
  createManagedTaskFiles(contract, state, env);
  return { root, env, contract, state };
}

function createSddFixture(tasks: string[], initializeGit = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-runner-sdd-"));
  roots.push(root);
  const changeDir = path.join(root, "openspec", "changes", "demo");
  const prompt = path.join(changeDir, "prompt", "implementation.md");
  fs.mkdirSync(path.dirname(prompt), { recursive: true });
  fs.writeFileSync(prompt, "# 实现 Prompt\n");
  fs.writeFileSync(
    path.join(changeDir, "tasks.md"),
    `# Tasks\n\n${tasks.join("\n")}\n`,
  );
  fs.writeFileSync(path.join(changeDir, "test-report.md"), "# Test Report\n");
  if (initializeGit) initializeGitRepository(root);
  const env = {
    ...process.env,
    SUPERFLOW_HOME: path.join(root, "home"),
    SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1",
  };
  const contract = createManagedTaskContract({
    request: prompt,
    projectRoot: root,
    profile: "sdd",
    source: "sdd",
    taskPromptPath: prompt,
    mandatoryEngineeringRules: ["所有新增代码每行不得超过 80 字符"],
  });
  const state = initManagedRunState(contract);
  createManagedTaskFiles(contract, state, env);
  return { root, env, contract, state };
}

function initializeGitRepository(root: string): void {
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "Test"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "baseline"], {
    cwd: root,
    stdio: "ignore",
  });
}

function executorReady(summary: string): ExecutorResult {
  return {
    status: "ready_for_review",
    summary,
    changedFiles: ["result.txt"],
    commands: [
      {
        command: "npm test",
        exitCode: 0,
        result: "tests, startup, HTTP, runtime cleanup passed",
        categories: ["build", "test", "startup", "invocation", "runtime"],
      },
    ],
    evidence: ["evidence.md"],
    releasePrerequisites: [],
    blockers: [],
  };
}

function executorBlocked(summary: string): ExecutorResult {
  return {
    status: "blocked",
    summary,
    changedFiles: [],
    commands: [],
    evidence: [],
    releasePrerequisites: [],
    blockers: ["仍需监督者判断"],
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
