import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { prepareCapturePackage } from "../helpers/execution-receipt.js";

let directory: string;
let script: string;
let review: any;

function saveReview() {
  fs.writeFileSync(path.join(directory, "review.json"), JSON.stringify(review));
}

function run(...args: string[]) {
  return spawnSync("python3", [script, ...args], {
    cwd: directory,
    encoding: "utf8",
    env: process.env,
  });
}

beforeEach(() => {
  directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "observed-runtime-")));
  script = prepareCapturePackage(directory);
  fs.writeFileSync(path.join(directory, "source.txt"), "current application");
  fs.writeFileSync(path.join(directory, "stale.bin"), "previous application");
  fs.writeFileSync(path.join(directory, "build.cjs"),
    "require('node:fs').copyFileSync('source.txt','artifact.bin');");
  fs.writeFileSync(path.join(directory, "case.cjs"), `
const fs=require('node:fs');
const crypto=require('node:crypto');
const mode=fs.existsSync('mode.txt')?fs.readFileSync('mode.txt','utf8'):'valid';
const build=JSON.parse(fs.readFileSync('evidence/build.json','utf8'));
fs.writeFileSync('case-invoked','yes');
fs.copyFileSync(mode==='stale'||mode==='misreported'?'stale.bin':'artifact.bin','runtime.bin');
const sha=crypto.createHash('sha256').update(fs.readFileSync('runtime.bin')).digest('hex');
const assertions=()=>['response','state','forbiddenEffects'].map(id=>({id,expected:true,actual:true,result:'PASS'}));
const event={event:'superflow.measurement.v1',caseId:'C1',executed:1,persistence:[],
 assertions:assertions(),branches:['changed','unchanged'].map(id=>({id,executed:1,assertions:assertions()})),
 target:{service:'sample',route:'run',kind:'library',buildId:build.id,
 buildSha256:build.sha256,sourceFingerprint:build.sourceFingerprint,
 runtimeArtifacts:[{path:'runtime.bin',sha256:mode==='misreported'?build.sha256:sha,pid:process.pid}]}};
if(mode==='missing-runtime')delete event.target.runtimeArtifacts;
if(mode==='missing-file')fs.unlinkSync('runtime.bin');
if(mode==='missing-branch')event.branches.pop();
if(mode==='duplicate-branch')event.branches[1]=event.branches[0];
if(mode==='unexecuted-branch')event.branches[0].executed=0;
if(mode==='failed-branch')Object.assign(event.branches[0].assertions[2],{actual:false,result:'FAIL'});
if(mode==='false-marked-pass')event.branches[0].assertions[2].actual=false;
if(mode==='missing-assertion')event.branches[0].assertions.pop();
if(mode==='duplicate-pid')event.target.runtimeArtifacts.push({...event.target.runtimeArtifacts[0]});
console.log(JSON.stringify(event));
`);
  review = { coverage: {
    schemaVersion: "superflow.review-coverage.v1",
    entries: [{ id: "E1", kind: "library", service: "sample", route: "run" }],
    decisions: [{ disposition: "FIX", caseIds: ["C1"] }],
    cases: [{ id: "C1", entryId: "E1", level: "library",
      executionEvidence: "runner-captured.v1",
      executionContext: { argv: [process.execPath, "case.cjs"], cwd: ".", environmentKeys: [] },
      assertions: { response: "observed response", state: "observed state", forbiddenEffects: "no unexpected effects" },
      requiredBranches: ["changed", "unchanged"], runtimeArtifact: { instances: 1 },
    }],
  } };
  saveReview();
  fs.writeFileSync(path.join(directory, "build-plan.json"), JSON.stringify({
    kind: "build", cwd: ".", argv: [process.execPath, "build.cjs"],
    sources: ["source.txt", "build.cjs"], artifact: "artifact.bin", output: "evidence/build.json",
  }));
  fs.writeFileSync(path.join(directory, "case-plan.json"), JSON.stringify({
    kind: "case", changeDir: ".", review: "review.json", caseId: "C1", sources: ["case.cjs"],
    build: "evidence/build.json", output: "evidence/C1.json",
  }));
  const built = run("--record-execution", "build-plan.json");
  expect(built.status, built.stdout + built.stderr).toBe(0);
});

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

