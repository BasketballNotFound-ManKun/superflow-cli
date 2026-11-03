import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recordExecution, writeExecutionReceipt } from "../helpers/execution-receipt.js";

let dir: string;
const table = (result = "PARTIAL") =>
  "| Case ID | Entry ID | Acceptance level | Result | Evidence path |\n" +
  "|---|---|---|---|---|\n" +
  `| C1 | E1 | api | ${result} | logs/C1.json |\n` +
  "| C2 | E1 | api | PARTIAL | NOT_RUN |\n";
function run(...args: string[]) {
  return spawnSync("python3", [path.join(dir, "capture-package/assets/scripts/lint.py"), ...args],
    { cwd: dir, encoding: "utf8" });
}
function status() { return run("--execution-status", "test-report.md", "--review", "review.json"); }
function rebuild() {
  recordExecution(dir, { kind: "build", argv: [process.execPath, "build.cjs"], cwd: ".",
    sources: ["application.ts", "build.cjs", "case-C1.cjs"], artifact: "artifact.txt", output: "logs/build.json" });
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-feedback-"));
  fs.writeFileSync(path.join(dir, "review.json"), JSON.stringify({ coverage: {
    schemaVersion: "superflow.review-coverage.v1", entries: [{ id: "E1", route: "POST /entry", kind: "api" }],
    cases: [{ id: "C1", entryId: "E1", level: "api" }, { id: "C2", entryId: "E1", level: "api" }],
    decisions: [{ disposition: "FIX", caseIds: ["C1", "C2"] }],
  } }));
  writeExecutionReceipt(dir, "C1", "E1");
  fs.copyFileSync(path.join(dir, "capture-plan.json"), path.join(dir, "case-plan.json"));
  fs.writeFileSync(path.join(dir, "test-report.md"), "# Report\n\n" + table() + "\nVerification Result: PARTIAL\n");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("observed verification feedback", () => {
  it("reads valid receipts despite stale manual PARTIAL without changing the report or running a command", () => {
    const before = fs.readFileSync(path.join(dir, "test-report.md"), "utf8");
    fs.writeFileSync(path.join(dir, "case-C1.cjs"), fs.readFileSync(path.join(dir, "case-C1.cjs"), "utf8"));
    const result = status();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ snapshotOnly: true, caseVerificationComplete: false,
      status: "PARTIAL", counts: { required: 2, passed: 1, partial: 1, invalid: 0 } });
    expect(fs.readFileSync(path.join(dir, "test-report.md"), "utf8")).toBe(before);
  });
  it("reports claimed PASS as invalid when the actual source changed", () => {
    fs.writeFileSync(path.join(dir, "test-report.md"), table("PASS"));
    fs.appendFileSync(path.join(dir, "application.ts"), "// changed source\n");
    const result = status();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ counts: { passed: 0, invalid: 1, partial: 1 } });
  });
  it("syncs the existing current table after actual capture, preserving history and narrative", () => {
    const history = "## History\n" + table("PASS") + "Verification Result: PASS\n";
    fs.writeFileSync(path.join(dir, "test-report.md"), history + "## Current\nKeep this explanation.\n" +
      table() + "Verification Result: PASS\nArchive Readiness: PASS\n");
    const result = run("--record-execution", "case-plan.json", "--sync-report", "test-report.md");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const text = fs.readFileSync(path.join(dir, "test-report.md"), "utf8");
    expect(text).toContain(history);
    expect(text).toContain("Keep this explanation.");
    expect(text.split("## Current")[1]).toContain("| C1 | E1 | api | PASS | logs/C1.json |");
    expect(text.split("## Current")[1]).toContain("Verification Result: PARTIAL");
    expect(text.split("## Current")[1]).toContain("Archive Readiness: NOT_READY");
    expect(JSON.parse(status().stdout).counts.passed).toBe(1);
  });
  it("records a real failing process as PARTIAL even when its printed measurements claim PASS", () => {
    fs.appendFileSync(path.join(dir, "case-C1.cjs"), "process.exit(7);\n");
    rebuild();
    fs.writeFileSync(path.join(dir, "test-report.md"), table("PASS") + "Verification Result: PASS\n");
    const result = run("--record-execution", "case-plan.json", "--sync-report", "test-report.md");
    expect(result.status).toBe(2);
    expect(fs.readFileSync(path.join(dir, "test-report.md"), "utf8")).toContain("| C1 | E1 | api | PARTIAL |");
    expect(JSON.parse(fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8")).command.exitCode).toBe(7);
    expect(JSON.parse(status().stdout).counts.passed).toBe(0);
  });
  it("rejects ambiguous report tables before executing the test", () => {
    fs.writeFileSync(path.join(dir, "test-report.md"), table() + "\n" + table());
    const before = fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8");
    const result = run("--record-execution", "case-plan.json", "--sync-report", "test-report.md");
    expect(result.status).toBe(2);
    expect(fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8")).toBe(before);
  });
  it("does not overwrite an execution input when the report aliases the test source", () => {
    const file = path.join(dir, "case-C1.cjs");
    const before = fs.readFileSync(file, "utf8");
    fs.unlinkSync(path.join(dir, "test-report.md"));
    fs.linkSync(file, path.join(dir, "test-report.md"));
    const result = run("--record-execution", "case-plan.json", "--sync-report", "test-report.md");
    expect(result.status).toBe(2);
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  });
  it("preserves a report updated by the running test instead of overwriting it", () => {
    fs.appendFileSync(path.join(dir, "case-C1.cjs"),
      "require('node:fs').appendFileSync('test-report.md', 'Other owner update\\n');\n");
    rebuild();
    const result = run("--record-execution", "case-plan.json", "--sync-report", "test-report.md");
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("执行期间报告已改变");
    expect(fs.readFileSync(path.join(dir, "test-report.md"), "utf8")).toContain("Other owner update");
  });
  it.each(["C#1.json", "C1.json#failed.json"])(
    "rejects ambiguous receipt path %s before execution, preserving the previous result", (output) => {
      fs.appendFileSync(path.join(dir, "case-C1.cjs"),
        "require('node:fs').writeFileSync('ran.txt', 'ran');\n" +
        "if (require('node:fs').existsSync('fail.flag')) process.exit(7);\n");
      rebuild();
      expect(run("--record-execution", "case-plan.json").status).toBe(0);
      fs.rmSync(path.join(dir, "ran.txt"));
      fs.writeFileSync(path.join(dir, "fail.flag"), "fail");
      const planFile = path.join(dir, "case-plan.json");
      const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
      plan.output = `logs/${output}`;
      fs.writeFileSync(planFile, JSON.stringify(plan));
      const before = fs.readFileSync(path.join(dir, "test-report.md"), "utf8");
      const oldReceipt = fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8");
      const result = run("--record-execution", "case-plan.json", "--sync-report", "test-report.md");
      expect(result.status).toBe(2);
      expect(fs.existsSync(path.join(dir, "ran.txt"))).toBe(false);
      expect(fs.existsSync(path.join(dir, `logs/${output}`))).toBe(false);
      expect(fs.readFileSync(path.join(dir, "test-report.md"), "utf8")).toBe(before);
      expect(fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8")).toBe(oldReceipt);
    },
  );
  it.each(["skills", "skills-en"])("%s owner recovery shows observed facts without phase mutation", (skills) => {
    const scripts = path.resolve("assets", skills, "superflow/scripts/superflow-state.sh");
    fs.mkdirSync(path.join(dir, ".sdd/reviews"), { recursive: true });
    fs.copyFileSync(path.join(dir, "review.json"), path.join(dir, ".sdd/reviews/document-review.json"));
    const yaml = "phase: implement\nbuild_mode: owner\nauto_transition: true\n";
    fs.writeFileSync(path.join(dir, ".sdd/state.yaml"), yaml);
    for (const command of ["recover", "next"]) {
      const result = spawnSync("bash", [scripts, command, dir], { encoding: "utf8", env: { ...process.env,
        SUPERFLOW_REPORT_LINT: path.join(dir, "capture-package/assets/scripts/lint.py") } });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("EXECUTION:");
      expect(result.stdout).toContain('"passed": 1');
      expect(fs.readFileSync(path.join(dir, ".sdd/state.yaml"), "utf8")).toBe(yaml);
    }
  });

  it("preserves CRLF history bytes while projecting only the current case table", () => {
    const history = ("## History\n" + table("PASS") + "Verification Result: PASS\n").replaceAll("\n", "\r\n");
    fs.writeFileSync(path.join(dir, "test-report.md"), history + "## Current\r\n" + table().replaceAll("\n", "\r\n"));
    const result = run("--record-execution", "case-plan.json", "--sync-report", "test-report.md");
    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(dir, "test-report.md"), "utf8").startsWith(history)).toBe(true);
  });
  it("does not project from a review changed by the executing test", () => {
    fs.appendFileSync(path.join(dir, "case-C1.cjs"),
      "require('node:fs').appendFileSync('review.json', ' ');\n");
    rebuild();
    const before = fs.readFileSync(path.join(dir, "test-report.md"), "utf8");
    const result = run("--record-execution", "case-plan.json", "--sync-report", "test-report.md");
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("执行期间评审合同已改变");
    expect(fs.readFileSync(path.join(dir, "test-report.md"), "utf8")).toBe(before);
  });
  it("all case evidence can be verified without claiming independent review or full delivery", () => {
    writeExecutionReceipt(dir, "C2", "E1");
    fs.writeFileSync(path.join(dir, "test-report.md"), table().replace("NOT_RUN", "logs/C2.json") + "Verification Result: PARTIAL\n");
    const result = status();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ snapshotOnly: true, status: "VERIFIED", caseVerificationComplete: true,
      counts: { required: 2, passed: 2, invalid: 0, partial: 0 } });
    expect(fs.readFileSync(path.join(dir, "test-report.md"), "utf8")).toContain("Verification Result: PARTIAL");
  });

});
