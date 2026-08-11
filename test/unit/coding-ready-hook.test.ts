import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const HOOK = path.join(ROOT, "assets", "scripts", "superflow-hook-guard.sh");

let repo: string;
let sourceFile: string;
let change: string;

describe("coding-ready source edit hook", () => {
  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-ready-hook-"));
    spawnSync("git", ["init"], { cwd: repo });
    fs.writeFileSync(path.join(repo, ".sdd-enforced"), "\n");
    sourceFile = path.join(repo, "src", "index.ts");
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, "export const value = 1;\n");
    change = path.join(repo, "openspec", "changes", "demo");
    fs.mkdirSync(path.join(change, ".sdd", "handoff"), { recursive: true });
    fs.writeFileSync(
      path.join(change, ".sdd", "state.yaml"),
      "phase: implement\nhandoff_hash: pending\n",
    );
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("blocks runtime edits before a current coding-ready receipt exists", () => {
    const result = runHook(sourceFile);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Coding Ready");
  });

  it("allows runtime edits with a receipt bound to the current handoff hash", () => {
    const hash = createHash("sha256").update("current").digest("hex");
    fs.writeFileSync(
      path.join(change, ".sdd", "state.yaml"),
      `phase: implement\nhandoff_hash: ${hash}\n`,
    );
    fs.mkdirSync(path.join(change, ".sdd", "readiness"), { recursive: true });
    fs.writeFileSync(
      path.join(change, ".sdd", "readiness", "coding-ready.json"),
      JSON.stringify({
        schemaVersion: "superflow.coding-ready.v1",
        codingReady: true,
        handoffHash: hash,
      }),
    );
    const result = runHook(sourceFile);
    expect(result.status).toBe(0);
  });
});

function runHook(filePath: string) {
  return spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_input: { file_path: filePath } }),
    encoding: "utf-8",
  });
}
