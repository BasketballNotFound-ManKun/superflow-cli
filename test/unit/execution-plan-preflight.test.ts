import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareCapturePackage } from "../helpers/execution-receipt.js";

let dir: string;
let script: string;
let build: any;
let casePlan: any;
let review: any;
function save(name: string, value: any) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}
function run(mode = "--check-execution-plan", plans = ["build-plan.json", "case-plan.json"]) {
  return spawnSync("python3", [script, mode, ...plans.map(p => path.join(dir, p))],
    { encoding: "utf8", cwd: os.tmpdir() });
}
function assertUntouched() {
  expect(fs.existsSync(path.join(dir, "invoked"))).toBe(false);
  expect(fs.existsSync(path.join(dir, "evidence"))).toBe(false);
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-plan-"));
  script = prepareCapturePackage(dir);
  fs.writeFileSync(path.join(dir, "app.txt"), "true");
  fs.writeFileSync(path.join(dir, "build.cjs"),
    "const fs=require('node:fs');fs.writeFileSync('invoked','build');fs.copyFileSync('app.txt','artifact.txt');");
  fs.writeFileSync(path.join(dir, "case.cjs"), `
const fs=require('node:fs');
const build=JSON.parse(fs.readFileSync('evidence/build.json','utf8'));
const actual=fs.readFileSync('artifact.txt','utf8')==='true';
fs.writeFileSync('invoked','case');
console.log(JSON.stringify({event:'superflow.measurement.v1',caseId:'C1',executed:1,persistence:[],
 assertions:['response','state','forbiddenEffects'].map(id=>({id,expected:true,actual,result:actual?'PASS':'FAIL'})),
 target:{service:'sample',route:'run',kind:'library',buildId:build.id,buildSha256:build.sha256,sourceFingerprint:build.sourceFingerprint}}));
process.exit(actual?0:1);
`);
  build = { kind: "build", cwd: ".", argv: [process.execPath, "build.cjs"],
    sources: ["app.txt", "build.cjs", "case.cjs"], artifact: "artifact.txt", output: "evidence/build.json" };
  casePlan = { kind: "case", changeDir: ".", review: "review.json", caseId: "C1",
    build: "evidence/build.json", output: "evidence/C1.json" };
  review = { coverage: { entries: [{ id: "E1", kind: "library", service: "sample", route: "run" }],
    cases: [{ id: "C1", entryId: "E1", level: "library", executionEvidence: "runner-captured.v1",
      assertions: { response: "true", state: "unchanged", forbiddenEffects: "none" },
      executionContext: { argv: [process.execPath, "case.cjs"], cwd: ".", environmentKeys: [] } }] } };
  save("build-plan.json", build); save("case-plan.json", casePlan); save("review.json", review);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("execution plan preflight", () => {
  it("checks both plans before build without invoking commands or creating evidence", () => {
    const result = run();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("BUILD_NOT_RUN");
    expect(result.stdout).toContain("PLAN_VALID");
    expect(result.stdout).not.toContain('"status": "PASS"');
    assertUntouched();
  });
  it("aggregates plan errors and resolves paths against the plan rather than shell cwd", () => {
    build.cwd = "missing"; build.sources = ["missing.txt"]; build.argv = [];
    casePlan.caseId = "unknown";
    save("build-plan.json", build); save("case-plan.json", casePlan);
    const result = run();
    expect(result.status).toBe(2);
    for (const part of ["cwd", "sources", "argv", "caseId", "解析基准=", "实际路径="])
      expect(result.stdout).toContain(part);
    assertUntouched();
  });
  it.each([
    ["directory sources", (b: any) => { b.sources = ["."]; }, "sources"],
    ["missing sources", (b: any) => { b.sources = ["missing.txt"]; }, "sources"],
    ["empty sources", (b: any) => { b.sources = []; }, "sources"],
    ["duplicate sources", (b: any) => { b.sources = ["app.txt", "./app.txt"]; }, "sources"],
    ["invalid kind", (b: any) => { b.kind = "other"; }, "kind"],
    ["invalid argv", (b: any) => { b.argv = "node build.cjs"; }, "argv"],
    ["absolute cwd", (b: any) => { b.cwd = dir; }, "cwd"],
    ["source output collision", (b: any) => { b.output = "app.txt"; }, "output"],
    ["sidecar input collision", (b: any) => { b.sources.push("evidence/build.stdout.log"); fs.mkdirSync(path.join(dir,"evidence")); fs.writeFileSync(path.join(dir,"evidence/build.stdout.log"),"source"); }, "output"],
  ])("rejects %s before running the build", (_name, mutate, expected) => {
    mutate(build); save("build-plan.json", build);
    const result = run("--record-execution", ["build-plan.json"]);
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stdout).toContain(expected);
    expect(fs.existsSync(path.join(dir, "invoked"))).toBe(false);
    if (_name !== "sidecar input collision") expect(fs.existsSync(path.join(dir, "evidence"))).toBe(false);
  });
  it.each([
    ["null coverage object", (r: any) => { r.coverage = null; }, "coverage"],
    ["invalid coverage object", (r: any) => { r.coverage = []; }, "coverage"],
    ["duplicate Case ID", (r: any) => r.coverage.cases.push(r.coverage.cases[0]), "重复"],
    ["missing Case ID", (r: any) => { delete r.coverage.cases[0].id; }, "ID"],
    ["missing Entry ID", (r: any) => { delete r.coverage.entries[0].id; }, "ID"],
    ["invalid argv", (r: any) => { r.coverage.cases[0].executionContext.argv = []; }, "argv"],
    ["absolute case cwd", (r: any) => { r.coverage.cases[0].executionContext.cwd = dir; }, "cwd"],
    ["missing case cwd", (r: any) => { r.coverage.cases[0].executionContext.cwd = "missing"; }, "cwd"],
    ["duplicate environment", (r: any) => { r.coverage.cases[0].executionContext.environmentKeys = ["PATH", "PATH"]; }, "环境"],
    ["invalid persistence shape", (r: any) => { r.coverage.cases[0].assertions.persistence = [{}]; }, "persistence"],
    ["missing database test layer", (r: any) => { r.coverage.entries[0].database = {engine:"sample",major:1}; }, "testLayer"],
    ["duplicate Entry ID", (r: any) => r.coverage.entries.push(r.coverage.entries[0]), "重复"],
    ["unknown Entry", (r: any) => { r.coverage.cases[0].entryId = "unknown"; }, "entryId"],
    ["invalid entry kind", (r: any) => { r.coverage.entries[0].kind = "other"; }, "kind"],
    ["invalid service", (r: any) => { r.coverage.entries[0].service = {}; }, "service"],
    ["invalid route", (r: any) => { r.coverage.entries[0].route = []; }, "route"],
    ["invalid assertions", (r: any) => { r.coverage.cases[0].assertions.response = {}; }, "assertions"],
    ["invalid layer", (r: any) => { r.coverage.cases[0].testLayer = "other"; }, "testLayer"],
    ["invalid boundary", (r: any) => { r.coverage.cases[0].mockBoundary = {allowed:["same"],forbidden:["same"]}; }, "mockBoundary"],
    ["secret environment", (r: any) => { r.coverage.cases[0].executionContext.environmentKeys = ["PASSWORD"]; }, "环境"],
  ])("rejects frozen %s while build is not yet run", (_name, mutate, expected) => {
    mutate(review); save("review.json", review);
    const result = run();
    expect(result.status).toBe(2);
    expect(result.stdout).toContain(expected);
    assertUntouched();
  });
  it("rejects different evidence directories and same output between build and case", () => {
    casePlan.output = "other/C1.json"; save("case-plan.json", casePlan);
    expect(run().stdout).toContain("同一证据目录");
    casePlan.output = build.output; save("case-plan.json", casePlan);
    expect(run().stdout).toContain("output");
    assertUntouched();
  });
  it("reports every missing source in one preparation", () => {
    build.sources = ["missing-one.txt", "missing-two.txt"];
    save("build-plan.json", build);
    const result = run();
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("missing-one.txt");
    expect(result.stdout).toContain("missing-two.txt");
    assertUntouched();
  });
  it("checks case source obligations against the pending build plan", () => {
    review.coverage.sources = [{ id: "S1", role: "code", path: "required.txt" }];
    review.coverage.entries[0].sourceRefs = ["S1"];
    fs.writeFileSync(path.join(dir, "required.txt"), "required");
    save("review.json", review);
    const result = run();
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("sources");
    assertUntouched();
  });
  it("does not let capture overwrite the build's raw output", () => {
    expect(run("--record-execution", ["build-plan.json"]).status).toBe(0);
    fs.rmSync(path.join(dir, "invoked"));
    const raw = fs.readFileSync(path.join(dir, "evidence/build.stdout.log"));
    casePlan.output = "evidence/build.stdout.log"; save("case-plan.json", casePlan);
    const result = run("--record-execution", ["case-plan.json"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("output");
    expect(fs.readFileSync(path.join(dir, "evidence/build.stdout.log"))).toEqual(raw);
    expect(fs.existsSync(path.join(dir, "invoked"))).toBe(false);
  });
  it.each(["stdout.log", "stderr.log", "capture.json", "events.jsonl"])(
    "rejects a review input at the dependent build's %s sidecar", suffix => {
      fs.mkdirSync(path.join(dir, "evidence"));
      const reviewPath = `evidence/build.${suffix}`;
      const reviewFile = save(reviewPath, review);
      const original = fs.readFileSync(reviewFile);
      casePlan.review = reviewPath; save("case-plan.json", casePlan);
      for (const plans of [["build-plan.json", "case-plan.json"], ["case-plan.json", "build-plan.json"]]) {
        const result = run("--check-execution-plan", plans);
        expect(result.status, result.stdout + result.stderr).toBe(2);
        expect(result.stdout).toContain("output");
        expect(fs.readFileSync(reviewFile)).toEqual(original);
        expect(fs.existsSync(path.join(dir, "invoked"))).toBe(false);
        expect(fs.readdirSync(path.join(dir, "evidence"))).toEqual([`build.${suffix}`]);
      }
    },
  );
  it.each(["source", "plan"])("keeps %s input bytes when a build sidecar aliases it", role => {
    fs.mkdirSync(path.join(dir, "evidence"));
    const input = "evidence/build.stdout.log";
    if (role === "source") {
      save(input, { value: "source" });
      build.sources.push(input); save("build-plan.json", build);
    } else {
      save(input, casePlan);
    }
    const original = fs.readFileSync(path.join(dir, input));
    const plans = ["build-plan.json", role === "plan" ? input : "case-plan.json"];
    const result = run("--check-execution-plan", plans);
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stdout).toContain("output");
    expect(fs.readFileSync(path.join(dir, input))).toEqual(original);
    expect(fs.existsSync(path.join(dir, "invoked"))).toBe(false);
    expect(fs.readdirSync(path.join(dir, "evidence"))).toEqual(["build.stdout.log"]);
  });
  it("does not exempt a main receipt that is also an explicit review input", () => {
    expect(run("--record-execution", ["build-plan.json"]).status).toBe(0);
    fs.rmSync(path.join(dir, "invoked"));
    const buildFile = path.join(dir, "evidence/build.json");
    const existing = JSON.parse(fs.readFileSync(buildFile, "utf8"));
    save("evidence/build.json", { ...existing, coverage: review.coverage });
    casePlan.review = "evidence/build.json"; save("case-plan.json", casePlan);
    const original = fs.readFileSync(buildFile);
    const result = run();
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stdout).toContain("output");
    expect(fs.readFileSync(buildFile)).toEqual(original);
    expect(fs.existsSync(path.join(dir, "invoked"))).toBe(false);
  });
  it("preserves pending dependency and real recapture in either batch order", () => {
    const forward = ["build-plan.json", "case-plan.json"];
    const reverse = [...forward].reverse();
    for (const plans of [forward, reverse]) {
      const result = run("--check-execution-plan", plans);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain("BUILD_NOT_RUN");
      assertUntouched();
    }
    expect(run("--record-execution", ["build-plan.json"]).status).toBe(0);
    for (const plans of [forward, reverse])
      expect(run("--check-execution-plan", plans).status).toBe(0);
    expect(run("--record-execution", ["build-plan.json"]).status).toBe(0);
    expect(run("--record-execution", ["case-plan.json"]).status).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "evidence/C1.json"), "utf8")).status).toBe("PASS");
  });
  it.each(["source", "plan", "artifact"].flatMap(role =>
    ["json", "stdout.log", "stderr.log", "capture.json", "events.jsonl"].flatMap(suffix =>
      ["--check-execution-plan", "--record-execution"].map(mode => [role, suffix, mode]))))(
    "rejects a hard-linked %s input at build.%s before %s writes or runs", (role, suffix, mode) => {
      fs.mkdirSync(path.join(dir, "evidence"));
      const input = role === "source" ? "app.txt" : role === "plan" ? "build-plan.json" : "artifact.txt";
      if (role === "artifact") fs.writeFileSync(path.join(dir, input), "existing artifact");
      const output = `evidence/build.${suffix}`;
      fs.linkSync(path.join(dir, input), path.join(dir, output));
      const original = fs.readFileSync(path.join(dir, input));
      const before = fs.readdirSync(path.join(dir, "evidence"));
      const result = run(mode, ["build-plan.json"]);
      expect(result.status, result.stdout + result.stderr).toBe(2);
      expect(fs.existsSync(path.join(dir, "invoked"))).toBe(false);
      expect(result.stdout).toContain("output");
      expect(fs.readFileSync(path.join(dir, input))).toEqual(original);
      expect(fs.readdirSync(path.join(dir, "evidence"))).toEqual(before);
    },
  );
  it.each(["json", "stdout.log", "stderr.log", "capture.json", "events.jsonl"].flatMap(suffix =>
    ["--check-execution-plan", "--record-execution"].map(mode => [suffix, mode])))(
    "protects review bytes hard-linked to Case output C1.%s during %s", (suffix, mode) => {
      expect(run("--record-execution", ["build-plan.json"]).status).toBe(0);
      fs.rmSync(path.join(dir, "invoked"));
      fs.linkSync(path.join(dir, "review.json"), path.join(dir, `evidence/C1.${suffix}`));
      const original = fs.readFileSync(path.join(dir, "review.json"));
      const before = fs.readdirSync(path.join(dir, "evidence"));
      const result = run(mode, ["case-plan.json"]);
      expect(result.status, result.stdout + result.stderr).toBe(2);
      expect(fs.existsSync(path.join(dir, "invoked"))).toBe(false);
      expect(result.stdout).toContain("output");
      expect(fs.readFileSync(path.join(dir, "review.json"))).toEqual(original);
      expect(fs.readdirSync(path.join(dir, "evidence"))).toEqual(before);
    },
  );
  it("does not exempt a review hard-linked to the primary build dependency", () => {
    expect(run("--record-execution", ["build-plan.json"]).status).toBe(0);
    fs.rmSync(path.join(dir, "invoked"));
    const existing = JSON.parse(fs.readFileSync(path.join(dir, "evidence/build.json"), "utf8"));
    save("evidence/build.json", { ...existing, coverage: review.coverage });
    fs.linkSync(path.join(dir, "evidence/build.json"), path.join(dir, "review-alias.json"));
    casePlan.review = "review-alias.json"; save("case-plan.json", casePlan);
    const original = fs.readFileSync(path.join(dir, "review-alias.json"));
    for (const plans of [["build-plan.json", "case-plan.json"], ["case-plan.json", "build-plan.json"]]) {
      const result = run("--check-execution-plan", plans);
      expect(result.status, result.stdout + result.stderr).toBe(2);
      expect(result.stdout).toContain("output");
      expect(fs.readFileSync(path.join(dir, "review-alias.json"))).toEqual(original);
      expect(fs.existsSync(path.join(dir, "invoked"))).toBe(false);
    }
  });
  it.each(["json", "stdout.log", "stderr.log", "capture.json", "events.jsonl"])(
    "rejects same-batch output physical aliases at second.%s", suffix => {
      fs.mkdirSync(path.join(dir, "evidence"));
      fs.writeFileSync(path.join(dir, "evidence/build.json"), "retained output");
      fs.linkSync(path.join(dir, "evidence/build.json"), path.join(dir, `evidence/second.${suffix}`));
      save("second-plan.json", { ...build, output: "evidence/second.json", artifact: "second-artifact.txt" });
      const before = fs.readFileSync(path.join(dir, "evidence/build.json"));
      const result = run("--check-execution-plan", ["build-plan.json", "second-plan.json"]);
      expect(result.status, result.stdout + result.stderr).toBe(2);
      expect(result.stdout).toContain("output");
      expect(fs.readFileSync(path.join(dir, "evidence/build.json"))).toEqual(before);
      expect(fs.existsSync(path.join(dir, "invoked"))).toBe(false);
    },
  );
  it("accepts independent same-byte output copies and rejects future ancestor conflicts", () => {
    fs.mkdirSync(path.join(dir, "evidence"));
    fs.writeFileSync(path.join(dir, "evidence/build.json"), "same bytes");
    fs.copyFileSync(path.join(dir, "evidence/build.json"), path.join(dir, "evidence/second.json"));
    save("second-plan.json", { ...build, output: "evidence/second.json", artifact: "second-artifact.txt" });
    expect(run("--check-execution-plan", ["build-plan.json", "second-plan.json"]).status).toBe(0);
    save("second-plan.json", { ...build, output: "evidence/future.json/nested.json" });
    build.output = "evidence/future.json"; save("build-plan.json", build);
    const result = run("--check-execution-plan", ["build-plan.json", "second-plan.json"]);
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stdout).toContain("output");
    expect(fs.existsSync(path.join(dir, "evidence/future.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "invoked"))).toBe(false);
  });
  it.each(["--check-execution-plan", "--record-execution"])(
    "keeps the output diagnostic for future paths below an existing file during %s", mode => {
      build.output = "app.txt/build.json"; save("build-plan.json", build);
      const original = fs.readFileSync(path.join(dir, "app.txt"));
      const result = run(mode, ["build-plan.json"]);
      expect(result.status).toBe(2);
      expect(result.stdout).toContain("output 父路径不是目录");
      expect(fs.readFileSync(path.join(dir, "app.txt"))).toEqual(original);
      assertUntouched();
    },
  );
  it("rejects duplicate physical sources but allows independent same-byte source copies", () => {
    fs.copyFileSync(path.join(dir, "app.txt"), path.join(dir, "app-copy.txt"));
    build.sources.push("app-copy.txt"); save("build-plan.json", build);
    expect(run("--check-execution-plan", ["build-plan.json"]).status).toBe(0);
    fs.linkSync(path.join(dir, "app.txt"), path.join(dir, "app-alias.txt"));
    build.sources.push("app-alias.txt"); save("build-plan.json", build);
    const result = run("--check-execution-plan", ["build-plan.json"]);
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stdout).toContain("sources");
    assertUntouched();
  });
  it.each(["json", "stdout.log", "stderr.log", "capture.json", "events.jsonl"])(
    "rechecks build.%s aliases created by the command before recorder writes", suffix => {
      fs.appendFileSync(path.join(dir, "build.cjs"),
        `require('node:fs').linkSync('app.txt','evidence/build.${suffix}');`);
      const original = fs.readFileSync(path.join(dir, "app.txt"));
      expect(run("--check-execution-plan", ["build-plan.json"]).status).toBe(0);
      assertUntouched();
      const result = run("--record-execution", ["build-plan.json"]);
      expect(result.status, result.stdout + result.stderr).toBe(2);
      expect(fs.readFileSync(path.join(dir, "app.txt"))).toEqual(original);
      expect(result.stdout).toContain("output");
      expect(fs.readFileSync(path.join(dir, "invoked"), "utf8")).toBe("build");
      expect(fs.readdirSync(path.join(dir, "evidence"))).toEqual([`build.${suffix}`]);
    },
  );
  it.each(["json", "stdout.log", "stderr.log", "capture.json", "events.jsonl"])(
    "rechecks C1.%s aliases created by the Case before recorder writes", suffix => {
      const source = fs.readFileSync(path.join(dir, "case.cjs"), "utf8");
      fs.writeFileSync(path.join(dir, "case.cjs"), source.replace("process.exit(actual?0:1);",
        `fs.linkSync('review.json','evidence/C1.${suffix}');process.exit(actual?0:1);`));
      expect(run("--record-execution", ["build-plan.json"]).status).toBe(0);
      fs.rmSync(path.join(dir, "invoked"));
      const original = fs.readFileSync(path.join(dir, "review.json"));
      const before = fs.readdirSync(path.join(dir, "evidence"));
      expect(run("--check-execution-plan", ["case-plan.json"]).status).toBe(0);
      const result = run("--record-execution", ["case-plan.json"]);
      expect(result.status, result.stdout + result.stderr).toBe(2);
      expect(fs.readFileSync(path.join(dir, "review.json"))).toEqual(original);
      expect(result.stdout).toContain("output");
      expect(fs.readFileSync(path.join(dir, "invoked"), "utf8")).toBe("case");
      expect(fs.readdirSync(path.join(dir, "evidence")).sort()).toEqual([...before, `C1.${suffix}`].sort());
    },
  );
  it("rejects physical output aliases created by the child before writing raw streams", () => {
    fs.appendFileSync(path.join(dir, "build.cjs"), `
const out=require('node:fs');out.writeFileSync('evidence/build.stdout.log','child-created');
out.linkSync('evidence/build.stdout.log','evidence/build.stderr.log');
console.log('observed stdout');console.error('observed stderr');`);
    expect(run("--check-execution-plan", ["build-plan.json"]).status).toBe(0);
    const result = run("--record-execution", ["build-plan.json"]);
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stdout).toContain("output");
    expect(fs.readFileSync(path.join(dir, "evidence/build.stdout.log"), "utf8")).toBe("child-created");
    expect(fs.readdirSync(path.join(dir, "evidence")).sort()).toEqual(["build.stderr.log", "build.stdout.log"]);
  });
  it("preserves real build/case capture and still rejects changed source before case execution", () => {
    expect(run("--record-execution", ["build-plan.json"]).status).toBe(0);
    fs.rmSync(path.join(dir, "invoked"));
    expect(run().status).toBe(0);
    expect(fs.existsSync(path.join(dir, "invoked"))).toBe(false);
    expect(run("--record-execution", ["case-plan.json"]).status).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "evidence/C1.json"), "utf8")).status).toBe("PASS");
    fs.rmSync(path.join(dir, "invoked"));
    fs.writeFileSync(path.join(dir, "app.txt"), "changed");
    expect(run("--record-execution", ["case-plan.json"]).status).toBe(2);
    expect(fs.existsSync(path.join(dir, "invoked"))).toBe(false);
  });
});
