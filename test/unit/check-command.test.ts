import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
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

  it("emits structured JSON when coding-ready stops on missing documents", () => {
    fs.rmSync(path.join(change, "api.md"));
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        createRequire(import.meta.url).resolve("tsx/esm"),
        path.resolve(__dirname, "../../src/app/cli.ts"),
        "check",
        "demo",
        "--level",
        "coding-ready",
        "--json",
      ],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.ready).toBe(false);
    expect(report.failed).toBeGreaterThan(0);
    expect(report.items).toContainEqual(
      expect.objectContaining({ file: "api.md", exists: false }),
    );
  });

  it("treats a missing Understand index as a documented fallback, not a blocker", () => {
    const result = collectCheck(change, "demo");
    expect(result.failed).toBe(0);
    expect(
      result.items.find((item) => item.file === ".ua/knowledge-graph.json"),
    ).toMatchObject({ required: false, exists: false });
  });

  it("detects the current Understand index at the project root", () => {
    const graph = path.join(root, ".ua", "knowledge-graph.json");
    fs.mkdirSync(path.dirname(graph), { recursive: true });
    fs.writeFileSync(graph, "{}");

    const result = collectCheck(change, "demo");
    expect(
      result.items.find((item) => item.file === ".ua/knowledge-graph.json"),
    ).toMatchObject({ required: false, exists: true });
  });
});
