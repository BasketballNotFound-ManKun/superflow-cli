import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { readManagedEvents } from "../../src/domains/managed-work/journal.js";
import { resumeHumanDirectedAfterReview } from "../../src/domains/managed-work/control.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import {
  createManagedTaskFiles,
  loadManagedRun,
  loadRegistry,
  saveManagedRun,
} from "../../src/domains/managed-work/storage.js";

describe("human-directed Host review recovery", () => {
  it("returns a needs-fix review to manual execution without launching an Agent", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "manual-review-"));
    const env = {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
      SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1",
    };
    try {
      const contract = createManagedTaskContract({
        request: "review: inspect one source file",
        projectRoot: root,
        executionMode: "human_directed",
      });
      const initial = initManagedRunState(contract);
      createManagedTaskFiles(contract, initial, env);
      const runDir = path.join(root, ".superflow", "tasks", contract.taskId,
        "runs", initial.runId);
      const resultPath = path.join(runDir, "review-result-1.json");
      fs.writeFileSync(resultPath, JSON.stringify({
        protocolVersion: "superflow.review.v2",
        messageType: "host_review",
        result: "needs_fix",
        summary: "补齐被排除文件的理由",
        findings: [{
          id: "F-1",
          severity: "high",
          blocking: true,
          category: "coverage",
          target: "review report",
          evidence: "one changed file was not accounted for",
          risk: "incomplete review",
          requiredFix: "account for the omitted file",
          acceptanceChecks: ["all changed files have a reason"],
        }],
      }));
      initial.status = "queued";
      initial.currentStep = "external_review_received";
      initial.reviewRound = 1;
      initial.reviewInvocations = 1;
      initial.lastReviewResult = resultPath;
      saveManagedRun(initial);

      const result = await resumeHumanDirectedAfterReview(contract.taskId, env);

      expect(result.status).toBe("waiting_for_human");
      expect(result.currentStep).toBe("waiting_for_manual_delivery");
      expect(loadManagedRun(root, contract.taskId, initial.runId).status)
        .toBe("waiting_for_human");
      expect(loadRegistry(env).tasks[0].status).toBe("waiting_for_human");
      expect(readManagedEvents(result).map((event) => event.eventType))
        .toEqual(expect.arrayContaining([
          "review.ended",
          "review.manual_rework_requested",
        ]));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
