import { describe, expect, it } from "vitest";
import {
  classifyManagedProfile,
  createManagedTaskContract,
  validateManagedTaskContract,
} from "../../src/domains/managed-work/contract.js";

describe("managed work contract", () => {
  it("classifies direct tasks by risk", () => {
    expect(classifyManagedProfile("整理一份结果说明")).toBe("quick");
    expect(classifyManagedProfile("修复登录代码并补充测试")).toBe(
      "engineering",
    );
    expect(classifyManagedProfile("修改数据库字段并检查跨仓 API")).toBe("sdd");
    expect(classifyManagedProfile("持续观察构建状态")).toBe("monitor");
    expect(classifyManagedProfile("Implement login validation and tests")).toBe(
      "engineering",
    );
    expect(classifyManagedProfile("Change a database API across repos")).toBe(
      "sdd",
    );
  });

  it("creates a bounded two-agent contract", () => {
    const contract = createManagedTaskContract({
      request: "修复一个代码问题",
      projectRoot: ".",
      supervisorAgent: "codex",
    });

    expect(contract.executorAgent).toBe("claude");
    expect(contract.supervisorExecution).toBe("external_host");
    expect(contract.permissions.gitCommit).toBe(false);
    expect(contract.budgets.maxExecutorTokenUnits).toBe(2_000_000);
    expect(contract.budgets.maxExecutorCostUsd).toBeUndefined();
    expect(contract.budgets.stalledTimeoutMinutes).toBe(60);
    expect(contract.budgets.maxSingleInvocationHours).toBe(2);
    expect(contract.budgets.maxReviewRounds).toBe(5);
    expect(contract.budgets.maxExecutorInvocations).toBe(7);
    expect(contract.budgets.maxTotalAgentInvocations).toBe(12);
    expect(contract.contractHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("supports the current Codex host as the supervisor", () => {
    const contract = createManagedTaskContract({
      request: "修复一个代码问题",
      projectRoot: ".",
    });

    expect(contract.supervisorExecution).toBe("external_host");
    expect(() => validateManagedTaskContract(contract)).not.toThrow();
  });

  it("freezes the human-directed mode into the same task contract", () => {
    const delegated = createManagedTaskContract({
      request: "修复一个代码问题",
      projectRoot: ".",
    });
    const manual = createManagedTaskContract({
      request: "修复一个代码问题",
      projectRoot: ".",
      executionMode: "human_directed",
    });

    expect(manual.executionMode).toBe("human_directed");
    expect(manual.status).toBe("waiting_for_human");
    expect(manual.contractHash).not.toBe(delegated.contractHash);
  });

  it("freezes English into the contract and completion criteria", () => {
    const contract = createManagedTaskContract({
      request: "Implement login validation",
      projectRoot: ".",
      profile: "engineering",
      language: "en",
    });

    expect(contract.language).toBe("en");
    expect(contract.doneCriteria.join("\n")).toContain("verification evidence");
    expect(contract.doneCriteria.join("\n")).not.toMatch(/[\p{Script=Han}]/u);
    expect(() => validateManagedTaskContract(contract)).not.toThrow();
  });

  it("rejects attempts to raise hard limits", () => {
    expect(() =>
      createManagedTaskContract({
        request: "测试任务",
        projectRoot: ".",
        budgets: { maxReviewRounds: 11 },
      }),
    ).toThrow("硬上限");
  });

  it("rejects a contract changed after it was frozen", () => {
    const contract = createManagedTaskContract({
      request: "测试任务",
      projectRoot: ".",
    });
    contract.budgets.maxReviewRounds = 11;

    expect(() => validateManagedTaskContract(contract)).toThrow("硬上限");
  });

  it("rejects immutable task content changed on disk", () => {
    const contract = createManagedTaskContract({
      request: "测试任务",
      projectRoot: ".",
    });
    contract.objective = "被改写的目标";

    expect(() => validateManagedTaskContract(contract)).toThrow("哈希校验失败");
  });

  it("rejects using the same agent for both roles", () => {
    expect(() =>
      createManagedTaskContract({
        request: "测试任务",
        projectRoot: ".",
        supervisorAgent: "codex",
        executorAgent: "codex",
      }),
    ).toThrow("不能相同");
  });
});
