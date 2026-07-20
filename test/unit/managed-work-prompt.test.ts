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
import { buildExecutorPrompt, buildReviewPrompt } from "../../src/domains/managed-work/prompts.js";

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

  it("builds English executor and reviewer prompts without Chinese text", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-prompt-en-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "Implement the task",
      projectRoot: root,
      language: "en",
    });
    const state = initManagedRunState(contract);

    const executor = buildExecutorPrompt(contract, state);
    const reviewer = buildReviewPrompt(contract, state);

    expect(executor).toContain("only executor allowed to modify");
    expect(reviewer).toContain("persistent read-only reviewer");
    expect(`${executor}\n${reviewer}`).not.toMatch(/[\p{Script=Han}]/u);
  });
});
