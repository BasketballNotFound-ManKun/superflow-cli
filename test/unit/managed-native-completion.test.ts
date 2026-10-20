import { createHash } from "crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  createManagedTaskContract,
  generatedStandardPromptContent,
  calculateManagedContractHash,
} from "../../src/domains/managed-work/contract.js";
import { evaluateCompletion } from "../../src/domains/managed-work/completion-policy.js";
import { readManagedExecutionContract } from "../../src/domains/managed-work/execution-contract.js";
import {
  assertManagedAcceptanceContractForStart,
  validateManagedAcceptanceReviewCoverage,
} from "../../src/domains/managed-work/acceptance-contract.js";
import type { ExecutorResult } from "../../src/domains/managed-work/types.js";

const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);
const reply: ExecutorResult = {
  status: "ready_for_review",
  summary: "已核实用户请求，供 Host 独立评审。",
  changedFiles: [],
  commands: [],
  evidence: [],
  releasePrerequisites: [],
  blockers: [],
};
function fixture(profile: "native" | "engineering" = "native", budgets = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "managed-native-"));
  roots.push(root);
  const contract = createManagedTaskContract({
    request: "实现 API 并执行测试",
    projectRoot: root,
    profile,
    budgets,
    ...(profile === "native"
      ? ({ supervisorAgent: "codex", executorAgent: "codex" } as const)
      : {}),
  });
  const runDir = path.join(
    root,
    ".superflow/tasks",
    contract.taskId,
    "runs/run-1",
  );
  mkdirSync(runDir, { recursive: true });
  return { root, contract, runDir };
}
function check(
  f: ReturnType<typeof fixture>,
  result?: ExecutorResult,
  review?: string,
) {
  const { root, contract, runDir } = f;
  const json = (file: string, value: unknown) =>
    writeFileSync(file, JSON.stringify(value));
  contract.status = "release_ready";
  const lastExecutorResult = path.join(runDir, "executor-result-1.json");
  const lastReviewResult = path.join(runDir, "review-result-1.json");
  if (result) json(lastExecutorResult, result);
  if (review) json(lastReviewResult, { result: review, findings: [] });
  json(
    path.join(root, ".superflow/tasks", contract.taskId, "task.json"),
    contract,
  );
  json(path.join(runDir, "run-state.json"), {
    contractHash: contract.contractHash,
    status: contract.status,
    executorInvocations: 1,
    reviewInvocations: 1,
    totalAgentInvocations: 1,
    reviewRound: 1,
    executorSession: { sessionId: "native-session" },
    lastExecutorResult,
    lastReviewResult,
  });
  const event = {
    sequence: 1,
    previousEventHash: null,
    eventType: "run.delivery_ready",
  };
  const eventHash = createHash("sha256")
    .update(JSON.stringify(event))
    .digest("hex");
  writeFileSync(
    path.join(runDir, "progress.jsonl"),
    JSON.stringify({ ...event, eventHash }) + "\n",
  );
  writeFileSync(path.join(runDir, "task-report.md"), "Host 评审记录");
  return spawnSync(
    process.execPath,
    [
      path.resolve("assets/scripts/superflow-managed-work-check.mjs"),
      root,
      contract.taskId,
    ],
    { encoding: "utf8" },
  );
}

