import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  addManagedHumanGuidance,
  getManagedTaskSnapshot,
  listManagedTaskSnapshots,
  pauseManagedTask,
  resumeManagedTaskFromHost,
  startManagedTaskFromHost,
  submitManagedHostReview,
  waitForManagedTaskChange,
  type ManagedControlRuntime,
} from "../../src/domains/managed-work/control.js";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import {
  appendManagedEvent,
  readManagedEvents,
} from "../../src/domains/managed-work/journal.js";
import {
  createManagedTaskFiles,
  loadManagedRun,
  loadManagedTask,
  loadRegistry,
  saveManagedRun,
} from "../../src/domains/managed-work/storage.js";
import {
  computeWorkspaceFingerprintForRoots,
  initManagedRunState,
} from "../../src/domains/managed-work/state.js";
import {
  createSuperflowMcpServer,
  DEFAULT_MCP_WAIT_TIMEOUT_SECONDS,
} from "../../src/mcp/server.js";
import { runManagedTask } from "../../src/domains/managed-work/runner.js";
import type {
  AgentInvocation,
  AgentInvocationResult,
  AgentInvoker,
  ExecutorResult,
} from "../../src/domains/managed-work/types.js";

const roots: string[] = [];
const testMcpRuntime = {
  createIdentity: () => ({
    version: "test",
    cliPath: "test-runtime",
    fingerprint: "test-fingerprint",
    startedAt: "fixed",
  }),
  assertCurrent: () => undefined,
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Superflow managed MCP", () => {
  it("uses a Host-compatible default wait transport window", () => {
    expect(DEFAULT_MCP_WAIT_TIMEOUT_SECONDS).toBe(240);
  });

  it("rolls back project task files when registry persistence fails", () => {
    const fixture = createFixture();
    const blockedHome = path.join(fixture.root, "blocked-home");
    fs.writeFileSync(blockedHome, "not a directory", "utf-8");
    const contract = createManagedTaskContract({
      profile: "engineering",
      request: "registry 写入失败回滚",
      projectRoot: fixture.root,
    });
    const state = initManagedRunState(contract);

    expect(() =>
      createManagedTaskFiles(contract, state, {
        ...fixture.env,
        SUPERFLOW_HOME: blockedHome,
      }),
    ).toThrow();
    expect(
      fs.existsSync(
        path.join(fixture.root, ".superflow", "tasks", contract.taskId),
      ),
    ).toBe(false);
  });
  it("does not persist a task when the service handshake fails", () => {
    const fixture = createFixture();
    fixture.runtime.ensureService = () => {
      throw new Error("旧服务仍在退出");
    };

    expect(() =>
      startManagedTaskFromHost(
        {
          profile: "engineering",
          request: "服务升级期间启动",
          projectRoot: fixture.root,
        },
        fixture.runtime,
      ),
    ).toThrow("旧服务仍在退出");
    expect(loadRegistry(fixture.env).tasks).toHaveLength(0);
  });

  it("reuses the same non-terminal task when start is safely retried", () => {
    const fixture = createFixture();
    const input = {
      profile: "engineering",
      request: "相同请求安全重试",
      projectRoot: fixture.root,
      supervisorAgent: "codex" as const,
      executorAgent: "claude" as const,
    };

    const first = startManagedTaskFromHost(input, fixture.runtime);
    const retried = startManagedTaskFromHost(input, fixture.runtime);

    expect(retried.taskId).toBe(first.taskId);
    expect(loadRegistry(fixture.env).tasks).toHaveLength(1);
    expect(fixture.serviceStarts).toHaveLength(2);
  });

  it("skips stale registry locators while listing healthy tasks", () => {
    const fixture = createFixture();
    const healthy = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "健康任务",
        projectRoot: fixture.root,
      },
      fixture.runtime,
    );
    const registry = loadRegistry(fixture.env);
    registry.tasks.unshift({
      ...registry.tasks[0],
      taskId: "task-stale-missing-workspace",
      projectRoot: path.join(fixture.root, "missing-worktree"),
      updatedAt: new Date(Date.now() + 1_000).toISOString(),
    });
    fs.mkdirSync(
      path.dirname(
        path.join(fixture.env.SUPERFLOW_HOME!, "managed", "registry.json"),
      ),
      {
        recursive: true,
      },
    );
    fs.writeFileSync(
      path.join(fixture.env.SUPERFLOW_HOME!, "managed", "registry.json"),
      `${JSON.stringify(registry, null, 2)}\n`,
      "utf-8",
    );

    expect(
      listManagedTaskSnapshots(fixture.env).map((item) => item.taskId),
    ).toEqual([healthy.taskId]);
  });

  it("creates external-host tasks and never nests a supervisor CLI", () => {
    const fixture = createFixture();
    const snapshot = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "完成任务并真实验证",
        projectRoot: fixture.root,
        supervisorAgent: "codex",
        executorAgent: "claude",
      },
      fixture.runtime,
    );
    const contract = loadManagedTask(fixture.root, snapshot.taskId);

    expect(contract.supervisorExecution).toBe("external_host");
    expect(contract.supervisorAgent).toBe("codex");
    expect(contract.executorAgent).toBe("claude");
    expect(fixture.serviceStarts).toHaveLength(1);
    expect(snapshot.status).toBe("waiting_for_human");
    expect(snapshot.executorConfig?.confirmed).toBe(false);
    expect(snapshot.latestEvents[0].summary).toContain("禁止嵌套");
  });

  it("waits locally for attention without model polling", async () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "等待评审",
        projectRoot: fixture.root,
      },
      fixture.runtime,
    );
    const registry = loadRegistry(fixture.env);
    const state = loadManagedRun(
      fixture.root,
      created.taskId,
      registry.tasks[0].activeRunId,
    );
    state.status = "waiting_for_human";
    state.currentStep = "human_input_required";
    state.blocker = null;
    saveManagedRun(state);

    const result = await waitForManagedTaskChange(
      created.taskId,
      created.latestSequence,
      1,
      fixture.runtime,
    );

    expect(result.timedOut).toBe(false);
    expect(result.snapshot.attentionRequired).toBe(true);
    expect(result.snapshot.attentionReason).toBe("human_input_required");
    expect(result.snapshot.recommendedAction).toContain("请求必要输入");
    expect(result.snapshot.executorInvocations).toBe(0);
    expect(result.snapshot).not.toHaveProperty("latestEvents");
    expect(result.snapshot).not.toHaveProperty("lastExecutorResult");
    expect(result.snapshot).not.toHaveProperty("lastReviewResult");
  });

  it("streams a healthy supervision checkpoint without waking the host", async () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "定时监督研发任务",
        projectRoot: fixture.root,
      },
      fixture.runtime,
    );
    const registry = loadRegistry(fixture.env);
    const state = loadManagedRun(
      fixture.root,
      created.taskId,
      registry.tasks[0].activeRunId,
    );
    state.status = "running";
    state.currentStep = "executor_implementing";
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "executor.supervision_checkpoint",
      actor: "claude",
      role: "executor",
      summary: "10 分钟监督点：阶段 http_e2e；命令完成 1",
      evidencePaths: [],
    });

    const progress: string[] = [];
    const result = await waitForManagedTaskChange(
      created.taskId,
      created.latestSequence,
      1,
      fixture.runtime,
      false,
      (update) => {
        progress.push(update.message);
      },
    );

    expect(result.timedOut).toBe(true);
    expect(result.snapshot.status).toBe("running");
    expect(result.snapshot.attentionRequired).toBe(false);
    expect(progress).toEqual([expect.stringContaining("10 分钟监督点")]);
  });

  it("wakes the host after two supervision checkpoints without milestones", async () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "监督停滞研发任务",
        projectRoot: fixture.root,
      },
      fixture.runtime,
    );
    const registry = loadRegistry(fixture.env);
    const state = loadManagedRun(
      fixture.root,
      created.taskId,
      registry.tasks[0].activeRunId,
    );
    state.status = "running";
    state.currentStep = "executor_implementing";
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "executor.supervision_attention_required",
      actor: "managed-runner",
      role: "runner",
      summary: "连续两个监督点没有有效里程碑，需要 Host 判断是否偏航",
      evidencePaths: [],
    });

    const result = await waitForManagedTaskChange(
      created.taskId,
      created.latestSequence,
      1,
      fixture.runtime,
    );

    expect(result.timedOut).toBe(false);
    expect(result.snapshot.status).toBe("running");
    expect(result.snapshot.attentionRequired).toBe(true);
    expect(result.snapshot.attentionReason).toContain("没有有效里程碑");
    expect(result.snapshot.recommendedAction).toContain("轻量监督");
  });

  it("wakes immediately with an actionable budget exhaustion summary", async () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "等待研发完成",
        projectRoot: fixture.root,
      },
      fixture.runtime,
    );
    const registry = loadRegistry(fixture.env);
    const state = loadManagedRun(
      fixture.root,
      created.taskId,
      registry.tasks[0].activeRunId,
    );
    state.status = "budget_exhausted";
    state.currentStep = "budget_exhausted";
    state.blocker = "Claude 临时调用窗口已用尽";
    state.executorInvocations = 14;
    saveManagedRun(state);

    const startedAt = Date.now();
    const result = await waitForManagedTaskChange(
      created.taskId,
      created.latestSequence,
      10,
      fixture.runtime,
    );

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(result.timedOut).toBe(false);
    expect(result.snapshot).toMatchObject({
      status: "budget_exhausted",
      attentionRequired: true,
      attentionReason: "Claude 临时调用窗口已用尽",
      recommendedAction: "立即通知用户并等待明确授权增加预算",
      blocker: "Claude 临时调用窗口已用尽",
      executorInvocations: 14,
    });
    expect(result.snapshot).not.toHaveProperty("latestEvents");
  });

  it("returns attention actions in the managed task language", async () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "Wait for delivery",
        projectRoot: fixture.root,
        language: "en",
      },
      fixture.runtime,
    );
    const registry = loadRegistry(fixture.env);
    const state = loadManagedRun(
      fixture.root,
      created.taskId,
      registry.tasks[0].activeRunId,
    );
    state.status = "budget_exhausted";
    state.currentStep = "budget_exhausted";
    state.blocker = "Executor budget exhausted";
    saveManagedRun(state);

    const result = await waitForManagedTaskChange(
      created.taskId,
      created.latestSequence,
      1,
      fixture.runtime,
    );

    expect(result.snapshot.recommendedAction).toContain(
      "Notify the user immediately",
    );
  });

  it("does not wake the host for ordinary progress by default", async () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "长任务进展",
        projectRoot: fixture.root,
      },
      fixture.runtime,
    );
    const registry = loadRegistry(fixture.env);
    const state = loadManagedRun(
      fixture.root,
      created.taskId,
      registry.tasks[0].activeRunId,
    );
    state.status = "running";
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "executor.progress",
      actor: "claude",
      role: "executor",
      summary: "普通工具进展",
    });

    const result = await waitForManagedTaskChange(
      created.taskId,
      created.latestSequence,
      1,
      fixture.runtime,
    );

    expect(result.timedOut).toBe(true);
    expect(result.snapshot.attentionRequired).toBe(false);
  });

  it("persists user guidance and resumes a safe waiting task", () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "等待用户补充",
        projectRoot: fixture.root,
      },
      fixture.runtime,
    );
    const registry = loadRegistry(fixture.env);
    const state = loadManagedRun(
      fixture.root,
      created.taskId,
      registry.tasks[0].activeRunId,
    );
    state.status = "waiting_for_human";
    state.currentStep = "human_input_required";
    saveManagedRun(state);

    const resumed = addManagedHumanGuidance(
      created.taskId,
      "开发环境允许创建独立测试数据",
      fixture.runtime,
    );
    const messages = fs.readFileSync(
      path.join(
        fixture.root,
        ".superflow",
        "tasks",
        created.taskId,
        "human-messages.jsonl",
      ),
      "utf-8",
    );

    expect(resumed.status).toBe("queued");
    expect(resumed.lastReviewResult).toBeNull();
    expect(messages).toContain("开发环境允许创建独立测试数据");
    expect(fixture.serviceStarts).toHaveLength(2);
  });

  it("keeps review findings and delivery evidence when guidance resumes a task", () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "保留整改证据",
        projectRoot: fixture.root,
      },
      fixture.runtime,
    );
    const state = loadManagedRun(fixture.root, created.taskId, created.runId);
    const reviewPath = path.join(fixture.root, ".superflow", "review.json");
    const deliveryPath = path.join(fixture.root, ".superflow", "delivery.json");
    const review = {
      result: "needs_fix",
      summary: "修复并发问题",
      findings: [{ id: "R1", blocking: true, severity: "high" }],
    };
    fs.writeFileSync(reviewPath, JSON.stringify(review));
    fs.writeFileSync(deliveryPath, JSON.stringify({ evidence: ["test.log"] }));
    state.status = "waiting_for_human";
    state.lastReviewResult = reviewPath;
    state.lastExecutorResult = deliveryPath;
    saveManagedRun(state);

    const resumed = addManagedHumanGuidance(
      created.taskId,
      "继续",
      fixture.runtime,
    );
    expect(resumed.lastReviewResult).toEqual(review);
    expect(resumed.lastExecutorResult).toEqual({ evidence: ["test.log"] });
    const saved = loadManagedRun(fixture.root, created.taskId, created.runId);
    expect(saved.lastReviewResult).toBe(reviewPath);
    expect(saved.lastExecutorResult).toBe(deliveryPath);
    expect(readManagedEvents(saved).at(-1)?.evidencePaths).not.toHaveLength(0);
  });

  it("shows requested and reported models and absent discovery in compact waits", async () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "观测运行能力",
        projectRoot: fixture.root,
        executorModel: "requested-model",
        executorReasoningEffort: "low",
      },
      fixture.runtime,
    );
    const state = loadManagedRun(fixture.root, created.taskId, created.runId);
    state.runtimeTelemetry = {
      phase: "model_waiting",
      model: "reported-model",
      reasoningEffort: null,
      tools: ["Read"],
      toolUses: [],
      plugins: [],
      lastOutputAt: "fixed",
      lastProgressAt: "fixed",
      lastProgressReason: "system_init",
    };
    saveManagedRun(state);
    const result = await waitForManagedTaskChange(
      created.taskId,
      0,
      1,
      fixture.runtime,
    );
    expect(result.snapshot).toHaveProperty("executorRuntime", {
      requestedModel: "requested-model",
      reportedModel: "reported-model",
      modelNamesMatch: false,
      tools: ["Read"],
      skills: null,
      slashCommands: null,
      toolUses: [],
    });
  });

  it("does not report a previous invocation's capabilities during a new call", async () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "恢复运行观测",
        projectRoot: fixture.root,
        externalModelDataDisclosureApproved: true,
      },
      fixture.runtime,
    );
    const state = loadManagedRun(fixture.root, created.taskId, created.runId);
    state.runtimeTelemetry = {
      phase: "model_waiting",
      model: "previous-model",
      reasoningEffort: "high",
      tools: ["Skill"],
      skills: ["old-skill"],
      slashCommands: ["old-skill"],
      toolUses: ["Skill"],
      plugins: [],
      capabilitiesReported: true,
      lastOutputAt: "old",
      lastProgressAt: "old",
      lastProgressReason: "system_init",
    };
    saveManagedRun(state);
    const observed: unknown[] = [];
    const invoker: AgentInvoker = {
      invoke: async () => {
        observed.push(
          getManagedTaskSnapshot(created.taskId, fixture.env).executorRuntime,
        );
        throw new Error("fixture: no runtime report");
      },
    };
    await runManagedTask(fixture.root, created.taskId, invoker, fixture.env);
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({
      reportedModel: null,
      tools: null,
      skills: null,
      slashCommands: null,
      toolUses: [],
    });
  });

  it.each(["pass", "blocked"] as const)(
    "does not replay an old %s after acknowledged guidance fails",
    async (result) => {
      const fixture = createFixture();
      const created = startManagedTaskFromHost(
        {
          profile: "engineering",
          request: "失败后继续指导",
          projectRoot: fixture.root,
          externalModelDataDisclosureApproved: true,
        },
        fixture.runtime,
      );
      const state = loadManagedRun(fixture.root, created.taskId, created.runId);
      const dir = path.join(
        fixture.root,
        ".superflow",
        "tasks",
        created.taskId,
        "runs",
        created.runId,
      );
      state.reviewRound = 1;
      state.reviewInvocations = 1;
      state.status = "waiting_for_human";
      state.lastReviewResult = path.join(dir, "review-result-1.json");
      state.lastExecutorResult = path.join(dir, "old-delivery.json");
      fs.writeFileSync(
        state.lastReviewResult,
        JSON.stringify({ result, summary: "旧结论", findings: [] }),
      );
      fs.writeFileSync(
        state.lastExecutorResult,
        JSON.stringify({
          status: "ready_for_review",
          summary: "旧交付",
          commands: [],
          evidence: [],
          blockers: [],
          releasePrerequisites: [],
        }),
      );
      saveManagedRun(state);
      addManagedHumanGuidance(created.taskId, "继续最新指导", fixture.runtime);
      let calls = 0;
      const invoker: AgentInvoker = {
        invoke: async (invocation) => {
          calls++;
          invocation.onSession?.("new-session");
          throw new Error("fixture: failed after acknowledgement");
        },
      };
      await runManagedTask(fixture.root, created.taskId, invoker, fixture.env);
      await runManagedTask(fixture.root, created.taskId, invoker, fixture.env);
      expect(calls).toBe(2);
      const handoff = JSON.parse(
        fs.readFileSync(path.join(dir, "executor-handoff-2.json"), "utf8"),
      );
      expect(handoff.humanGuidance.messages[0].content).toBe("继续最新指导");
      expect(fs.existsSync(path.join(dir, "old-delivery.json"))).toBe(true);
    },
  );

  it.each(["pass", "blocked", "needs_fix"] as const)(
    "delivers new guidance without losing the previous %s review",
    async (result) => {
      const fixture = createFixture();
      const created = startManagedTaskFromHost(
        {
          profile: "engineering",
          request: "继续受影响工作",
          projectRoot: fixture.root,
          externalModelDataDisclosureApproved: true,
        },
        fixture.runtime,
      );
      const state = loadManagedRun(fixture.root, created.taskId, created.runId);
      state.status = "waiting_for_human";
      state.reviewRound = 1;
      state.reviewInvocations = 1;
      const finding = {
        id: "R-atomic",
        severity: "high",
        blocking: true,
        category: "correctness",
        target: "src/example.ts",
        evidence: "write split",
        risk: "lost update",
        requiredFix: "atomic write",
        acceptanceChecks: ["rollback"],
      };
      const reviewPath = path.join(
        fixture.root,
        ".superflow",
        "tasks",
        created.taskId,
        "runs",
        created.runId,
        "review-result-1.json",
      );
      fs.writeFileSync(
        reviewPath,
        JSON.stringify({
          result,
          summary: "原评审",
          findings: result === "needs_fix" ? [finding] : [],
        }),
      );
      state.lastReviewResult = reviewPath;
      saveManagedRun(state);
      addManagedHumanGuidance(
        created.taskId,
        "只继续剩余工作",
        fixture.runtime,
      );
      let calls = 0;
      const invoker: AgentInvoker = {
        invoke: async () => {
          calls++;
          throw new Error("fixture: stop after capturing handoff");
        },
      };
      await runManagedTask(fixture.root, created.taskId, invoker, fixture.env);
      expect(calls).toBe(1);
      const handoff = JSON.parse(
        fs.readFileSync(
          path.join(path.dirname(reviewPath), "executor-handoff-1.json"),
          "utf8",
        ),
      );
      expect(handoff.findings).toEqual(result === "needs_fix" ? [finding] : []);
      expect(handoff.humanGuidance.messages[0].content).toBe("只继续剩余工作");
    },
  );

  it("exposes the host interaction tools through MCP", async () => {
    const fixture = createFixture();
    const server = createSuperflowMcpServer(fixture.runtime, testMcpRuntime);
    const client = new Client({ name: "superflow-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "superflow_managed_start",
        "superflow_managed_runtime",
        "superflow_managed_list",
        "superflow_managed_status",
        "superflow_managed_wait",
        "superflow_managed_message",
        "superflow_managed_pause",
        "superflow_managed_resume",
        "superflow_managed_submit_review",
      ]),
    );

    const result = await client.callTool({
      name: "superflow_managed_start",
      arguments: {
        profile: "engineering",
        request: "通过 MCP 启动",
        projectRoot: fixture.root,
        supervisorAgent: "codex",
        executorAgent: "claude",
      },
    });
    expect(result.isError).not.toBe(true);
    expect(loadRegistry(fixture.env).tasks).toHaveLength(1);
    expect(
      loadManagedTask(fixture.root, loadRegistry(fixture.env).tasks[0].taskId)
        .supervisorExecution,
    ).toBe("external_host");

    const runtimeResult = await client.callTool({
      name: "superflow_managed_runtime",
      arguments: {},
    });
    expect(runtimeResult.isError).not.toBe(true);

    await client.close();
    await server.close();
  });

  it("emits standard MCP progress notifications during a long wait", async () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "通过 MCP 观察长任务阶段",
        projectRoot: fixture.root,
      },
      fixture.runtime,
    );
    const registry = loadRegistry(fixture.env);
    const state = loadManagedRun(
      fixture.root,
      created.taskId,
      registry.tasks[0].activeRunId,
    );
    state.status = "running";
    state.currentStep = "executor_implementing";
    saveManagedRun(state);
    const server = createSuperflowMcpServer(fixture.runtime, testMcpRuntime);
    const client = new Client({ name: "superflow-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const messages: string[] = [];
    setTimeout(() => {
      appendManagedEvent(state, {
        eventType: "executor.supervision_checkpoint",
        actor: "claude",
        role: "executor",
        summary: "健康监督点：应用启动阶段仍在推进",
        evidencePaths: [],
      });
    }, 20);

    const result = await client.callTool(
      {
        name: "superflow_managed_wait",
        arguments: {
          taskId: created.taskId,
          afterSequence: created.latestSequence,
          timeoutSeconds: 1,
        },
      },
      undefined,
      {
        timeout: 3_000,
        onprogress: (progress) => {
          if (progress.message) messages.push(progress.message);
        },
      },
    );

    expect(result.isError).not.toBe(true);
    expect(messages).toEqual([expect.stringContaining("应用启动阶段仍在推进")]);
    await client.close();
    await server.close();
  });

  it("returns a complete host review request in the snapshot", () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "等待主 Agent 评审",
        projectRoot: fixture.root,
      },
      fixture.runtime,
    );
    const registry = loadRegistry(fixture.env);
    const contract = loadManagedTask(fixture.root, created.taskId);
    const state = loadManagedRun(
      fixture.root,
      created.taskId,
      registry.tasks[0].activeRunId,
    );
    const prompt = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      created.taskId,
      "host-review.md",
    );
    fs.writeFileSync(prompt, "请检查真实工作区和证据", "utf-8");
    state.status = "waiting_for_host_review";
    state.currentStep = "external_supervisor_review_required";
    state.pendingExternalReview = {
      round: 1,
      promptPath: prompt,
      workspaceFingerprint: computeWorkspaceFingerprintForRoots([
        contract.projectRoot,
      ]),
      requestedAt: new Date().toISOString(),
    };
    saveManagedRun(state);

    expect(getManagedTaskSnapshot(created.taskId, fixture.env)).toMatchObject({
      attentionRequired: true,
      pendingHostReview: {
        round: 1,
        prompt: "请检查真实工作区和证据",
      },
    });
  });

  it("pauses and resumes through the persisted task state", () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "支持人工暂停",
        projectRoot: fixture.root,
      },
      fixture.runtime,
    );
    const registry = loadRegistry(fixture.env);
    const state = loadManagedRun(
      fixture.root,
      created.taskId,
      registry.tasks[0].activeRunId,
    );
    state.status = "waiting_for_human";
    state.currentStep = "human_input_required";
    saveManagedRun(state);

    const paused = pauseManagedTask(
      created.taskId,
      "用户暂时下班",
      fixture.runtime,
    );
    expect(paused.status).toBe("paused");

    const resumed = resumeManagedTaskFromHost(created.taskId, fixture.runtime);
    expect(resumed.status).toBe("queued");
    expect(resumed.pauseRequested).toBe(false);
  });

  it("recovers a persisted Host-review escalation without another executor call", () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "恢复已完成的研发交付",
        projectRoot: fixture.root,
      },
      fixture.runtime,
    );
    const registry = loadRegistry(fixture.env);
    const state = loadManagedRun(
      fixture.root,
      created.taskId,
      registry.tasks[0].activeRunId,
    );
    const invalid = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      created.taskId,
      "runs",
      state.runId,
      "executor-result-1-invalid.json",
    );
    fs.writeFileSync(invalid, "{}\n");
    state.status = "waiting_for_human";
    state.currentStep = "waiting_for_human";
    state.lastExecutorResult = invalid;
    saveManagedRun(state);
    appendManagedEvent(state, {
      eventType: "executor.rejection_escalated_to_host",
      actor: "managed-runner",
      role: "runner",
      summary: "需要 Host 语义判断",
    });

    const resumed = resumeManagedTaskFromHost(created.taskId, fixture.runtime);

    expect(resumed.status).toBe("queued");
    expect(resumed.executorInvocations).toBe(0);
    expect(resumed.currentStep).toBe("recovering_host_review_escalation");
  });

  it("applies a running pause only after the executor reaches a safe boundary", async () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        request: "运行时安全暂停",
        projectRoot: fixture.root,
        profile: "quick",
        externalModelDataDisclosureApproved: true,
      },
      fixture.runtime,
    );
    const invoker: AgentInvoker = {
      invoke: async <T>(
        _invocation: AgentInvocation,
      ): Promise<AgentInvocationResult<T>> => {
        const requested = pauseManagedTask(
          created.taskId,
          "执行完成后暂停",
          fixture.runtime,
        );
        expect(requested.status).toBe("running");
        expect(requested.pauseRequested).toBe(true);
        return {
          sessionId: "00000000-0000-4000-8000-000000000001",
          output: {
            status: "ready_for_review",
            summary: "已完成当前安全单元",
            changedFiles: [],
            commands: [],
            evidence: [],
            releasePrerequisites: [],
            blockers: [],
          } as ExecutorResult as T,
          stdout: "",
          stderr: "",
          exitCode: 0,
        };
      },
    };

    const state = await runManagedTask(
      fixture.root,
      created.taskId,
      invoker,
      fixture.env,
    );

    expect(state.status).toBe("paused");
    expect(state.currentStep).toBe("paused_by_user");
    expect(state.lastExecutorResult).not.toBeNull();
    expect(state.pendingExternalReview).toBeFalsy();
  });

  it("submits one host review and resumes only the executor path", () => {
    const fixture = createFixture();
    const created = startManagedTaskFromHost(
      {
        profile: "engineering",
        request: "等待结构化评审",
        projectRoot: fixture.root,
      },
      fixture.runtime,
    );
    const registry = loadRegistry(fixture.env);
    const contract = loadManagedTask(fixture.root, created.taskId);
    const state = loadManagedRun(
      fixture.root,
      created.taskId,
      registry.tasks[0].activeRunId,
    );
    const prompt = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      created.taskId,
      "host-review.md",
    );
    fs.writeFileSync(prompt, "全量评审", "utf-8");
    state.status = "waiting_for_host_review";
    state.currentStep = "external_supervisor_review_required";
    state.reviewRound = 1;
    state.pendingExternalReview = {
      round: 1,
      promptPath: prompt,
      workspaceFingerprint: computeWorkspaceFingerprintForRoots([
        contract.projectRoot,
      ]),
      requestedAt: new Date().toISOString(),
    };
    saveManagedRun(state);
    expect(computeWorkspaceFingerprintForRoots([contract.projectRoot])).toBe(
      state.pendingExternalReview.workspaceFingerprint,
    );

    const resumed = submitManagedHostReview(
      created.taskId,
      { result: "pass", summary: "评审通过", findings: [] },
      fixture.runtime,
    );

    expect(resumed.status).toBe("queued");
    expect(resumed.currentStep).toBe("external_review_received");
    expect(fixture.serviceStarts).toHaveLength(2);
    const refreshed = loadManagedRun(
      fixture.root,
      created.taskId,
      registry.tasks[0].activeRunId,
    );
    expect(readManagedEvents(refreshed).at(-1)?.summary).toContain(
      "Host 用量不可用",
    );
  });
});

function createFixture(): {
  root: string;
  env: NodeJS.ProcessEnv;
  runtime: ManagedControlRuntime;
  serviceStarts: string[];
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-mcp-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  const env = {
    ...process.env,
    SUPERFLOW_HOME: path.join(root, "home"),
    SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1",
  };
  const serviceStarts: string[] = [];
  const runtime: ManagedControlRuntime = {
    env,
    cliPath: path.join(root, "cli.js"),
    assertManagedAgentPair: () => undefined,
    ensureService: (cliPath) => {
      serviceStarts.push(cliPath);
      return {
        pid: 12345,
        startedAt: new Date().toISOString(),
        cliPath,
      };
    },
  };
  return { root, env, runtime, serviceStarts };
}
