import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isCommandOutcomeConsistent,
  validateRiskBasedEvidence,
} from "../../src/domains/managed-work/verification-policy.js";
import type {
  ExecutorResult,
  ManagedTaskContract,
} from "../../src/domains/managed-work/types.js";

describe("managed verification policy", () => {
  it("requires frontend startup and real-browser E2E for page changes", () => {
    const result = fixtureResult(["src/pages/User.vue"]);
    result.commands = [{ command: "npm run build", exitCode: 0, result: "ok" }];

    expect(() => validateRiskBasedEvidence(contract(), result)).toThrow(
      "缺少前端应用启动证据",
    );

    result.commands.push(
      { command: "npm run dev", exitCode: 0, result: "started" },
      {
        command: "npx playwright test user-permission.e2e.ts",
        exitCode: 0,
        result: "passed",
      },
    );
    expect(() => validateRiskBasedEvidence(contract(), result)).not.toThrow();
  });

  it("requires both sides of a cross-stack API contract", () => {
    const result = fixtureResult([
      "src/main/java/UserController.java",
      "src/api/user.ts",
    ]);
    result.commands = [
      {
        command: "mvn -Dtest=UserControllerMockMvcTest test",
        exitCode: 0,
        result: "passed",
      },
    ];

    expect(() => validateRiskBasedEvidence(contract(), result)).toThrow(
      "缺少前端请求合同测试",
    );
  });

  it("rejects a successful command that reports an expected HTTP 500", () => {
    const result = fixtureResult([]);
    result.commands = [{
      command: "./startup-probe.sh",
      exitCode: 0,
      result: "startup probe HTTP status=500 (expected database failure)",
      assertion: "positive",
    }];

    expect(() => validateRiskBasedEvidence(contract(), result)).toThrow(
      "成功命令证据与真实运行结果矛盾",
    );
    expect(isCommandOutcomeConsistent(result.commands[0])).toBe(false);
  });

  it("rejects task category downgrade forbidden by frozen prompt", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-policy-"));
    roots.push(root);
    const change = path.join(root, "openspec", "changes", "demo");
    const snapshot = path.join(root, ".superflow", "source-prompt.md");
    fs.mkdirSync(change, { recursive: true });
    fs.mkdirSync(path.dirname(snapshot), { recursive: true });
    const prompt = path.join(change, "implementation-prompt.md");
    fs.writeFileSync(prompt, "tasks.md 仅使用 [local_required]。\n");
    fs.writeFileSync(snapshot, "tasks.md 仅使用 [local_required]。\n");
    fs.writeFileSync(
      path.join(change, "tasks.md"),
      "- [ ] [release_required] 把本地验证留到发布阶段\n",
    );
    const value = contract();
    value.projectRoot = root;
    value.relatedProjectRoots = [];
    value.taskPrompt = {
      originalPath: prompt,
      snapshotPath: snapshot,
      sha256: "test",
    };

    expect(() => validateRiskBasedEvidence(value, fixtureResult([]))).toThrow(
      "禁止把任务降级",
    );
  });
});

const roots: string[] = [];

afterEach(() => {
  roots.splice(0).forEach((root) => {
    fs.rmSync(root, { recursive: true, force: true });
  });
});

function fixtureResult(changedFiles: string[]): ExecutorResult {
  return {
    status: "ready_for_review",
    summary: "done",
    changedFiles,
    commands: [],
    evidence: [],
    releasePrerequisites: [],
    blockers: [],
  };
}

function contract(): ManagedTaskContract {
  return {
    language: "zh",
    projectRoot: process.cwd(),
  } as ManagedTaskContract;
}
