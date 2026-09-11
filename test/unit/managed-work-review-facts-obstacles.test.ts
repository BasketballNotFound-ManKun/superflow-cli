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

describe("collectExecutorObstacles", () => {
  it("counts guarded rejections across stderr logs and keeps raw lines", () => {
    const runDir = createRunDir({
      "executor-2-stderr.log": [
        "2026-09-11T07:14:09Z ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: [Superflow managed-work guard] 写入工具缺少目标路径，按失败关闭。 Command: *** Begin Patch",
        "2026-09-11T07:14:15Z ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: [Superflow managed-work guard] 写入工具缺少目标路径，按失败关闭。 Command: *** Begin Patch",
      ].join("\n"),
      "executor-3-stderr.log":
        "2026-09-11T07:09:31Z ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: [Superflow managed-work guard] 执行角色的 Bash 禁止直接访问托管运行目录，请使用只读工具。\n",
    });
    const obstacles = collectExecutorObstacles(runDir, null);
    expect(obstacles.guardedRejectionCount).toBe(3);
    expect(obstacles.recentRejections).toHaveLength(3);
    expect(obstacles.recentRejections[0]).toContain("写入工具缺少目标路径");
    expect(obstacles.lastInvocationFailure).toBeNull();
  });

  it("also matches failed-invocation stderr logs and caps samples at five", () => {
    const runDir = createRunDir({
      "executor-6-failed-stderr.log": Array.from(
        { length: 7 },
        (_, index) =>
          `line ${index}: Command blocked by PreToolUse hook: [Superflow managed-work guard] 写入工具缺少目标路径 demo ${index}`,
      ).join("\n"),
    });
    const obstacles = collectExecutorObstacles(
      runDir,
      "codex 调用失败，退出码 1: Selected model is at capacity. Please try a different model.",
    );
    expect(obstacles.guardedRejectionCount).toBe(7);
    expect(obstacles.recentRejections).toHaveLength(5);
    expect(obstacles.lastInvocationFailure).toContain("at capacity");
  });

  it("returns empty obstacles for a run directory without stderr logs", () => {
    const runDir = createRunDir({});
    const obstacles = collectExecutorObstacles(runDir, null);
    expect(obstacles.guardedRejectionCount).toBe(0);
    expect(obstacles.recentRejections).toHaveLength(0);
    expect(obstacles.lastInvocationFailure).toBeNull();
  });
});
