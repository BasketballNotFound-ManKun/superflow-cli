import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { computeWorkspaceFingerprint } from "../../src/domains/managed-work/state.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("managed workspace fingerprint", () => {
  it("ignores managed runtime files but detects target changes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-fingerprint-"));
    roots.push(root);
    execFileSync("git", ["init"], { cwd: root });
    fs.writeFileSync(path.join(root, "README.md"), "baseline\n");
    const before = computeWorkspaceFingerprint(root);

    fs.mkdirSync(path.join(root, ".superflow", "tasks", "demo"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, ".superflow", "tasks", "demo", "run-state.json"),
      "{}",
    );
    fs.writeFileSync(
      path.join(root, ".superflow", "managed-project.lock"),
      "{}",
    );
    expect(computeWorkspaceFingerprint(root)).toBe(before);

    fs.writeFileSync(path.join(root, "result.txt"), "changed\n");
    expect(computeWorkspaceFingerprint(root)).not.toBe(before);
  });
});