describe("observed runtime and parameter branches", () => {
  it("binds an adapter to the exact validator used by this capture", () => {
    fs.appendFileSync(path.join(directory, "case.cjs"),
      "\nfs.writeFileSync('validator-path',process.env.SUPERFLOW_REPORT_LINT||'');\n");
    const result = run("--record-execution", "case-plan.json");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(fs.readFileSync(path.join(directory, "validator-path"), "utf8"))
      .toBe(fs.realpathSync(script));
  });

  it("captures the real runtime copy and every declared branch", () => {
    const result = run("--record-execution", "case-plan.json");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const receipt = JSON.parse(fs.readFileSync(path.join(directory, "evidence/C1.json"), "utf8"));
    expect(receipt.status).toBe("PASS");
    expect(receipt.branches).toEqual(expect.any(Array));
    expect(receipt.branches.map((branch: any) => branch.id)).toEqual(["changed", "unchanged"]);
    expect(receipt.target.runtimeArtifacts[0].sha256).toBe(receipt.build.sha256);
  });

  it.each([
    ["missing-runtime", "runtimeArtifacts"],
    ["stale", "runtime"],
    ["misreported", "runtime"],
    ["missing-file", "runtime"],
    ["missing-branch", "branch"],
    ["duplicate-branch", "branch"],
    ["unexecuted-branch", "branch"],
    ["failed-branch", "branch"],
    ["false-marked-pass", "branch"],
    ["missing-assertion", "branch"],
  ])("rejects %s even when aggregate assertions claim PASS", (mode, diagnostic) => {
    fs.writeFileSync(path.join(directory, "mode.txt"), mode);
    const result = run("--record-execution", "case-plan.json");
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stdout).toContain(diagnostic);
    const receipt = JSON.parse(fs.readFileSync(path.join(directory, "evidence/C1.json"), "utf8"));
    expect(receipt.status).toBe("PARTIAL");
  });

  it("rejects two instance claims sharing one PID", () => {
    review.coverage.cases[0].runtimeArtifact.instances = 2;
    saveReview();
    fs.writeFileSync(path.join(directory, "mode.txt"), "duplicate-pid");
    const result = run("--record-execution", "case-plan.json");
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stdout).toContain("pid");
  });

  it.each([
    ["duplicate-branches", { requiredBranches: ["changed", "changed"] }],
    ["empty-branches", { requiredBranches: [] }],
    ["null-branches", { requiredBranches: null }],
    ["old-runtime-label", { runtimeArtifact: "archive-task" }],
    ["invalid-instance-count", { runtimeArtifact: { instances: true } }],
    ["null-runtime", { runtimeArtifact: null }],
  ])("rejects frozen %s before invoking a case", (_name, mutation) => {
    Object.assign(review.coverage.cases[0], mutation);
    saveReview();
    const result = run("--record-execution", "case-plan.json");
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(fs.existsSync(path.join(directory, "case-invoked"))).toBe(false);
  });

  it("does not infer all parameter branches from one aggregate boolean", () => {
    delete review.coverage.cases[0].requiredBranches;
    review.coverage.cases[0].databaseAssertions = [{ id: "all", kind: "allParameterBranches", expected: true }];
    saveReview();
    const result = run("--check-execution-plan", "case-plan.json");
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stdout).toContain("requiredBranches");
    expect(fs.existsSync(path.join(directory, "case-invoked"))).toBe(false);
  });

  it("invalidates a retained receipt if the actual runtime copy changes", () => {
    expect(run("--record-execution", "case-plan.json").status).toBe(0);
    fs.writeFileSync(path.join(directory, "test-report.md"),
      "| Case ID | Entry ID | Acceptance level | Result | Evidence path |\n" +
      "|---|---|---|---|---|\n| C1 | E1 | library | PASS | evidence/C1.json |\n");
    fs.writeFileSync(path.join(directory, "runtime.bin"), "changed runtime copy");
    const result = run("--execution-status", "test-report.md", "--review", "review.json");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const snapshot = JSON.parse(result.stdout);
    expect(snapshot.counts.passed).toBe(0);
    expect(snapshot.counts.invalid).toBe(1);
  });

  it("requires the indexed runtime copy to match the verified working copy", () => {
    fs.writeFileSync(path.join(directory, "runtime.bin"), "previous application");
    expect(spawnSync("git", ["init", "-q"], { cwd: directory }).status).toBe(0);
    expect(spawnSync("git", ["add", "runtime.bin"], { cwd: directory }).status).toBe(0);
    expect(run("--record-execution", "case-plan.json").status).toBe(0);
    fs.writeFileSync(path.join(directory, "test-report.md"),
      "| Case ID | Entry ID | Acceptance level | Result | Evidence path |\n" +
      "|---|---|---|---|---|\n| C1 | E1 | library | PASS | evidence/C1.json |\n" +
      "Verification Result: PARTIAL\n");
    const check = () => run("--review", "review.json", "--git-index-root", directory, "test-report.md");
    const stale = check();
    expect(stale.status, stale.stdout + stale.stderr).toBe(2);
    expect(stale.stdout).toContain("runtime.bin");
    expect(spawnSync("git", ["add", "runtime.bin"], { cwd: directory }).status).toBe(0);
    const indexed = check();
    expect(indexed.status, indexed.stdout + indexed.stderr).toBe(0);
  });
});
