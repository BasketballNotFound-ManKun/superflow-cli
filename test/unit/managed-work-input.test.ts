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

    const result = resolveManagedInput(changeDir, { projectRoot: root });

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

    const result = resolveManagedInput(prompt, { projectRoot: root });

    expect(result.request).toBe(fs.realpathSync(prompt));
    expect(result.taskPromptPath).toBe(fs.realpathSync(prompt));
    expect(result.profile).toBe("sdd");
  });

  it("rejects tasks.md as the SDD execution entry", () => {
    const root = fixtureRoot();
    const tasks = path.join(root, "openspec", "changes", "demo", "tasks.md");
    fs.mkdirSync(path.dirname(tasks), { recursive: true });
    fs.writeFileSync(tasks, "- [ ] work\n");

    expect(() => resolveManagedInput(tasks, { projectRoot: root })).toThrow(
      "不是 Agent 执行 Prompt",
    );
  });

  it("returns English input errors when English is selected", () => {
    const root = fixtureRoot();
    const tasks = path.join(root, "openspec", "changes", "demo", "tasks.md");
    fs.mkdirSync(path.dirname(tasks), { recursive: true });
    fs.writeFileSync(tasks, "- [ ] work\n");

    expect(() =>
      resolveManagedInput(tasks, { projectRoot: root, language: "en" }),
    ).toThrow("tasks.md is a checklist");
  });

  it("keeps a normal sentence as a direct managed request", () => {
    const root = fixtureRoot();

    const result = resolveManagedInput("修复登录失败", { projectRoot: root });

    expect(result.source).toBe("direct_prompt");
    expect(result.taskPromptPath).toBeUndefined();
  });
});

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-input-"));
  roots.push(root);
  return root;
}
