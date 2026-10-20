import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { createManagedTaskFiles, loadManagedRun, loadManagedTask } from "../../src/domains/managed-work/storage.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import { runManagedTask } from "../../src/domains/managed-work/runner.js";
import { submitExternalHostReviewResult } from "../../src/domains/managed-work/host-review.js";
import { appendManagedHumanMessage } from "../../src/domains/managed-work/human-messages.js";
import type { AgentInvocation, AgentInvoker, ExecutorResult } from "../../src/domains/managed-work/types.js";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture(budgets = {}, rules: string[] = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-native-run-")); roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  fs.writeFileSync(path.join(root, "AGENTS.md"), "Original project rules");
  const env = { ...process.env, SUPERFLOW_HOME: path.join(root, "home"), SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1" };
  const contract = createManagedTaskContract({ request: "/sample-workflow\ndocs/example", projectRoot: root, budgets, mandatoryEngineeringRules: rules });
  createManagedTaskFiles(contract, initManagedRunState(contract), env);
  return { root, env, contract };
}
function invoker(calls: AgentInvocation[]): AgentInvoker {
  return { invoke: async <T>(invocation: AgentInvocation) => {
    calls.push(invocation); invocation.onSession?.("native-session");
    return { sessionId: "native-session", output: { status: "ready_for_review", summary: "原生回复：请确认下一步", changedFiles: [], commands: [], evidence: [], releasePrerequisites: [], blockers: [] } as ExecutorResult as T, stdout: "natural response", stderr: "", exitCode: 0 };
  } };
}
const needsFix = { result: "needs_fix" as const, summary: "继续用户任务", findings: [{ id: "N-1", severity: "high" as const, blocking: true, category: "scope", target: "user request", evidence: "only navigated", risk: "unfinished", requiredFix: "continue", acceptanceChecks: ["user outcome"] }] };
describe("native managed runner", () => {
  it("passes explicit user constraints without adding an engineering workflow", async () => {
    const f = fixture({}, ["Only edit the requested docs directory"]);
    const calls: AgentInvocation[] = [];
    await runManagedTask(f.root, f.contract.taskId, invoker(calls), f.env);
    expect(fs.readFileSync(calls[0].systemPromptPath!, "utf8"))
      .toContain("Only edit the requested docs directory");
  });
  it("preserves the native entry and waits for Host without imposing engineering work", async () => {
    const f = fixture(); const calls: AgentInvocation[] = [];
    const state = await runManagedTask(f.root, f.contract.taskId, invoker(calls), f.env);
    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ nativeMode: true, prompt: f.contract.request,
      timeout: { hardMs: 0, stalledMs: 0 } });
    const policy = fs.readFileSync(calls[0].systemPromptPath!, "utf8");
    expect(policy).not.toMatch(/one-command acceptance|Local curl|without pipes|tools.apply_patch/);
    const contract = loadManagedTask(f.root, f.contract.taskId);
    const saved = loadManagedRun(f.root, f.contract.taskId, state.runId);
    submitExternalHostReviewResult(contract, saved, { result: "pass", summary: "用户范围内回复已核验", findings: [] }, "zh", f.env);
    const done = await runManagedTask(f.root, f.contract.taskId, invoker(calls), f.env);
    expect(done.status, done.blocker ?? "").toBe("local_delivery_ready");
    expect(calls).toHaveLength(1);
  });
  it("honors a user-selected call budget even when native defaults are unbounded", async () => {
    const f = fixture({ maxExecutorInvocations: 1 }); const calls: AgentInvocation[] = [];
    const state = await runManagedTask(f.root, f.contract.taskId, invoker(calls), f.env);
    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
    const contract = loadManagedTask(f.root, f.contract.taskId);
    submitExternalHostReviewResult(contract, loadManagedRun(f.root, f.contract.taskId, state.runId), needsFix, "zh", f.env);
    const stopped = await runManagedTask(f.root, f.contract.taskId, invoker(calls), f.env);
    expect(stopped.status).toBe("budget_exhausted"); expect(calls).toHaveLength(1);
  });
  it("resumes the same native agent session for correction", async () => {
    const f = fixture(); const calls: AgentInvocation[] = [];
    const state = await runManagedTask(f.root, f.contract.taskId, invoker(calls), f.env);
    expect(state.status, state.blocker ?? "").toBe("waiting_for_host_review");
    submitExternalHostReviewResult(loadManagedTask(f.root, f.contract.taskId), loadManagedRun(f.root, f.contract.taskId, state.runId), needsFix, "zh", f.env);
    const next = await runManagedTask(f.root, f.contract.taskId, invoker(calls), f.env);
    expect(next.status, next.blocker ?? "").toBe("waiting_for_host_review");
    expect(calls[1].sessionId).toBe("native-session");
    expect(calls[1].prompt).toContain("N-1");
  });
  it("sends new user guidance together with existing review findings", async () => {
    const f = fixture(); const calls: AgentInvocation[] = [];
    const first = await runManagedTask(f.root, f.contract.taskId, invoker(calls), f.env);
    const contract = loadManagedTask(f.root, f.contract.taskId);
    submitExternalHostReviewResult(contract, loadManagedRun(f.root, f.contract.taskId, first.runId), needsFix, "zh", f.env);
    appendManagedHumanMessage(contract, "Only change documentation", "user");
    await runManagedTask(f.root, f.contract.taskId, invoker(calls), f.env);
    expect(calls[1].prompt).toContain("Only change documentation");
    expect(calls[1].prompt).toContain("N-1");
    expect(fs.readFileSync(calls[1].systemPromptPath!, "utf8"))
      .toContain(contract.request);
  });
  it("does not freeze a native project's own editable rules", async () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, "AGENTS.md"), "Original project rules");
    const calls: AgentInvocation[] = [];
    const state = await runManagedTask(f.root, f.contract.taskId, invoker(calls), f.env);
    expect(state.status).toBe("waiting_for_host_review");
    fs.writeFileSync(path.join(f.root, "AGENTS.md"), "User requested an update");
    // Another native turn may legitimately include the rule update itself.
    const manifest = JSON.parse(fs.readFileSync(path.join(f.root, ".superflow", "tasks", f.contract.taskId, "context-manifest.json"), "utf8"));
    expect(manifest.entries.some((entry: { role: string }) => entry.role === "rule")).toBe(false);
  });
});
