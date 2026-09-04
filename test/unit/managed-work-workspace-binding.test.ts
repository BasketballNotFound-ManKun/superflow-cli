import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import { createManagedTaskFiles } from "../../src/domains/managed-work/storage.js";
import { ensureManagedWorkspaceBinding } from "../../src/domains/managed-work/workspace-binding.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("managed workspace binding", () => {
  it("freezes repository, worktree, and branch identity", () => {
    const fixture = createFixture("zh");
    const binding = ensureManagedWorkspaceBinding(fixture.contract);
    expect(binding.repositories[0].branch).toBe("main");
    expect(binding.repositories[0].repositoryIdentity).toMatch(/^[a-f0-9]{64}$/);

    git(fixture.root, "switch", "-c", "other");
    expect(() => ensureManagedWorkspaceBinding(fixture.contract)).toThrow(
      /托管工作区绑定校验失败：分支已从 main 变为 other/,
    );
  });

  it("writes an English portable locator without Chinese leakage", () => {
    const fixture = createFixture("en");
    const binding = ensureManagedWorkspaceBinding(fixture.contract);
    expect(binding.taskLocator).toBe(
      path.join(".superflow", "tasks", fixture.contract.taskId),
    );
    const projection = fs.readFileSync(
      path.join(
        fixture.root,
        binding.taskLocator,
        "workspace-binding.md",
      ),
      "utf-8",
    );
    expect(projection).not.toMatch(/[\p{Script=Han}]/u);
  });

  it("fails closed when a non-Git workspace is initialized during a task", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-binding-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "update fixture",
      projectRoot: root,
      language: "zh",
    });
    createManagedTaskFiles(contract, initManagedRunState(contract), {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    });

    ensureManagedWorkspaceBinding(contract);
    git(root, "init", "-b", "main");

    expect(() => ensureManagedWorkspaceBinding(contract)).toThrow(
      /托管工作区绑定校验失败：仓库身份已变化/,
    );
  });
});

function createFixture(language: "zh" | "en") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-binding-"));
  roots.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Superflow Test");
  git(root, "config", "user.email", "test@example.invalid");
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n");
  git(root, "add", "README.md");
  git(root, "commit", "-m", "fixture");
  const contract = createManagedTaskContract({
    request: "update fixture",
    projectRoot: root,
    language,
  });
  createManagedTaskFiles(contract, initManagedRunState(contract), {
    ...process.env,
    SUPERFLOW_HOME: path.join(root, "home"),
  });
  return { root, contract };
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf-8" }).trim();
}
