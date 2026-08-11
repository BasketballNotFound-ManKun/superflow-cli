import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "../..");
const AUDIT = path.join(
  ROOT,
  "assets",
  "scripts",
  "superflow-document-audit.mjs",
);
const ENV_PREFLIGHT = path.join(
  ROOT,
  "assets",
  "scripts",
  "superflow-environment-preflight.mjs",
);

let tmp: string;
let change: string;

async function write(relative: string, content: string): Promise<void> {
  const target = path.join(change, relative);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, content);
}

async function prepareReadyChange(): Promise<void> {
  change = path.join(tmp, "openspec", "changes", "cross-repo-demo");
  const promptLinks = ["[P00](prompt/p00.md)", "[P01](prompt/p01.md)"].join(
    " ",
  );
  await write(
    ".openspec.yaml",
    [
      "schema: superflow/v1",
      "applicability:",
      "  cross_repo: true",
      "  complex_logic: true",
      "  mermaid: required",
      "  environment: required",
      "  money: false",
      "repositories:",
      "  - ../service-a",
      "  - ../service-b",
      "",
    ].join("\n"),
  );
  for (const document of [
    "tasks.md",
    "traceability-matrix.md",
    "sdd-quality-gate.md",
    "test-report.md",
  ]) {
    await write(document, `# ${document}\n\n${promptLinks}\n`);
  }
  await write(
    "design.md",
    [
      "# Design",
      "",
      "```mermaid",
      "sequenceDiagram",
      "  participant A as service-a",
      "  participant B as service-b",
      "  A->>B: request",
      "```",
      "",
      "```mermaid",
      "flowchart TD",
      "  A[service-a] --> B[service-b]",
      "```",
      "",
    ].join("\n"),
  );
  await write("tests.md", "# Tests\n\nEnvironment preflight is required.\n");
  await write("prompt/p00.md", "# P00\n");
  await write("prompt/p01.md", "# P01\n");
  const hash = createHash("sha256").update("ready-docs").digest("hex");
  await write(".sdd/handoff/sdd-context.sha256", `${hash}\n`);
  await write(
    ".sdd/reviews/document-review.json",
    JSON.stringify(
      {
        schemaVersion: "superflow.document-review.v1",
        handoffHash: hash,
        verdict: "PASS",
        openOwnerDecisions: [],
        rounds: [
          {
            round: 1,
            lens: "source-contract",
            inputHash: hash,
            findings: [],
          },
          {
            round: 2,
            lens: "architecture-minimality",
            inputHash: hash,
            findings: [],
          },
          {
            round: 3,
            lens: "e2e-environment",
            inputHash: hash,
            findings: [],
          },
        ],
      },
      null,
      2,
    ),
  );
  await write("fixtures/service-a.txt", "service-a\n");
  await write("fixtures/service-b.txt", "service-b\n");
  await write(
    ".sdd/readiness/environment.json",
    JSON.stringify(
      {
        schemaVersion: "superflow.environment-readiness.v1",
        handoffHash: hash,
        scope: "local-dev",
        overall: "READY",
        ownerHelpRequired: [],
        checks: [
          {
            id: "service-a",
            type: "file",
            target: "fixtures/service-a.txt",
            status: "READY",
          },
          {
            id: "service-b",
            type: "file",
            target: "fixtures/service-b.txt",
            status: "READY",
          },
        ],
      },
      null,
      2,
    ),
  );
}

describe("document delivery readiness", () => {
  beforeEach(async () => {
    tmp = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "superflow-doc-readiness-"),
    );
    await prepareReadyChange();
  });

  afterEach(async () => {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("accepts three closed review lenses and exact prompt links", async () => {
    const result = await execFileAsync("node", [AUDIT, change, "--json"]);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ready).toBe(true);
    expect(parsed.reviewRounds).toBe(3);
    expect(parsed.promptCount).toBe(2);
  });

  it("requires every aggregate document to link every prompt", async () => {
    await write("test-report.md", "# Test Report\n\n[P00](prompt/p00.md)\n");
    await expect(execFileAsync("node", [AUDIT, change])).rejects.toMatchObject({
      stderr: expect.stringContaining("test-report.md 未链接 prompt/p01.md"),
    });
  });

  it("requires all three independent review lenses", async () => {
    const reviewFile = path.join(
      change,
      ".sdd",
      "reviews",
      "document-review.json",
    );
    const review = JSON.parse(await fs.promises.readFile(reviewFile, "utf-8"));
    review.rounds.pop();
    await fs.promises.writeFile(reviewFile, JSON.stringify(review));
    await expect(execFileAsync("node", [AUDIT, change])).rejects.toMatchObject({
      stderr: expect.stringContaining("至少三轮"),
    });
  });

  it("requires sequence and flow/state Mermaid diagrams for complex changes", async () => {
    await write("design.md", "# Design\n\nNo diagram.\n");
    await expect(execFileAsync("node", [AUDIT, change])).rejects.toMatchObject({
      stderr: expect.stringContaining("sequenceDiagram"),
    });
  });

  it("rejects structurally invalid Mermaid instead of checking the fence only", async () => {
    await write(
      "design.md",
      [
        "# Design",
        "",
        "```mermaid",
        "sequenceDiagram",
        "  participant A",
        "```",
        "",
        "```mermaid",
        "flowchart TD",
        "  A[only one node]",
        "```",
        "",
      ].join("\n"),
    );
    await expect(execFileAsync("node", [AUDIT, change])).rejects.toMatchObject({
      stderr: expect.stringContaining("缺少有效消息箭头"),
    });
  });

  it("probes declared local environment evidence without printing secrets", async () => {
    const result = await execFileAsync("node", [
      ENV_PREFLIGHT,
      change,
      "--json",
    ]);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ready).toBe(true);
    expect(result.stdout).not.toContain("password");
  });

  it("blocks when an environment check is stale or owner help remains", async () => {
    await fs.promises.rm(path.join(change, "fixtures", "service-b.txt"));
    await expect(
      execFileAsync("node", [ENV_PREFLIGHT, change]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("service-b"),
    });
  });
});
