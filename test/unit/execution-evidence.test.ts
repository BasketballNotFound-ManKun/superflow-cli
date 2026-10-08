import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { digest } from "../helpers/review-coverage.js";
import { writeExecutionReceipt } from "../helpers/execution-receipt.js";

const lint = path.resolve("assets/scripts/superflow-test-report-lint.py");
let dir: string;
function run() {
  try {
    return {
      code: 0,
      output: execFileSync(
        "python3",
        [
          lint,
          "--review",
          path.join(dir, "review.json"),
          path.join(dir, "report.md"),
        ],
        { encoding: "utf8" },
      ),
    };
  } catch (error: any) {
    return { code: error.status, output: error.stdout };
  }
}
function save(receipt: any) {
  fs.writeFileSync(path.join(dir, "logs/C1.json"), JSON.stringify(receipt));
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-receipt-"));
  writeExecutionReceipt(dir, "C1", "E11");
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
  fs.writeFileSync(
    path.join(dir, "report.md"),
    "| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |\n|---|---|---|---|---|\n| C1 | E11 | api | PASS | logs/C1.json |\n验证结果: PASS\n",
  );
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
describe("execution receipt boundary", () => {
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
      "验证结果: PASS\n" +
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
      fs.readFileSync(path.join(dir, "logs/C1.jsonl"), "utf8"),
    );
    raw.target.service = "E05";
    const output = JSON.stringify(raw) + "\n";
    fs.writeFileSync(path.join(dir, "logs/C1.jsonl"), output);
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
      fs.writeFileSync(reviewFile, JSON.stringify(review));
      const receipt = JSON.parse(
        fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
      );
      receipt.persistence = [
        {
          ...expected,
          before: { businessId: "synthetic-1", value: null },
          after: { businessId: "synthetic-1", value: actual },
          result: "PASS",
        },
      ];
      const raw = {
        ...receipt,
        command: { argv: receipt.command.argv, exitCode: 0 },
      };
      const output = JSON.stringify(raw) + "\n";
      fs.writeFileSync(path.join(dir, "logs/C1.jsonl"), output);
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
      fs.readFileSync(path.join(dir, "logs/build.jsonl"), "utf8"),
    );
    const buildOutput =
      JSON.stringify(event) +
      "\n" +
      JSON.stringify({ ...event, exitCode: 1 }) +
      "\n";
    fs.writeFileSync(path.join(dir, "logs/build.jsonl"), buildOutput);
    receipt.build.command.sha256 = digest(buildOutput);
    const raw = {
      ...receipt,
      command: { argv: receipt.command.argv, exitCode: 0 },
    };
    const output = JSON.stringify(raw) + "\n";
    fs.writeFileSync(path.join(dir, "logs/C1.jsonl"), output);
    receipt.command.sha256 = digest(output);
    save(receipt);
    expect(run().code).toBe(2);
  });
});
