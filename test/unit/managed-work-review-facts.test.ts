import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { writeManagedReviewFacts } from "../../src/domains/managed-work/review-facts.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import { createManagedTaskFiles } from "../../src/domains/managed-work/storage.js";

describe("managed Host review facts", () => {
  it("compresses build, HTTP, and cleanup evidence before semantic review", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow-review-facts-"),
    );
    const contract = createManagedTaskContract({
      request: "实现接口并完成真实 HTTP 验收和清理",
      projectRoot: root,
      profile: "engineering",
      language: "zh",
    });
    const state = initManagedRunState(contract);
    createManagedTaskFiles(contract, state, {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    });
    const evidence = path.join(root, "acceptance.log");
    fs.writeFileSync(evidence, "HTTP 200; cleanup zero residue\n");
    const result = path.join(root, "executor-result.json");
    fs.writeFileSync(
      result,
      JSON.stringify({
        status: "ready_for_review",
        summary: "完成",
        changedFiles: ["src/controller.ts"],
        commands: [
          {
            command: "npm test",
            exitCode: 0,
            result: "12 passed",
            assertion: "positive",
            categories: ["build", "test"],
          },
          {
            command: "node acceptance.mjs",
            exitCode: 0,
            result: "HTTP 200 and cleanup passed",
            assertion: "positive",
            categories: ["startup", "invocation", "runtime"],
          },
        ],
        evidence: [`${evidence} (E2E 原始证据目录)`],
        releasePrerequisites: [],
        blockers: [],
      }),
    );
    state.lastExecutorResult = result;
    state.reviewRound = 1;

    const packet = writeManagedReviewFacts(contract, state);
    expect(packet.facts.workspace.changedFiles).toEqual(["src/controller.ts"]);
    expect(packet.facts.workspace.roundChangedFiles).toEqual(
      expect.arrayContaining(["acceptance.log"]),
    );
    expect(packet.facts.commands).toMatchObject({
      total: 2,
      successful: 2,
      categories: ["build", "invocation", "runtime", "startup", "test"],
    });
    expect(packet.facts.evidence[0]).toMatchObject({
      path: evidence,
      exists: true,
    });
    expect(packet.facts.evidence[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.readFileSync(packet.markdownPath, "utf-8")).toContain(
      "Runner 事实仅作为确定性输入",
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("separates this review's delta from cumulative task changes", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow-review-facts-delta-"),
    );
    fs.writeFileSync(path.join(root, "changed.ts"), "before\n");
    const contract = createManagedTaskContract({
      request: "修改代码并测试",
      projectRoot: root,
      profile: "engineering",
      language: "zh",
    });
    const state = initManagedRunState(contract);
    createManagedTaskFiles(contract, state, {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    });
    fs.writeFileSync(path.join(root, "changed.ts"), "after\n");
    const result = path.join(root, "executor-result.json");
    fs.writeFileSync(
      result,
      JSON.stringify({
        status: "ready_for_review",
        summary: "完成",
        changedFiles: ["changed.ts"],
        commands: [],
        evidence: [],
        releasePrerequisites: [],
        blockers: [],
      }),
    );
    state.lastExecutorResult = result;
    const first = writeManagedReviewFacts(contract, state);
    state.lastReviewedWorkspaceFiles = first.workspaceSnapshot;
    state.reviewRound = 2;
    const second = writeManagedReviewFacts(contract, state);
    expect(first.facts.workspace.roundChangedFiles).toEqual(
      expect.arrayContaining(["changed.ts"]),
    );
    expect(second.facts.workspace.roundChangedFiles).toEqual([]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("prefers structured task evidence over free-text paths", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow-review-facts-structured-"),
    );
    const contract = createManagedTaskContract({
      request: "验证结构化证据",
      projectRoot: root,
      profile: "engineering",
      language: "zh",
    });
    const state = initManagedRunState(contract);
    createManagedTaskFiles(contract, state, {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    });
    const evidence = path.join(root, "reports", "e2e.json");
    fs.mkdirSync(path.dirname(evidence), { recursive: true });
    fs.writeFileSync(evidence, "{}\n");
    const result = path.join(root, "executor-result.json");
    fs.writeFileSync(
      result,
      JSON.stringify({
        status: "ready_for_review",
        summary: "完成",
        changedFiles: [],
        commands: [],
        evidence: ["不存在的自由文本路径"],
        releasePrerequisites: [],
        blockers: [],
        taskEvidence: [
          {
            taskId: "task-1",
            category: "local_required",
            owner: "executor",
            evidencePaths: ["reports/e2e.json"],
            verificationCommands: [],
            changedFiles: [],
          },
        ],
      }),
    );
    state.lastExecutorResult = result;

    const packet = writeManagedReviewFacts(contract, state);

    expect(packet.facts.evidence).toContainEqual(
      expect.objectContaining({ path: evidence, exists: true }),
    );
    expect(packet.facts.evidence).not.toContainEqual(
      expect.objectContaining({
        path: path.join(root, "不存在的自由文本路径"),
      }),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("renders English facts without Chinese text", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow-review-facts-en-"),
    );
    const contract = createManagedTaskContract({
      request: "Update a library",
      projectRoot: root,
      profile: "quick",
      language: "en",
    });
    const state = initManagedRunState(contract);
    createManagedTaskFiles(contract, state, {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    });
    state.reviewRound = 1;
    const packet = writeManagedReviewFacts(contract, state);
    const markdown = fs.readFileSync(packet.markdownPath, "utf-8");
    expect(markdown).toContain("Runner facts are deterministic inputs");
    expect(markdown).not.toMatch(/[\p{Script=Han}]/u);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps an E2E evidence directory reviewable without reading it as a file", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow-review-facts-directory-"),
    );
    const contract = createManagedTaskContract({
      request: "完成真实 HTTP E2E",
      projectRoot: root,
      profile: "engineering",
      language: "zh",
    });
    const state = initManagedRunState(contract);
    createManagedTaskFiles(contract, state, {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    });
    const evidence = path.join(root, "e2e-results");
    fs.mkdirSync(evidence);
    fs.writeFileSync(path.join(evidence, "response.json"), "{}\n");
    const result = path.join(root, "executor-result.json");
    fs.writeFileSync(
      result,
      JSON.stringify({
        status: "ready_for_review",
        summary: "完成",
        changedFiles: [],
        commands: [],
        evidence: [evidence],
        releasePrerequisites: [],
        blockers: [],
      }),
    );
    state.lastExecutorResult = result;
    state.reviewRound = 1;

    const packet = writeManagedReviewFacts(contract, state);

    expect(packet.facts.evidence).toContainEqual({
      path: evidence,
      kind: "directory",
      exists: true,
      bytes: expect.any(Number),
      sha256: null,
    });
    fs.rmSync(root, { recursive: true, force: true });
  });
});
