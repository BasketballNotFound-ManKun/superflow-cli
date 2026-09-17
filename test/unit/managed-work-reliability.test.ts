import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import {
  ensureSuperflowGitignore,
} from "../../src/domains/managed-work/gitignore.js";
import {
  classifyManagedProfile,
} from "../../src/domains/managed-work/contract.js";
import {
  environmentUnreachableBlocker,
} from "../../src/domains/managed-work/runner.js";
import { createManagedTaskFiles } from "../../src/domains/managed-work/storage.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";

describe("managed work reliability hardening", () =>
{
  it("covers partial and negated ignore rules using actual git semantics", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sf-ignore-git-"));
    try {
      execFileSync("git", ["init", "-q", root]);
      fs.writeFileSync(path.join(root, ".gitignore"), ".superflow/tasks/\n!.superflow/\n");
      ensureSuperflowGitignore(root);
      for (const file of [".superflow/probe.log", ".superflow/tasks/demo/state.json"]) {
        expect(execFileSync("git", ["check-ignore", file], { cwd: root, encoding: "utf8" }).trim()).toBe(file);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses symlinked ignore files without modifying their target", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sf-ignore-link-"));
    try {
      const target = path.join(root, "external-ignore");
      fs.writeFileSync(target, "original\n");
      fs.symlinkSync(target, path.join(root, ".gitignore"));
      expect(() => ensureSuperflowGitignore(root)).toThrow("symlinked");
      expect(fs.readFileSync(target, "utf8")).toBe("original\n");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it("recognizes truthful unreachable-environment blockers", () =>
  {
    expect(
      environmentUnreachableBlocker("无法连接共享开发数据库 MySQL：connection refused"),
    ).toBe(true);
    expect(
      environmentUnreachableBlocker("Redis cache is unavailable: timeout"),
    ).toBe(true);
    expect(environmentUnreachableBlocker("缺少业务设计决策，需要 Host 裁定")).toBe(
      false,
    );
  });

  it("keeps sdd requests that mention inspection words as code tasks", () =>
  {
    const contract = createManagedTaskContract({
      request: "接管 SDD 变更并检查越权接口的数据权限",
      projectRoot: "/tmp",
      source: "sdd",
    });
    expect(contract.taskKind).toBe("code");
  });

  it("classifies plain docs requests without source hints as docs-only", () =>
  {
    const contract = createManagedTaskContract({
      request: "修复 README 中的安装说明",
      projectRoot: "/tmp",
    });
    expect(contract.taskKind).toBe("docs-only");
  });

  it("idempotently appends superflow runtime ignore rules to project gitignore", () =>
  {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sfgi-"));
    try
    {
      ensureSuperflowGitignore(root);
      const first = fs.readFileSync(path.join(root, ".gitignore"), "utf-8");
      expect(first).toContain(".superflow/");
      ensureSuperflowGitignore(root);
      const second = fs.readFileSync(path.join(root, ".gitignore"), "utf-8");
      expect(second).toBe(first);
    }
    finally
    {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("extends a partial tasks ignore to cover all runtime files", () =>
  {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sfgi2-"));
    try
    {
      fs.writeFileSync(
        path.join(root, ".gitignore"),
        "node_modules/\n.superflow/tasks/\n",
      );
      ensureSuperflowGitignore(root);
      expect(
        fs.readFileSync(path.join(root, ".gitignore"), "utf-8"),
      ).toContain("\n.superflow/\n");
    }
    finally
    {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("classifies monitoring requests as monitor profile", () =>
  {
    expect(classifyManagedProfile("持续观察构建状态")).toBe("monitor");
  });

  it("writes the superflow gitignore rule when a managed task is created", () =>
  {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sftask-"));
    try
    {
      const contract = createManagedTaskContract({
        request: "修复一个代码问题",
        projectRoot: root,
      });
      const state = initManagedRunState(contract);
      createManagedTaskFiles(contract, state);
      expect(
        fs.readFileSync(path.join(root, ".gitignore"), "utf-8"),
      ).toContain(".superflow/");
      expect(
        fs.existsSync(path.join(root, ".superflow", "tasks", contract.taskId)),
      ).toBe(true);
    }
    finally
    {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
