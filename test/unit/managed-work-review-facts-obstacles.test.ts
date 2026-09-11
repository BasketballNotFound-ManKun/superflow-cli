import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectExecutorObstacles } from "../../src/domains/managed-work/review-facts.js";

const roots: string[] = [];

afterEach(() => {
  roots.splice(0).forEach((root) => {
    fs.rmSync(root, { recursive: true, force: true });
  });
});

function createRunDir(logs: Record<string, string>): string {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "managed-obstacles-"));
  roots.push(runDir);
  for (const [name, content] of Object.entries(logs)) {
    fs.writeFileSync(path.join(runDir, name), content, "utf-8");
  }
  return runDir;
}

function rejection(line: string): string {
  return `2026-09-11T07:14:0${line}Z ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: [Superflow managed-work guard] 写入工具缺少目标路径 demo ${line}`;
}

describe("collectExecutorObstacles", () => {
  it("inspects only the most recent stderr logs and reports the scope", () => {
    const runDir = createRunDir({
      "executor-1-stderr.log": rejection(1),
      "executor-2-stderr.log": rejection(2),
      "executor-3-stderr.log": rejection(3),
      "executor-6-failed-stderr.log": rejection(6),
      "executor-7-failed-stderr.log": rejection(7),
    });
    const obstacles = collectExecutorObstacles(runDir, null);
    expect(obstacles.inspection.totalStderrLogCount).toBe(5);
    expect(obstacles.inspection.inspectedLogCount).toBe(3);
    expect(obstacles.inspection.inspectedLogs).toEqual([
      "executor-7-failed-stderr.log",
      "executor-6-failed-stderr.log",
      "executor-3-stderr.log",
    ]);
    expect(obstacles.guardedRejectionCount).toBe(3);
    expect(obstacles.recentRejections.join("\n")).not.toContain("demo 1");
    expect(obstacles.recentRejections.join("\n")).not.toContain("demo 2");
  });

  it("reads only the tail of oversized logs", () => {
    const filler = "x".repeat(64 * 1024 + 16);
    const runDir = createRunDir({
      "executor-9-stderr.log": [
        rejection(8),
        filler,
        rejection(9),
      ].join("\n"),
    });
    const obstacles = collectExecutorObstacles(runDir, null);
    expect(obstacles.guardedRejectionCount).toBe(1);
    expect(obstacles.recentRejections.join("\n")).toContain("demo 9");
    expect(obstacles.recentRejections.join("\n")).not.toContain("demo 8");
  });

  it("redacts credentials inside rejection samples", () => {
    const runDir = createRunDir({
      "executor-2-stderr.log":
        "error=Command blocked by PreToolUse hook: guard rejected DB_PASSWORD=supersecret value",
    });
    const obstacles = collectExecutorObstacles(runDir, null);
    expect(obstacles.recentRejections.join("\n")).not.toContain("supersecret");
    expect(obstacles.recentRejections.join("\n")).toContain("<redacted>");
  });

  it("returns empty obstacles for a run directory without stderr logs", () => {
    const runDir = createRunDir({});
    const obstacles = collectExecutorObstacles(runDir, null);
    expect(obstacles.guardedRejectionCount).toBe(0);
    expect(obstacles.recentRejections).toHaveLength(0);
    expect(obstacles.inspection.totalStderrLogCount).toBe(0);
    expect(obstacles.lastInvocationFailure).toBeNull();
  });
});
