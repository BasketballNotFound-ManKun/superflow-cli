import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import * as verification from "../../scripts/verify-changed.mjs";
import {
  collectChangedFiles,
  planChangedVerification,
  runChecks,
  resolveNpmInvocation,
} from "../../scripts/verify-changed.mjs";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("changed verification", () => {
  it("full delivery covers build and real package smoke after exactly one test run", () => {
    const plan = planChangedVerification([], { full: true });
    expect(plan.checks.map((check) => check.id)).toEqual([
      "design",
      "managed-design",
      "typecheck",
      "lint",
      "skill-audit",
      "test:full",
      "build",
      "package-smoke",
    ]);
    expect(
      plan.checks.filter((check) => check.id.startsWith("test:")),
    ).toHaveLength(1);
    expect(
      plan.checks.find((check) => check.id === "test:full")?.args,
    ).toContain("--reporter=json");
  });

  it("reports failed and unexecuted checks, preserving the actual exit code", () => {
    const execution = runChecks(
      [
        { id: "first", command: "npm test", args: ["test"] },
        { id: "second", command: "npm run build", args: ["run", "build"] },
      ],
      { executable: "npm", argumentPrefix: [] },
      () => ({ status: 9 }),
    );
    expect(execution.status).toBe(9);
    expect(execution.results.map((check) => check.status)).toEqual([
      "FAIL",
      "NOT_RUN",
    ]);
    expect(execution.results[0].exitCode).toBe(9);
  });

  it("fails the full run when inputs change after an earlier successful check", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "verify consistency "));
    temporaryDirectories.push(cwd);
    spawnSync("git", ["init"], { cwd });
    writeFileSync(path.join(cwd, "input.ts"), "before");
    const result = runChecks(
      [{ id: "test", args: ["test"] }],
      { executable: "npm", argumentPrefix: [] },
      () => {
        writeFileSync(path.join(cwd, "input.ts"), "after");
        return { status: 0 };
      },
      { cwd, verifyInputs: true },
    );
    expect(result.status).toBe(1);
    expect(result.consistency.status).toBe("FAIL");
    expect(result.results[0].status).toBe("PASS");
  });

  it("plain text exposes consistency failure even when every subprocess passed", () => {
    const output = verification.formatTextResults({
      status: 1,
      mode: "execute",
      results: [{ id: "build", status: "PASS" }],
      consistency: { status: "FAIL", error: "inputs changed" },
    });
    expect(output).toContain("FAIL input-consistency: inputs changed");
    expect(output).toContain("FAIL verification");
  });

  it("records process launch failure instead of losing the report", () => {
    const execution = runChecks(
      [{ id: "missing", args: [] }],
      { executable: "npm", argumentPrefix: [] },
      () => ({ status: null, error: new Error("ENOENT") }),
    );
    expect(execution.status).toBe(1);
    expect(execution.results[0]).toMatchObject({
      status: "FAIL",
      error: "ENOENT",
    });
  });

  it("package smoke fails diagnostically without a same-run build snapshot", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "test/acceptance/package-smoke.ts"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--build-snapshot");
    expect(result.stdout).toBe("");
  });

  it("refuses stale source or build outputs before packing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "verify build "));
    temporaryDirectories.push(root);
    for (const directory of ["src", "dist/app", "scripts"])
      mkdirSync(path.join(root, directory), { recursive: true });
    for (const file of [
      "package.json",
      "tsconfig.json",
      "src/main.ts",
      "dist/app/cli.js",
      "dist/build-info.json",
      "scripts/clean-dist.js",
      "scripts/ensure-bin-modes.js",
    ])
      writeFileSync(path.join(root, file), "original");
    const snapshot = verification.captureBuildSnapshot(root);
    expect(() =>
      verification.assertBuildSnapshot(root, snapshot),
    ).not.toThrow();
    writeFileSync(path.join(root, "src/main.ts"), "changed");
    expect(() => verification.assertBuildSnapshot(root, snapshot)).toThrow();
    writeFileSync(path.join(root, "src/main.ts"), "original");
    writeFileSync(path.join(root, "dist/app/cli.js"), "stale");
    expect(() => verification.assertBuildSnapshot(root, snapshot)).toThrow();
  });

  describe("normal workflow baseline evidence", () => {
    const cwd = path.resolve("fixture");
    const required = [
      { id: "documents", path: "test/unit/document-readiness.test.ts" },
    ];
    const valid = () => ({
      success: true,
      numFailedTests: 0,
      numPassedTests: 1,
      numTotalTests: 1,
      testResults: [
        {
          name: path.join(cwd, required[0].path),
          status: "passed",
          assertionResults: [{ title: "real gate", status: "passed" }],
        },
      ],
    });
    it("accepts the reporter's executed passing assertions", () => {
      expect(
        verification.validateBaselineReport(valid(), { cwd, required }).status,
      ).toBe("PASS");
    });
    it.each(["missing", "empty", "skipped", "partial", "failed", "other-root"])(
      "rejects %s baseline execution",
      (kind) => {
        const report = valid();
        if (kind === "missing") report.testResults = [];
        if (kind === "empty") report.testResults[0].assertionResults = [];
        if (kind === "skipped")
          report.testResults[0].assertionResults[0].status = "pending";
        if (kind === "partial")
          report.testResults[0].assertionResults.push({
            title: "not run",
            status: "skipped",
          });
        if (kind === "failed") report.success = false;
        if (kind === "other-root")
          report.testResults[0].name = path.resolve("other", required[0].path);
        expect(
          verification.validateBaselineReport(report, { cwd, required }).status,
        ).toBe("FAIL");
      },
    );
  });

  it.each([
    "src/new.ts",
    "installer/bin/main.cjs",
    "package.json",
    "assets/manifest.json",
    "src/platform/fs.ts",
    "src/platform/process-tree.ts",
    "src/platform/process-liveness.ts",
    "scripts/release-notes-check.js",
    "src/platform/version-check.ts",
  ])("falls back conservatively for %s", (file) => {
    const plan = planChangedVerification([file, "test/unit/path.test.ts"]);
    expect(plan.full).toBe(true);
    expect(plan.reasons.length).toBeGreaterThan(0);
    expect(
      plan.checks.filter((check) => check.id.startsWith("test")),
    ).toHaveLength(1);
    expect(
      plan.checks.find((check) => check.id === "test:full")?.args,
    ).toContain("test");
  });
  it("keeps ordinary docs narrow but treats agent rules as shared", () => {
    expect(planChangedVerification(["docs/example.md"]).full).toBe(false);
    expect(planChangedVerification(["AGENTS.md"]).full).toBe(true);
    expect(planChangedVerification(["CLAUDE.md"]).full).toBe(true);
  });
  it("supports English reasons and an explicit full plan without changes", () => {
    const plan = planChangedVerification([], { full: true, language: "en" });
    expect(plan.message).toMatch(/^Planned/);
    expect(plan.reasons).toEqual(["Full verification explicitly requested."]);
    expect(
      plan.checks.find((check) => check.id === "test:full")?.args,
    ).toContain("test");
    expect(
      plan.checks.every((check) => !/[\u4e00-\u9fff]/u.test(check.reason)),
    ).toBe(true);
  });
  it("selects shared asset checks and skill audit", () => {
    const plan = planChangedVerification(["assets/skills/example/SKILL.md"]);
    expect(plan.checks.map((check) => check.id)).toContain("skill-audit");
    expect(plan.full).toBe(true);
  });
  it("runs a newly added test directly and deduplicates", () => {
    const plan = planChangedVerification([
      "test/unit/new.test.ts",
      "test/unit/new.test.ts",
    ]);
    expect(plan.full).toBe(false);
    expect(
      plan.checks.filter((check) => check.id.startsWith("test"))[0].args,
    ).toContain("test/unit/new.test.ts");
  });
  it("explains no changes and preserves explicit full", () => {
    expect(planChangedVerification([]).message).toContain("没有");
    expect(
      planChangedVerification([], { full: true }).checks.some(
        (check) => check.id === "test:full",
      ),
    ).toBe(true);
  });
  it("resolves npm through Node on Windows without a shell", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "verify-npm-"));
    temporaryDirectories.push(directory);
    const entry = path.join(directory, "npm-cli.js");
    writeFileSync(entry, "");
    expect(
      resolveNpmInvocation({ platform: "win32", npmExecPath: entry }),
    ).toEqual({ executable: process.execPath, argumentPrefix: [entry] });
    expect(() =>
      resolveNpmInvocation({
        platform: "win32",
        npmExecPath: "",
        pathValue: directory,
      }),
    ).toThrow();
  });
  it("selects its own tests without generating build output", () => {
    const plan = planChangedVerification([
      "scripts/verify-changed.mjs",
      "test/unit/verify-changed.test.ts",
    ]);
    expect(plan.full).toBe(false);
    expect(
      plan.checks.find((check) => check.id === "typecheck")?.args,
    ).toContain("--noEmit");
    expect(
      plan.checks
        .find((check) => check.id === "test:selected")
        ?.args.filter((arg) => arg.endsWith("verify-changed.test.ts")),
    ).toHaveLength(1);
    expect(plan.checks.some((check) => check.args.includes("build"))).toBe(
      false,
    );
  });
  it("propagates a failed check without executing later checks", () => {
    const seen: unknown[] = [];
    const status = runChecks(
      [{ args: ["test"] }, { args: ["run", "lint"] }],
      { executable: "npm", argumentPrefix: [] },
      (_exe, args) => {
        seen.push(args);
        return { status: 7 };
      },
    );
    expect(status.status).toBe(7);
    expect(seen).toHaveLength(1);
  });
  it("enumerates committed, staged, dirty and untracked names with whitespace", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "verify-changed-"));
    temporaryDirectories.push(cwd);
    const git = (...args: string[]) => spawnSync("git", args, { cwd });
    git("init");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    writeFileSync(path.join(cwd, "dirty.txt"), "old");
    git("add", ".");
    git("commit", "-m", "baseline");
    writeFileSync(path.join(cwd, "dirty.txt"), "new");
    writeFileSync(path.join(cwd, "staged.txt"), "new");
    git("add", "staged.txt");
    writeFileSync(path.join(cwd, "untracked space\nname.txt"), "new");
    expect(collectChangedFiles("HEAD", cwd).sort()).toEqual([
      "dirty.txt",
      "staged.txt",
      "untracked space\nname.txt",
    ]);
    expect(() => collectChangedFiles("--output=/tmp/injected", cwd)).toThrow();
    const result = spawnSync(
      process.execPath,
      [path.resolve("scripts/verify-changed.mjs"), "--plan", "--json"],
      {
        cwd,
        encoding: "utf8",
        env: { ...process.env, npm_execpath: "/missing/npm-cli.js" },
      },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).files).toContain("staged.txt");
    expect(JSON.parse(result.stdout).mode).toBe("plan");
    expect(JSON.parse(result.stdout).success).toBe(null);
    expect(
      JSON.parse(result.stdout).results.every(
        (check) => check.status === "NOT_RUN",
      ),
    ).toBe(true);
    const npmEntry = path.join(cwd, "fake-npm.cjs");
    writeFileSync(
      npmEntry,
      'console.log("child stdout"); console.error("child stderr"); process.exit(7);',
    );
    const execute = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [path.resolve("scripts/verify-changed.mjs"), ...args],
        {
          cwd,
          encoding: "utf8",
          env: { ...process.env, npm_execpath: npmEntry, SUPERFLOW_LANG: "en" },
        },
      );
    const checked = execute("--json");
    expect(checked.status).toBe(7);
    expect(JSON.parse(checked.stdout).status).toBe(7);
    expect(JSON.parse(checked.stdout).message).toMatch(/^Planned/);
    expect(checked.stderr).toContain("child stdout");
    expect(checked.stderr).toContain("child stderr");
    const first = JSON.parse(
      execute("--full", "--json", "--report", path.join(cwd, "first.json"))
        .stdout,
    );
    const second = JSON.parse(
      execute("--full", "--json", "--report", path.join(cwd, "second.json"))
        .stdout,
    );
    expect(first.evidenceDirectory).not.toBe(second.evidenceDirectory);
    expect(first.evidenceDirectory).not.toBe(cwd);
    const failedPath = path.join(cwd, "invalid-base-report.json");
    const invalid = execute(
      "--base",
      "missing-commit",
      "--json",
      "--report",
      failedPath,
    );
    expect(invalid.status).toBe(1);
    const invalidReport = JSON.parse(invalid.stdout);
    expect(invalidReport.success).toBe(false);
    expect(invalidReport.error).toContain("Failed to read Git changes");
    expect(JSON.parse(readFileSync(failedPath, "utf8"))).toEqual(invalidReport);
    expect(execute("--help").stdout).toContain("Usage:");
    expect(execute("--language", "zh", "--help").stdout).toContain("用法：");
    expect(execute("--language", "xx", "--plan").status).toBe(1);
    expect(execute("--bogus").stderr).toContain("Unknown argument:");
    expect(execute("--language", "zh", "--bogus").stderr).toContain(
      "未知参数：",
    );
  });
});
