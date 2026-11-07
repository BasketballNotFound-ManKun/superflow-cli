import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareCapturePackage } from "../helpers/execution-receipt.js";

let dir: string;
let script: string;
const plans = ["build-plan.json", "C1-plan.json", "C2-plan.json"];
function save(file: string, value: unknown) {
  fs.writeFileSync(path.join(dir, file), JSON.stringify(value));
}
function json(file: string) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
}
function run(selected = plans, options: string[] = []) {
  return spawnSync(
    "python3",
    [script, "--record-execution", ...selected, ...options],
    { cwd: dir, encoding: "utf8" },
  );
}
function success(result: ReturnType<typeof run>) {
  expect(result.status, result.stdout + result.stderr).toBe(0);
}
function invoked() {
  return fs.existsSync(path.join(dir, "invoked"))
    ? fs.readFileSync(path.join(dir, "invoked"), "utf8").trim().split("\n")
    : [];
}
function evidence() {
  return Object.fromEntries(
    fs
      .readdirSync(path.join(dir, "logs"))
      .map((file) => [
        file,
        fs.readFileSync(path.join(dir, "logs", file)).toString("base64"),
      ]),
  );
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-sequence-"));
  script = prepareCapturePackage(dir);
  fs.writeFileSync(
    path.join(dir, "application.js"),
    "module.exports = true;\n",
  );
  fs.writeFileSync(
    path.join(dir, "build.cjs"),
    "const fs=require('node:fs');fs.appendFileSync('invoked','build\\n');fs.copyFileSync('application.js','artifact.txt');\n",
  );
  for (const id of ["C1", "C2"]) {
    fs.writeFileSync(
      path.join(dir, `case-${id}.cjs`),
      `
const fs=require('node:fs');fs.appendFileSync('invoked','${id}\\n');
const build=JSON.parse(fs.readFileSync('logs/build.json','utf8'));
const actual=fs.readFileSync('artifact.txt','utf8').includes('true');
console.log(JSON.stringify({event:'superflow.measurement.v1',caseId:'${id}',executed:1,
 assertions:['response','state','forbiddenEffects'].map(id=>({id,expected:true,actual,result:actual?'PASS':'FAIL'})),
 persistence:[],target:{service:'sample',route:'run',kind:'library',buildId:build.id,buildSha256:build.sha256,sourceFingerprint:build.sourceFingerprint}}));
`,
    );
    save(`${id}-plan.json`, {
      kind: "case",
      changeDir: ".",
      review: "review.json",
      caseId: id,
      sources: [`case-${id}.cjs`],
      build: "logs/build.json",
      output: `logs/${id}.json`,
    });
  }
  save("build-plan.json", {
    kind: "build",
    cwd: ".",
    argv: [process.execPath, "build.cjs"],
    sources: ["application.js", "build.cjs"],
    artifact: "artifact.txt",
    output: "logs/build.json",
  });
  save("review.json", {
    coverage: {
      schemaVersion: "superflow.review-coverage.v1",
      sources: [{ id: "S", role: "code", path: "application.js" }],
      entries: [
        {
          id: "E1",
          kind: "library",
          service: "sample",
          route: "run",
          sourceRefs: ["S"],
        },
      ],
      cases: ["C1", "C2"].map((id) => ({
        id,
        entryId: "E1",
        level: "library",
        executionEvidence: "runner-captured.v1",
        executionContext: {
          argv: [process.execPath, `case-${id}.cjs`],
          cwd: ".",
          environmentKeys: [],
        },
      })),
      decisions: [{ disposition: "FIX", caseIds: ["C1", "C2"] }],
    },
  });
  fs.writeFileSync(
    path.join(dir, "test-report.md"),
    "# Report\n| Case ID | Entry ID | Acceptance level | Result | Evidence path |\n" +
      "|---|---|---|---|---|\n| C1 | E1 | library | PARTIAL | pending |\n" +
      "| C2 | E1 | library | PARTIAL | pending |\nVerification Result: PARTIAL\n",
  );
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("ordered execution capture with verified reuse", () => {
  it("executes build then Cases, then reuses original bytes without any child or history", () => {
    success(run(plans, ["--sync-report", "test-report.md"]));
    expect(invoked()).toEqual(["build", "C1", "C2"]);
    const before = evidence();
    success(run(plans, ["--reuse-valid", "--sync-report", "test-report.md"]));
    expect(invoked()).toEqual(["build", "C1", "C2"]);
    expect(evidence()).toEqual(before);
    expect(fs.readFileSync(path.join(dir, "test-report.md"), "utf8")).toContain(
      "| C2 | E1 | library | PASS | logs/C2.json |",
    );
  });
  it("recaptures only changed Case inputs and preserves the other original", () => {
    success(run());
    const first = fs.readFileSync(path.join(dir, "logs/C1.json"));
    fs.appendFileSync(
      path.join(dir, "case-C2.cjs"),
      "// updated observation\n",
    );
    success(run(plans, ["--reuse-valid"]));
    expect(invoked()).toEqual(["build", "C1", "C2", "C2"]);
    expect(fs.readFileSync(path.join(dir, "logs/C1.json"))).toEqual(first);
  });
  it("rebuilds stale production inputs then recaptures both Cases against the new build", () => {
    success(run());
    const id = json("logs/build.json").id;
    fs.appendFileSync(
      path.join(dir, "application.js"),
      "// production change\n",
    );
    success(run(plans, ["--reuse-valid"]));
    expect(invoked()).toEqual(["build", "C1", "C2", "build", "C1", "C2"]);
    expect(json("logs/build.json").id).not.toBe(id);
    expect(json("logs/C2.json").build.id).toBe(json("logs/build.json").id);
  });
  it("does not silently reuse after a plan field changes", () => {
    success(run());
    fs.writeFileSync(path.join(dir, "extra.txt"), "extra input");
    save("C2-plan.json", {
      ...json("C2-plan.json"),
      sources: ["case-C2.cjs", "extra.txt"],
    });
    success(run(plans, ["--reuse-valid"]));
    expect(invoked()).toEqual(["build", "C1", "C2", "C2"]);
  });
  it.each(["missing-plan.json", "bad-plan.json"])(
    "preflights %s before any command",
    (file) => {
      if (file === "bad-plan.json")
        save(file, { kind: "case", changeDir: "." });
      expect(run(["build-plan.json", file]).status).toBe(2);
      expect(invoked()).toEqual([]);
      expect(fs.existsSync(path.join(dir, "logs"))).toBe(false);
    },
  );
  it("rejects a future producer and leaves every command unstarted", () => {
    expect(run(["C1-plan.json", "build-plan.json"]).status).toBe(2);
    expect(invoked()).toEqual([]);
  });
  it("stops at a failed build and never creates later PASS receipts", () => {
    fs.appendFileSync(path.join(dir, "build.cjs"), "process.exit(9);\n");
    expect(run().status).toBe(2);
    expect(invoked()).toEqual(["build"]);
    expect(json("logs/build.json").status).toBe("PARTIAL");
    expect(fs.existsSync(path.join(dir, "logs/C1.json"))).toBe(false);
  });
  it("retains unknown later output and rejects before executing the build", () => {
    fs.mkdirSync(path.join(dir, "logs"));
    fs.writeFileSync(path.join(dir, "logs/C2.json"), "user data");
    expect(run().status).toBe(2);
    expect(invoked()).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "logs/C2.json"), "utf8")).toBe(
      "user data",
    );
  });
  it("preflights cross-plan source/output aliases before running", () => {
    save("C2-plan.json", { ...json("C2-plan.json"), output: "case-C1.cjs" });
    expect(run().status).toBe(2);
    expect(invoked()).toEqual([]);
  });
  it("preflights the report/change boundary before running a build", () => {
    fs.mkdirSync(path.join(dir, "other"));
    fs.copyFileSync(
      path.join(dir, "test-report.md"),
      path.join(dir, "other/test-report.md"),
    );
    expect(run(plans, ["--sync-report", "other/test-report.md"]).status).toBe(
      2,
    );
    expect(invoked()).toEqual([]);
  });
  it("keeps single-plan default as a real execution even when evidence is valid", () => {
    success(run(["build-plan.json"]));
    success(run(["build-plan.json"]));
    expect(invoked()).toEqual(["build", "build"]);
  });
  it("reuses semantic inputs after plan formatting, location, or review filename changes", () => {
    success(run());
    const before = evidence();
    fs.mkdirSync(path.join(dir, "plans"));
    fs.copyFileSync(
      path.join(dir, "review.json"),
      path.join(dir, "same-review.json"),
    );
    const value = json("C2-plan.json");
    value.review = "../same-review.json";
    value.changeDir = "..";
    value.build = "../logs/build.json";
    value.output = "../logs/C2.json";
    fs.writeFileSync(
      path.join(dir, "plans/moved.json"),
      JSON.stringify(value, null, 2),
    );
    success(
      run(
        ["build-plan.json", "C1-plan.json", "plans/moved.json"],
        ["--reuse-valid"],
      ),
    );
    expect(invoked()).toEqual(["build", "C1", "C2"]);
    expect(evidence()).toEqual(before);
  });
  it.each(["argv", "cwd", "artifact"])(
    "recaptures after a build %s binding changes",
    (field) => {
      success(run());
      const build = json("build-plan.json");
      if (field === "argv") build.argv.push("extra");
      if (field === "cwd") {
        fs.mkdirSync(path.join(dir, "nested"));
        build.cwd = "nested";
        build.argv[1] = "../build.cjs";
        build.sources = ["../application.js", "../build.cjs"];
        fs.copyFileSync(
          path.join(dir, "application.js"),
          path.join(dir, "nested/application.js"),
        );
        build.artifact = "../artifact.txt";
        fs.writeFileSync(path.join(dir, "nested/artifact.txt"), "unused");
      }
      if (field === "artifact") {
        fs.copyFileSync(
          path.join(dir, "artifact.txt"),
          path.join(dir, "same-artifact.txt"),
        );
        build.artifact = "same-artifact.txt";
      }
      save("build-plan.json", build);
      success(run(["build-plan.json"], ["--reuse-valid"]));
      expect(json("logs/build.json").id).not.toBe(
        json("logs/C1.json").build.id,
      );
    },
  );
  it("preflights missing later execution inputs and report/output conflicts", () => {
    save("C2-plan.json", { ...json("C2-plan.json"), sources: ["missing.cjs"] });
    expect(run().status).toBe(2);
    expect(invoked()).toEqual([]);
    save("C2-plan.json", {
      ...json("C2-plan.json"),
      sources: ["case-C2.cjs"],
      output: "test-report.md",
    });
    expect(run(plans, ["--sync-report", "test-report.md"]).status).toBe(2);
    expect(invoked()).toEqual([]);
  });
  it("keeps a multi-Case plan as one process when reusing or recapturing", () => {
    const review = json("review.json");
    for (const item of review.coverage.cases)
      item.executionContext.argv[1] = "group.cjs";
    save("review.json", review);
    fs.writeFileSync(
      path.join(dir, "group.cjs"),
      "require('./case-C1.cjs');require('./case-C2.cjs');",
    );
    save("group-plan.json", {
      kind: "case",
      changeDir: ".",
      review: "review.json",
      sources: ["group.cjs", "case-C1.cjs", "case-C2.cjs"],
      build: "logs/build.json",
      cases: ["C1", "C2"].map((caseId) => ({
        caseId,
        output: `logs/${caseId}.json`,
      })),
    });
    const group = ["build-plan.json", "group-plan.json"];
    success(run(group));
    const before = evidence();
    success(run(group, ["--reuse-valid"]));
    expect(evidence()).toEqual(before);
    fs.appendFileSync(
      path.join(dir, "case-C2.cjs"),
      "// changed group input\n",
    );
    success(run(group, ["--reuse-valid"]));
    expect(invoked()).toEqual(["build", "C1", "C2", "C1", "C2"]);
    expect(json("logs/C1.json").capture).toEqual(json("logs/C2.json").capture);
  });
  it("propagates a shared Case process failure and stops subsequent plans", () => {
    const review = json("review.json");
    review.coverage.cases[0].executionContext.argv[1] = "failed-group.cjs";
    save("review.json", review);
    fs.writeFileSync(
      path.join(dir, "failed-group.cjs"),
      "require('./case-C1.cjs');process.exit(7);",
    );
    save("C1-plan.json", {
      ...json("C1-plan.json"),
      sources: ["failed-group.cjs", "case-C1.cjs"],
    });
    expect(run().status).toBe(2);
    expect(invoked()).toEqual(["build", "C1"]);
    expect(json("logs/C1.json").status).toBe("PARTIAL");
    expect(json("logs/C1.json").command.exitCode).toBe(7);
    expect(fs.existsSync(path.join(dir, "logs/C2.json"))).toBe(false);
  });

  it("rejects a later producer even if an old build is currently valid", () => {
    success(run());
    const before = evidence();
    expect(
      run(["C1-plan.json", "build-plan.json"], ["--reuse-valid"]).status,
    ).toBe(2);
    expect(invoked()).toEqual(["build", "C1", "C2"]);
    expect(evidence()).toEqual(before);
  });
  it("rejects plan changes made by an earlier child rather than executing unpreflighted argv", () => {
    fs.appendFileSync(
      path.join(dir, "build.cjs"),
      `
const plan=JSON.parse(fs.readFileSync('C2-plan.json','utf8'));
plan.sources=['missing.cjs'];fs.writeFileSync('C2-plan.json',JSON.stringify(plan));
`,
    );
    expect(run().status).toBe(2);
    expect(invoked()).toEqual(["build"]);
    expect(fs.existsSync(path.join(dir, "logs/C1.json"))).toBe(false);
  });

  it("rejects reverse preview before any command or evidence write", () => {
    const result = spawnSync(
      "python3",
      [script, "--check-execution-plan", "C1-plan.json", "build-plan.json"],
      { cwd: dir, encoding: "utf8" },
    );
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stdout).toContain("前序");
    expect(invoked()).toEqual([]);
    expect(fs.existsSync(path.join(dir, "logs"))).toBe(false);
  });
  it.each(["argv", "cwd", "branches", "assertions", "identity"])(
    "stops after a build changes the frozen review %s",
    (field) => {
      fs.writeFileSync(
        path.join(dir, "unexpected.cjs"),
        "require('node:fs').writeFileSync('unexpected','ran');",
      );
      const mutation =
        field === "argv"
          ? "review.coverage.cases[0].executionContext.argv[1]='unexpected.cjs';"
          : field === "cwd"
            ? "review.coverage.cases[0].executionContext.cwd='nested';"
            : field === "branches"
              ? "review.coverage.cases[0].branches=['new-branch'];"
              : field === "assertions"
                ? "review.coverage.cases[0].assertions={response:'changed',state:'unchanged',forbiddenEffects:'none'};"
                : "";
      fs.mkdirSync(path.join(dir, "nested"));
      fs.appendFileSync(
        path.join(dir, "build.cjs"),
        `
const review=JSON.parse(fs.readFileSync('review.json','utf8'));${mutation}
${field === "identity" ? "fs.renameSync('review.json','old-review.json');" : ""}
fs.writeFileSync('review.json',JSON.stringify(review));
`,
      );
      expect(run().status).toBe(2);
      expect(invoked()).toEqual(["build"]);
      expect(fs.existsSync(path.join(dir, "unexpected"))).toBe(false);
      expect(fs.existsSync(path.join(dir, "logs/C1.json"))).toBe(false);
    },
  );
  it("recaptures only the Case whose selector or assertion contract changed", () => {
    success(run());
    const other = fs.readFileSync(path.join(dir, "logs/C2.json"));
    const review = json("review.json");
    review.coverage.cases[0].selector = "new-selector";
    review.coverage.cases[0].assertions = {
      response: "changed meaning",
      state: "unchanged",
      forbiddenEffects: "none",
    };
    review.metadata = "unrelated review metadata";
    save("review.json", review);
    success(run(plans, ["--reuse-valid"]));
    expect(invoked()).toEqual(["build", "C1", "C2", "C1"]);
    expect(fs.readFileSync(path.join(dir, "logs/C2.json"))).toEqual(other);
  });
  it.each(["missing", "tampered"])(
    "does not skip a %s receipt execution contract",
    (mode) => {
      success(run());
      const receipt = json("logs/C1.json");
      if (mode === "missing") delete receipt.executionContract;
      else receipt.executionContract = { forged: true };
      save("logs/C1.json", receipt);
      const original = fs.readFileSync(path.join(dir, "logs/C1.json"));
      success(run(plans, ["--reuse-valid"]));
      expect(invoked()).toEqual(["build", "C1", "C2", "C1"]);
      expect(json("logs/C1.json").executionContract.case.id).toBe("C1");
      const previous = fs
        .readdirSync(path.join(dir, "logs"))
        .filter((file) => file.startsWith("C1.previous-"));
      expect(
        previous.some((file) =>
          fs.readFileSync(path.join(dir, "logs", file)).equals(original),
        ),
      ).toBe(true);
    },
  );
  it("binds referenced source definitions without binding unrelated definitions", () => {
    const review = json("review.json");
    review.coverage.sources.push({
      id: "K",
      role: "requirement",
      path: "requirement.txt",
      label: "old",
    });
    review.coverage.cases[0].sourceRefs = ["K"];
    save("review.json", review);
    success(run());
    review.coverage.sources[1].label = "new meaning";
    review.coverage.sources.push({
      id: "UNRELATED",
      role: "requirement",
      path: "other.txt",
    });
    save("review.json", review);
    success(run(plans, ["--reuse-valid"]));
    expect(invoked()).toEqual(["build", "C1", "C2", "C1"]);
    expect(json("logs/C1.json").executionContract.sources).toHaveLength(2);
  });
  it("rejects a missing Case source reference during batch preflight", () => {
    const review = json("review.json");
    review.coverage.cases[0].sourceRefs = ["missing"];
    save("review.json", review);
    expect(run().status).toBe(2);
    expect(invoked()).toEqual([]);
  });
  it("rejects a sensitive contract projection before commands or any receipt write", () => {
    const review = json("review.json");
    review.coverage.cases[0].note =
      "Authorization: Bearer synthetic-private-value";
    save("review.json", review);
    expect(run().status).toBe(2);
    expect(invoked()).toEqual([]);
    expect(fs.existsSync(path.join(dir, "logs"))).toBe(false);
  });
  it.each(
    ["case", "entry"].flatMap((owner) =>
      ["canonical", "evidence", "schema", "values"].map((slot) => [
        owner,
        slot,
      ]),
    ),
  )(
    "binds nested %s %s source definitions without unrelated sources",
    (owner, slot) => {
      const review = json("review.json");
      review.coverage.entries.push({ ...review.coverage.entries[0], id: "E2" });
      review.coverage.cases[1].entryId = "E2";
      const definition = {
        id: "K",
        role: "contract",
        path: "old-contract.txt",
        sha256: createHash("sha256").update("old").digest("hex"),
      };
      review.coverage.sources.push(definition, {
        id: "OTHER",
        role: "contract",
        path: "unrelated.txt",
        sha256: "a".repeat(64),
      });
      const anchor = {
        sourceRef: "K",
        lineStart: 1,
        lineEnd: 1,
        text: "binding",
      };
      const shape =
        slot === "canonical"
          ? { investigation: { canonical: anchor } }
          : slot === "evidence"
            ? { investigation: { evidence: [anchor] } }
            : slot === "schema"
              ? { valueConstraints: [{ schema: anchor, values: [] }] }
              : {
                  valueConstraints: [
                    {
                      schema: { sourceRef: "S" },
                      values: [
                        { ...anchor, value: { sourceRef: "BUSINESS_SAMPLE" } },
                      ],
                    },
                  ],
                };
      Object.assign(
        owner === "case"
          ? review.coverage.cases[0]
          : review.coverage.entries[0],
        shape,
      );
      save("review.json", review);
      success(run());
      const other = fs.readFileSync(path.join(dir, "logs/C2.json"));
      definition.path = "new-contract.txt";
      definition.sha256 = createHash("sha256").update("new").digest("hex");
      save("review.json", review);
      success(run(plans, ["--reuse-valid"]));
      expect(invoked()).toEqual(["build", "C1", "C2", "C1"]);
      expect(fs.readFileSync(path.join(dir, "logs/C2.json"))).toEqual(other);
      const before = evidence();
      review.coverage.sources[2].path = "changed-unrelated.txt";
      review.coverage.sources[2].sha256 = "b".repeat(64);
      save("review.json", review);
      success(run(plans, ["--reuse-valid"]));
      expect(invoked()).toEqual(["build", "C1", "C2", "C1"]);
      expect(evidence()).toEqual(before);
    },
  );
  it.each(["missing", "", 1, null])(
    "rejects invalid nested sourceRef %s before commands",
    (sourceRef) => {
      const review = json("review.json");
      review.coverage.entries[0].investigation = { canonical: { sourceRef } };
      save("review.json", review);
      expect(run().status).toBe(2);
      expect(invoked()).toEqual([]);
    },
  );
  it("ignores sourceRef-shaped business expected values", () => {
    const review = json("review.json");
    review.coverage.cases[0].expected = {
      sourceRef: "NOT_A_CONTRACT_SOURCE",
      sourceRefs: [123],
    };
    save("review.json", review);
    success(run());
    const before = evidence();
    success(run(plans, ["--reuse-valid"]));
    expect(invoked()).toEqual(["build", "C1", "C2"]);
    expect(evidence()).toEqual(before);
  });
});
