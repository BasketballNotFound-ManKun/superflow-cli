import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createManagedTaskContract,
  validateManagedTaskPromptSnapshot,
} from "../../src/domains/managed-work/contract.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import { createManagedTaskFiles } from "../../src/domains/managed-work/storage.js";
import {
  buildExecutorPrompt,
  buildReviewPrompt,
} from "../../src/domains/managed-work/prompts.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("managed work prompt snapshot", () => {
  it("freezes the implementation prompt and detects later tampering", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-prompt-"));
    roots.push(root);
    const prompt = path.join(root, "prompt", "p01.md");
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.writeFileSync(prompt, "# frozen prompt\n");
    const contract = createManagedTaskContract({
      request: prompt,
      projectRoot: root,
      profile: "sdd",
      source: "sdd",
      taskPromptPath: prompt,
    });
    const state = initManagedRunState(contract);
    const env = {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    };

    createManagedTaskFiles(contract, state, env);

    expect(fs.readFileSync(contract.taskPrompt!.snapshotPath, "utf-8")).toBe(
      "# frozen prompt\n",
    );
    expect(() => validateManagedTaskPromptSnapshot(contract)).not.toThrow();
    fs.writeFileSync(contract.taskPrompt!.snapshotPath, "changed\n");
    expect(() => validateManagedTaskPromptSnapshot(contract)).toThrow(
      "快照哈希校验失败",
    );
  });

  it("builds English executor and reviewer prompts without Chinese text", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-prompt-en-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "Implement the task",
      projectRoot: root,
      language: "en",
    });
    const state = initManagedRunState(contract);

    const executor = buildExecutorPrompt(contract, state);
    const reviewer = buildReviewPrompt(contract, state);

    expect(executor).toContain("only executor allowed to modify");
    expect(executor).toContain(
      "Return blocked whenever locally actionable blockers remain",
    );
    expect(executor).toContain(
      "repository-owned one-command acceptance entry",
    );
    expect(executor).toContain("one representative setup/verification failure");
    expect(executor).toContain("Default verification level for this task: task-level real acceptance");
    expect(executor).toContain("Verification has three levels");
    expect(executor).toContain("does not rerun the helper's non-owner");
    expect(executor).toContain(
      "Never run `git init` for diff, preflight, or delivery",
    );
    expect(reviewer).toContain("persistent read-only reviewer");
    expect(reviewer).toContain("Distinguish three delivery stages");
    expect(reviewer).toContain("Do not require any delivery terminal state");
    expect(reviewer).toContain(
      "fully review the repository-owned one-command acceptance entry",
    );
    expect(reviewer).toContain("must not rerun for every business task");
    expect(reviewer).toContain("Review with the three verification levels");
    expect(`${executor}\n${reviewer}`).not.toMatch(/[\p{Script=Han}]/u);
  });

  it("hands a fresh executor session the current workspace and repair evidence", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "managed-prompt-resume-"),
    );
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "继续实现",
      projectRoot: root,
      language: "zh",
    });
    const state = initManagedRunState(contract);
    state.executorInvocations = 2;

    const executor = buildExecutorPrompt(contract, state);

    expect(executor).toContain("这是全新的短执行会话");
    expect(executor).toContain("当前工作区、冻结任务 Prompt");
    expect(executor).toContain("读取项目级 CLAUDE.md");
    expect(executor).toContain("真实工具调用返回错误");
    expect(executor).toContain("不得作为延期本地可实现代码");
    expect(executor).toContain("约束的是上线时点，不是源码实现时点");
    expect(executor).toContain("仍有本地代码项未完成时");
    expect(executor).toContain("不得自行把当前任务项改标为未来版本");
    expect(executor).toContain(
      "只要仍有本地可处理的 blockers 就必须返回 blocked",
    );
    expect(executor).toContain("由本任务创建的开发测试表");
    expect(executor).toContain("一次调用内持续完成全部本地可执行任务");
    expect(executor).toContain("更新 tasks.md 和 test-report.md");
    expect(executor).toContain("最终完成度扫描");
    expect(executor).toContain("仓库内的单命令验收入口");
    expect(executor).toContain("清除工具路径覆盖变量的干净 shell");
    expect(executor).toContain("托管执行不得自行改写 design.md/tests.md");
    expect(executor).not.toContain("UPDATE ... WHERE id = ? AND version = ?");
    expect(executor).not.toContain("Spring Boot 工程在返回最终结果前");
    expect(executor).not.toContain("Playwright/Cypress 做真实浏览器 E2E");
    expect(executor).not.toContain("H2、Mock、Stub");
    expect(executor).toContain("具体命令、断言和证据位置只从冻结 tests.md");
    expect(executor).toContain("成功链路与一个代表性 setup/验证失败");
    expect(executor).toContain("本任务默认验证层级：任务级真实验收");
    expect(executor).toContain("验证分三级");
    expect(executor).toContain("不重复 helper 的非 owner");
    expect(executor).toContain("多个互不相同的业务删除路径");
    expect(executor).toContain("cleanup 删除 nonce/运行目录后仍须存在");
    expect(executor).toContain("不得硬编码个人绝对路径");
    expect(executor).toContain("docs/managed-work-design-principles.md");
    expect(executor).toContain("禁止为 diff、预检或交付执行 `git init`");
    const reviewer = buildReviewPrompt(contract, state);
    expect(reviewer).toContain("必须区分三段状态");
    expect(reviewer).toContain("非阻断的发布前置条件");
    expect(reviewer).toContain("托管评审不得另行发明测试合同");
    expect(reviewer).toContain("由统一 CompletionPolicy 原子裁决三段状态");
    expect(reviewer).toContain("一次性汇总全部实质 finding");
    expect(reviewer).toContain("不得发现第一个严重问题后提前结束");
    expect(reviewer).toContain("首轮全量审查仓库内单命令验收入口");
    expect(reviewer).toContain("一个代表性 setup/验证失败");
    expect(reviewer).toContain("不得为每个业务任务重复");
    expect(reviewer).toContain("按三级验证模型评审");
    expect(reviewer).toContain("运行临时目录删除后仍实际存在");
    expect(reviewer).toContain("docs/managed-work-design-principles.md");
  });

  it("places missing SDD deliverables in a short checklist before execution", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-prompt-sdd-"));
    roots.push(root);
    const changeDir = path.join(root, "openspec", "changes", "demo");
    const prompt = path.join(changeDir, "prompt", "implementation.md");
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.writeFileSync(prompt, "# implementation\n");
    fs.writeFileSync(path.join(changeDir, "tasks.md"), "- [ ] task\n");
    const contract = createManagedTaskContract({
      request: prompt,
      projectRoot: root,
      profile: "sdd",
      source: "sdd",
      taskPromptPath: prompt,
    });
    const state = initManagedRunState(contract);

    const executor = buildExecutorPrompt(contract, state);

    expect(executor).toContain("本轮交付清单");
    expect(executor).toContain("当前缺少必交测试报告");
    expect(executor).toContain(path.join(changeDir, "test-report.md"));
    expect(executor).toContain("本任务默认验证层级：任务级真实验收");
  });

  it("scopes repair verification to evidence invalidated by findings", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-prompt-scope-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "更新说明文字",
      projectRoot: root,
      profile: "quick",
      language: "zh",
    });
    const state = initManagedRunState(contract);

    const executor = buildExecutorPrompt(contract, state, [
      {
        id: "R1-001",
        severity: "medium",
        blocking: true,
        category: "documentation",
        target: "docs/example.md",
        evidence: "说明与实现不一致",
        risk: "评审者会误解行为",
        requiredFix: "同步说明",
        acceptanceChecks: ["npm test -- --run prompt"],
      },
    ]);

    expect(executor).toContain("本任务默认验证层级：受影响验证");
    expect(executor).toContain("实际修改代码或依赖真实运行环境");
    expect(executor).toContain("本轮整改先把每个 finding 映射到失效证据");
    expect(executor).toContain("禁止习惯性重跑全套验收");
    expect(executor).toContain("纯文档、证据格式或隔离测试修改");
  });
});
