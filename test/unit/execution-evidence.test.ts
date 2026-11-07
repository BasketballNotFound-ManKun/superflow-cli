import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { digest } from "../helpers/review-coverage.js";
import { writeExecutionReceipt, prepareCapturePackage } from "../helpers/execution-receipt.js";

const lint = path.resolve("assets/scripts/superflow-test-report-lint.py");
let dir: string;
function currentEvidence(name: string, field: "capture" | "command") {
  const receipt = JSON.parse(fs.readFileSync(path.join(dir, `logs/${name}.json`), "utf8"));
  return path.join(dir, "logs", field === "capture" ? receipt.capture.path : receipt.command.output);
}
function run(environment: NodeJS.ProcessEnv = {}, complete = false) {
  try {
    return {
      code: 0,
      output: execFileSync(
        "python3",
        [
          fs.existsSync(path.join(dir, "capture-package/assets/scripts/lint.py"))
            ? path.join(dir, "capture-package/assets/scripts/lint.py") : lint,
          ...(complete ? ["--require-complete"] : []),
          "--review",
          path.join(dir, "review.json"),
          path.join(dir, "report.md"),
        ],
        { encoding: "utf8", env: { ...process.env, ...environment } },
      ),
    };
  } catch (error: any) {
    return { code: error.status, output: error.stdout };
  }
}
function save(receipt: any) {
  fs.writeFileSync(path.join(dir, "logs/C1.json"), JSON.stringify(receipt));
}
function record(
  plan: object,
  script = path.join(dir, "capture-package/assets/scripts/lint.py"),
  environment = process.env,
) {
  const file = path.join(dir, "capture-plan.json");
  fs.writeFileSync(file, JSON.stringify(plan));
  try {
    return {
      code: 0,
      output: execFileSync("python3", [script, "--record-execution", file], {
        encoding: "utf8",
        env: environment,
      }),
    };
  } catch (error: any) {
    return { code: error.status, output: error.stdout };
  }
}

function prepareCapturedCase(fail = false) {
  prepareCapturePackage(dir);
  fs.writeFileSync(
    path.join(dir, "build.cjs"),
    `
    const fs = require('node:fs');
    fs.writeFileSync('artifact.json', JSON.stringify({
      answer: fs.readFileSync('application.ts', 'utf8').includes('true')
    }));
  `,
  );
  fs.writeFileSync(
    path.join(dir, "case.cjs"),
    `
    const fs = require('node:fs');
    const build = JSON.parse(fs.readFileSync('logs/build.json', 'utf8'));
    const actual = JSON.parse(fs.readFileSync('artifact.json', 'utf8')).answer;
    fs.writeFileSync('invoked.txt', 'real child invocation');
    console.error('retained diagnostic API_TOKEN=private-fixture-value');
    console.log(JSON.stringify({event: 'superflow.measurement.v1',
      caseId: 'C1', executed: 1, persistence: [],
      assertions: ['response', 'state', 'forbiddenEffects'].map(id => ({
        id, expected: true, actual, result: actual ? 'PASS' : 'FAIL'
      })), target: {service: 'E11', route: 'POST /E11', kind: 'api',
        buildId: build.id, buildSha256: build.sha256,
        sourceFingerprint: build.sourceFingerprint}
    }));
    process.exit(${fail ? 7 : 0});
  `,
  );
  const reviewFile = path.join(dir, "review.json");
  const review = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
  Object.assign(review.coverage.cases[0], {
    executionEvidence: "runner-captured.v1",
    executionContext: {
      argv: [process.execPath, "case.cjs"],
      cwd: ".",
      environmentKeys: [],
    },
  });
  fs.writeFileSync(reviewFile, JSON.stringify(review));
}

function captureBuild() {
  return record({
    kind: "build",
    argv: [process.execPath, "build.cjs"],
    cwd: ".",
    sources: ["application.ts", "build.cjs", "case.cjs"],
    artifact: "artifact.json",
    output: "logs/build.json",
  });
}

