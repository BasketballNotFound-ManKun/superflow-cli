import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveChangeDir,
  runArchiveDryRun,
  runChangeGuard,
  runCodingReady,
} from "../../src/app/commands/change-guard.js";

let tmp: string;
let originalCwd: string;

describe("change command guards", () => {
  beforeEach(async () => {
    originalCwd = process.cwd();
    tmp = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "superflow-change-guard-"),
    );
    await fs.promises.mkdir(
      path.join(tmp, "openspec", "changes", "sample-change"),
      { recursive: true },
    );
    process.chdir(tmp);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("resolves a change name from the OpenSpec changes directory", () => {
    expect(resolveChangeDir("sample-change")).toBe(
      fs.realpathSync(path.join(tmp, "openspec", "changes", "sample-change")),
    );
  });

  it("executes the verify guard instead of only checking skill deployment", () => {
    expect(() => runChangeGuard("sample-change", "verify")).toThrow();
  });

  it("executes docs and implement guards", () => {
    expect(() => runChangeGuard("sample-change", "docs")).toThrow();
    expect(() => runChangeGuard("sample-change", "implement")).toThrow();
  });

  it("executes the coding-ready gate", () => {
    expect(() => runCodingReady("sample-change")).toThrow();
  });

  it("does not admit an OpenSpec-only document package to coding", () => {
    const change = path.join(tmp, "openspec", "changes", "sample-change");
    for (const file of ["proposal.md", "design.md", "tasks.md", "specs/demo/spec.md"]) {
      const target = path.join(change, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "# OpenSpec artifact\n");
    }
    const script = path.resolve(originalCwd, "assets/scripts/superflow-coding-ready.mjs");
    const result = spawnSync(process.execPath, [script, change, "--json"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    const failure = JSON.parse(result.stderr);
    expect(failure.codingReady).toBe(false);
    expect(failure.issues.join("\n")).toContain("api.md");
    expect(failure.issues.join("\n")).toContain("tests.md");
    const receipt = JSON.parse(fs.readFileSync(
      path.join(change, ".sdd/readiness/coding-ready.json"), "utf8",
    ));
    expect(receipt.codingReady).toBe(false);
  });

  it("executes archive dry-run before loading the archive skill", () => {
    expect(() => runArchiveDryRun("sample-change")).toThrow();
  });
});
