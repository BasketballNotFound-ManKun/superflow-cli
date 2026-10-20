import { describe, expect, it } from "vitest";
import {
  classifyManagedProfile,
  createManagedTaskContract,
  validateManagedTaskContract,
} from "../../src/domains/managed-work/contract.js";

describe("managed work contract", () => {
  it("defaults new auto tasks to native without generated requirements or limits", () => {
    const contract = createManagedTaskContract({
      request: "实现数据库 API 并运行服务",
      projectRoot: ".",
      profile: "auto",
      supervisorAgent: "codex",
      executorAgent: "codex",
    });
    expect(contract.profile).toBe("native");
    expect(contract.taskPrompt).toBeNull();
    expect(contract.acceptanceContract).toBeUndefined();
    expect(contract.budgets).toMatchObject({
      maxActiveRunHours: 0,
      maxSingleInvocationHours: 0,
      stalledTimeoutMinutes: 0,
      maxReviewRounds: 0,
      maxExecutorInvocations: 0,
      maxTotalAgentInvocations: 0,
      unlimitedAgentInvocations: true,
    });
    expect(contract.budgets.maxExecutorTokenUnits).toBeUndefined();
    expect(contract.budgets.maxExecutorCostUsd).toBeUndefined();
    expect(contract.permissions.gitCommit).toBe(false);
    expect(contract.permissions.productionWrites).toBe(false);
    expect(() => validateManagedTaskContract(contract)).not.toThrow();
  });

  it("retains explicit native limits without legacy ceilings", () => {
    const contract = createManagedTaskContract({
      request: "完成目标",
      projectRoot: ".",
      profile: "native",
      budgets: {
        maxReviewRounds: 100,
        maxExecutorInvocations: 100,
        maxTotalAgentInvocations: 200,
        maxActiveRunHours: 100,
        maxSingleInvocationHours: 50,
        maxExecutorTokenUnits: 100_000_000,
        maxExecutorCostUsd: 1000,
      },
    });
    expect(contract.budgets.maxReviewRounds).toBe(100);
    expect(contract.budgets.maxExecutorCostUsd).toBe(1000);
    expect(() => validateManagedTaskContract(contract)).not.toThrow();
  });

  it.each([-1, Infinity, NaN, 1.5])(
    "rejects invalid native invocation budgets: %s",
    (value) => {
      expect(() =>
        createManagedTaskContract({
          request: "完成目标",
          projectRoot: ".",
          profile: "native",
          budgets: { maxExecutorInvocations: value },
        }),
      ).toThrow();
    },
  );

  it.each([-1, Infinity, NaN])(
    "rejects invalid native duration budgets: %s",
    (value) => {
      expect(() =>
        createManagedTaskContract({
          request: "完成目标",
          projectRoot: ".",
          profile: "native",
          budgets: { maxSingleInvocationHours: value },
        }),
      ).toThrow();
    },
  );

  it.each(["quick", "engineering", "sdd", "monitor"] as const)(
    "preserves frozen legacy %s contracts",
    (profile) => {
      const contract = createManagedTaskContract({
        request: "完成目标",
        projectRoot: ".",
        profile,
      });
      const restored = JSON.parse(JSON.stringify(contract));
      expect(restored.schemaVersion).toBe(1);
      expect(restored.budgets.maxExecutorTokenUnits).toBe(2_000_000);
      expect(restored.budgets.maxReviewRounds).toBe(5);
      expect(() => validateManagedTaskContract(restored)).not.toThrow();
    },
  );

  it("detects modified native budgets through the existing contract hash", () => {
    const contract = createManagedTaskContract({
      request: "完成目标",
      projectRoot: ".",
    });
    contract.budgets.maxExecutorInvocations = 100;
    expect(() => validateManagedTaskContract(contract)).toThrow("哈希校验失败");
  });

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
      profile: "engineering",
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
      profile: "engineering",
    });

    expect(contract.supervisorExecution).toBe("external_host");
    expect(() => validateManagedTaskContract(contract)).not.toThrow();
  });

  it("freezes the human-directed mode into the same task contract", () => {
    const delegated = createManagedTaskContract({
      request: "修复一个代码问题",
      projectRoot: ".",
      profile: "engineering",
    });
    const manual = createManagedTaskContract({
      request: "修复一个代码问题",
      projectRoot: ".",
      profile: "engineering",
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
        profile: "engineering",
        budgets: { maxReviewRounds: 11 },
      }),
    ).toThrow("硬上限");
  });

  it("rejects a contract changed after it was frozen", () => {
    const contract = createManagedTaskContract({
      request: "测试任务",
      projectRoot: ".",
      profile: "engineering",
    });
    contract.budgets.maxReviewRounds = 11;

    expect(() => validateManagedTaskContract(contract)).toThrow("硬上限");
  });

  it("rejects immutable task content changed on disk", () => {
    const contract = createManagedTaskContract({
      request: "测试任务",
      projectRoot: ".",
      profile: "engineering",
    });
    contract.objective = "被改写的目标";

    expect(() => validateManagedTaskContract(contract)).toThrow("哈希校验失败");
  });

  it("rejects using the same agent for both roles", () => {
    expect(() =>
      createManagedTaskContract({
        request: "测试任务",
        projectRoot: ".",
        profile: "engineering",
        supervisorAgent: "codex",
        executorAgent: "codex",
      }),
    ).toThrow("不能相同");
  });
});
