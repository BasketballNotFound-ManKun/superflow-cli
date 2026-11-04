import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareCapturePackage } from "../helpers/execution-receipt.js";

let directory: string;
let script: string;

function invoke(...args: string[]) {
  return spawnSync("python3", [script, ...args], {
    cwd: directory,
    encoding: "utf8",
  });
}

function plan(caseId: string, sources = [`case-${caseId}.cjs`]) {
  return { kind: "case", changeDir: ".", review: "review.json", caseId,
    sources, build: "logs/build.json", output: `logs/${caseId}.json` };
}

function capture(value: object) {
  fs.writeFileSync(path.join(directory, "plan.json"), JSON.stringify(value));
  return invoke("--record-execution", "plan.json");
}

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
}

function status() {
  const result = invoke("--execution-status", "test-report.md", "--review", "review.json");
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-inputs-"));
  script = prepareCapturePackage(directory);
  fs.writeFileSync(path.join(directory, "application.js"), "module.exports = true;\n");
  fs.writeFileSync(path.join(directory, "build.cjs"),
    "require('node:fs').copyFileSync('application.js', 'artifact.txt');\n");
  for (const caseId of ["C1", "C2"]) {
    fs.writeFileSync(path.join(directory, `case-${caseId}.cjs`), `
const fs = require('node:fs');
fs.appendFileSync('ran-${caseId}.txt', 'ran\\n');
const build = JSON.parse(fs.readFileSync('logs/build.json', 'utf8'));
const actual = fs.readFileSync('artifact.txt', 'utf8').includes('true');
console.log(JSON.stringify({event:'superflow.measurement.v1', caseId:'${caseId}', executed:1,
  assertions:['response','state','forbiddenEffects'].map(id => ({id,expected:true,actual,result:actual?'PASS':'FAIL'})),
  persistence:[], target:{service:'E1',route:'POST /entry',kind:'api',buildId:build.id,
    buildSha256:build.sha256,sourceFingerprint:build.sourceFingerprint}}));
`);
  }
  fs.writeFileSync(path.join(directory, "review.json"), JSON.stringify({ coverage: {
    schemaVersion: "superflow.review-coverage.v1",
    sources: [{ id: "P", role: "code", path: "application.js" }],
    entries: [{ id: "E1", route: "POST /entry", kind: "api", sourceRefs: ["P"] }],
    cases: ["C1", "C2"].map(id => ({ id, entryId: "E1", level: "api",
      executionEvidence: "runner-captured.v1",
      executionContext: { argv: [process.execPath, `case-${id}.cjs`], cwd: ".", environmentKeys: [] } })),
    decisions: [{ disposition: "FIX", caseIds: ["C1", "C2"] }],
  } }));
  fs.writeFileSync(path.join(directory, "test-report.md"),
    "# Report\n| Case ID | Entry ID | Acceptance level | Result | Evidence path |\n" +
    "|---|---|---|---|---|\n| C1 | E1 | api | PASS | logs/C1.json |\n" +
    "| C2 | E1 | api | PASS | logs/C2.json |\nVerification Result: PARTIAL\n");
  const result = capture({ kind: "build", argv: [process.execPath, "build.cjs"], cwd: ".",
    sources: ["application.js", "build.cjs"], artifact: "artifact.txt", output: "logs/build.json" });
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

describe("production build and execution input identities", () => {
  it("captures declared execution inputs without putting them into the production build", () => {
    const result = capture(plan("C1"));
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const receipt = readJson("logs/C1.json");
    expect(receipt.sources.map((source: { path: string }) => source.path).sort())
      .toEqual(["../application.js", "../build.cjs", "../case-C1.cjs"]);
    expect(receipt.build.sources.map((source: { path: string }) => source.path).sort())
      .toEqual(["../application.js", "../build.cjs"]);
    expect(receipt.target.sourceFingerprint).toBe(receipt.build.sourceFingerprint);
  });

  it("invalidates the changed execution input while retaining the unrelated Case", () => {
    expect(capture(plan("C1")).status).toBe(0);
    expect(capture(plan("C2")).status).toBe(0);
    fs.appendFileSync(path.join(directory, "case-C1.cjs"), "// changed test\n");
    expect(status().counts).toEqual({ required: 2, passed: 1, partial: 0, invalid: 1 });
    expect(status().cases.find((value: { caseId: string }) => value.caseId === "C2").result).toBe("PASS");
  });

  it("recaptures only the changed Case using the unchanged production build and preserves history", () => {
    expect(capture(plan("C1")).status).toBe(0);
    expect(capture(plan("C2")).status).toBe(0);
    const build = fs.readFileSync(path.join(directory, "logs/build.json"));
    const other = fs.readFileSync(path.join(directory, "logs/C1.json"));
    const oldAttempt = readJson("logs/C2.json").capture.path;
    fs.appendFileSync(path.join(directory, "case-C2.cjs"), "// changed test\n");
    const result = capture(plan("C2"));
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(fs.readFileSync(path.join(directory, "logs/build.json"))).toEqual(build);
    expect(fs.readFileSync(path.join(directory, "logs/C1.json"))).toEqual(other);
    expect(fs.existsSync(path.join(directory, "logs", oldAttempt))).toBe(true);
    expect(status().counts).toEqual({ required: 2, passed: 2, partial: 0, invalid: 0 });
  });

  it("rejects a stale common production source even when its old artifact still exists", () => {
    expect(capture(plan("C1")).status).toBe(0);
    expect(capture(plan("C2")).status).toBe(0);
    fs.appendFileSync(path.join(directory, "application.js"), "// production changed\n");
    const ran = fs.readFileSync(path.join(directory, "ran-C1.txt"), "utf8");
    const result = capture(plan("C1"));
    expect(result.status).toBe(2);
    expect(fs.readFileSync(path.join(directory, "ran-C1.txt"), "utf8")).toBe(ran);
    expect(status().counts.invalid).toBe(2);
  });

  it("rejects missing execution sources before starting the child", () => {
    const value: Record<string, unknown> = plan("C1");
    delete value.sources;
    const result = capture(value);
    expect(result.status).toBe(2);
    expect(fs.existsSync(path.join(directory, "ran-C1.txt"))).toBe(false);
    expect(result.stdout).toContain("sources");
  });

  it("observes execution inputs that change during the test and retains a failed receipt", () => {
    fs.appendFileSync(path.join(directory, "case-C1.cjs"),
      "require('node:fs').appendFileSync('case-C1.cjs', '// changed during execution\\n');\n");
    const result = capture(plan("C1"));
    expect(result.status).toBe(2);
    expect(readJson("logs/C1.json").status).toBe("PARTIAL");
  });

  it("rejects an output aliasing an execution input before running the test", () => {
    fs.mkdirSync(path.join(directory, "logs"), { recursive: true });
    fs.linkSync(path.join(directory, "case-C1.cjs"), path.join(directory, "logs/C1.json"));
    const before = fs.readFileSync(path.join(directory, "case-C1.cjs"));
    const result = capture(plan("C1"));
    expect(result.status).toBe(2);
    expect(fs.existsSync(path.join(directory, "ran-C1.txt"))).toBe(false);
    expect(fs.readFileSync(path.join(directory, "case-C1.cjs"))).toEqual(before);
  });

  it("deduplicates the same declared path across build and execution inputs", () => {
    const result = capture(plan("C1", ["application.js", "case-C1.cjs"]));
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(readJson("logs/C1.json").sources).toHaveLength(3);
  });

  it("does not permit execution inputs to fill a missing production source chain", () => {
    const review = readJson("review.json");
    fs.writeFileSync(path.join(directory, "other-production.js"), "module.exports = true;\n");
    review.coverage.sources.push({ id: "P2", role: "code", path: "other-production.js" });
    review.coverage.entries[0].sourceRefs.push("P2");
    fs.writeFileSync(path.join(directory, "review.json"), JSON.stringify(review));
    const result = capture(plan("C1", ["case-C1.cjs", "other-production.js"]));
    expect(result.status).toBe(2);
    expect(fs.existsSync(path.join(directory, "ran-C1.txt"))).toBe(false);
  });
});
