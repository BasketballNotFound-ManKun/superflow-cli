import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeWorkspaceFingerprint,
  snapshotChangedWorkspaceFiles,
} from "../../src/domains/managed-work/state.js";

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

  it("detects content changes even when git porcelain stays modified", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-fingerprint-"));
    roots.push(root);
    execFileSync("git", ["init"], { cwd: root });
    fs.writeFileSync(path.join(root, "result.txt"), "baseline\n");
    execFileSync("git", ["add", "result.txt"], { cwd: root });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "-m",
        "baseline",
      ],
      { cwd: root },
    );
    fs.writeFileSync(path.join(root, "result.txt"), "version one\n");
    const first = computeWorkspaceFingerprint(root);

    fs.writeFileSync(path.join(root, "result.txt"), "version two\n");

    expect(computeWorkspaceFingerprint(root)).not.toBe(first);
  });

  it("preserves the first porcelain path when a tracked file is modified", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-snapshot-"));
    roots.push(root);
    execFileSync("git", ["init"], { cwd: root });
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "src", "server.js"), "baseline\n");
    execFileSync("git", ["add", "src/server.js"], { cwd: root });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "-m",
        "baseline",
      ],
      { cwd: root },
    );
    fs.writeFileSync(path.join(root, "src", "server.js"), "changed\n");

    const snapshot = snapshotChangedWorkspaceFiles([root]);

    expect(snapshot[`${root}::src/server.js`]).toBeTruthy();
    expect(snapshot[`${root}::rc/server.js`]).toBeUndefined();
  });

  it("ignores untracked build evidence but keeps tracked generated paths", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-snapshot-"));
    roots.push(root);
    execFileSync("git", ["init"], { cwd: root });
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "tracked.js"), "baseline\n");
    execFileSync("git", ["add", "-f", "dist/tracked.js"], { cwd: root });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "-m",
        "baseline",
      ],
      { cwd: root },
    );
    for (const directory of ["target", "node_modules", "test-results", "coverage"]) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
      fs.writeFileSync(path.join(root, directory, "artifact.log"), "generated\n");
    }

    const generatedOnly = snapshotChangedWorkspaceFiles([root]);
    expect(Object.keys(generatedOnly)).toHaveLength(0);

    fs.writeFileSync(path.join(root, "dist", "tracked.js"), "changed\n");
    const trackedChange = snapshotChangedWorkspaceFiles([root]);
    expect(trackedChange[`${root}::dist/tracked.js`]).toBeTruthy();
  });
});
