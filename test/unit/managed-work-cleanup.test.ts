import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  executeManagedTaskCleanup,
  planManagedTaskCleanup,
} from "../../src/domains/managed-work/cleanup.js";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import {
  createManagedTaskFiles,
  saveManagedRun,
} from "../../src/domains/managed-work/storage.js";
import { managedRunDir } from "../../src/domains/managed-work/paths.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

describe("managed task retention cleanup", () => {
  it("keeps full artifacts but compacts superseded streams idempotently", () => {
    const fixture = createFixture();
    const full = planManagedTaskCleanup(fixture.root, fixture.taskId, "full");
    expect(full.actions).toEqual([]);

    const compact = planManagedTaskCleanup(
      fixture.root,
      fixture.taskId,
      "compact",
    );
    expect(compact.actions.map((item) => item.path)).toEqual(
      expect.arrayContaining([
        `.superflow/tasks/${fixture.taskId}/runs/${fixture.runId}/executor-1-invalid-events-part-001.jsonl`,
        `.superflow/tasks/${fixture.taskId}/runs/${fixture.runId}/workspace-change-1.txt`,
      ]),
    );
    expect(compact.retained.map((item) => item.path)).toEqual(
      expect.arrayContaining([
        `.superflow/tasks/${fixture.taskId}/runs/${fixture.runId}/executor-handoff-2.json`,
        `.superflow/tasks/${fixture.taskId}/runs/${fixture.runId}/review-result-1.json`,
      ]),
    );
    expect(executeManagedTaskCleanup(compact, true).releasedBytes).toBe(0);
    const applied = executeManagedTaskCleanup(compact);
    expect(applied.deletedFiles).toBe(compact.actions.length);
    expect(fs.existsSync(fixture.latestHandoff)).toBe(true);
    expect(fs.existsSync(fixture.review)).toBe(true);
    expect(
      planManagedTaskCleanup(fixture.root, fixture.taskId, "compact").actions,
    ).toEqual([]);
  });

  it("fails closed for active tasks, traversal, and symlinked candidates", () => {
    const active = createFixture("running");
    expect(() => planManagedTaskCleanup(active.root, active.taskId)).toThrow(
      "仍在运行",
    );
    expect(() => planManagedTaskCleanup(active.root, "../outside")).toThrow(
      "编号格式",
    );

    const linked = createFixture();
    const target = path.join(linked.root, "outside.log");
    fs.writeFileSync(target, "outside\n");
    fs.symlinkSync(
      target,
      path.join(linked.runDir, "workspace-change-999.txt"),
    );
    expect(() => planManagedTaskCleanup(linked.root, linked.taskId)).toThrow(
      "符号链接",
    );
  });

  it("supports none only after stopped states and rejects corrupted bindings", () => {
    for (const status of ["completed", "failed", "cancelled"] as const) {
      const fixture = createFixture(status);
      const validEvents = path.join(
        fixture.runDir,
        "executor-2-events-part-001.jsonl",
      );
      fs.writeFileSync(validEvents, "valid but summarized\n");
      const plan = planManagedTaskCleanup(fixture.root, fixture.taskId, "none");
      expect(plan.actions.map((item) => item.path)).toContain(
        `.superflow/tasks/${fixture.taskId}/runs/${fixture.runId}/executor-2-events-part-001.jsonl`,
      );
    }

    const corrupted = createFixture();
    fs.writeFileSync(
      path.join(
        corrupted.root,
        ".superflow",
        "tasks",
        corrupted.taskId,
        "workspace-binding.json",
      ),
      "{}\n",
    );
    expect(() =>
      planManagedTaskCleanup(corrupted.root, corrupted.taskId),
    ).toThrow("工作区绑定");

    const unknown = createFixture();
    const statePath = path.join(unknown.runDir, "run-state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    state.status = "unknown";
    fs.writeFileSync(statePath, `${JSON.stringify(state)}\n`);
    expect(() => planManagedTaskCleanup(unknown.root, unknown.taskId)).toThrow(
      "未知或损坏",
    );
  });

  it("does not create runtime acceptance for docs-only and review-only contracts", async () => {
    const { writeManagedExecutionContract } =
      await import("../../src/domains/managed-work/execution-contract.js");
    for (const taskKind of ["docs-only", "review-only"] as const) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-kind-"));
      roots.push(root);
      const contract = createManagedTaskContract({
        request: taskKind === "docs-only" ? "只更新文档" : "只做源码评审",
        projectRoot: root,
        taskKind,
      });
      const execution = writeManagedExecutionContract(contract);
      expect(execution.tasks.map((task) => task.taskId)).toEqual([
        "E01",
        "E02",
      ]);
      expect(
        execution.tasks.flatMap((task) => task.requiredCategories),
      ).toEqual([]);
    }
  });
});

function createFixture(status = "completed") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-cleanup-"));
  roots.push(root);
  const contract = createManagedTaskContract({
    request: "实现一个小功能",
    projectRoot: root,
  });
  const state = initManagedRunState(contract);
  state.status = status as typeof state.status;
  state.completedAt = new Date().toISOString();
  createManagedTaskFiles(contract, state, {
    SUPERFLOW_HOME: path.join(root, "home"),
  });
  saveManagedRun(state);
  const runDir = managedRunDir(root, contract.taskId, state.runId);
  fs.writeFileSync(
    path.join(runDir, "executor-1-invalid-events-part-001.jsonl"),
    "x".repeat(20),
  );
  fs.writeFileSync(path.join(runDir, "workspace-change-1.txt"), "snapshot\n");
  fs.writeFileSync(path.join(runDir, "executor-handoff-1.json"), "{}\n");
  const latestHandoff = path.join(runDir, "executor-handoff-2.json");
  fs.writeFileSync(latestHandoff, "{}\n");
  const review = path.join(runDir, "review-result-1.json");
  fs.writeFileSync(review, '{"result":"pass","findings":[]}\n');
  return {
    root,
    taskId: contract.taskId,
    runId: state.runId,
    runDir,
    latestHandoff,
    review,
  };
}