describe("native completion boundaries", () => {
  it("records one user-request response task and rejects absent output", () => {
    const { contract } = fixture();
    expect(readManagedExecutionContract(contract).tasks).toEqual([
      {
        taskId: "N01",
        text: contract.request,
        requiredCategories: [],
        requiresChangedFiles: false,
      },
    ]);
    expect(evaluateCompletion(contract).localReady).toBe(false);
    const awaitingReview = evaluateCompletion(contract, {
      ...reply,
      summary: "完成！所有任务已经完成",
    });
    expect(awaitingReview.localReady).toBe(false);
    expect(awaitingReview.tasks[0].completed).toBe(false);
    expect(awaitingReview.progress.source).toEqual({ completed: 0, total: 1 });
    expect(
      evaluateCompletion(contract, reply, { hostApproved: true }).localReady,
    ).toBe(true);
    expect(
      evaluateCompletion(contract, undefined, { hostApproved: true })
        .localReady,
    ).toBe(false);
  });
  it.each(["task_file", "sdd"] as const)(
    "does not invent acceptance requirements for native %s",
    (source) => {
      const { contract } = fixture();
      expect(() =>
        assertManagedAcceptanceContractForStart({ ...contract, source }),
      ).not.toThrow();
    },
  );
  it("requires an executor response before delivery", () => {
    const result = check(fixture(), undefined, "pass");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("缺少最终执行结果");
  });
  it("requires explicit Host pass after the natural response", () => {
    const result = check(fixture(), reply, "needs_fix");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("最终检查结论不一致");
  });
  it.each([
    {},
    {
      maxReviewRounds: 100,
      maxExecutorInvocations: 100,
      maxActiveRunHours: 100,
    },
  ])("accepts native integrity after Host pass with budgets %j", (budgets) => {
    const result = check(fixture("native", budgets), reply, "pass");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
  it("keeps the executor configuration in the shared frozen hash", () => {
    const f = fixture();
    f.contract.executorConfig = { model: "native-model" };
    f.contract.contractHash = calculateManagedContractHash(f.contract);
    expect(check(f, reply, "pass").status).toBe(0);
  });
  it("does not infer native completion from nearby task checkboxes", () => {
    const { contract, root } = fixture();
    const prompt = path.join(root, "prompt.md");
    writeFileSync(prompt, "用户请求");
    writeFileSync(path.join(root, "tasks.md"), "- [ ] 尚未完成的通用工程任务");
    contract.taskPrompt = {
      originalPath: prompt,
      snapshotPath: prompt,
      sha256: "unused",
      origin: "user",
    };
    const decision = evaluateCompletion(contract, reply, {
      hostApproved: true,
    });
    expect(decision.localReady).toBe(true);
    expect(decision.tasks.map((task) => task.taskId)).toEqual(["N01"]);
  });
  it("keeps native SDD responses independent of legacy apply commands", () => {
    const f = fixture();
    f.contract.source = "sdd";
    f.contract.contractHash = calculateManagedContractHash(f.contract);
    expect(check(f, reply, "pass").status).toBe(0);
  });
  it("rejects forged frozen native contract content", () => {
    const f = fixture();
    f.contract.request = "另一项请求";
    const result = check(f, reply, "pass");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("冻结哈希不一致");
  });
  it("rejects nonexistent explicitly cited evidence", () => {
    const result = check(
      fixture(),
      { ...reply, evidence: ["missing.log"] },
      "pass",
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("证据不存在");
  });
  it("preserves explicit native acceptance review references", () => {
    const { contract } = fixture();
    contract.acceptanceContract = {
      businessInvariants: ["保持用户约束"],
      sourceCoverage: [{ scope: "请求", targets: ["result.txt"] }],
      deliverables: ["用户目标"],
      verification: ["Host 核实"],
      exclusions: [],
    };
    expect(() =>
      validateManagedAcceptanceReviewCoverage(contract, {
        result: "pass",
        summary: "已评审",
        findings: [],
        verificationCommands: [],
      }),
    ).toThrow("覆盖记录");
  });
  it("keeps legacy engineering evidence requirements", () => {
    const f = fixture("engineering");
    // Generated prompt snapshots remain required for legacy engineering tasks.
    mkdirSync(path.dirname(f.contract.taskPrompt!.snapshotPath), {
      recursive: true,
    });
    writeFileSync(
      f.contract.taskPrompt!.snapshotPath,
      generatedStandardPromptContent(f.contract.request, "engineering", "zh"),
    );
    const result = check(f, reply, "pass");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("工程任务缺少");
  });
});
