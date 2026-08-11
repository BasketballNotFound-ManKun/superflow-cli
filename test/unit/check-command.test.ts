import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectCheck } from "../../src/app/commands/check.js";

let root: string;
let change: string;

describe("check command levels", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-check-"));
    change = path.join(root, "openspec", "changes", "demo");
    for (const file of [
      ".openspec.yaml",
      "proposal.md",
      "api.md",
      "design.md",
      "tasks.md",
      "tests.md",
      "traceability-matrix.md",
      "review-checklist.md",
      "sdd-quality-gate.md",
      "test-report.md",
      "spec.md",
      ".sdd/handoff/sdd-context.md",
      ".sdd/handoff/sdd-context.json",
      ".sdd/handoff/sdd-context.sha256",
      ".sdd/state.yaml",
    ]) {
      const target = path.join(change, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(
        target,
        file === ".sdd/state.yaml" ? "phase: docs\n" : "\n",
      );
    }
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("treats a missing Understand index as a documented fallback, not a blocker", () => {
    const result = collectCheck(change, "demo");
    expect(result.failed).toBe(0);
    expect(
      result.items.find(
        (item) => item.file === ".understand-anything/knowledge-graph.json",
      ),
    ).toMatchObject({ required: false, exists: false });
  });
});
