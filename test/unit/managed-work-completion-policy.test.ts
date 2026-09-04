import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { evaluateCompletion } from "../../src/domains/managed-work/completion-policy.js";
import type { ExecutorResult } from "../../src/domains/managed-work/types.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("managed completion policy", () => {
  it("uses exact task categories and three independent progress tracks", () => {
    const fixture = createFixture();
    const decision = evaluateCompletion(fixture.contract, fixture.result);

    expect(decision.localReady).toBe(true);
    expect(decision.environmentReady).toBe(false);
    expect(decision.releaseReady).toBe(false);
    expect(decision.progress).toEqual({
      source: { completed: 1, total: 1 },
      environment: { completed: 0, total: 1 },
      release: { completed: 0, total: 1 },
    });
  });

  it("derives baseline task evidence without executor-authored taskEvidence", () => {
    const fixture = createFixture();
    fixture.result.taskEvidence = [];

    const decision = evaluateCompletion(fixture.contract, fixture.result);

    expect(decision.localReady).toBe(true);
  });

  it("does not let optional evidence weaken a valid baseline", () => {
    const fixture = createFixture();
    fixture.result.taskEvidence![0].verificationCommands = [
      "abbreviated executor command",
    ];

    const decision = evaluateCompletion(fixture.contract, fixture.result);

    expect(decision.localReady).toBe(true);
  });

  it("rejects a checked local task without any successful verification", () => {
    const fixture = createFixture();
    fixture.result.taskEvidence = [];
    fixture.result.commands = [];

    const decision = evaluateCompletion(fixture.contract, fixture.result);

    expect(decision.localReady).toBe(false);
    expect(decision.localGaps[0]).toContain("缺少结构化证据");
  });

  it("accepts combined Maven selectors and negative cleanup checks", () => {
    const fixture = createFixture();
    fixture.result.commands = [
      {
        command: "mvn test -Dtest=ServiceTest,HttpIntegrationTest",
        exitCode: 0,
        result: "Tests run: 11",
      },
      {
        command: "lsof -i :19260",
        exitCode: 1,
        result: "empty, no listener",
      },
    ];
    fixture.result.taskEvidence![0].verificationCommands = [
      "mvn test -Dtest=HttpIntegrationTest",
      "lsof -i :19260",
    ];

    const decision = evaluateCompletion(fixture.contract, fixture.result);

    expect(decision.localReady).toBe(true);
  });

  it("accepts a directory evidence reference with a trailing description", () => {
    const fixture = createFixture();
    const evidenceDir = path.join(
      fixture.contract.projectRoot,
      "openspec",
      "changes",
      "demo",
      "evidence",
    );
    fs.mkdirSync(evidenceDir);
    fixture.result.taskEvidence![0].evidencePaths = [
      "evidence (真实 HTTP 原始证据目录)",
    ];

    const decision = evaluateCompletion(fixture.contract, fixture.result);

    expect(decision.localReady).toBe(true);
  });
});

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "completion-policy-"));
  roots.push(root);
  const change = path.join(root, "openspec", "changes", "demo");
  const prompt = path.join(change, "prompt", "implementation.md");
  fs.mkdirSync(path.dirname(prompt), { recursive: true });
  fs.writeFileSync(prompt, "# implementation\n");
  fs.writeFileSync(path.join(change, "test-report.md"), "# report\n");
  fs.writeFileSync(
    path.join(change, "tasks.md"),
    [
      "- [x] 1.1 [local_required] 实现代码",
      "- [ ] 1.2 [environment_required] 测试环境验证",
      "- [ ] 1.3 [release_required] 发布签收",
    ].join("\n"),
  );
  const contract = createManagedTaskContract({
    request: prompt,
    projectRoot: root,
    source: "sdd",
    taskPromptPath: prompt,
  });
  const result: ExecutorResult = {
    status: "ready_for_review",
    summary: "done",
    changedFiles: ["src/main.ts"],
    commands: [{ command: "npm test", exitCode: 0, result: "passed" }],
    evidence: ["test-report.md"],
    releasePrerequisites: ["environment", "release"],
    blockers: [],
    taskEvidence: [
      {
        taskId: "1.1",
        category: "local_required",
        owner: "executor",
        evidencePaths: ["test-report.md"],
        verificationCommands: ["npm test"],
        changedFiles: ["src/main.ts"],
      },
    ],
  };
  return { contract, result };
}
