import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { collectStatus } from "../../src/app/commands/status.js";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { createManagedTaskFiles } from "../../src/domains/managed-work/storage.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";

describe("commands/status", () => {
  it("derives the runnable frontier from a cross-module task graph", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-frontier-"));
    const changeDir = path.join(root, "openspec", "changes", "charging-sites");
    fs.mkdirSync(path.join(changeDir, ".sdd"), { recursive: true });
    fs.writeFileSync(path.join(changeDir, ".sdd", "state.yaml"),
      "workflow: full\nphase: implement\nreview_mode: standard\n");
    const tasks = path.join(changeDir, "tasks.md");
    fs.writeFileSync(tasks, [
      "- [ ] [local_required] P00 Create station credential storage",
      "  - Blocked by: none",
      "- [ ] [local_required] P01 Route partner calls by station",
      "  - Blocked by: P00",
      "- [ ] [local_required] P02 Update management page",
      "  - Blocked by: P00",
      "- [ ] [environment_required] P03 Verify two-station callbacks",
      "  - Blocked by: P01, P02",
      "",
    ].join("\n"));

    try {
      const initial = (await collectStatus(root)).changes[0];
      expect(initial.taskFrontier).toEqual(["P00"]);
      fs.writeFileSync(tasks, fs.readFileSync(tasks, "utf8")
        .replace("- [ ] [local_required] P00", "- [x] [local_required] P00"));
      const afterStorage = (await collectStatus(root)).changes[0];
      expect(afterStorage.taskFrontier).toEqual(["P01", "P02"]);
      expect(afterStorage.taskDependencyIssues).toEqual([]);

      fs.writeFileSync(tasks, fs.readFileSync(tasks, "utf8")
        .replace("Blocked by: P00", "Blocked by: P99"));
      const broken = (await collectStatus(root)).changes[0];
      expect(broken.taskFrontier).toEqual([]);
      expect(broken.risks).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "TASK_GRAPH_INVALID" }),
      ]));

      fs.writeFileSync(tasks, fs.readFileSync(tasks, "utf8")
        .replace("Blocked by: P99", "Blocked by: P03")
        .replace("- [x] [local_required] P00", "- [ ] [local_required] P00"));
      const cyclic = (await collectStatus(root, "en")).changes[0];
      expect(cyclic.taskFrontier).toEqual([]);
      expect(cyclic.taskDependencyIssues.join(" ")).toContain("cycle");
      expect(cyclic.taskDependencyIssues.join(" "))
        .not.toMatch(/[\p{Script=Han}]/u);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not advertise an executable frontier before implementation", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-planning-frontier-"));
    const changeDir = path.join(root, "openspec", "changes", "demo");
    fs.mkdirSync(path.join(changeDir, ".sdd"), { recursive: true });
    fs.writeFileSync(path.join(changeDir, ".sdd", "state.yaml"),
      "workflow: full\nphase: docs\nreview_mode: standard\n");
    fs.writeFileSync(path.join(changeDir, "tasks.md"),
      "- [ ] T-01 Define migration\n  - Blocked by: none\n");
    try {
      expect((await collectStatus(root)).changes[0].taskFrontier).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("collects active SDD changes with phase, tasks, and next skill", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-status-"));
    const changeDir = path.join(root, "openspec", "changes", "demo");
    fs.mkdirSync(path.join(changeDir, ".sdd"), { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, "tasks.md"),
      "- [x] done\n- [ ] pending\n",
    );
    fs.writeFileSync(
      path.join(changeDir, ".sdd", "state.yaml"),
      [
        "workflow: full",
        "phase: implement",
        "build_mode: team-prompt",
        "verify_mode: null",
        "verify_result: pending",
        "archived: false",
        "",
      ].join("\n"),
    );

    const result = await collectStatus(root);

    expect(result.changes).toEqual([
      expect.objectContaining({
        name: "demo",
        phase: "implement",
        tasksCompleted: 1,
        tasksTotal: 2,
        nextCommand: "superflow implement demo",
        nextReason: "当前处于 implement 阶段，还有 1 个任务未完成。",
        risks: expect.arrayContaining([
          expect.objectContaining({ code: "REVIEW_MODE_MISSING" }),
          expect.objectContaining({ code: "TASKS_INCOMPLETE" }),
        ]),
      }),
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("routes design phase to superflow design command", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-status-design-"));
    const changeDir = path.join(root, "openspec", "changes", "demo");
    fs.mkdirSync(path.join(changeDir, ".sdd"), { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, "tasks.md"),
      "- [ ] design pending\n",
    );
    fs.writeFileSync(
      path.join(changeDir, ".sdd", "state.yaml"),
      [
        "workflow: full",
        "phase: design",
        "build_mode: null",
        "review_mode: standard",
        "verify_mode: null",
        "verify_result: pending",
        "archived: false",
        "",
      ].join("\n"),
    );

    const result = await collectStatus(root);

    expect(result.changes).toEqual([
      expect.objectContaining({
        name: "demo",
        phase: "design",
        nextCommand: "superflow design demo",
      }),
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns English SDD status explanations when requested", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-status-en-"));
    const changeDir = path.join(root, "openspec", "changes", "demo");
    fs.mkdirSync(path.join(changeDir, ".sdd"), { recursive: true });
    fs.writeFileSync(path.join(changeDir, "tasks.md"), "- [ ] pending\n");
    fs.writeFileSync(
      path.join(changeDir, ".sdd", "state.yaml"),
      "workflow: full\nphase: implement\nreview_mode: standard\n",
    );

    const result = await collectStatus(root, "en");

    expect(result.changes[0].nextReason).toContain("1 task(s) remain");
    expect(result.changes[0].risks.map((risk) => risk.message).join("\n"))
      .not.toMatch(/[\p{Script=Han}]/u);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("collects managed tasks with budgets and session summaries", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-status-"));
    const home = path.join(root, "home");
    const previous = process.env.SUPERFLOW_HOME;
    process.env.SUPERFLOW_HOME = home;
    try {
      const contract = createManagedTaskContract({
        request: "整理状态",
        projectRoot: root,
      });
      const state = initManagedRunState(contract);
      createManagedTaskFiles(contract, state, process.env);

      const result = await collectStatus(root);

      expect(result.managedTasks).toEqual([
        expect.objectContaining({
          taskId: contract.taskId,
          status: "queued",
          reviewRound: 0,
          maxReviewRounds: 5,
          supervisorSession: "--",
          executorSession: "--",
        }),
      ]);
    } finally {
      if (previous === undefined) delete process.env.SUPERFLOW_HOME;
      else process.env.SUPERFLOW_HOME = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
