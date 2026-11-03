import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";
import {
  recordExecution,
  writeExecutionReceipt,
} from "../helpers/execution-receipt.js";

const project = path.resolve(__dirname, "../..");
const temporary: string[] = [];

afterEach(() => {
  for (const directory of temporary.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

function fixture(language = "zh", pythonFixture = false) {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "verify-execution-")),
  );
  temporary.push(directory);
  const root = path.join(directory, "project");
  const change = path.join(root, "openspec/changes/sample-change");
  const otherChange = path.join(root, "openspec/changes/other-change");
  fs.mkdirSync(change, { recursive: true });
  fs.mkdirSync(otherChange, { recursive: true });
  fs.writeFileSync(path.join(root, "source.txt"), "source\n");
  fs.writeFileSync(
    path.join(root, "build.cjs"),
    "require('fs').copyFileSync('source.txt', 'artifact.txt');\n",
  );
  const plan = path.join(root, "build-plan.json");
  const savePlan = (value: unknown, file = plan) =>
    fs.writeFileSync(file, JSON.stringify(value));
  savePlan({
    kind: "build",
    cwd: ".",
    argv: [process.execPath, "build.cjs"],
    sources: ["source.txt", "build.cjs"],
    artifact: "artifact.txt",
    output: "logs/build.json",
  });
  const env = fixtureProcessEnv(path.join(directory, "home"), {
    ...process.env,
    NO_UPDATE_NOTIFIER: "1",
    SUPERFLOW_LANG: language,
  });
  const calls = path.join(directory, "python-calls.jsonl");
  if (pythonFixture) {
    const bin = path.join(directory, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, "python3"),
      `#!${process.execPath}\n` +
        `const fs = require('fs');\n` +
        `const args = process.argv.slice(2);\n` +
        `fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');\n` +
        `if (args.includes('--record-execution')) fs.writeFileSync('executed.txt', 'ran');\n` +
        `if (args.includes('--execution-status')) console.log(JSON.stringify({snapshotOnly:true,status:'PARTIAL',caseVerificationComplete:false}));\n` +
        `else console.log('fixture stdout');\n` +
        `console.error('fixture stderr');\n` +
        `process.exit(Number(process.env.FIXTURE_EXIT_CODE || '0'));\n`,
      { mode: 0o755 },
    );
    env.PATH = `${bin}${path.delimiter}${env.PATH}`;
  }
  const runFrom = (cwd: string, ...args: string[]) =>
    spawnSync(
      process.execPath,
      [
        path.join(project, "node_modules/tsx/dist/cli.mjs"),
        path.join(project, "src/app/cli.ts"),
        "verify",
        ...args,
      ],
      { cwd, env, encoding: "utf8" },
    );
  const run = (...args: string[]) => runFrom(root, ...args);
  return {
    directory,
    root,
    change,
    otherChange,
    plan,
    savePlan,
    env,
    calls,
    run,
    runFrom,
  };
}

function caseFixture() {
  const f = fixture();
  const review = path.join(f.change, ".sdd/reviews/document-review.json");
  fs.mkdirSync(path.dirname(review), { recursive: true });
  fs.writeFileSync(
    review,
    JSON.stringify({
      coverage: {
        schemaVersion: "superflow.review-coverage.v1",
        entries: [{ id: "E1", route: "POST /entry", kind: "api" }],
        cases: [
          { id: "C1", entryId: "E1", level: "api" },
          { id: "C2", entryId: "E1", level: "api" },
        ],
        decisions: [{ disposition: "FIX", caseIds: ["C1", "C2"] }],
      },
    }),
  );
  writeExecutionReceipt(f.change, "C1", "E1");
  const casePlan = path.join(f.change, "capture-plan.json");
  const report = path.join(f.change, "test-report.md");
  fs.writeFileSync(
    report,
    "# Current report\n\n" +
      "| Case ID | Entry ID | Acceptance level | Result | Evidence path |\n" +
      "|---|---|---|---|---|\n" +
      "| C1 | E1 | api | PARTIAL | logs/C1.json |\n" +
      "| C2 | E1 | api | PARTIAL | NOT_RUN |\n\n" +
      "Verification Result: PARTIAL\n",
  );
  return { ...f, casePlan, report };
}

