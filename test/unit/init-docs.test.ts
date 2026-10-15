import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync as fsWrite } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initDocsCommand } from "../../src/app/commands/init-docs.js";

let tmp: string;
let changeDir: string;

beforeEach(() => {
  tmp = path.join(os.tmpdir(), `superflow-init-docs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  changeDir = path.join(tmp, "openspec", "changes", "demo-change");
  mkdirSync(changeDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("initDocsCommand", () => {
  it("在默认工作区生成全部必备文档骨架", () => {
    mkdirSync(path.join(tmp, "openspec", "changes", "demo-change"), { recursive: true });
    initDocsCommand("demo-change", { projectPath: tmp });
    for (const f of [
      "proposal.md", "design.md", "tasks.md", "api.md", "tests.md",
      "release-sql.md", "source-code-audit.md", "review-checklist.md", "traceability-matrix.md",
      "sdd-quality-gate.md", "test-report.md", "prompt/implementation.md",
    ]) {
      expect(existsSync(path.join(changeDir, f)), f).toBe(true);
    }
  });

  it("已存在文件默认跳过，--force 覆盖", () => {
    initDocsCommand("demo-change", { projectPath: tmp });
    const proposal = path.join(changeDir, "proposal.md");
    fsWrite(proposal, "custom", "utf-8");
    initDocsCommand("demo-change", { projectPath: tmp });
    expect(readFileSync(proposal, "utf-8")).toBe("custom");
    initDocsCommand("demo-change", { projectPath: tmp, force: true });
    expect(readFileSync(proposal, "utf-8")).not.toBe("custom");
  });

  it("模板业务无关：不含任何占位业务词，且嵌入通用质量门声明", () => {
    initDocsCommand("demo-change", { projectPath: tmp });
    const gate = readFileSync(path.join(changeDir, "sdd-quality-gate.md"), "utf-8");
    expect(gate).toContain("Concurrency And Idempotency Ownership");
    expect(gate).toContain("Money Precision Boundary");
    expect(gate).toContain("External Integration Configuration And Deployment Contract");
    expect(gate).toContain("复杂度减法评审");
    const design = readFileSync(path.join(changeDir, "design.md"), "utf-8");
    expect(design).toContain("owner-decided");
    const audit = readFileSync(path.join(changeDir, "source-code-audit.md"), "utf-8");
    expect(audit).toContain("验证命令");
    // 业务无关性：模板不应包含任何具体业务表/接口名
    for (const f of ["proposal.md", "design.md", "sdd-quality-gate.md", "prompt/implementation.md"]) {
      const content = readFileSync(path.join(changeDir, f), "utf-8");
      expect(content.includes("map_info"), f).toBe(false);
      expect(content.includes("PVD"), f).toBe(false);
      expect(content.includes("parking"), f).toBe(false);
    }
  });
});
