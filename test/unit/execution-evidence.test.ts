import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { digest } from "../helpers/review-coverage.js";
import { writeExecutionReceipt } from "../helpers/execution-receipt.js";

const lint = path.resolve("assets/scripts/superflow-test-report-lint.py");
let dir: string;
function run(environment: NodeJS.ProcessEnv = {}, complete = false) {
  try {
    return {
      code: 0,
      output: execFileSync(
        "python3",
        [
          lint,
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
      argv: ["node", "application.ts"],
      cwd: ".",
      environmentKeys: ["NODE_ENV"],
    };
    fs.writeFileSync(reviewFile, JSON.stringify(review));
    const receipt = JSON.parse(
      fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
    );
    receipt.executionContext = {
      cwd: fs.realpathSync(dir),
      environmentSha256: {
        NODE_ENV: digest(JSON.stringify(process.env.NODE_ENV ?? null)),
      },
    };
    const outputFile = path.join(dir, "logs/C1.jsonl");
    const event = JSON.parse(fs.readFileSync(outputFile, "utf8"));
    event.executionContext = receipt.executionContext;
    const output = JSON.stringify(event) + "\n";
    fs.writeFileSync(outputFile, output);
    receipt.command.sha256 = digest(output);
    save(receipt);
    return receipt;
  }
  it("preserves legacy extra context without claiming declared binding", () => {
    const receipt = JSON.parse(
      fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
    );
    receipt.executionContext = { legacyNote: "not frozen" };
    save(receipt);
    expect(run().code).toBe(0);
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
      const receipt = JSON.parse(
        fs.readFileSync(path.join(dir, "logs/C1.json"), "utf8"),
      );

      Object.assign(receipt, {
        testLayer: "database",
        mockBoundary: boundary,
        database: {
          engine: "sqlite",
          major: 3,
          statements,
          assertions: frozen.map((a) => ({
            ...a,
            actual:
              a.kind === "unchangedRows"
                ? { before: a.expected, after: a.expected }
                : a.expected,
            result: "PASS",
          })),
        },
      });
      receipt.sources.push({ path: "../schema.sql", sha256: digest(schema) });
      const fingerprint = digest(
        receipt.sources
          .map((source: any) => `${source.path}:${source.sha256}`)
          .sort()
          .join("\n"),
      );
      receipt.build.sourceFingerprint = fingerprint;
      receipt.target.sourceFingerprint = fingerprint;
      const buildFile = path.join(dir, "logs/build.jsonl");
      const buildEvent = JSON.parse(fs.readFileSync(buildFile, "utf8"));
      buildEvent.sourceFingerprint = fingerprint;
      const buildOutput = JSON.stringify(buildEvent) + "\n";
      fs.writeFileSync(buildFile, buildOutput);
      receipt.build.command.sha256 = digest(buildOutput);
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