describe("execution feedback through the existing verify CLI", () => {
  it("preflights an existing plan without executing its build or creating evidence", () => {
    const f = fixture();
    const result = f.run(
      "sample-change",
      "--execution-plan",
      "build-plan.json",
    );
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(result.stdout).toContain("PLAN_VALID");
    expect(fs.existsSync(path.join(f.root, "artifact.txt"))).toBe(false);
    expect(fs.existsSync(path.join(f.root, "logs"))).toBe(false);
  });

  it("executes the existing capture only with explicit --run", () => {
    const f = fixture();
    const result = f.run(
      "sample-change",
      "--execution-plan",
      "build-plan.json",
      "--run",
    );
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(fs.readFileSync(path.join(f.root, "artifact.txt"), "utf8")).toBe(
      "source\n",
    );
    const receipt = JSON.parse(
      fs.readFileSync(path.join(f.root, "logs/build.json"), "utf8"),
    );
    expect(receipt.command.argv).toEqual([process.execPath, "build.cjs"]);
  });

  it.each([
    ["--run"],
    ["--sync-report"],
    ["--execution-plan", "build-plan.json", "--sync-report"],
    ["--execution-plan", "build-plan.json", "--run", "--sync-report"],
    ["--execution-status", "--run"],
    ["--execution-status", "--sync-report"],
    ["--execution-status", "--execution-plan", "build-plan.json"],
  ])(
    "rejects invalid operation combinations before invoking Python: %s",
    (...args) => {
      const f = fixture("zh", true);
      const result = f.run("sample-change", ...args);
      expect(result.status).not.toBe(0);
      expect(fs.existsSync(f.calls)).toBe(false);
      expect(fs.existsSync(path.join(f.root, "executed.txt"))).toBe(false);
    },
  );

  it.each([[], ["missing-change"]])(
    "requires an existing selected change before preflight: %s",
    (change) => {
      const f = fixture("zh", true);
      const result = f.run(
        ...(change ? [change] : []),
        "--execution-plan",
        "build-plan.json",
      );
      expect(result.status).not.toBe(0);
      expect(fs.existsSync(f.calls)).toBe(false);
    },
  );

  it.each([[], ["--run"], ["--run", "--sync-report"]])(
    "rejects a Case plan belonging to another change before any Python operation: %s",
    (...args) => {
      const f = fixture("zh", true);
      f.savePlan({ kind: "case", changeDir: "openspec/changes/other-change" });
      const result = f.run(
        "sample-change",
        "--execution-plan",
        "build-plan.json",
        ...args,
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("changeDir");
      expect(fs.existsSync(f.calls)).toBe(false);
      expect(fs.existsSync(path.join(f.root, "executed.txt"))).toBe(false);
    },
  );

  it("resolves relative change and plan paths from a nested cwd without rewriting plan bytes", () => {
    const f = fixture("en", true);
    const nested = path.join(f.root, "module");
    fs.mkdirSync(nested);
    const before = fs.readFileSync(f.plan, "utf8");
    const result = f.runFrom(
      nested,
      "../openspec/changes/sample-change",
      "--execution-plan",
      "../build-plan.json",
      "--run",
    );
    expect(result.status, result.stderr).toBe(0);
    const calls = fs
      .readFileSync(f.calls, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(calls).toEqual([
      [
        path.join(project, "assets/scripts/superflow-test-report-lint.py"),
        "--record-execution",
        f.plan,
      ],
    ]);
    expect(fs.readFileSync(f.plan, "utf8")).toBe(before);
    expect(fs.existsSync(path.join(nested, "executed.txt"))).toBe(true);
  });

  it("binds a matching Case plan to only the selected change report for explicit sync", () => {
    const f = fixture("en", true);
    const alias = path.join(f.root, "selected-alias");
    fs.symlinkSync(f.change, alias, "dir");
    f.savePlan({ kind: "case", changeDir: "selected-alias" });
    const result = f.run(
      f.change,
      "--execution-plan",
      f.plan,
      "--run",
      "--sync-report",
    );
    expect(result.status, result.stderr).toBe(0);
    const args = JSON.parse(fs.readFileSync(f.calls, "utf8"));
    expect(args.slice(1)).toEqual([
      "--record-execution",
      f.plan,
      "--sync-report",
      path.join(f.change, "test-report.md"),
    ]);
  });

  it("reads a PARTIAL Case snapshot without capture or deployment checks", () => {
    const f = fixture("en", true);
    const result = f.run(f.change, "--execution-status");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      snapshotOnly: true,
      status: "PARTIAL",
      caseVerificationComplete: false,
    });
    const args = JSON.parse(fs.readFileSync(f.calls, "utf8"));
    expect(args.slice(1)).toEqual([
      "--execution-status",
      path.join(f.change, "test-report.md"),
      "--review",
      path.join(f.change, ".sdd/reviews/document-review.json"),
    ]);
    expect(fs.existsSync(path.join(f.root, "executed.txt"))).toBe(false);
  });

  it("preflights, runs and syncs a real Case capture while retaining a read-only PARTIAL status", () => {
    const f = caseFixture();
    const before = fs.readFileSync(f.report, "utf8");
    const evidence = fs.readdirSync(path.join(f.change, "logs")).sort();
    const preflight = f.run("sample-change", "--execution-plan", f.casePlan);
    expect(preflight.status, preflight.stdout + preflight.stderr).toBe(0);
    expect(fs.readFileSync(f.report, "utf8")).toBe(before);
    expect(fs.readdirSync(path.join(f.change, "logs")).sort()).toEqual(
      evidence,
    );
    const captured = f.run(
      "sample-change",
      "--execution-plan",
      f.casePlan,
      "--run",
      "--sync-report",
    );
    expect(captured.status, captured.stdout + captured.stderr).toBe(0);
    const synced = fs.readFileSync(f.report, "utf8");
    expect(synced).toContain("| C1 | E1 | api | PASS | logs/C1.json |");
    expect(synced).toContain("| C2 | E1 | api | PARTIAL | NOT_RUN |");
    const evidenceAfter = fs.readdirSync(path.join(f.change, "logs")).sort();
    const snapshot = f.run("sample-change", "--execution-status");
    expect(snapshot.status, snapshot.stdout + snapshot.stderr).toBe(0);
    expect(JSON.parse(snapshot.stdout)).toMatchObject({
      schemaVersion: "superflow.execution-status.v1",
      snapshotOnly: true,
      status: "PARTIAL",
      caseVerificationComplete: false,
      counts: { required: 2, passed: 1, partial: 1, invalid: 0 },
    });
    expect(fs.readFileSync(f.report, "utf8")).toBe(synced);
    expect(fs.readdirSync(path.join(f.change, "logs")).sort()).toEqual(
      evidenceAfter,
    );
    expect(fs.existsSync(path.join(f.change, ".sdd/state.yaml"))).toBe(false);
  });

  it("preserves the real failed capture exit and synchronizes its Case to PARTIAL", () => {
    const f = caseFixture();
    fs.appendFileSync(path.join(f.change, "case-C1.cjs"), "process.exit(7);\n");
    const plan = JSON.parse(fs.readFileSync(f.casePlan, "utf8"));
    recordExecution(f.change, {
      kind: "build",
      cwd: ".",
      argv: [process.execPath, "build.cjs"],
      sources: ["application.ts", "build.cjs", "case-C1.cjs"],
      artifact: "artifact.txt",
      output: "logs/build.json",
    });
    fs.writeFileSync(f.casePlan, JSON.stringify(plan));
    const captured = f.run(
      "sample-change",
      "--execution-plan",
      f.casePlan,
      "--run",
      "--sync-report",
    );
    expect(captured.status, captured.stdout + captured.stderr).toBe(2);
    const receipt = JSON.parse(
      fs.readFileSync(path.join(f.change, "logs/C1.json"), "utf8"),
    );
    expect(receipt.command.exitCode).toBe(7);
    expect(fs.readFileSync(f.report, "utf8")).toContain(
      "| C1 | E1 | api | PARTIAL |",
    );
    const snapshot = f.run("sample-change", "--execution-status");
    expect(snapshot.status).toBe(0);
    expect(JSON.parse(snapshot.stdout).counts.passed).toBe(0);
  });

  it("preserves Python stdout, stderr and its nonzero exit code", () => {
    const f = fixture("en", true);
    f.env.FIXTURE_EXIT_CODE = "7";
    const result = f.run("sample-change", "--execution-plan", f.plan, "--run");
    expect(result.status).toBe(7);
    expect(result.stdout).toBe("fixture stdout\n");
    expect(result.stderr).toBe("fixture stderr\n");
  });

  it.each(["en", "zh"])(
    "uses %s help language for new operation errors",
    (language) => {
      const f = fixture(language, true);
      const result = f.run("sample-change", "--run");
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        language === "en"
          ? "requires --execution-plan"
          : "需要 --execution-plan",
      );
    },
  );

  it("keeps the default verify guard instead of silently running a plan", () => {
    const f = fixture("en", true);
    const result = f.run("sample-change", "--agent", "codex");
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("SDD guard failed");
    const calls = fs.readFileSync(f.calls, "utf8");
    expect(calls).not.toMatch(
      /--record-execution|--check-execution-plan|--execution-status|--sync-report/,
    );
    expect(fs.existsSync(path.join(f.root, "executed.txt"))).toBe(false);
  });
});
