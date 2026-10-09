import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { prepareCoverage, REVIEW, digest } from "../helpers/review-coverage.js";
import { writeExecutionReceipt } from "../helpers/execution-receipt.js";

const root = path.resolve(__dirname, "../..");
const dirs: string[] = [];
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-db-contract-"));
  dirs.push(dir);
  prepareCoverage(dir);
  const review = JSON.parse(fs.readFileSync(path.join(dir, REVIEW), "utf8"));
  const database = {
    engine: "mysql",
    major: 8,
    schemaSourceRefs: ["tests"],
    statements: [{ sourceRef: "caller", id: "AnonymousMapper.update" }],
  };
  review.coverage.entries[1].database = database;
  const test = review.coverage.cases[1];
  Object.assign(test, {
    testLayer: "database",
    evidenceKind: "real",
    mockBoundary: {
      allowed: ["ExternalClient"],
      forbidden: ["AnonymousMapper"],
    },
    statements: database.statements,
    databaseAssertions: [
      { id: "rows", kind: "affectedRows", expected: 1 },
      {
        id: "other",
        kind: "unchangedRows",
        expected: { other: { businessId: "other", value: 3 } },
      },
    ],
  });
  return { dir, review, test, database };
}
function issues(dir: string, review: any): string[] {
  return JSON.parse(
    execFileSync(
      "node",
      [
        "--input-type=module",
        "-e",
        `import {validateCoverage} from ${JSON.stringify(path.join(root, "assets/scripts/superflow-review-coverage.mjs"))}; const issues=[]; validateCoverage(${JSON.stringify(dir)}, ${JSON.stringify(review)}, issues); console.log(JSON.stringify(issues));`,
      ],
      { encoding: "utf8" },
    ),
  );
}
function receiptCheck(f: ReturnType<typeof fixture>, mutate = (_r: any) => {}) {
  const receipt: any = writeExecutionReceipt(f.dir, "C2", "api-child-create");
  receipt.target.route = f.review.coverage.entries[1].route;
  Object.assign(receipt, {
    testLayer: f.test.testLayer,
    mockBoundary: f.test.mockBoundary,
    database: {
      engine: "mysql",
      major: 8,
      statements: f.database.statements,
      assertions: f.test.databaseAssertions.map((a: any) => ({
        ...a,
        actual: structuredClone(
          a.kind === "unchangedRows"
            ? { before: a.expected, after: a.expected }
            : a.expected,
        ),
        result: "PASS",
      })),
    },
  });
  f.review.coverage.sources[1] = {
    id: "caller",
    path: "application.ts",
    role: "code",
    sha256: digest(fs.readFileSync(path.join(f.dir, "application.ts"))),
  };
  // Schema and SQL source identity are bound independently of entry source refs.
  receipt.sources.push({
    path: "../tests.md",
    sha256: f.review.coverage.sources[2].sha256,
  });
  receipt.build.sourceFingerprint = digest(
    receipt.sources
      .map((s: any) => `${s.path}:${s.sha256}`)
      .sort()
      .join("\n"),
  );
  receipt.target.sourceFingerprint = receipt.build.sourceFingerprint;
  const buildEvent = {
    event: "build",
    buildId: receipt.build.id,
    sourceFingerprint: receipt.build.sourceFingerprint,
    artifactSha256: receipt.build.sha256,
    argv: receipt.build.command.argv,
    exitCode: 0,
  };
  fs.writeFileSync(
    path.join(f.dir, "logs/build.jsonl"),
    JSON.stringify(buildEvent) + "\n",
  );
  receipt.build.command.sha256 = digest(JSON.stringify(buildEvent) + "\n");
  mutate(receipt);
  const event = {
    ...receipt,
    command: { argv: receipt.command.argv, exitCode: 0 },
  };
  const output = JSON.stringify(event) + "\n";
  fs.writeFileSync(path.join(f.dir, "logs/C2.jsonl"), output);
  receipt.command.sha256 = digest(output);
  fs.writeFileSync(path.join(f.dir, "logs/C2.json"), JSON.stringify(receipt));
  fs.writeFileSync(path.join(f.dir, "review.json"), JSON.stringify(f.review));
  return () =>
    execFileSync(
      "python3",
      [
        "-c",
        `import importlib.util,json,sys; from pathlib import Path; spec=importlib.util.spec_from_file_location('lint',sys.argv[1]); m=importlib.util.module_from_spec(spec);sys.modules['lint']=m;spec.loader.exec_module(m);r=json.loads(Path(sys.argv[3]).read_text());m.validate_execution_receipt(Path(sys.argv[2]),r['coverage']['cases'][1],r['coverage'],Path(sys.argv[3]).parent)`,
        path.join(root, "assets/scripts/superflow-test-report-lint.py"),
        path.join(f.dir, "logs/C2.json"),
        path.join(f.dir, "review.json"),
      ],
      { encoding: "utf8", stdio: "pipe" },
    );
}
afterEach(() =>
  dirs
    .splice(0)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })),
);
describe("数据库执行合同", () => {
  it("数据库必要用例不能只有 Mock 逻辑层", () => {
    const f = fixture();
    f.test.testLayer = "logic";
    f.test.evidenceKind = "unit";
    expect(issues(f.dir, f.review).join("\n")).toContain("必要真实数据库用例");
  });
  it("允许辅助逻辑层，同时保留必要数据库层", () => {
    const f = fixture();
    const auxiliary = {
      ...f.test,
      id: "C3",
      testLayer: "logic",
      evidenceKind: "unit",
    };
    delete auxiliary.statements;
    delete auxiliary.databaseAssertions;
    f.review.coverage.cases.push(auxiliary);
    f.review.coverage.decisions[1].caseIds.push("C3");
    expect(issues(f.dir, f.review)).toEqual([]);
  });
  it("旧纯逻辑合同保持兼容", () => {
    const f = fixture();
    delete f.review.coverage.entries[1].database;
    delete f.test.testLayer;
    expect(issues(f.dir, f.review)).toEqual([]);
  });
  it("真实数据库分层凭证可通过", () => {
    expect(receiptCheck(fixture())).not.toThrow();
  });
  it.each([
    "engine",
    "major",
    "statement",
    "mock",
    "schema",
    "assertion",
    "layer",
    "raw",
  ])("拒绝 %s 错配", (kind) => {
    const f = fixture();
    const check = receiptCheck(f, (r: any) => {
      if (kind === "engine") r.database.engine = "sqlite";
      if (kind === "major") r.database.major = 5;
      if (kind === "statement") r.database.statements = [];
      if (kind === "mock") r.mockBoundary.allowed.push("AnonymousMapper");
      if (kind === "schema")
        r.sources = r.sources.filter((s: any) => s.path !== "../tests.md");
      if (kind === "assertion") r.database.assertions[0].actual = 0;
      if (kind === "layer") r.testLayer = "logic";
    });
    if (kind === "raw") {
      const file = path.join(f.dir, "logs/C2.json");
      const r = JSON.parse(fs.readFileSync(file, "utf8"));
      r.database.engine = "sqlite";
      fs.writeFileSync(file, JSON.stringify(r));
    }
    expect(check).toThrow();
  });
  it.each(["rows", "response", "nested", "snapshot", "raw"])(
    "严格区分 JSON boolean/number：%s",
    (scope) => {
      const f = fixture();
      if (scope === "snapshot")
        f.test.databaseAssertions[1].expected.other.value = 1;
      if (scope === "nested")
        f.test.databaseAssertions.push({
          id: "nested",
          kind: "fieldValue",
          expected: { rows: [{ value: 1 }] },
        });
      const check = receiptCheck(f, (r: any) => {
        if (scope === "rows") r.database.assertions[0].actual = true;
        if (scope === "snapshot")
          r.database.assertions[1].actual.after.other.value = true;
        if (scope === "response") r.assertions[0].actual = 1;
        if (scope === "nested")
          r.database.assertions[2].actual.rows[0].value = true;
      });
      if (scope === "raw") {
        const file = path.join(f.dir, "logs/C2.jsonl");
        const event = JSON.parse(fs.readFileSync(file, "utf8"));
        event.assertions[0].actual = 1;
        const output = JSON.stringify(event) + "\n";
        fs.writeFileSync(file, output);
        const receiptFile = path.join(f.dir, "logs/C2.json");
        const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
        receipt.command.sha256 = digest(output);
        fs.writeFileSync(receiptFile, JSON.stringify(receipt));
      }
      expect(check).toThrow();
    },
  );
  it.each(["boolean", "changed", "missing", "cross-key"])(
    "拒绝缺失或错误 keyed 快照：%s",
    (scope) => {
      const f = fixture();
      const check = receiptCheck(f, (r: any) => {
        const a = r.database.assertions[1];
        if (scope === "boolean") a.actual = true;
        if (scope === "changed")
          a.actual.after = { other: { businessId: "other", value: 4 } };
        if (scope === "missing") delete a.actual.before;
        if (scope === "cross-key")
          a.actual.after = { wrong: { businessId: "other", value: 3 } };
      });
      expect(check).toThrow();
    },
  );
  it("冻结不变断言不能只填布尔成功", () => {
    const f = fixture();
    f.test.databaseAssertions[1].expected = true;
    expect(issues(f.dir, f.review).join("\n")).toContain(
      "按业务键冻结的行快照",
    );
  });
  it("数据库义务缺 testLayer 不能绕过验证", () => {
    const f = fixture();
    delete f.test.testLayer;
    expect(receiptCheck(f)).toThrow(/PARTIAL/);
  });
  it("持久化入口必须声明数据库合同", () => {
    const f = fixture();
    delete f.review.coverage.entries[1].database;
    f.review.coverage.entries[1].persistence = [
      { table: "record", field: "state" },
    ];
    expect(issues(f.dir, f.review).join("\n")).toContain("缺少数据库合同");
  });
  it("必要数据库用例集合不能漏掉冻结生产 statement", () => {
    const f = fixture();
    f.database.statements.push({
      sourceRef: "caller",
      id: "AnonymousMapper.read",
    });
    f.test.statements = [{ sourceRef: "caller", id: "AnonymousMapper.update" }];
    expect(issues(f.dir, f.review).join("\n")).toContain(
      "生产 SQL 未被必要数据库用例覆盖",
    );
  });
  it("数据库环境缺失只能保留 PARTIAL/BLOCKED", () => {
    const f = fixture();
    f.review.coverage.decisions = [{ disposition: "FIX", caseIds: ["C2"] }];
    const review = path.join(f.dir, "review.json");
    const report = path.join(f.dir, "test-report.md");
    fs.writeFileSync(review, JSON.stringify(f.review));
    const text =
      "| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |\n" +
      "|---|---|---|---|---|\n| C2 | api-child-create | api | BLOCKED | unavailable.log |\n";
    fs.writeFileSync(report, text + "验证结果: PARTIAL\n数据库环境不可用\n");
    const lint = () =>
      execFileSync(
        "python3",
        [
          path.join(root, "assets/scripts/superflow-test-report-lint.py"),
          "--review",
          review,
          report,
        ],
        { stdio: "pipe" },
      );
    expect(lint).not.toThrow();
    fs.writeFileSync(report, text + "验证结果: PASS\n");
    expect(lint).toThrow();
  });
  it("固定源码历史证据有效，源码变化不能复用", () => {
    const f = fixture();
    const check = receiptCheck(f);
    expect(check).not.toThrow();
    fs.writeFileSync(path.join(f.dir, "application.ts"), "changed source");
    expect(check).toThrow(/源码已变化/);
  });
  it("旧持久化凭证缺合同必须保留 PARTIAL", () => {
    const f = fixture();
    delete f.review.coverage.entries[1].database;
    f.review.coverage.entries[1].persistence = [
      { table: "record", field: "state" },
    ];
    delete f.test.testLayer;
    expect(receiptCheck(f)).toThrow(/PARTIAL/);
  });
});
