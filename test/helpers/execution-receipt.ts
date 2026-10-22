import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const lint = path.resolve("assets/scripts/superflow-test-report-lint.py");

// Compile the canonical modules in an isolated package, without relying on dist.
export function prepareCapturePackage(directory: string): string {
  const root = path.join(directory, "capture-package");
  const script = path.join(root, "assets/scripts/lint.py");
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(lint, script);
  fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
  for (const module of ["managed-work/redaction", "review/report"]) {
    const target = path.join(root, `dist/domains/${module}.js`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, ts.transpileModule(
      fs.readFileSync(`src/domains/${module}.ts`, "utf8"),
      { compilerOptions: { module: ts.ModuleKind.ES2022 } },
    ).outputText);
  }
  return script;
}

export function recordExecution(directory: string, plan: object): void {
  const script = path.join(directory, "capture-package/assets/scripts/lint.py");
  if (!fs.existsSync(script)) prepareCapturePackage(directory);
  const file = path.join(directory, "capture-plan.json");
  fs.writeFileSync(file, JSON.stringify(plan));
  execFileSync("python3", [script, "--record-execution", file], {
    encoding: "utf8", stdio: "pipe",
  });
}

// Real child processes exercise capture; their anonymous measurements only test
// the evidence contract and make no claim of executing a business database.
export function writeExecutionReceipt(
  directory: string,
  caseId: string,
  entryId: string,
  level = "api",
  measurement: Record<string, any> = {},
) {
  fs.mkdirSync(path.join(directory, "logs"), { recursive: true });
  const application = path.join(directory, "application.ts");
  if (!fs.existsSync(application))
    fs.writeFileSync(application, "export const run = () => true;\n");
  const reviewFile = ["review.json", ".sdd/reviews/document-review.json", "document-review.json"]
    .map(file => path.join(directory, file)).find(file => fs.existsSync(file));
  const review = reviewFile ? JSON.parse(fs.readFileSync(reviewFile, "utf8")) : {
    coverage: { entries: [{ id: entryId, service: entryId, route: `POST /${entryId}`, kind: level }],
      cases: [{ id: caseId, entryId, level }] },
  };
  const test = review.coverage.cases.find((item: any) => item.id === caseId);
  Object.assign(test, {
    executionEvidence: "runner-captured.v1",
    executionContext: { argv: [process.execPath, `case-${caseId}.cjs`], cwd: ".", environmentKeys: [] },
  });
  const captureReview = reviewFile ?? path.join(directory, "capture-review.json");
  fs.writeFileSync(captureReview, JSON.stringify(review));
  const entry = review.coverage.entries.find((item: any) => item.id === entryId);
  const buildName = caseId === "C1" ? "build" : `build-${caseId}`;
  fs.writeFileSync(path.join(directory, "build.cjs"),
    "require('node:fs').copyFileSync('application.ts', 'artifact.txt');\n");
  const observed = {
    event: "superflow.measurement.v1", caseId, executed: 1,
    ...measurement,
  };
  fs.writeFileSync(path.join(directory, `case-${caseId}.cjs`), `
const fs = require('node:fs');
const build = JSON.parse(fs.readFileSync(${JSON.stringify(`logs/${buildName}.json`)}, 'utf8'));
const event = ${JSON.stringify(observed)};
const actual = fs.readFileSync('artifact.txt', 'utf8').includes('true');
if (!event.assertions) event.assertions = ['response', 'state', 'forbiddenEffects'].map(id => ({ id, expected: true, actual, result: actual ? 'PASS' : 'FAIL' }));
event.target = { service: ${JSON.stringify(entry.service ?? entryId)}, route: ${JSON.stringify(entry.route)}, kind: ${JSON.stringify(level)}, buildId: build.id, buildSha256: build.sha256, sourceFingerprint: build.sourceFingerprint };
console.log(JSON.stringify(event));
`);
  const sources = new Set(["application.ts", "build.cjs", `case-${caseId}.cjs`]);
  for (const source of review.coverage.sources ?? [])
    if (fs.existsSync(path.join(directory, source.path))) sources.add(source.path);
  recordExecution(directory, {
    kind: "build", argv: [process.execPath, "build.cjs"], cwd: ".",
    sources: [...sources], artifact: "artifact.txt", output: `logs/${buildName}.json`,
  });
  recordExecution(directory, {
    kind: "case", changeDir: ".", review: path.relative(directory, captureReview), caseId,
    build: `logs/${buildName}.json`, output: `logs/${caseId}.json`,
  });
  // Current delivery marker only; issuing real readiness remains the gate owner's job.
  const ready = path.join(directory, ".sdd/readiness/coding-ready.json");
  fs.mkdirSync(path.dirname(ready), { recursive: true });
  const marker = fs.existsSync(ready) ? JSON.parse(fs.readFileSync(ready, "utf8")) : {};
  fs.writeFileSync(ready, JSON.stringify({ ...marker, workflowPolicy: "observed-delivery.v1", codingReady: true }));
  return JSON.parse(fs.readFileSync(path.join(directory, "logs", `${caseId}.json`), "utf8"));
}

// Explicit completed review for synthetic fixtures: bind every captured input.
export function writeIndependentReview(directory: string, report = "test-report.md") {
  const sources = new Map<string, string>();
  for (const file of fs.readdirSync(path.join(directory, "logs"))) {
    if (!file.endsWith(".json")) continue;
    const receipt = JSON.parse(fs.readFileSync(path.join(directory, "logs", file), "utf8"));
    if (receipt.schemaVersion !== "superflow.execution-receipt.v1") continue;
    for (const source of receipt.sources) {
      const relative = path.relative(directory, path.resolve(directory, "logs", source.path));
      sources.set(relative, source.sha256);
    }
  }
  const review = path.join(directory, ".sdd/reviews/current-code-review.md");
  fs.mkdirSync(path.dirname(review), { recursive: true });
  fs.writeFileSync(review,
    "DONE\n## Review Identity\n| Field | Value |\n|---|---|\n| Role | independent-reviewer |\n| Dispatch | session:fixture/dispatch |\n| Return | session:fixture/return |\n## Concerns\nNone\n## Findings\nNone\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n" +
    [...sources].map(([file, hash]) => `| ${file} | ${hash} |`).join("\n"));
  fs.appendFileSync(path.join(directory, report),
    "\n## Independent Review\n| Report |\n|---|\n| .sdd/reviews/current-code-review.md |\n");
}
