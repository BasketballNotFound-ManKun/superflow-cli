import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import {
  createManagedTaskFiles,
  saveManagedRun,
} from "../../src/domains/managed-work/storage.js";
import { waitForManagedTask } from "../../src/domains/managed-work/wait.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("managed work wait", () => {
  it("waits on local state and returns the terminal result", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-wait-"));
    roots.push(root);
    const env = {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    };
    const contract = createManagedTaskContract({
      request: "等待结果",
      projectRoot: root,
    });
    const state = initManagedRunState(contract);
    createManagedTaskFiles(contract, state, env);
    setTimeout(() => {
      state.status = "awaiting_git_approval";
      state.currentStep = "awaiting_git_approval";
      saveManagedRun(state);
    }, 20);

    const result = await waitForManagedTask(root, contract.taskId, state.runId, {
      pollMilliseconds: 5,
      serviceCheckMilliseconds: 5,
      ensureService: () => undefined,
    });

    expect(result.status).toBe("awaiting_git_approval");
  });
});
