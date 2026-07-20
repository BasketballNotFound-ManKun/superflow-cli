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
});
