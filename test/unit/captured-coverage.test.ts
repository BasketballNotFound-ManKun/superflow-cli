import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prepareCoverage, REVIEW } from "../helpers/review-coverage.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function validate(update: (test: any) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-capture-"));
  directories.push(directory);
  prepareCoverage(directory, { persistReceipt: false });
  const file = path.join(directory, REVIEW);
  const review = JSON.parse(fs.readFileSync(file, "utf8"));
  update(review.coverage.cases[0]);
  fs.writeFileSync(file, JSON.stringify(review));
  const module = pathToFileURL(
    path.resolve("assets/scripts/superflow-review-coverage.mjs"),
  ).href;
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
    import fs from 'node:fs';
    import {validateCoverage} from ${JSON.stringify(module)};
    const issues=[];
    validateCoverage(${JSON.stringify(directory)}, JSON.parse(fs.readFileSync(${JSON.stringify(file)},'utf8')), issues);
    console.log(JSON.stringify(issues));
  `,
      ],
      { encoding: "utf8" },
    ),
  );
}

describe("captured execution coverage contract", () => {
  it.each([
    ["duplicate branch IDs", { requiredBranches: ["changed", "changed"] }, "requiredBranches"],
    ["empty branch IDs", { requiredBranches: [] }, "requiredBranches"],
    ["aggregate branches without a frozen set", { databaseAssertions: [{ id: "all", kind: "allParameterBranches", expected: true }] }, "requiredBranches"],
    ["runtime task name instead of identity", { runtimeArtifact: "archive-task" }, "runtimeArtifact"],
    ["invalid runtime count", { runtimeArtifact: { instances: 0 } }, "runtimeArtifact"],
  ])("rejects %s before issuing Coding Ready", (_name, update, diagnostic) => {
    expect(validate(test => Object.assign(test, update)).join("\n")).toContain(diagnostic);
  });

  it("accepts explicit branch IDs and observed runtime instance obligations", () => {
    expect(validate(test => Object.assign(test, {
      requiredBranches: ["changed", "unchanged"], runtimeArtifact: { instances: 2 },
    }))).toEqual([]);
  });

  it("rejects cases without the current captured execution policy", () => {
    expect(
      validate((test) => {
        delete test.executionEvidence;
      }).join("\n"),
    ).toContain("executionEvidence");
  });
  it("rejects unknown capture policies", () => {
    expect(
      validate((test) => {
        test.executionEvidence = "pretend-pass";
      }).join("\n"),
    ).toContain("executionEvidence");
  });
  it("requires a frozen command for captured execution", () => {
    expect(
      validate((test) => {
        delete test.executionContext;
      }).join("\n"),
    ).toContain("executionContext");
  });
  it("accepts a captured case with an existing command contract", () => {
    expect(
      validate((test) => {
        test.executionEvidence = "runner-captured.v1";
        test.executionContext = {
          argv: ["node", "verify.js"],
          cwd: ".",
          environmentKeys: [],
        };
      }),
    ).toEqual([]);
  });
});
