import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createSuperflowMcpServer } from "../../src/mcp/server.js";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  startManagedTaskFromHost,
  type ManagedControlRuntime,
} from "../../src/domains/managed-work/control.js";
import { loadManagedTask } from "../../src/domains/managed-work/storage.js";
import { assertManagedAgentPair } from "../../src/domains/managed-work/pair-admission.js";
import { runManagedTask } from "../../src/domains/managed-work/runner.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-native-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "docs"));
  const runtime: ManagedControlRuntime = {
    cliPath: path.join(root, "cli.js"),
    env: {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
      SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1",
    },
    assertManagedAgentPair: (host, executor, _runtime, options) =>
      assertManagedAgentPair(
        host,
        executor,
        {
          executable: (agent) => agent === executor,
          exists: () => {
            throw new Error("unexpected legacy assets");
          },
        },
        options,
      ),
    ensureService: (cliPath) => ({
      pid: 12345,
      startedAt: new Date().toISOString(),
      cliPath,
    }),
  };
  return { root, runtime };
}

describe("native managed control", () => {
  it("queues the original skill request without model confirmation or legacy admission", () => {
    const { root, runtime } = fixture();
    const request = "  /my-skill docs  ";
    const snapshot = startManagedTaskFromHost(
      { request, projectRoot: root },
      runtime,
    );
    const contract = loadManagedTask(root, snapshot.taskId);
    expect(snapshot).toMatchObject({
      profile: "native",
      status: "queued",
      executorConfig: { model: null, reasoningEffort: null, confirmed: true },
    });
    expect(contract.request).toBe(request);
  });

  it("allows the same native agent for host and executor", () => {
    const { root, runtime } = fixture();
    expect(
      startManagedTaskFromHost(
        {
          request: "work",
          projectRoot: root,
          supervisorAgent: "codex",
          executorAgent: "codex",
        },
        runtime,
      ).status,
    ).toBe("queued");
  });

  it("preserves explicit models and budgets and does not reuse a different budget", () => {
    const { root, runtime } = fixture();
    const input = {
      request: "work",
      projectRoot: root,
      executorModel: "selected-model",
      executorReasoningEffort: "high" as const,
      budgets: { maxReviewRounds: 0, maxExecutorInvocations: 7 },
    };
    const first = startManagedTaskFromHost(input, runtime);
    expect(first.executorConfig).toMatchObject({
      model: "selected-model",
      reasoningEffort: "high",
      confirmed: true,
    });
    expect(loadManagedTask(root, first.taskId).budgets).toMatchObject(
      input.budgets,
    );
    expect(startManagedTaskFromHost(input, runtime).taskId).toBe(first.taskId);
    expect(
      startManagedTaskFromHost(
        { ...input, budgets: { ...input.budgets, maxExecutorInvocations: 8 } },
        runtime,
      ).taskId,
    ).not.toBe(first.taskId);
  });

  it("keeps external disclosure approval mandatory before execution", async () => {
    const { root, runtime } = fixture();
    const snapshot = startManagedTaskFromHost(
      { request: "work", projectRoot: root },
      runtime,
    );
    let invocations = 0;
    const result = await runManagedTask(
      root,
      snapshot.taskId,
      {
        invoke: async () => {
          invocations++;
          throw new Error("must not invoke");
        },
      },
      runtime.env,
    );
    expect(invocations).toBe(0);
    expect(result.status).toBe("waiting_for_human");
    expect(result.blocker).toMatch(/授权/);
  });

  it("exposes native profile and zero budgets through the MCP start schema", async () => {
    const { root, runtime } = fixture();
    const server = createSuperflowMcpServer(runtime, {
      assertCurrent: () => undefined,
    });
    const client = new Client({ name: "native-test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: "superflow_managed_start",
        arguments: {
          request: "/my-skill docs",
          projectRoot: root,
          supervisorAgent: "codex",
          executorAgent: "codex",
          profile: "native",
          budgets: { maxReviewRounds: 0, maxExecutorInvocations: 0 },
        },
      });
      expect(result.isError).not.toBe(true);
      const { loadRegistry } =
        await import("../../src/domains/managed-work/storage.js");
      const contract = loadManagedTask(
        root,
        loadRegistry(runtime.env).tasks[0].taskId,
      );
      expect(contract.profile).toBe("native");
      expect(contract.budgets.maxExecutorInvocations).toBe(0);
      expect(contract.request).toBe("/my-skill docs");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("retains confirmation for explicit engineering contracts", () => {
    const { root, runtime } = fixture();
    runtime.assertManagedAgentPair = () => undefined;
    const snapshot = startManagedTaskFromHost(
      { request: "work", projectRoot: root, profile: "engineering" },
      runtime,
    );
    expect(snapshot.status).toBe("waiting_for_human");
    expect(snapshot.executorConfig?.confirmed).toBe(false);
  });
});
