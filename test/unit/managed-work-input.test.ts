import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveManagedInput } from "../../src/domains/managed-work/input.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("managed work input", () => {
  it("resolves a change directory to its implementation prompt", () => {
    const root = fixtureRoot();
    const changeDir = path.join(root, "openspec", "changes", "demo");
    const prompt = path.join(changeDir, "prompt", "p01-demo.md");
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.mkdirSync(path.join(changeDir, ".sdd"), { recursive: true });
    fs.writeFileSync(prompt, "# P01\n");
    fs.writeFileSync(
      path.join(changeDir, ".sdd", "state.yaml"),
      "phase: implement\nimplementation_prompt: prompt/p01-demo.md\n",
    );

    const result = resolveManagedInput(changeDir, {
      projectRoot: root,
      profile: "sdd",
    });

    expect(result.taskPromptPath).toBe(fs.realpathSync(prompt));
    expect(result.profile).toBe("sdd");
    expect(result.source).toBe("sdd");
  });

  it("accepts an implementation prompt file directly", () => {
    const root = fixtureRoot();
    const prompt = path.join(
      root,
      "openspec",
      "changes",
      "demo",
      "prompt",
      "p01-demo.md",
    );
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.writeFileSync(prompt, "# P01\n");

    const result = resolveManagedInput(prompt, {
      projectRoot: root,
      profile: "sdd",
    });

    expect(result.request).toBe(fs.realpathSync(prompt));
    expect(result.taskPromptPath).toBe(fs.realpathSync(prompt));
    expect(result.profile).toBe("sdd");
  });

  it("extracts the user-specified prompt path from a host instruction", () => {
    const root = fixtureRoot();
    const prompt = path.join(root, "prompt", "implementation.md");
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.writeFileSync(prompt, "# implementation\n");

    const result = resolveManagedInput(
      `使用托管，按照 ${prompt} 完成全部任务`,
      { projectRoot: root, profile: "sdd" },
    );

    expect(result.taskPromptPath).toBe(fs.realpathSync(prompt));
    expect(result.source).toBe("task_file");
  });

  it("rejects tasks.md as the SDD execution entry", () => {
    const root = fixtureRoot();
    const tasks = path.join(root, "openspec", "changes", "demo", "tasks.md");
    fs.mkdirSync(path.dirname(tasks), { recursive: true });
    fs.writeFileSync(tasks, "- [ ] work\n");

    expect(() =>
      resolveManagedInput(tasks, { projectRoot: root, profile: "sdd" }),
    ).toThrow("不是 Agent 执行 Prompt");
  });

  it("returns English input errors when English is selected", () => {
    const root = fixtureRoot();
    const tasks = path.join(root, "openspec", "changes", "demo", "tasks.md");
    fs.mkdirSync(path.dirname(tasks), { recursive: true });
    fs.writeFileSync(tasks, "- [ ] work\n");

    expect(() =>
      resolveManagedInput(tasks, {
        projectRoot: root,
        profile: "sdd",
        language: "en",
      }),
    ).toThrow("tasks.md is a checklist");
  });

  it("defaults to native and preserves the original natural request", () => {
    const root = fixtureRoot();
    const request = "  修复登录失败  ";
    expect(resolveManagedInput(request, { projectRoot: root })).toMatchObject({
      request,
      profile: "native",
      source: "direct_prompt",
    });
  });

  it("keeps skill commands and relative or absolute document directories", () => {
    const root = fixtureRoot();
    fs.mkdirSync(path.join(root, "docs"));
    for (const request of [
      "docs",
      "/my-skill docs",
      `/my-skill ${root}/docs`,
    ]) {
      expect(
        resolveManagedInput(request, { projectRoot: root, profile: "auto" }),
      ).toMatchObject({ request, profile: "native", source: "direct_prompt" });
    }
  });

  it("freezes a pure file reference without replacing skill requests", () => {
    const root = fixtureRoot();
    const file = path.join(root, "tasks.md");
    fs.writeFileSync(file, "work");
    expect(
      resolveManagedInput("tasks.md", { projectRoot: root }),
    ).toMatchObject({
      request: "tasks.md",
      taskPromptPath: fs.realpathSync(file),
    });
    expect(
      resolveManagedInput("/my-skill tasks.md", { projectRoot: root })
        .taskPromptPath,
    ).toBeUndefined();
  });

  it("rejects native existing paths outside allowed roots including symlinks", () => {
    const root = fixtureRoot();
    const outside = fixtureRoot();
    fs.symlinkSync(outside, path.join(root, "escape"));
    for (const request of [`/my-skill ${outside}`, "/my-skill escape"]) {
      expect(() => resolveManagedInput(request, { projectRoot: root })).toThrow(
        "不在项目目录",
      );
    }
    expect(
      resolveManagedInput(`/my-skill ${outside}`, {
        projectRoot: root,
        relatedProjectRoots: [outside],
      }).projectRoot,
    ).toBe(fs.realpathSync(root));
  });

  it("accepts quoted directories with spaces and validates every reference", () => {
    const root = fixtureRoot();
    const outside = fixtureRoot();
    fs.mkdirSync(path.join(root, "my docs"));
    const request = '/my-skill "my docs"';
    expect(
      resolveManagedInput(request, { projectRoot: root, profile: "native" }),
    ).toMatchObject({ request, profile: "native" });
    expect(() =>
      resolveManagedInput(`${request} [other](${outside})`, {
        projectRoot: root,
      }),
    ).toThrow("不在项目目录");
  });

  it("rejects an empty native request", () => {
    expect(() => resolveManagedInput("  ")).toThrow("不能为空");
  });

  it("keeps a normal sentence as a direct managed request", () => {
    const root = fixtureRoot();

    const result = resolveManagedInput("修复登录失败", {
      projectRoot: root,
      profile: "sdd",
    });

    expect(result.source).toBe("direct_prompt");
    expect(result.taskPromptPath).toBeUndefined();
  });
});

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-input-"));
  roots.push(root);
  return root;
}
