import fs from "node:fs";
import path from "node:path";
import { digest } from "./review-coverage.js";

// Anonymous receipt fixture; raw output and current source are independently read.
export function writeExecutionReceipt(
  directory: string,
  caseId: string,
  entryId: string,
  level = "api",
) {
  fs.mkdirSync(path.join(directory, "logs"), { recursive: true });
  const source = "export const run = () => true;\n";
  fs.writeFileSync(path.join(directory, "application.ts"), source);
  const event = {
    caseId,
    entryId,
    level,
    status: "PASS",
    executed: 1,
    assertions: ["response", "state", "forbiddenEffects"].map((id) => ({
      id,
      expected: true,
      actual: true,
      result: "PASS",
    })),
  };
  const sourceFingerprint = digest(`../application.ts:${digest(source)}`);
  const buildOutput = `${JSON.stringify({
    event: "build",
    buildId: "anonymous-build-1",
    sourceFingerprint,
    artifactSha256: digest(source),
    argv: ["node", "build.js"],
    exitCode: 0,
  })}\n`;
  fs.writeFileSync(path.join(directory, "logs/build.jsonl"), buildOutput);
  const receipt = {
    schemaVersion: "superflow.execution-receipt.v1",
    ...event,
    evidenceKind: "real",
    command: {
      argv: ["node", "application.ts"],
      exitCode: 0,
      output: `${caseId}.jsonl`,
      sha256: "",
    },
    sources: [{ path: "../application.ts", sha256: digest(source) }],
    build: {
      id: "anonymous-build-1",
      artifact: "../application.ts",
      sha256: digest(source),
      sourceFingerprint,
      command: {
        argv: ["node", "build.js"],
        exitCode: 0,
        output: "build.jsonl",
        sha256: digest(buildOutput),
      },
    },
    target: {
      service: entryId,
      route: `POST /${entryId}`,
      kind: level,
      buildId: "anonymous-build-1",
      buildSha256: digest(source),
      sourceFingerprint,
    },
  };
  const rawEvent = {
    ...receipt,
    command: { argv: receipt.command.argv, exitCode: 0 },
  };
  const output = `${JSON.stringify(rawEvent)}\n`;
  fs.writeFileSync(path.join(directory, "logs", `${caseId}.jsonl`), output);
  receipt.command.sha256 = digest(output);
  fs.writeFileSync(
    path.join(directory, "logs", `${caseId}.json`),
    JSON.stringify(receipt),
  );
  return receipt;
}
