import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { evaluateCompletion } from "../../src/domains/managed-work/completion-policy.js";
import {
  artifactLevelFor,
  readManagedExecutionContract,
  requiresRuntimeAcceptance,
} from "../../src/domains/managed-work/execution-contract.js";
import { ensureManagedContextManifest } from "../../src/domains/managed-work/context-manifest.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import { createManagedTaskFiles } from "../../src/domains/managed-work/storage.js";
import type { ExecutorResult } from "../../src/domains/managed-work/types.js";

describe("managed artifact levels", () => {
  it("creates a non-empty minimal contract for a one-line request", () => {
    const fixture = createDirect("更新一个说明文件", "quick", "zh");
    const execution = readManagedExecutionContract(fixture.contract);
    expect(artifactLevelFor(fixture.contract)).toBe("minimal");
    expect(execution.tasks.map((task) => task.taskId)).toEqual(["E01", "E02"]);
    expect(
      fs.readFileSync(
        path.join(fixture.taskDir, "execution-contract.md"),
        "utf-8",
      ),
    ).toContain("不代表凭空补充业务澄清结论");
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  it("requires real acceptance and cleanup for a direct engineering task", () => {
    const fixture = createDirect(
      "新增数据库 CRUD API 并启动应用完成 HTTP 测试",
      "sdd",
      "zh",
    );
    const execution = readManagedExecutionContract(fixture.contract);
    expect(artifactLevelFor(fixture.contract)).toBe("standard");
    expect(execution.tasks.map((task) => task.taskId)).toEqual([
      "E01",
      "E02",
      "E03",
      "E04",
    ]);
    const result: ExecutorResult = {
      status: "ready_for_review",
      summary: "done",
      changedFiles: ["src/controller.ts"],
      commands: [
        {
          command: "npm test",
          exitCode: 0,
          result: "passed",
          categories: ["test"],
        },
        {
          command: "node acceptance.mjs",
          exitCode: 0,
          result: "HTTP and cleanup passed",
          categories: ["startup", "invocation", "runtime"],
        },
      ],
      evidence: [path.join(fixture.taskDir, "execution-contract.md")],
      releasePrerequisites: [],
      blockers: [],
    };
    expect(evaluateCompletion(fixture.contract, result).localReady).toBe(true);
    expect(requiresRuntimeAcceptance(fixture.contract)).toBe(true);
    expect(fixture.contract.taskPrompt).toMatchObject({
      origin: "generated_standard",
    });
    const generatedPrompt = path.join(fixture.taskDir, "source-prompt.md");
    expect(fs.readFileSync(generatedPrompt, "utf-8")).toContain(
      "自动生成的标准执行合同",
    );
    expect(fs.readFileSync(generatedPrompt, "utf-8")).toContain(
      "新增数据库 CRUD API",
    );
    expect(fs.readFileSync(generatedPrompt, "utf-8")).toContain(
      "验收入口必须可移植",
    );
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(fixture.taskDir, "context-manifest.json"),
        "utf-8",
      ),
    ) as { entries: Array<{ path: string; role: string }> };
    expect(manifest.entries).toContainEqual(
      expect.objectContaining({
        path: generatedPrompt,
        role: "implementation_prompt",
      }),
    );
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  it("freezes conflict integrity without inventing a concrete API status for a direct concurrency request", () => {
    const fixture = createDirect(
      "新增带 expectedVersion 的并发 CAS 更新并完成真实 HTTP 验收",
      "sdd",
      "zh",
    );
    const generatedPrompt = path.join(fixture.taskDir, "source-prompt.md");
    const content = fs.readFileSync(generatedPrompt, "utf-8");
    expect(content).toContain("业务冲突必须返回确定性的非 5xx 响应");
    expect(content).toContain("状态转换恰好发生一次");
    expect(content).not.toContain("必须返回 HTTP 409");
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  it("does not invent runtime acceptance for a pure library task", () => {
    const fixture = createDirect(
      "Update a pure function library and run automated tests",
      "sdd",
      "en",
    );
    const execution = readManagedExecutionContract(fixture.contract);
    expect(execution.artifactLevel).toBe("standard");
    expect(execution.tasks.map((task) => task.taskId)).toEqual(["E01", "E02"]);
    expect(requiresRuntimeAcceptance(fixture.contract)).toBe(false);
    expect(
      fs.readFileSync(
        path.join(fixture.taskDir, "execution-contract.md"),
        "utf-8",
      ),
    ).not.toMatch(/[\p{Script=Han}]/u);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  it("requires real database evidence without inventing an application startup", () => {
    const fixture = createDirect(
      "创建 MySQL 数据库迁移并完成真实 SQL 写读与清理验收",
      "sdd",
      "zh",
    );
    const execution = readManagedExecutionContract(fixture.contract);
    expect(execution.tasks).toContainEqual({
      taskId: "E03",
      text: "完成任务级真实数据库验收",
      requiredCategories: ["runtime"],
      requiresChangedFiles: false,
    });
    const result: ExecutorResult = {
      status: "ready_for_review",
      summary: "数据库验收完成",
      changedFiles: ["sql/001-create-table.sql"],
      commands: [
        {
          command: "sh scripts/verify-db.sh",
          exitCode: 0,
          result: "真实数据库写读和清理完成",
          categories: ["test", "runtime"],
        },
      ],
      evidence: [path.join(fixture.taskDir, "execution-contract.md")],
      releasePrerequisites: [],
      blockers: [],
    };
    expect(evaluateCompletion(fixture.contract, result).localReady).toBe(true);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  it("uses full artifacts and canonical tasks for an SDD prompt", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow-artifact-full-"),
    );
    const change = path.join(root, "openspec", "changes", "demo");
    const prompt = path.join(change, "prompt", "implementation.md");
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.writeFileSync(
      prompt,
      [
        "# implementation",
        "",
        "- [design](../design.md)",
        "- [tests](../tests.md)",
        "- [report](../test-report.md)",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(change, "design.md"), "# design\n");
    fs.writeFileSync(path.join(change, "tests.md"), "# tests\n");
    fs.writeFileSync(path.join(change, "test-report.md"), "# report\n");
    fs.writeFileSync(path.join(change, "tasks.md"), "- [ ] 1.1 implement\n");
    const contract = createManagedTaskContract({
      request: prompt,
      projectRoot: root,
      source: "sdd",
      taskPromptPath: prompt,
      language: "en",
    });
    const state = initManagedRunState(contract);
    createManagedTaskFiles(contract, state, {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    });
    const execution = readManagedExecutionContract(contract);
    expect(execution.artifactLevel).toBe("full");
    expect(execution.canonicalTasksPath).toBe(path.join(change, "tasks.md"));
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          ".superflow",
          "tasks",
          contract.taskId,
          "context-manifest.json",
        ),
        "utf-8",
      ),
    ) as {
      entries: Array<{
        path: string;
        role: string;
        protection: string;
      }>;
    };
    expect(manifest.entries).toContainEqual(
      expect.objectContaining({
        path: path.join(change, "tasks.md"),
        role: "tasks",
        protection: "retain",
      }),
    );
    expect(manifest.entries).toContainEqual(
      expect.objectContaining({
        path: prompt,
        role: "implementation_prompt",
        protection: "immutable",
      }),
    );
    expect(manifest.entries).toContainEqual(
      expect.objectContaining({
        path: path.join(change, "test-report.md"),
        protection: "retain",
      }),
    );
    fs.writeFileSync(path.join(change, "tasks.md"), "- [x] 1.1 implement\n");
    fs.writeFileSync(path.join(change, "test-report.md"), "# report\npassed\n");
    expect(() => ensureManagedContextManifest(contract)).not.toThrow();
    fs.writeFileSync(path.join(change, "design.md"), "# changed design\n");
    expect(() => ensureManagedContextManifest(contract)).toThrow(
      "Managed context manifest is stale or invalid",
    );
    const projection = fs.readFileSync(
      path.join(
        root,
        ".superflow",
        "tasks",
        contract.taskId,
        "execution-contract.md",
      ),
      "utf-8",
    );
    expect(projection).not.toMatch(/[\p{Script=Han}]/u);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

function createDirect(
  request: string,
  profile: "quick" | "sdd",
  language: "zh" | "en",
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-artifact-"));
  const contract = createManagedTaskContract({
    request,
    projectRoot: root,
    profile,
    language,
  });
  createManagedTaskFiles(contract, initManagedRunState(contract), {
    ...process.env,
    SUPERFLOW_HOME: path.join(root, "home"),
  });
  return {
    root,
    contract,
    taskDir: path.join(root, ".superflow", "tasks", contract.taskId),
  };
}
