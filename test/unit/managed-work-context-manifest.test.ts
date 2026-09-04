import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import {
  ensureManagedContextManifest,
  managedContextManifestPath,
  validateManagedContextManifest,
} from "../../src/domains/managed-work/context-manifest.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import { createManagedTaskFiles } from "../../src/domains/managed-work/storage.js";

describe("managed execution context manifest", () => {
  it("freezes referenced design and task files by path and hash", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-context-"));
    const change = path.join(root, "openspec", "changes", "demo");
    const prompt = path.join(change, "prompt", "implementation.md");
    const design = path.join(change, "design.md");
    const tasks = path.join(change, "tasks.md");
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.writeFileSync(design, "# 设计\n");
    fs.writeFileSync(tasks, "- [ ] 实现接口\n");
    fs.writeFileSync(
      prompt,
      "# 实现任务\n\n- [设计](../design.md)\n- [任务](../tasks.md)\n",
    );
    const contract = createManagedTaskContract({
      request: prompt,
      projectRoot: root,
      source: "sdd",
      taskPromptPath: prompt,
      language: "zh",
    });
    createManagedTaskFiles(contract, initManagedRunState(contract), {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    });

    const manifest = ensureManagedContextManifest(contract);
    expect(manifest.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: design, role: "design" }),
        expect.objectContaining({ path: tasks, role: "tasks" }),
        expect.objectContaining({ role: "implementation_prompt" }),
      ]),
    );
    expect(manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      fs.readFileSync(managedContextManifestPath(contract), "utf-8"),
    ).not.toContain("# 设计");
    expect(
      fs.readFileSync(
        path.join(
          path.dirname(managedContextManifestPath(contract)),
          "context-manifest.md",
        ),
        "utf-8",
      ),
    ).toContain("托管执行上下文");

    fs.writeFileSync(design, "# 被篡改\n");
    expect(() => validateManagedContextManifest(manifest, contract)).toThrow(
      "执行上下文清单已漂移",
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("renders an English projection without copying referenced content", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow-context-en-"),
    );
    const contract = createManagedTaskContract({
      request: "Update one file",
      projectRoot: root,
      language: "en",
    });
    createManagedTaskFiles(contract, initManagedRunState(contract), {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    });
    const projection = fs.readFileSync(
      path.join(
        path.dirname(managedContextManifestPath(contract)),
        "context-manifest.md",
      ),
      "utf-8",
    );
    expect(projection).toContain("Managed Execution Context");
    expect(projection).not.toMatch(/[\p{Script=Han}]/u);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
