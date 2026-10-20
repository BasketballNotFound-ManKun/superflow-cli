import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import { createManagedTaskFiles } from "../../src/domains/managed-work/storage.js";
import {
  ensureManagedWorkspaceBinding,
  validateManagedWorkspaceBinding,
  writeManagedWorkspaceBinding,
} from "../../src/domains/managed-work/workspace-binding.js";

import { ensureManagedContextManifest } from "../../src/domains/managed-work/context-manifest.js";

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
    expect(binding.repositories[0].repositoryIdentity).toMatch(
      /^[a-f0-9]{64}$/,
    );

    git(fixture.root, "switch", "-c", "other");
    expect(() => ensureManagedWorkspaceBinding(fixture.contract)).toThrow(
      /托管工作区绑定校验失败：分支已从 main 变为 other/,
    );
  });

  it("native permits branch changes and commits while retaining the original audit binding", () => {
    const fixture = createFixture("zh", "native");
    const binding = ensureManagedWorkspaceBinding(fixture.contract);
    git(fixture.root, "switch", "-c", "native-work");
    fs.writeFileSync(path.join(fixture.root, "README.md"), "changed\n");
    git(fixture.root, "add", "README.md");
    git(fixture.root, "commit", "-m", "change");
    expect(ensureManagedWorkspaceBinding(fixture.contract)).toEqual(binding);
    expect(binding.repositories[0].branch).toBe("main");
  });

  it("native permits initializing and committing in an originally non-Git root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-binding-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "initialize",
      projectRoot: root,
      profile: "native",
    });
    const binding = ensureManagedWorkspaceBinding(contract);
    expect(binding.repositories[0].worktreeIdentity).toBeNull();
    git(root, "init", "-b", "main");
    git(
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "--allow-empty",
      "-m",
      "initial",
    );
    expect(
      ensureManagedWorkspaceBinding(contract).repositories[0],
    ).toMatchObject(binding.repositories[0]);
  });

  it("pins the first native Git initialization and rejects later metadata replacement", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-binding-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "initialize",
      projectRoot: root,
      profile: "native",
    });
    ensureManagedWorkspaceBinding(contract);
    git(root, "init", "-b", "main");
    git(
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "--allow-empty",
      "-m",
      "initial",
    );
    const initialized = ensureManagedWorkspaceBinding(contract);
    expect(initialized.repositories[0].worktreeIdentity).toBeNull();
    git(
      root,
      "init",
      "--separate-git-dir",
      path.join(root, "replacement-metadata"),
    );
    expect(() => ensureManagedWorkspaceBinding(contract)).toThrow(
      "Git worktree 已变化",
    );
  });

  it("refreshes only the Runner binding hash after initialization and fails on other frozen drift", () => {
    for (const drift of [false, true]) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-binding-"));
      roots.push(root);
      const contract = createManagedTaskContract({
        request: "initialize",
        projectRoot: root,
        profile: "native",
      });
      createManagedTaskFiles(contract, initManagedRunState(contract), {
        ...process.env,
        SUPERFLOW_HOME: path.join(root, "home"),
      });
      const before = ensureManagedContextManifest(contract);
      git(root, "init", "-b", "main");
      if (drift) {
        fs.appendFileSync(
          path.join(root, ".superflow", "tasks", contract.taskId, "request.md"),
          "tampered",
        );
        expect(() => ensureManagedWorkspaceBinding(contract)).toThrow(
          "清单已漂移",
        );
        continue;
      }
      ensureManagedWorkspaceBinding(contract);
      const after = ensureManagedContextManifest(contract);
      expect(
        after.entries.filter(
          (entry) => !entry.path.endsWith("workspace-binding.json"),
        ),
      ).toEqual(
        before.entries.filter(
          (entry) => !entry.path.endsWith("workspace-binding.json"),
        ),
      );
      git(
        root,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "--allow-empty",
        "-m",
        "initial",
      );
      ensureManagedWorkspaceBinding(contract);
      expect(() => ensureManagedContextManifest(contract)).not.toThrow();
      git(
        root,
        "init",
        "--separate-git-dir",
        path.join(root, "different-metadata"),
      );
      expect(() => ensureManagedWorkspaceBinding(contract)).toThrow(
        "Git worktree 已变化",
      );
    }
  });

  it("native pins the first commit of an initially unborn repository", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-binding-"));
    roots.push(root);
    git(root, "init", "-b", "main");
    git(root, "config", "user.name", "Superflow Test");
    git(root, "config", "user.email", "test@example.invalid");
    const contract = createManagedTaskContract({
      request: "first commit",
      projectRoot: root,
      profile: "native",
    });
    createManagedTaskFiles(contract, initManagedRunState(contract), {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    });
    const original = ensureManagedWorkspaceBinding(contract);
    git(root, "commit", "--allow-empty", "-m", "first");
    const committed = ensureManagedWorkspaceBinding(contract);
    expect(committed.repositories[0]).toMatchObject(original.repositories[0]);
    expect(
      committed.repositories[0].nativeInitialized?.headAtStart,
    ).toBeTruthy();
    expect(() => ensureManagedContextManifest(contract)).not.toThrow();
    git(root, "checkout", "--orphan", "replacement");
    git(root, "commit", "--allow-empty", "-m", "replacement");
    expect(() => ensureManagedWorkspaceBinding(contract)).toThrow(
      "仓库身份已变化",
    );
  });

  it("native rejects changed configured roots and Git metadata locations", () => {
    const fixture = createFixture("zh", "native");
    const other = createFixture("zh", "native");
    const binding = ensureManagedWorkspaceBinding(fixture.contract);
    expect(() =>
      validateManagedWorkspaceBinding(binding, {
        ...fixture.contract,
        projectRoot: other.root,
      }),
    ).toThrow("工作区根目录已变化");
    git(
      fixture.root,
      "init",
      "--separate-git-dir",
      path.join(fixture.root, "git-metadata"),
    );
    expect(() => ensureManagedWorkspaceBinding(fixture.contract)).toThrow(
      "Git worktree 已变化",
    );
  });

  it("native keeps repository identity checks for an existing Git root", () => {
    const fixture = createFixture("zh", "native");
    const binding = ensureManagedWorkspaceBinding(fixture.contract);
    git(fixture.root, "checkout", "--orphan", "replacement");
    git(fixture.root, "commit", "-m", "replacement root");
    expect(() =>
      validateManagedWorkspaceBinding(binding, fixture.contract),
    ).toThrow("仓库身份已变化");
  });

  it("native rejects redirecting a configured symlink root", () => {
    const fixture = createFixture("zh", "native");
    const other = createFixture("zh", "native");
    const link = path.join(fixture.root, "alias");
    fs.symlinkSync(fixture.root, link);
    const contract = { ...fixture.contract, projectRoot: link };
    const binding = writeManagedWorkspaceBinding(contract);
    fs.unlinkSync(link);
    fs.symlinkSync(other.root, link);
    expect(() => validateManagedWorkspaceBinding(binding, contract)).toThrow(
      "真实目录已变化",
    );
  });

  it("writes an English portable locator without Chinese leakage", () => {
    const fixture = createFixture("en");
    const binding = ensureManagedWorkspaceBinding(fixture.contract);
    expect(binding.taskLocator).toBe(
      path.join(".superflow", "tasks", fixture.contract.taskId),
    );
    const projection = fs.readFileSync(
      path.join(fixture.root, binding.taskLocator, "workspace-binding.md"),
      "utf-8",
    );
    expect(projection).not.toMatch(/[\p{Script=Han}]/u);
  });

  it("fails closed when a non-Git workspace is initialized during a task", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-binding-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      profile: "engineering",
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

function createFixture(
  language: "zh" | "en",
  profile: "engineering" | "native" = "engineering",
) {
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
    profile,
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
