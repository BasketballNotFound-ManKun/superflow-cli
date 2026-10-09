import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const fixture = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(fixture, "../../..");
let retained = process.argv[2]
  ? path.resolve(process.argv[2])
  : fs.mkdtempSync(path.join(os.tmpdir(), "superflow-mysql-gate-"));
const result = spawnSync("bash", [path.join(fixture, "replay.sh"), retained], {
  encoding: "utf8",
  timeout: 120000,
});
if (result.status !== 0) {
  process.stderr.write(result.stdout + result.stderr);
  process.exit(result.status ?? 1);
}
retained = fs.realpathSync(retained);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const hashFile = (file) => hash(fs.readFileSync(file));
const relative = (file) => path.relative(retained, file);
for (const variant of ["correct", "omitted"]) {
  const observed = JSON.parse(
    fs.readFileSync(path.join(retained, `${variant}.jsonl`), "utf8"),
  );
  const mapper = path.join(
    fixture,
    variant === "correct" ? "AttemptMapper.xml" : "AttemptMapper-omitted.xml",
  );
  const sourceFiles = [
    path.join(fixture, "MapperReplay.java"),
    mapper,
    path.join(fixture, "schema.sql"),
  ];
  const sources = sourceFiles.map((file) => ({
    path: relative(file),
    sha256: hashFile(file),
  }));
  const fingerprint = hash(
    sources
      .map((s) => `${s.path}:${s.sha256}`)
      .sort()
      .join("\n"),
  );
  const statement = { sourceRef: "S1", id: "AttemptMapper.complete" };
  const database = {
    engine: "mysql",
    major: 8,
    schemaSourceRefs: ["S2"],
    statements: [statement],
  };
  const mockBoundary = {
    allowed: [],
    forbidden: ["CompletionService", "AttemptMapper"],
  };
  const databaseAssertions = [
    { id: "rows", kind: "affectedRows", expected: 1 },
    {
      id: "isolation",
      kind: "unchangedRows",
      expected: {
        "other:2": {
          businessId: "other",
          round: 2,
          state: 0,
          verificationToken: "other-token",
        },
        "target:1": {
          businessId: "target",
          round: 1,
          state: 2,
          verificationToken: "old-token",
        },
      },
    },
  ];
  const frozenWrite = {
    id: "token",
    table: "attempt_record",
    field: "verification_token",
    expected: "new-token",
  };
  const entry = {
    id: "E1",
    kind: "library",
    actor: "anonymous-caller",
    route: "CompletionService.complete",
    sourceRefs: ["S0", "S1"],
    database,
    persistence: [{ table: "attempt_record", field: "verification_token" }],
  };
  const test = {
    id: "C1",
    entryId: "E1",
    level: "library",
    testLayer: "database",
    evidenceKind: "real",
    mockBoundary,
    statements: [statement],
    databaseAssertions,
    assertions: {
      response: "one row",
      state: "token stored",
      forbiddenEffects: "non-target and old-round unchanged",
      persistence: [frozenWrite],
    },
  };
  const artifact = path.join(retained, "classes/MapperReplay.class");
  const argv = ["bash", path.join(fixture, "replay.sh"), retained];
  const buildEvent = {
    event: "build",
    buildId: variant,
    sourceFingerprint: fingerprint,
    artifactSha256: hashFile(artifact),
    argv: JSON.parse(
      fs.readFileSync(path.join(retained, "build-command.json"), "utf8"),
    ),
    exitCode: 0,
  };
  const buildOutput = JSON.stringify(buildEvent) + "\n";
  fs.writeFileSync(path.join(retained, `${variant}-build.jsonl`), buildOutput);
  const receipt = {
    schemaVersion: "superflow.execution-receipt.v1",
    caseId: "C1",
    entryId: "E1",
    level: "library",
    testLayer: "database",
    // Adversarial omitted receipt claims PASS; actual observations are unchanged.
    status: "PASS",
    executed: 1,
    evidenceKind: "real",
    mockBoundary,
    command: {
      argv,
      exitCode: 0,
      output: `${variant}-event.jsonl`,
      sha256: "",
    },
    sources,
    build: {
      id: variant,
      artifact: relative(artifact),
      sha256: hashFile(artifact),
      sourceFingerprint: fingerprint,
      command: {
        argv: buildEvent.argv,
        exitCode: 0,
        output: `${variant}-build.jsonl`,
        sha256: hash(buildOutput),
      },
    },
    target: {
      service: "E1",
      route: entry.route,
      kind: "library",
      buildId: variant,
      buildSha256: hashFile(artifact),
      sourceFingerprint: fingerprint,
    },
    assertions: ["response", "state", "forbiddenEffects"].map((id) => ({
      id,
      expected: true,
      actual: true,
      result: "PASS",
    })),
    persistence: [
      {
        ...frozenWrite,
        before: { businessId: observed.businessId, value: observed.before },
        after: { businessId: observed.businessId, value: observed.after },
        result: "PASS",
      },
    ],
    database: {
      engine: observed.engine,
      major: Number(observed.version.split(".")[0]),
      statements: [statement],
      assertions: [
        {
          ...databaseAssertions[0],
          actual: observed.affectedRows,
          result: "PASS",
        },
        {
          ...databaseAssertions[1],
          actual: observed.unchangedRows,
          result: "PASS",
        },
      ],
    },
  };
  const event = { ...receipt, command: { argv, exitCode: 0 } };
  const output = JSON.stringify(event) + "\n";
  fs.writeFileSync(path.join(retained, `${variant}-event.jsonl`), output);
  receipt.command.sha256 = hash(output);
  fs.writeFileSync(
    path.join(retained, `${variant}-receipt.json`),
    JSON.stringify(receipt),
  );
  const coverage = {
    entries: [entry],
    cases: [test],
    sources: sources.map((s, i) => ({
      ...s,
      id: `S${i}`,
      role: i === 2 ? "contract" : "code",
    })),
  };
  fs.writeFileSync(
    path.join(retained, `${variant}-coverage.json`),
    JSON.stringify(coverage),
  );
  const check = spawnSync(
    "python3",
    [
      "-c",
      `import importlib.util,json,sys;from pathlib import Path;s=importlib.util.spec_from_file_location('lint',sys.argv[1]);m=importlib.util.module_from_spec(s);sys.modules['lint']=m;s.loader.exec_module(m);c=json.loads(Path(sys.argv[3]).read_text());m.validate_execution_receipt(Path(sys.argv[2]),c['cases'][0],c,Path(sys.argv[3]).parent)`,
      path.join(root, "assets/scripts/superflow-test-report-lint.py"),
      path.join(retained, `${variant}-receipt.json`),
      path.join(retained, `${variant}-coverage.json`),
    ],
    { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
  );
  if (variant === "correct") assert.equal(check.status, 0, check.stderr);
  else {
    assert.notEqual(check.status, 0);
    assert.match(check.stderr, /持久化值未达到预期/);
  }
  fs.writeFileSync(
    path.join(retained, `${variant}-gate.log`),
    check.stdout + check.stderr,
  );
}
process.stdout.write(
  `真实 MySQL 正例通过；Mock 绿但 XML 漏字段的错误 PASS 被门禁拒绝。证据：${retained}\n`,
);
