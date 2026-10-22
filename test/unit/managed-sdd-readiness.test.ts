import { prepareSourceInvestigation } from "../helpers/source-investigation.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import {
  resumeManagedTaskFromHost, startManagedTaskFromHost,
  authorizeManagedExecutor, addManagedHumanGuidance,
  type ManagedControlRuntime,
} from "../../src/domains/managed-work/control.js";
import { runManagedTask } from "../../src/domains/managed-work/runner.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import {
  createManagedTaskFiles, loadManagedRun, loadManagedTask, saveManagedRun,
} from "../../src/domains/managed-work/storage.js";
import type { AgentInvoker, ManagedProfile } from "../../src/domains/managed-work/types.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function fixture(profile: ManagedProfile = "sdd", source: "sdd" | "direct_prompt" = "sdd") {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "managed-current-ready-")));
  roots.push(root);
  const change = path.join(root, "openspec/changes/demo");
  const prompt = path.join(change, "prompt/implementation.md");
  fs.mkdirSync(path.dirname(prompt), { recursive: true });
  fs.writeFileSync(prompt, "# Implementation\n");
  prepareSourceInvestigation(change, { full: true, preserveContracts: true });
  const env = { ...process.env, SUPERFLOW_HOME: path.join(root, "home"),
    SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1" };
  const contract = createManagedTaskContract({
    request: source === "sdd" ? prompt : "complete the agreed task", projectRoot: root,
    profile, source, ...(source === "sdd" ? { taskPromptPath: prompt } : {}),
    externalModelDataDisclosure: { approved: true, approvedBy: "fixture" },
  });
  const state = initManagedRunState(contract);
  createManagedTaskFiles(contract, state, env);
  let services = 0;
  const runtime: ManagedControlRuntime = { cliPath: "unused", env,
    ensureService: cliPath => { services++; return { pid: 123, cliPath, startedAt: new Date().toISOString() }; },
  };
  const receipt = path.join(change, ".sdd/readiness/coding-ready.json");
  const removePolicy = () => {
    const value = JSON.parse(fs.readFileSync(receipt, "utf8"));
    delete value.workflowPolicy;
    fs.writeFileSync(receipt, JSON.stringify(value));
  };
  return { root, change, prompt, env, contract, state, runtime, removePolicy,
    services: () => services };
}