function captureCase() {
  return record({
    kind: "case",
    sources: ["case.cjs"],
    changeDir: ".",
    review: "review.json",
    caseId: "C1",
    build: "logs/build.json",
    output: "logs/C1.json",
  });
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-receipt-"));
  fs.writeFileSync(
    path.join(dir, "review.json"),
    JSON.stringify({
      coverage: {
        schemaVersion: "superflow.review-coverage.v1",
        sources: [{ id: "S1", role: "code", path: "application.ts" }],
        entries: [
          {
            id: "E11",
            service: "E11",
            route: "POST /E11",
            kind: "api",
            sourceRefs: ["S1"],
          },
        ],
        cases: [
          {
            id: "C1",
            entryId: "E11",
            level: "api",
            assertions: {
              response: "ok",
              state: "correct",
              forbiddenEffects: "none",
            },
          },
        ],
        decisions: [{ disposition: "FIX", caseIds: ["C1"] }],
      },
    }),
  );
  writeExecutionReceipt(dir, "C1", "E11");
  fs.writeFileSync(
    path.join(dir, "report.md"),
    "| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |\n|---|---|---|---|---|\n| C1 | E11 | api | PASS | logs/C1.json |\n验证结果: PASS\n",
  );
  const receipt = JSON.parse(fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"));
  fs.writeFileSync(path.join(dir, "baseline-review.md"), "DONE\n## Review Identity\n| Field | Value |\n|---|---|\n| Role | independent-reviewer |\n| Dispatch | session:fixture/dispatch |\n| Return | session:fixture/return |\n## Concerns\nNone\n## Findings\nNone\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n" + receipt.sources.map((source: any) => `| ${source.path.replace(/^\.\.\//, "")} | ${source.sha256} |`).join("\n"));
  fs.appendFileSync(path.join(dir, "report.md"), "\n## Independent Review\n| Report |\n|---|\n| baseline-review.md |\n\n## Summary\n");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
describe("execution receipt boundary", () => {
  it("reports the declaration, base and resolved missing receipt path", () => {
    fs.writeFileSync(path.join(dir, "report.md"),
      fs.readFileSync(path.join(dir, "report.md"), "utf8")
        .replace("logs/C1.json", "evidence/missing.json"));
    const result = run();
    expect(result.code).toBe(2);
    expect(result.output).toContain("声明值='evidence/missing.json'");
    expect(result.output).toContain(`解析基准=${fs.realpathSync(dir)}`);
    expect(result.output).toContain(
      `实际路径=${path.join(fs.realpathSync(dir), "evidence/missing.json")}`,
    );
  });

  it("rejects a PARTIAL receipt behind a PASS report row", () => {
    const file = path.join(dir, "logs/C1.json");
    const receipt = JSON.parse(fs.readFileSync(file, "utf8"));
    receipt.status = "PARTIAL";
    save(receipt);
    const result = run();
    expect(result.code).toBe(2);
    expect(result.output).toContain("执行凭证 status 与冻结用例不一致");
  });

  it("reports a missing source against the receipt directory", () => {
    fs.rmSync(path.join(dir, "application.ts"));
    const result = run();
    expect(result.code).toBe(2);
    expect(result.output).toContain("声明值='../application.ts'");
    expect(result.output).toContain(
      `解析基准=${path.join(fs.realpathSync(dir), "logs")}`,
    );
    expect(result.output).toContain(
      `实际路径=${path.join(fs.realpathSync(dir), "application.ts")}`,
    );
  });

  it.each(["review", "build"])(
    "reports a missing case plan %s against the plan directory", reference => {
      prepareCapturedCase();
      expect(captureBuild().code).toBe(0);
      const result = record({
        kind: "case", changeDir: ".", review: "review.json", caseId: "C1",
        sources: ["case.cjs"],
        build: "logs/build.json", output: "logs/C1.json",
        [reference]: "missing/reference.json",
      });
      expect(result.code).toBe(2);
      expect(result.output).toContain("声明值='missing/reference.json'");
      expect(result.output).toContain(`解析基准=${fs.realpathSync(dir)}`);
      expect(result.output).toContain(
        `实际路径=${path.join(fs.realpathSync(dir), "missing/reference.json")}`,
      );
      expect(fs.existsSync(path.join(dir, "invoked.txt"))).toBe(false);
    },
  );

  it("rejects a PARTIAL report row beneath a final PASS summary", () => {
    const file = path.join(dir, "report.md");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8")
      .replace("| C1 | E11 | api | PASS |", "| C1 | E11 | api | PARTIAL |"));
    const result = run();
    expect(result.code).toBe(2);
    expect(result.output).toContain("用例 C1 为 PARTIAL，报告不能声明整体验证 PASS");
  });

  function nestedCapture(cwd: string, changeDir: unknown) {
    prepareCapturedCase();
    expect(captureBuild().code).toBe(0);
    const change = path.join(dir, "openspec/changes/sample");
    const reviewPath = path.join(change, ".sdd/reviews/document-review.json");
    fs.mkdirSync(path.dirname(reviewPath), { recursive: true });
    const review = JSON.parse(fs.readFileSync(path.join(dir, "review.json"), "utf8"));
    review.projectRoot = "../../..";
    review.coverage.cases[0].executionContext.cwd = cwd;
    for (const source of review.coverage.sources) source.path = "../../../" + source.path;
    fs.writeFileSync(reviewPath, JSON.stringify(review));
    const result = record({
      kind: "case", changeDir, sources: ["case.cjs"],
      review: "openspec/changes/sample/.sdd/reviews/document-review.json",
      caseId: "C1", build: "logs/build.json", output: "logs/C1.json",
    });
    return { change, reviewPath, result };
  }

  it("captures from a change-relative project cwd and consumes the unchanged nested receipt", () => {
    const { change, reviewPath, result } = nestedCapture("../../..", "openspec/changes/sample");
    expect(result, result.output).toMatchObject({ code: 0 });
    const receipt = fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8");
    expect(JSON.parse(receipt).executionContext.cwd).toBe(fs.realpathSync(dir));
    fs.writeFileSync(path.join(change, "current-review.md"),
      "DONE\n## Review Identity\n| Field | Value |\n|---|---|\n| Role | independent-reviewer |\n| Dispatch | session:fixture/dispatch |\n| Return | session:fixture/return |\n## Concerns\nNone\n## Findings\nNone\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n" +
      JSON.parse(receipt).sources.map((source: any) =>
        `| ${path.relative(dir, path.resolve(dir, "logs", source.path))} | ${source.sha256} |`).join("\n"));
    fs.mkdirSync(path.join(change, ".sdd/readiness"), { recursive: true });
    fs.copyFileSync(path.join(dir, ".sdd/readiness/coding-ready.json"),
      path.join(change, ".sdd/readiness/coding-ready.json"));
    const report = path.join(change, "report.md");
    fs.writeFileSync(report,
      "| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |\n|---|---|---|---|---|\n" +
      "| C1 | E11 | api | PASS | ../../../logs/C1.json |\n验证结果: PASS\n" +
      "\n## Independent Review\n| Report |\n|---|\n| current-review.md |\n");
    const consumed = spawnSync("python3", [
      path.join(dir, "capture-package/assets/scripts/lint.py"),
      "--require-complete", "--review", reviewPath, report,
    ], { encoding: "utf8" });
    expect(consumed.status, consumed.stdout + consumed.stderr).toBe(0);
    expect(consumed.stdout).toContain("检查通过");
    expect(fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8")).toBe(receipt);
  });

  it.each([undefined, null, "", "/absolute", "C:\\absolute", "missing-change", 3])(
    "rejects an absent or invalid explicit case change root %s", changeDir => {
      const { result } = nestedCapture("../../..", changeDir);
      expect(result.code).toBe(2);
      expect(result.output).toContain("changeDir");
      expect(fs.existsSync(path.join(dir, "invoked.txt"))).toBe(false);
    },
  );

  it.each([".", "openspec/changes/sample/.sdd/reviews"])(
    "rejects a wrong existing change root %s", changeDir => {
      const { result } = nestedCapture("../../..", changeDir);
      expect(result.code).toBe(2);
      expect(fs.existsSync(path.join(dir, "invoked.txt"))).toBe(false);
    },
  );

  it.each(["../../../../..", ".", "../../../missing"])(
    "rejects the old review-relative or incorrect cwd %s", cwd => {
      const { result } = nestedCapture(cwd, "openspec/changes/sample");
      expect(result.code).toBe(2);
    },
  );

  it("reports a frozen cwd against the explicit change root", () => {
    const { change, result } = nestedCapture(
      "../../../missing", "openspec/changes/sample",
    );
    expect(result.code).toBe(2);
    expect(result.output).toContain("声明值='../../../missing'");
    expect(result.output).toContain(`解析基准=${fs.realpathSync(change)}`);
    expect(result.output).toContain(
      `实际路径=${path.join(fs.realpathSync(dir), "missing")}`,
    );
    expect(fs.existsSync(path.join(dir, "invoked.txt"))).toBe(false);
  });

  it("reports a missing change root against its plan directory", () => {
    const { result } = nestedCapture("../../..", "missing-change");
    expect(result.code).toBe(2);
    expect(result.output).toContain("声明值='missing-change'");
    expect(result.output).toContain(`解析基准=${fs.realpathSync(dir)}`);
    expect(result.output).toContain(
      `实际路径=${path.join(fs.realpathSync(dir), "missing-change")}`,
    );
  });

  function observedDelivery() {
    fs.writeFileSync(path.join(dir, "report.md"), fs.readFileSync(path.join(dir, "report.md"), "utf8").split("\n## Independent Review")[0]);
    prepareCapturedCase();
    expect(captureBuild().code).toBe(0);
    expect(captureCase().code).toBe(0);
    fs.mkdirSync(path.join(dir, ".sdd/readiness"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".sdd/readiness/coding-ready.json"), JSON.stringify({
      workflowPolicy: "observed-delivery.v1", codingReady: true,
    }));
  }
  function reviewed(files = ["application.ts", "build.cjs", "case.cjs"], state = "DONE", findings = "None") {
    fs.writeFileSync(path.join(dir, "code-review.md"),
      `${state}\n## Review Identity\n| Field | Value |\n|---|---|\n| Role | independent-reviewer |\n| Dispatch | session:fixture/dispatch |\n| Return | session:fixture/return |\n## Concerns\nNone\n## Findings\n${findings}\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n`
      + files.map(file => `| ${file} | ${digest(fs.readFileSync(path.join(dir, file), "utf8"))} |`).join("\n"));
    fs.appendFileSync(path.join(dir, "report.md"),
      "\n## Independent Review\n| Report |\n|---|\n| code-review.md |\n");
  }

  it("requires actual independent review references for new complete delivery", () => {
    observedDelivery();
    const result = run({}, true);
    expect(result.code).toBe(2);
    expect(result.output).toContain("Independent Review");
    expect(run().code).toBe(0);
  });
  it("requires current independent review despite an older coding-ready receipt", () => {
    observedDelivery();
    fs.writeFileSync(path.join(dir, ".sdd/readiness/coding-ready.json"), JSON.stringify({
      schemaVersion: "superflow.coding-ready.v1", codingReady: true,
    }));
    expect(run({}, true).code).toBe(2);
  });
  it.each(["missing", "absent-policy", "old-policy"])(
    "rejects complete captured and reviewed SDD with %s READY policy", (kind) => {
      observedDelivery();
      reviewed();
      const ready = path.join(dir, ".sdd/readiness/coding-ready.json");
      if (kind === "missing") fs.rmSync(ready);
      else fs.writeFileSync(ready, JSON.stringify(kind === "absent-policy"
        ? { codingReady: true } : { workflowPolicy: "legacy-delivery.v0" }));
      const result = run({}, true);
      expect(result.code).toBe(2);
      expect(result.output).toContain("workflowPolicy");
    },
  );
  it("rejects complete captured and reviewed SDD when current READY is blocked", () => {
    observedDelivery();
    reviewed();
    fs.writeFileSync(path.join(dir, ".sdd/readiness/coding-ready.json"), JSON.stringify({
      workflowPolicy: "observed-delivery.v1", codingReady: false, verdict: "BLOCKED",
    }));
    const result = run({}, true);
    expect(result.code).toBe(2);
    expect(result.output).toContain("codingReady");
  });
  it("does not reuse a legacy review without current reviewed-source identities", () => {
    observedDelivery();
    reviewed();
    fs.writeFileSync(path.join(dir, "code-review.md"), "DONE\n## Findings\nNone\n");
    const result = run({}, true);
    expect(result.code).toBe(2);
    expect(result.output).toContain("Reviewed Sources");
  });
  it("rejects an unreadable review reference", () => {
    observedDelivery();
    reviewed();
    fs.rmSync(path.join(dir, "code-review.md"));
    expect(run({}, true).code).toBe(2);
  });

  it("consumes preserved review/Owner/recheck and checks every chain file against Git index", () => {
    observedDelivery();
    reviewed();
    const currentFile = path.join(dir, "code-review.md");
    const clean = fs.readFileSync(currentFile, "utf8");
    const original = clean.replace("session:fixture/return", "session:fixture/original-return").replace("DONE\n", "DONE_WITH_CONCERNS\n").replace("## Concerns\nNone", "## Concerns\nRecheck required").replace("## Findings\nNone", "## Findings\n- [F-001] application.ts:1: verify guard");
    const owner = "## Finding Dispositions\n| ID | Disposition | Evidence |\n|---|---|---|\n| F-001 | dismissed | source:application.ts:1 |\n";
    fs.writeFileSync(path.join(dir, "original.md"), original);
    fs.writeFileSync(path.join(dir, "owner.md"), owner);
    const chained = clean + `\n## Review Chain\n| Role | Path | SHA-256 |\n|---|---|---|\n| original | original.md | ${digest(original)} |\n| owner-response | owner.md | ${digest(owner)} |\n## Finding Rechecks\n| ID | Result | Evidence |\n|---|---|---|\n| F-001 | dismissed | source:application.ts:1 |\n`;
    fs.writeFileSync(currentFile, chained);
    expect(run({}, true).code).toBe(0);
    fs.writeFileSync(currentFile, chained.replace("| F-001 | dismissed | source:application.ts:1 |", ""));
    expect(run({}, true).code).toBe(2);
    fs.writeFileSync(currentFile, chained);
    execFileSync("git", ["init", "-q", dir]);
    execFileSync("git", ["-C", dir, "add", "."]);
    const checkIndex = () => spawnSync("python3", [path.join(dir, "capture-package/assets/scripts/lint.py"), "--require-complete", "--git-index-root", dir, "--review", path.join(dir, "review.json"), path.join(dir, "report.md")], { encoding: "utf8" });
    expect(checkIndex().status).toBe(0);
    const changedOwner = owner.replace("source:application.ts:1", "test:verified-guard");
    fs.writeFileSync(path.join(dir, "owner.md"), changedOwner);
    fs.writeFileSync(currentFile, chained.replace(digest(owner), digest(changedOwner)));
    execFileSync("git", ["-C", dir, "add", "code-review.md"]);
    const stale = checkIndex();
    expect(stale.status, stale.stdout + stale.stderr).toBe(2);
    expect(stale.stdout).toContain("owner.md");
    expect(run().code).toBe(0);
  });
  it("accepts a current source-bound completed review", () => {
    observedDelivery();
    reviewed();
    expect(run({}, true).code).toBe(0);
  });
  it.each(["BLOCKED", "NEEDS_CONTEXT", "DONE_WITH_CONCERNS"])(
    "does not promote a %s reviewer to complete delivery", state => {
      observedDelivery();
      reviewed(undefined, state);
      expect(run({}, true).code).toBe(2);
    },
  );
  it.each(["+ application.ts:1: unresolved", "* application.ts:1: unresolved",
    "1. application.ts:1: unresolved", "1) application.ts:1: unresolved",
    "Unresolved issue remains", "", "None\nUnresolved issue remains"])(
    "rejects ambiguous or unresolved current review findings: %s", findings => {
      observedDelivery();
      reviewed(undefined, "DONE", findings);
      expect(run({}, true).code).toBe(2);
    },
  );
  it("rejects a review that retains an unresolved finding", () => {
    observedDelivery();
    reviewed(undefined, "DONE", "- application.ts:1: unresolved issue");
    expect(run({}, true).code).toBe(2);
  });
  it("rejects a prior PASS after source repair even when execution receipts are refreshed", () => {
    observedDelivery();
    reviewed();
    fs.appendFileSync(path.join(dir, "application.ts"), "// repaired\n");
    expect(captureBuild().code).toBe(0);
    expect(captureCase().code).toBe(0);
    const result = run({}, true);
    expect(result.code).toBe(2);
    expect(result.output).toContain("reviewed source hash drift");
    fs.writeFileSync(path.join(dir, "report.md"),
      fs.readFileSync(path.join(dir, "report.md"), "utf8").split("\n## Independent Review")[0]);
    reviewed();
    expect(run({}, true).code).toBe(0);
  });
  it("requires review coverage of build inputs beyond the entry source", () => {
    observedDelivery();
    expect(captureBuild().code).toBe(0);
    expect(captureCase().code).toBe(0);
    reviewed(["application.ts"]);
    const result = run({}, true);
    expect(result.code).toBe(2);
    expect(result.output).toContain("build.cjs");
    fs.writeFileSync(path.join(dir, "report.md"),
      fs.readFileSync(path.join(dir, "report.md"), "utf8").split("\n## Independent Review")[0]);
    reviewed(["application.ts", "build.cjs", "case.cjs"]);
    expect(run({}, true).code).toBe(0);
  });
  it("fails closed when the installed canonical reviewer auditor is unavailable", () => {
    observedDelivery();
    reviewed();
    fs.rmSync(path.join(dir, "capture-package/dist/domains/review"), { recursive: true });
    // Prevent fallback to a developer's unrelated global installation.
    const bin = path.join(dir, "isolated-bin");
    fs.mkdirSync(bin);
    fs.symlinkSync(process.execPath, path.join(bin, "node"));
    expect(run({ PATH: bin + ":/usr/bin:/bin" }, true).code).toBe(2);
  });
  it.each(["delete", "empty", "directory"])(
    "retains process facts when a build makes its source unreadable: %s",
    (mutation) => {
      prepareCapturedCase();
      const operation =
        mutation === "delete"
          ? "fs.unlinkSync('application.ts')"
          : mutation === "empty"
            ? "fs.writeFileSync('application.ts', '')"
            : "fs.unlinkSync('application.ts'); fs.mkdirSync('application.ts')";
      fs.writeFileSync(
        path.join(dir, "build.cjs"),
        `const fs=require('node:fs'); ${operation}; console.log('failure observed'); process.exit(7);`,
      );
      expect(captureBuild().code).toBe(2);
      const capture = JSON.parse(
        fs.readFileSync(currentEvidence("build", "capture"), "utf8"),
      );
      expect(capture.exitCode).toBe(7);
      expect(capture.argv).toEqual([process.execPath, "build.cjs"]);
      expect(capture.cwd).toBe(fs.realpathSync(dir));
      expect(capture.finishedNs).toBeGreaterThanOrEqual(capture.startedNs);
      expect(capture.sourceObservationError).toBeTruthy();
      expect(
        fs.readFileSync(path.join(dir, "logs", capture.stdout.path), "utf8"),
      ).toContain("failure observed");
      const build = JSON.parse(
        fs.readFileSync(path.join(dir, "logs/build.json"), "utf8"),
      );
      expect(build.status).toBe("PARTIAL");
      expect(build.command.exitCode).toBe(7);
    },
  );
  it("checks that the canonical redactor can run before launching the build", () => {
    prepareCapturedCase();
    fs.writeFileSync(
      path.join(dir, "capture-package/dist/domains/managed-work/redaction.js"),
      "throw new Error('broken installed module');",
    );
    const result = captureBuild();
    expect(result.code).toBe(2);
    expect(fs.existsSync(path.join(dir, "artifact.json"))).toBe(false);
  });
  it("fails closed before execution when the canonical redactor is unavailable", () => {
    prepareCapturedCase();
    fs.rmSync(path.join(dir, "capture-package/dist"), { recursive: true });
    const bin = path.join(dir, "private-bin");
    fs.mkdirSync(bin);
    const python = execFileSync(
      "python3",
      ["-c", "import sys; print(sys.executable)"],
      { encoding: "utf8" },
    ).trim();
    fs.symlinkSync(python, path.join(bin, "python3"));
    const result = record(
      {
        kind: "build",
        argv: [process.execPath, "build.cjs"],
        cwd: ".",
        sources: ["application.ts", "build.cjs", "case.cjs"],
        artifact: "artifact.json",
        output: "logs/build.json",
      },
      undefined,
      { ...process.env, PATH: bin },
    );
    expect(result.code).toBe(2);
    expect(result.output).toContain("脱敏器");
    expect(fs.existsSync(path.join(dir, "artifact.json"))).toBe(false);
  });
  it("loads the canonical package redactor for a separately installed script", () => {
    prepareCapturedCase();
    const scripts = path.join(dir, "installed/scripts");
    const bin = path.join(dir, "bin");
    const app = path.join(dir, "capture-package/dist/app");
    fs.mkdirSync(scripts, { recursive: true });
    fs.mkdirSync(bin);
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, "cli.js"), "#!/usr/bin/env node\n");
    fs.chmodSync(path.join(app, "cli.js"), 0o755);
    fs.symlinkSync(path.join(app, "cli.js"), path.join(bin, "superflow"));
    const script = path.join(scripts, "lint.py");
    fs.copyFileSync(lint, script);
    const result = record(
      {
        kind: "build",
        argv: [process.execPath, "build.cjs"],
        cwd: ".",
        sources: ["application.ts", "build.cjs", "case.cjs"],
        artifact: "artifact.json",
        output: "logs/build.json",
      },
      script,
      { ...process.env, PATH: bin + path.delimiter + process.env.PATH },
    );
    expect(result.code).toBe(0);
    expect(captureCase().code).toBe(0);
    expect(run().code).toBe(0);
  });
  it("resolves the npm package behind a regular executable shim", () => {
    prepareCapturedCase();
    const prefix = path.join(dir, "prefix");
    const packageRoot = path.join(prefix, "node_modules/@chenmk/superflow");
    fs.mkdirSync(path.dirname(packageRoot), { recursive: true });
    fs.renameSync(path.join(dir, "capture-package"), packageRoot);
    const script = path.join(dir, "installed/lint.py");
    fs.mkdirSync(path.dirname(script));
    fs.copyFileSync(lint, script);
    fs.writeFileSync(path.join(prefix, "superflow"), "#!/usr/bin/env node\n");
    fs.chmodSync(path.join(prefix, "superflow"), 0o755);
    const result = record(
      {
        kind: "build",
        argv: [process.execPath, "build.cjs"],
        cwd: ".",
        sources: ["application.ts", "build.cjs", "case.cjs"],
        artifact: "artifact.json",
        output: "logs/build.json",
      },
      script,
      { ...process.env, PATH: prefix + path.delimiter + process.env.PATH },
    );
    expect(result.code).toBe(0);
  });
  it("captures actual build and case processes with retained raw output", () => {
    prepareCapturedCase();
    expect(captureBuild().code).toBe(0);
    expect(captureCase().code).toBe(0);
    expect(fs.readFileSync(path.join(dir, "invoked.txt"), "utf8")).toBe(
      "real child invocation",
    );
    const receipt = JSON.parse(
      fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
    );
    expect(receipt.command.argv).toEqual([process.execPath, "case.cjs"]);
    expect(receipt.command.exitCode).toBe(0);
    expect(receipt.assertions[0].actual).toBe(true);
    const capture = JSON.parse(
      fs.readFileSync(path.join(dir, "logs", receipt.capture.path), "utf8"),
    );
    const stderr = fs.readFileSync(
      path.join(dir, "logs", capture.stderr.path),
      "utf8",
    );
    expect(stderr).toContain("retained diagnostic");
    expect(stderr).toContain("<redacted>");
    expect(stderr).not.toContain("private-fixture-value");
    expect(run().code).toBe(0);
  });
  it("does not manufacture measured assertions for a successful empty command", () => {
    prepareCapturedCase();
    fs.writeFileSync(
      path.join(dir, "case.cjs"),
      "console.log('no measured assertions');",
    );
    expect(captureBuild().code).toBe(0);
    expect(captureCase().code).toBe(2);
    const receipt = JSON.parse(
      fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
    );
    expect(receipt.status).toBe("PARTIAL");
    expect(receipt.assertions).toBeUndefined();
    expect(run().code).toBe(2);
  });
  it("rejects source mutation during the actual case command", () => {
    prepareCapturedCase();
    const file = path.join(dir, "case.cjs");
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, "utf8")
        .replace(
          "process.exit(0)",
          "fs.appendFileSync('application.ts', '// drift'); process.exit(0)",
        ),
    );
    expect(captureBuild().code).toBe(0);
    expect(captureCase().code).toBe(2);
    const receipt = JSON.parse(
      fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
    );
    expect(receipt.status).toBe("PARTIAL");
    expect(run().code).toBe(2);
  });
  it("rejects altered observations even with updated stdout and capture hashes", () => {
    prepareCapturedCase();
    expect(captureBuild().code).toBe(0);
    expect(captureCase().code).toBe(0);
    const receipt = JSON.parse(
      fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
    );
    const captureFile = path.join(dir, "logs", receipt.capture.path);
    const capture = JSON.parse(fs.readFileSync(captureFile, "utf8"));
    const stdoutFile = path.join(dir, "logs", capture.stdout.path);
    const event = JSON.parse(fs.readFileSync(stdoutFile, "utf8"));
    event.assertions[0].actual = false;
    fs.writeFileSync(stdoutFile, JSON.stringify(event));
    capture.stdout.sha256 = digest(fs.readFileSync(stdoutFile));
    fs.writeFileSync(captureFile, JSON.stringify(capture));
    receipt.capture.sha256 = digest(fs.readFileSync(captureFile));
    save(receipt);
    expect(run().code).toBe(2);
  });
  it.each(["case", "build", "cwd", "source"])(
    "rejects capture reuse after %s binding drift",
    (binding) => {
      prepareCapturedCase();
      expect(captureBuild().code).toBe(0);
      expect(captureCase().code).toBe(0);
      const receipt = JSON.parse(
        fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
      );
      if (binding === "source") {
        fs.appendFileSync(path.join(dir, "application.ts"), "// new source\n");
      } else {
        const captureFile = path.join(dir, "logs", receipt.capture.path);
        const capture = JSON.parse(fs.readFileSync(captureFile, "utf8"));
        if (binding === "cwd") capture.cwd = path.join(dir, "other");
        else {
          const stdoutFile = path.join(dir, "logs", capture.stdout.path);
          const event = JSON.parse(fs.readFileSync(stdoutFile, "utf8"));
          if (binding === "case") event.caseId = "C2";
          else event.target.buildId = "unrelated-build";
          fs.writeFileSync(stdoutFile, JSON.stringify(event));
          capture.stdout.sha256 = digest(fs.readFileSync(stdoutFile));
        }
        fs.writeFileSync(captureFile, JSON.stringify(capture));
        receipt.capture.sha256 = digest(fs.readFileSync(captureFile));
        save(receipt);
      }
      expect(run().code).toBe(2);
    },
  );
  it("retains a nonzero child result without promoting emitted PASS", () => {
    prepareCapturedCase(true);
    expect(captureBuild().code).toBe(0);
    expect(captureCase().code).not.toBe(0);
    expect(fs.readFileSync(path.join(dir, "invoked.txt"), "utf8")).toBe(
      "real child invocation",
    );
    const receipt = JSON.parse(
      fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
    );
    expect(receipt.command.exitCode).toBe(7);
    expect(receipt.status).not.toBe("PASS");
    expect(run().code).toBe(2);
  });
  it("rejects a self-consistent synthetic PASS when capture was frozen", () => {
    const file = path.join(dir, "review.json");
    const review = JSON.parse(fs.readFileSync(file, "utf8"));
    review.coverage.cases[0].executionEvidence = "runner-captured.v1";
    fs.writeFileSync(file, JSON.stringify(review));
    const receipt = JSON.parse(fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"));
    delete receipt.capture;
    save(receipt);
    // The gate must distinguish a schema-consistent receipt from capture.
    const result = run();
    expect(result.code).toBe(2);
    expect(result.output).toContain("capture");
  });
  it.each(["case", "build"])("rejects synthetic %s PASS when the case omits executionEvidence", (kind) => {
    const file = path.join(dir, "review.json");
    const review = JSON.parse(fs.readFileSync(file, "utf8"));
    delete review.coverage.cases[0].executionEvidence;
    fs.writeFileSync(file, JSON.stringify(review));
    const receipt = JSON.parse(fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"));
    if (kind === "case") delete receipt.capture;
    else {
      delete receipt.build.capture;
      const eventFile = currentEvidence("C1", "command");
      const event = JSON.parse(fs.readFileSync(eventFile, "utf8"));
      event.build = receipt.build;
      const output = JSON.stringify(event) + "\n";
      fs.writeFileSync(eventFile, output);
      receipt.command.sha256 = digest(output);
    }
    save(receipt);
    const result = run();
    expect(result.code).toBe(2);
    expect(result.output).toContain("capture");
  });
  it("requires current independent review when coding-ready is missing", () => {
    observedDelivery();
    fs.rmSync(path.join(dir, ".sdd/readiness/coding-ready.json"));
    expect(run({}, true).code).toBe(2);
  });
  it.each(["executionEvidence", "executionContext"])(
    "rejects genuine captured SDD PASS when frozen %s is missing", (field) => {
      const file = path.join(dir, "review.json");
      const review = JSON.parse(fs.readFileSync(file, "utf8"));
      delete review.coverage.cases[0][field];
      fs.writeFileSync(file, JSON.stringify(review));
      const result = run({}, true);
      expect(result.code).toBe(2);
      expect(result.output).toContain(field);
    },
  );
  it("does not treat an unsupported capture declaration as legacy evidence", () => {
    const file = path.join(dir, "review.json");
    const review = JSON.parse(fs.readFileSync(file, "utf8"));
    review.coverage.cases[0].executionEvidence = "runner-captured.unknown";
    fs.writeFileSync(file, JSON.stringify(review));
    expect(run().code).toBe(2);
  });
  it("preserves legacy partial under a newly declared capture requirement", () => {
    const file = path.join(dir, "review.json");
    const review = JSON.parse(fs.readFileSync(file, "utf8"));
    review.coverage.cases[0].executionEvidence = "runner-captured.v1";
    fs.writeFileSync(file, JSON.stringify(review));
    const report = path.join(dir, "report.md");
    fs.writeFileSync(
      report,
      fs
        .readFileSync(report, "utf8")
        .replace("| PASS |", "| PARTIAL |")
        .replace("验证结果: PASS", "验证结果: PARTIALLY_VERIFIED"),
    );
    expect(run().code).toBe(0);
    expect(run({}, true).code).toBe(2);
  });
  it.each([
    ["-\t```markdown", "    ```"],
    ["1.\t~~~markdown", "    ~~~"],
    [">\t```markdown", "> ```"],
  ])("does not promote unsupported tab container %s", (open, close) => {
    fs.appendFileSync(
      path.join(dir, "report.md"),
      `\n${open}\n\texample\n${close}\n验证结果: PASS\n`,
    );
    expect(run({}, true).code).toBe(2);
  });
  it.each([
    ["list", "- ```markdown", "  ", "  ```"],
    ["nested", "  - - ~~~~markdown", "      ", "      ~~~~"],
    ["quote", "> ```markdown", "> ", "> ```"],
    ["quoted-list", "> - ```markdown", ">   ", ">   ```"],
  ])(
    "keeps real final FAIL after %s container",
    (_name, open, prefix, close) => {
      const report = path.join(dir, "report.md");
      fs.appendFileSync(
        report,
        `\n${open}\n${prefix}验证结果: PASS\n${close}\n验证结果: FAIL\n`,
      );
      expect(run({}, true).code).toBe(2);
    },
  );
  it("does not promote an unclosed ambiguous container", () => {
    fs.appendFileSync(
      path.join(dir, "report.md"),
      "\n- ```markdown\n  example\n验证结果: FAIL\n",
    );
    expect(run({}, true).code).toBe(2);
  });
  it("requires repair for an unclosed container even after an earlier PASS", () => {
    fs.appendFileSync(
      path.join(dir, "report.md"),
      "\n- ```markdown\n  example\n",
    );
    expect(run({}, true).code).toBe(2);
  });
  it("does not close a root fence with list-like code content", () => {
    const report = path.join(dir, "report.md");
    fs.appendFileSync(
      report,
      "\n```markdown\n- ```\n验证结果: FAIL\n```\n验证结果: PASS\n",
    );
    expect(run({}, true).code).toBe(0);
  });
  function bindExecutionContext() {
    const reviewFile = path.join(dir, "review.json");
    const review = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
    review.coverage.cases[0].executionContext = {
      argv: [process.execPath, "case-C1.cjs"],
      cwd: ".",
      environmentKeys: ["NODE_ENV"],
    };
    fs.writeFileSync(reviewFile, JSON.stringify(review));
    // A changed frozen context needs a real new capture, not rewritten raw evidence.
    const captured = record({
      kind: "case", changeDir: ".", review: "review.json", caseId: "C1",
      sources: ["case-C1.cjs"], build: "logs/build.json", output: "logs/C1.json",
    });
    expect(captured.code, captured.output).toBe(0);
    return JSON.parse(fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"));
  }
  it("requires a frozen context even when the receipt retains actual capture context", () => {
    const file = path.join(dir, "review.json");
    const review = JSON.parse(fs.readFileSync(file, "utf8"));
    delete review.coverage.cases[0].executionContext;
    fs.writeFileSync(file, JSON.stringify(review));
    const receipt = JSON.parse(
      fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
    );
    receipt.executionContext.legacyNote = "not frozen";
    save(receipt);
    expect(run().code).toBe(2);
  });
  it("matches declared command, working directory and selected environment", () => {
    bindExecutionContext();
    expect(run().code).toBe(0);
    expect(run({ SUPERFLOW_TEST_INCIDENTAL: "changed" }).code).toBe(0);
  });
  it("rejects changed bound environment without exposing its value", () => {
    bindExecutionContext();
    const result = run({ NODE_ENV: "different-context" });
    expect(result.code).toBe(2);
    expect(result.output).not.toContain("different-context");
  });
  it.each(["argv", "cwd", "missing", "raw-event", "secret-key"])(
    "rejects execution context drift: %s",
    (kind) => {
      const receipt = bindExecutionContext();
      const reviewFile = path.join(dir, "review.json");
      if (kind === "argv" || kind === "secret-key") {
        const review = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
        const context = review.coverage.cases[0].executionContext;
        if (kind === "argv") context.argv = ["node", "different.ts"];
        else context.environmentKeys = ["DB_PASSWORD"];
        fs.writeFileSync(reviewFile, JSON.stringify(review));
      } else {
        if (kind === "cwd")
          receipt.executionContext.cwd = path.join(dir, "other");
        if (kind === "missing") delete receipt.executionContext;
        if (kind === "raw-event")
          receipt.executionContext.environmentSha256.NODE_ENV = digest("fake");
        save(receipt);
      }
      expect(run().code).toBe(2);
    },
  );
  it.each(["~~~", "````"])(
    "ignores fenced summaries and example ledgers: %s",
    (marker) => {
      const report = path.join(dir, "report.md");
      const original = fs.readFileSync(report, "utf8");
      const example = `${marker}markdown\n\`\`\`\n${original.replace("logs/C1.json", "missing.json")}Verification Result: FAIL\n${marker}\n`;
      fs.writeFileSync(report, example + original);
      expect(run().code).toBe(0);
    },
  );
  it("does not accept an execution ledger only present in a code block", () => {
    const report = path.join(dir, "report.md");
    fs.writeFileSync(
      report,
      "```markdown\n" +
        fs.readFileSync(report, "utf8") +
        "```\n验证结果: PASS\n",
    );
    expect(run().code).toBe(2);
  });
  it("accepts retained raw execution and current source", () =>
    expect(run().code).toBe(0));
  it.each(["", "{}", "API assertion", "https://example.invalid/proof"])(
    "rejects existence-only evidence %s",
    (text) => {
      if (text.startsWith("http"))
        fs.writeFileSync(
          path.join(dir, "report.md"),
          fs
            .readFileSync(path.join(dir, "report.md"), "utf8")
            .replace("logs/C1.json", text),
        );
      else fs.writeFileSync(path.join(dir, "logs/C1.json"), text);
      expect(run().code).toBe(2);
    },
  );
  it.each([
    (r: any) => {
      r.entryId = "E05";
    },
    (r: any) => {
      r.executed = 0;
    },
    (r: any) => {
      r.status = "SKIP";
    },
    (r: any) => {
      r.command.exitCode = 1;
    },
    (r: any) => {
      r.target.buildId = "old-build";
    },
    (r: any) => {
      r.target.service = "other-service";
    },
    (r: any) => {
      r.evidenceKind = "controlled-simulation";
    },
    (r: any) => {
      r.assertions[1].actual = false;
    },
  ])("rejects mismatched execution facts", (mutate) => {
    const r = JSON.parse(
      fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
    );
    mutate(r);
    save(r);
    expect(run().code).toBe(2);
  });
  it("rejects stale source and changed raw output", () => {
    fs.appendFileSync(path.join(dir, "application.ts"), "// changed\n");
    expect(run().code).toBe(2);
  });
  it("preserves honest partial without promoting it", () => {
    fs.writeFileSync(
      path.join(dir, "report.md"),
      fs
        .readFileSync(path.join(dir, "report.md"), "utf8")
        .replace("| PASS |", "| PARTIAL |")
        .replace("验证结果: PASS", "验证结果: PARTIALLY_VERIFIED"),
    );
    expect(run().code).toBe(0);
  });
  it("accepts final partial after a historical PASS and blocks full delivery", () => {
    const file = path.join(dir, "report.md");
    fs.writeFileSync(
      file,
      "## History\n验证结果: PASS\n## Current verification\n" +
        fs
          .readFileSync(file, "utf8")
          .replace("| PASS |", "| PARTIAL |")
          .replace("验证结果: PASS", "验证结果: PARTIALLY_VERIFIED"),
    );
    expect(run().output).toBe(
      "SuperBridge Flow test-report 证据一致性检查通过\n",
    );
    expect(() =>
      execFileSync("python3", [lint, "--require-complete", file]),
    ).toThrow();
  });
  it("rejects raw target contradiction even when the file hash matches", () => {
    const receipt = JSON.parse(
      fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
    );
    const raw = JSON.parse(
      fs.readFileSync(currentEvidence("C1", "command"), "utf8"),
    );
    raw.target.service = "E05";
    const output = JSON.stringify(raw) + "\n";
    fs.writeFileSync(currentEvidence("C1", "command"), output);
    receipt.command.sha256 = digest(output);
    save(receipt);
    expect(run().code).toBe(2);
  });
  it.each([null, "wrong", "expected"])(
    "compares actual persisted value %s",
    (actual) => {
      const reviewFile = path.join(dir, "review.json");
      const review = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
      const expected = {
        id: "write",
        table: "record",
        field: "external_code",
        expected: "expected",
      };
      review.coverage.cases[0].assertions.persistence = [expected];
      // Synthetic validator data, not a claim of executing any business DB.
      const schema = "CREATE TABLE record(id TEXT, external_code TEXT);\n";
      fs.writeFileSync(path.join(dir, "schema.sql"), schema);
      review.coverage.sources.push({
        id: "schema",
        role: "contract",
        path: "schema.sql",
        sha256: digest(schema),
      });
      const statements = [{ sourceRef: "S1", id: "anonymous.run" }];
      review.coverage.sources[0].sha256 = digest(
        fs.readFileSync(path.join(dir, "application.ts")),
      );
      review.coverage.entries[0].database = {
        engine: "sqlite",
        major: 3,
        schemaSourceRefs: ["schema"],
        statements,
      };
      const boundary = { allowed: [], forbidden: ["anonymous.run"] };
      const frozen = [
        { id: "rows", kind: "affectedRows", expected: 1 },
        {
          id: "isolated",
          kind: "unchangedRows",
          expected: {
            "other:1": { businessId: "other", round: 1, value: "old" },
          },
        },
      ];
      Object.assign(review.coverage.cases[0], {
        testLayer: "database",
        evidenceKind: "real",
        mockBoundary: boundary,
        statements,
        databaseAssertions: frozen,
      });

      fs.writeFileSync(reviewFile, JSON.stringify(review));
      const measurement = {
        testLayer: "database", mockBoundary: boundary,
        database: { engine: "sqlite", major: 3, statements,
          assertions: frozen.map((a) => ({ ...a,
            actual: a.kind === "unchangedRows"
              ? { before: a.expected, after: a.expected } : a.expected,
            result: "PASS",
          })),
        },
        persistence: [{ ...expected,
          before: { businessId: "synthetic-1", value: null },
          after: { businessId: "synthetic-1", value: "expected" }, result: "PASS",
        }],
      };
      const receipt = writeExecutionReceipt(dir, "C1", "E11", "api", measurement);
      receipt.persistence[0].after.value = actual;
      const raw = { ...receipt,
        command: { argv: receipt.command.argv, exitCode: 0 },
      };
      const output = JSON.stringify(raw) + "\n";
      fs.writeFileSync(currentEvidence("C1", "command"), output);
      receipt.command.sha256 = digest(output);
      save(receipt);
      expect(run().code).toBe(actual === "expected" ? 0 : 2);
    },
  );
  it("rejects conflicting build events for the same build ID", () => {
    const receipt = JSON.parse(
      fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
    );
    const event = JSON.parse(
      fs.readFileSync(currentEvidence("build", "command"), "utf8"),
    );
    const buildOutput =
      JSON.stringify(event) +
      "\n" +
      JSON.stringify({ ...event, exitCode: 1 }) +
      "\n";
    fs.writeFileSync(currentEvidence("build", "command"), buildOutput);
    receipt.build.command.sha256 = digest(buildOutput);
    const raw = {
      ...receipt,
      command: { argv: receipt.command.argv, exitCode: 0 },
    };
    const output = JSON.stringify(raw) + "\n";
    fs.writeFileSync(currentEvidence("C1", "command"), output);
    receipt.command.sha256 = digest(output);
    save(receipt);
    expect(run().code).toBe(2);
  });
});
