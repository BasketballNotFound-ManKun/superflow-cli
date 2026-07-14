import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveChangeDir,
  runArchiveDryRun,
  runChangeGuard,
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

  it("executes archive dry-run before loading the archive skill", () => {
    expect(() => runArchiveDryRun("sample-change")).toThrow();
  });
});
