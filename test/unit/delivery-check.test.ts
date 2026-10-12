import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "../..");
const DELIVERY = path.join(
  ROOT,
  "assets",
  "scripts",
  "superflow-delivery-check.sh",
);

let tmp: string;

async function write(relative: string, content: string): Promise<void> {
  const file = path.join(tmp, relative);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content);
}

describe("superflow delivery check", () => {
  beforeEach(async () => {
    tmp = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "superflow-delivery-"),
    );
    await execFileAsync("git", ["init"], { cwd: tmp });
    await write("src/main/java/example/App.java", "class App {}\n");
  });

  afterEach(async () => {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("detects active lifecycle state even when .sdd-enforced is missing", async () => {
    await write(
      "openspec/changes/sample/.sdd/state.yaml",
      "phase: implement\narchived: false\n",
    );
    await execFileAsync("git", ["add", "src/main/java/example/App.java"], {
      cwd: tmp,
    });

    await expect(
      execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
    ).rejects.toMatchObject({
      stdout: expect.stringContaining("没有 staged 当前任务的 test-report.md"),
      stderr: "",
    });
  });

  it("does not enforce SDD delivery when no lifecycle is active", async () => {
    await execFileAsync("git", ["add", "src/main/java/example/App.java"], {
      cwd: tmp,
    });

    await expect(
      execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
    ).resolves.toMatchObject({ stdout: "" });
  });

  it("allows standalone SQL changes without an SDD task report", async () => {
    await write(".sdd-enforced", "");
    await write("sql/v1.2.0/v1.2.0.test5.sql", "UPDATE sys_config;\n");
    await execFileAsync(
      "git",
      ["add", ".sdd-enforced", "sql/v1.2.0/v1.2.0.test5.sql"],
      { cwd: tmp },
    );

    await expect(
      execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
    ).resolves.toMatchObject({
      stdout: "SDD 交付完整性检查通过\n",
    });
  });

  it("still requires a report for runtime code in an enforced SDD project", async () => {
    await write(".sdd-enforced", "");
    await execFileAsync("git", ["add", ".sdd-enforced", "src"], {
      cwd: tmp,
    });

    await expect(
      execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
    ).rejects.toMatchObject({
      stdout: expect.stringContaining("没有 staged 当前任务的 test-report.md"),
    });
  });

  it("requires a report when SQL and active SDD docs change together", async () => {
    await write(".sdd-enforced", "");
    await write("sql/v1.2.0/v1.2.0.test5.sql", "UPDATE sys_config;\n");
    await write(
      "openspec/changes/sample/specs/example/spec.md",
      "# Requirement\n",
    );
    await execFileAsync(
      "git",
      ["add", ".sdd-enforced", "sql", "openspec"],
      { cwd: tmp },
    );

    await expect(
      execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
    ).rejects.toMatchObject({
      stdout: expect.stringContaining("没有 staged 当前任务的 test-report.md"),
    });
  });

  it("does not revalidate incomplete documents moved into archive", async () => {
    await write(".sdd-enforced", "");
    await write(
      "openspec/changes/archive/2026-07-14-sample/embedded-changes/" +
        "p01-history/tasks.md",
      "- [ ] historical task\n",
    );
    await execFileAsync("git", ["add", ".sdd-enforced", "openspec"], {
      cwd: tmp,
    });

    await expect(
      execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
    ).resolves.toMatchObject({ stdout: "SDD 交付完整性检查通过\n" });
  });

  it.each([
    "```text\nTODO: 填写真实执行结果\n```\n",
    "```markdown\n| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |\n" +
      "|---|---|---|---|---|\n| C1 | E1 | api | PASS | example.json |\n```\n",
  ])("keeps fenced examples out of blocked document closeout: %s", async (example) => {
    await write(
      "openspec/changes/sample/embedded-changes/p01-doc/test-report.md",
      "验证结果: BLOCKED\nBlocked: SDD 文档范围冻结，未进入实现，外部权限不可得。\n" +
        example,
    );
    await execFileAsync("git", ["add", "openspec"], { cwd: tmp });
    await expect(
      execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("SDD 交付完整性检查通过"),
    });
  });

  it("still rejects real body placeholders in blocked document closeout", async () => {
    await write(
      "openspec/changes/sample/embedded-changes/p01-doc/test-report.md",
      "验证结果: BLOCKED\nBlocked: SDD 文档范围冻结，未进入实现。\nTODO: 回填结果\n",
    );
    await execFileAsync("git", ["add", "openspec"], { cwd: tmp });
    await expect(
      execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
    ).rejects.toMatchObject({
      code: 2,
      stdout: expect.stringContaining("交付占位"),
    });
  });

  it("does not exempt real PASS cases as blocked document-only work", async () => {
    await write(
      "openspec/changes/sample/embedded-changes/p01-doc/test-report.md",
      "验证结果: BLOCKED\nBlocked: SDD 文档范围冻结，未进入实现。\n" +
        "| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |\n" +
        "|---|---|---|---|---|\n| C1 | E1 | api | PASS | actual.json |\n",
    );
    await execFileAsync("git", ["add", "openspec"], { cwd: tmp });
    await expect(
      execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
    ).rejects.toMatchObject({
      code: 2,
      stdout: expect.stringContaining("完整交付要求最终验证结果 PASS"),
    });
  });

  it.each(["FAIL", "失败", "UNKNOWN", "未知", "MISSING"])(
    "does not exempt a final %s using historical Blocked wording",
    async (result) => {
      await write(
        "openspec/changes/sample/embedded-changes/p01-doc/test-report.md",
        "验证结果: BLOCKED\nBlocked: SDD 文档范围冻结，未进入实现。\n" +
          `验证结果: ${result}\n`,
      );
      await execFileAsync("git", ["add", "openspec"], { cwd: tmp });
      await expect(
        execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
      ).rejects.toMatchObject({
        code: 2,
        stdout: expect.stringContaining("完整交付要求最终验证结果 PASS"),
      });
    },
  );

  it("preserves a legacy document freeze report without a final summary", async () => {
    await write(
      "openspec/changes/sample/embedded-changes/p01-doc/test-report.md",
      "Blocked: SDD 文档范围冻结，未进入实现，外部权限不可得。\n",
    );
    await execFileAsync("git", ["add", "openspec"], { cwd: tmp });
    await expect(
      execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("SDD 交付完整性检查通过"),
    });
  });
});