describe("managed SDD current admission on recovery", () => {
  it.each(["authorize", "guidance"] as const)(
    "checks current admission before %s resumes a task", action => {
      const f = fixture();
      f.state.status = "waiting_for_human";
      saveManagedRun(f.state);
      f.removePolicy();
      const taskFile = path.join(f.root, ".superflow/tasks", f.contract.taskId, "task.json");
      const before = fs.readFileSync(taskFile, "utf8");
      const resume = () => action === "authorize"
        ? authorizeManagedExecutor(f.contract.taskId, "fixture", f.runtime)
        : addManagedHumanGuidance(f.contract.taskId, "continue", f.runtime);
      expect(resume).toThrow("Coding Ready");
      expect(f.services()).toBe(0);
      expect(fs.readFileSync(taskFile, "utf8")).toBe(before);
      expect(loadManagedRun(f.root, f.contract.taskId, f.state.runId).status).toBe("waiting_for_human");
    },
  );
  it.each(["authorize", "guidance"] as const)(
    "allows current-policy %s after implementation changes", action => {
      const f = fixture();
      f.state.status = "waiting_for_human";
      saveManagedRun(f.state);
      fs.appendFileSync(path.join(f.change, "caller.ts"), "\n// implemented\n");
      const resumed = action === "authorize"
        ? authorizeManagedExecutor(f.contract.taskId, "fixture", f.runtime)
        : addManagedHumanGuidance(f.contract.taskId, "continue", f.runtime);
      expect(resumed.status).toBe("queued");
      expect(f.services()).toBe(1);
    },
  );
  it("rejects a paused legacy READY before changing state or starting service", () => {
    const f = fixture();
    f.state.status = "paused";
    saveManagedRun(f.state);
    f.removePolicy();
    const before = fs.readFileSync(path.join(f.root, ".superflow/tasks", f.contract.taskId, "task.json"), "utf8");
    expect(() => resumeManagedTaskFromHost(f.contract.taskId, f.runtime)).toThrow("Coding Ready");
    expect(f.services()).toBe(0);
    expect(loadManagedRun(f.root, f.contract.taskId, f.state.runId).status).toBe("paused");
    expect(fs.readFileSync(path.join(f.root, ".superflow/tasks", f.contract.taskId, "task.json"), "utf8")).toBe(before);
  });
  it("rejects idempotent start reuse before starting service", () => {
    const f = fixture();
    f.removePolicy();
    expect(() => startManagedTaskFromHost({ request: f.prompt, projectRoot: f.root,
      profile: "sdd" }, f.runtime)).toThrow("Coding Ready");
    expect(f.services()).toBe(0);
  });
  it("blocks a legacy READY before any recovered executor invocation", async () => {
    const f = fixture();
    f.removePolicy();
    let calls = 0;
    const invoker: AgentInvoker = { invoke: async () => { calls++; throw new Error("unexpected invocation"); } };
    const result = await runManagedTask(f.root, f.contract.taskId, invoker, f.env);
    expect(calls).toBe(0);
    expect(result.status).toBe("waiting_for_human");
    expect(result.blocker).toContain("Coding Ready");
    expect(loadManagedTask(f.root, f.contract.taskId).contractHash).toBe(f.contract.contractHash);
  });
  it("rechecks admission after an executor call before requesting Host review", async () => {
    const f = fixture();
    const invoker: AgentInvoker = {
      invoke: async <T>() => {
        f.removePolicy();
        return { sessionId: "00000000-0000-4000-8000-000000000001",
          stdout: "", stderr: "", exitCode: 0,
          output: { status: "blocked", summary: "observed blocker", changedFiles: [],
            commands: [], evidence: [], releasePrerequisites: [], blockers: ["fixture"] } as T };
      },
    };
    const result = await runManagedTask(f.root, f.contract.taskId, invoker, f.env);
    expect(result.executorInvocations).toBe(1);
    expect(result.status).toBe("waiting_for_human");
    expect(result.blocker).toContain("Coding Ready");
    expect(result.pendingExternalReview).toBeNull();
  });
  it("does not replay a persisted pass with an obsolete READY", async () => {
    const f = fixture();
    const file = path.join(f.root, "review-result-1.json");
    fs.writeFileSync(file, JSON.stringify({ result: "pass", summary: "old pass", findings: [], verificationCommands: [] }));
    f.state.lastReviewResult = file;
    f.state.reviewRound = 1;
    saveManagedRun(f.state);
    f.removePolicy();
    const result = await runManagedTask(f.root, f.contract.taskId,
      { invoke: async () => { throw new Error("unexpected invocation"); } }, f.env);
    expect(result.status).toBe("waiting_for_human");
    expect(result.blocker).toContain("Coding Ready");
    expect(fs.existsSync(file)).toBe(true);
  });
  it("allows current-policy continuation after implementation changes", () => {
    const f = fixture();
    fs.appendFileSync(path.join(f.change, "caller.ts"), "\n// implemented\n");
    f.state.status = "paused";
    saveManagedRun(f.state);
    expect(resumeManagedTaskFromHost(f.contract.taskId, f.runtime).status).toBe("queued");
    expect(f.services()).toBe(1);
  });
  it("reuses a current task after source evolution without a fresh-source check", () => {
    const f = fixture();
    fs.appendFileSync(path.join(f.change, "caller.ts"), "\n// implemented\n");
    expect(startManagedTaskFromHost({ request: f.prompt, projectRoot: f.root,
      profile: "sdd" }, f.runtime).taskId).toBe(f.contract.taskId);
    expect(f.services()).toBe(1);
  });
  it("continues dispatch with current documents after source changes", async () => {
    const f = fixture();
    fs.appendFileSync(path.join(f.change, "caller.ts"), "\n// implemented\n");
    let calls = 0;
    const result = await runManagedTask(f.root, f.contract.taskId,
      { invoke: async () => { calls++; throw new Error("synthetic executor stopped"); } }, f.env);
    expect(calls).toBe(1);
    expect(result.blocker).toBe("synthetic executor stopped");
  });
  it.each(["native", "quick", "sdd"] as const)("keeps non-SDD %s tasks independent of SDD receipts", profile => {
    const f = fixture(profile, "direct_prompt");
    f.removePolicy();
    f.state.status = "paused";
    saveManagedRun(f.state);
    expect(resumeManagedTaskFromHost(f.contract.taskId, f.runtime).status).toBe("queued");
  });
  it("rejects old admission in the final executor preflight", () => {
    const f = fixture();
    f.removePolicy();
    const result = spawnSync(process.execPath,
      [path.resolve("assets/scripts/superflow-managed-executor-preflight.mjs"), f.root, f.contract.taskId],
      { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Coding Ready");
  });
});
