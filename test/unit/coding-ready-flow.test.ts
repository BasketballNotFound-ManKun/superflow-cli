import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { makeContractChange, write } from "../helpers/contract-change.js";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";
import { prepareCoverage } from "../helpers/review-coverage.js";
import { assertCodingReadyForPrompt } from "../../src/domains/sdd-readiness.js";

const ROOT = path.resolve(__dirname, "../..");
let temporary: string;
afterEach(() => {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
});

it("real complete contract passes every coding-ready subgate and generates the receipt", async () => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), "superflow ready flow "));
  const home = path.join(temporary, "isolated home");
  fs.mkdirSync(home);
  const env = fixtureProcessEnv(home, {
    ...process.env,
    OPENSPEC_TELEMETRY: "0",
    CI: "1",
  });
  const tool = spawnSync("openspec", ["--version"], { encoding: "utf8", env });
  expect(
    tool.status,
    "OpenSpec 1.14.1 is required; install it into an isolated prefix and add its bin to PATH.",
  ).toBe(0);
  expect(tool.stdout.trim()).toBe("1.14.1");
  const change = await makeContractChange(temporary);
  const scripts = path.join(ROOT, "assets/skills/superflow/scripts");
  const shell = (name: string, args: string[]) => {
    const result = spawnSync("bash", [path.join(scripts, name), ...args], {
      env,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    return result;
  };
  await write(
    path.join(temporary, "openspec/config.yaml"),
    "schema: spec-driven\n",
  );
  await write(path.join(change, ".openspec.yaml"), "schema: spec-driven\n");
  await write(
    path.join(change, "proposal.md"),
    "# Proposal\n\n## Why\nPreserve a deterministic sample request route.\n\n## What Changes\n- Route sample requests through the existing entry.\n\n## Impact\nOne existing entry; no external resources.\n",
  );
  await write(
    path.join(change, "specs/appointment-route/spec.md"),
    "# Sample Route\n\n## ADDED Requirements\n\n### Requirement: Route requests\nThe system SHALL route sample requests through the existing entry.\n\n#### Scenario: Route a request\n- **WHEN** a sample request arrives\n- **THEN** the existing entry returns its response\n",
  );
  const technical =
    "docs/superpowers/specs/2026-06-22-appointment-route-technical-design.md";
  await fs.promises.appendFile(
    path.join(change, technical),
    "\n## Architecture Boundary And Call Direction\nThe existing entry owns requests and calls the existing service directly.\n",
  );
  await fs.promises.appendFile(
    path.join(change, "source-code-audit.md"),
    "\nVerification command: rg route caller.ts\n",
  );
  for (const prompt of ["implementation.md", "p01.md"]) {
    await write(
      path.join(change, "prompt", prompt),
      "# Implementation\n\nInherit technical_design and the canonical contract. Read .sdd/handoff/sdd-context.md; state handoff_hash is authoritative.\n",
    );
  }
  for (const document of [
    "tasks.md",
    "traceability-matrix.md",
    "sdd-quality-gate.md",
    "test-report.md",
  ])
    await fs.promises.appendFile(
      path.join(change, document),
      "\n[Implementation](prompt/implementation.md) [P01](prompt/p01.md)\n",
    );
  shell("superflow-state.sh", ["init", change, "full", "docs"]);
  for (const [key, value] of Object.entries({
    technical_design: technical,
    build_mode: "team-prompt",
    isolation: "branch",
    tdd_mode: "tdd",
    review_mode: "standard",
  }))
    shell("superflow-state.sh", ["set", change, key, value]);
  const hash = prepareCoverage(change, {
    persistState: false,
    persistReceipt: false,
  });
  shell("superflow-handoff.sh", [change, "--refresh"]);
  expect(
    fs
      .readFileSync(
        path.join(change, ".sdd/handoff/sdd-context.sha256"),
        "utf8",
      )
      .trim(),
  ).toBe(hash);
  await write(
    path.join(change, ".sdd/readiness/environment.json"),
    JSON.stringify({
      schemaVersion: "superflow.environment-readiness.v2",
      handoffHash: hash,
      scope: "local",
      overall: "LOCAL_FIXTURE_READY",
      ownerHelpRequired: [],
      executionContract: {
        applicationLocation: "local",
        dependencyPolicy: "local-isolated",
        allowLocalProvisioning: true,
        allowRemoteDevDependencies: false,
        allowedOverrides: [],
        forbiddenOverrides: [],
        services: [
          {
            id: "sample",
            configSource: { type: "generated-fixture", ref: "tests.md" },
            startupCommandSource: "tests.md",
          },
        ],
        dependencies: [
          {
            id: "sample-file",
            kind: "file",
            provisioning: "local-isolated",
            configSource: { type: "generated-fixture", ref: "tests.md" },
          },
        ],
      },
      checks: [
        {
          id: "sample-contract",
          type: "file",
          target: "tests.md",
          contractRef: "service:sample",
          status: "LOCAL_FIXTURE_READY",
        },
        {
          id: "sample-dependency",
          type: "file",
          target: "tests.md",
          contractRef: "dependency:sample-file",
          status: "LOCAL_FIXTURE_READY",
        },
      ],
    }),
  );
  expect(
    fs.existsSync(path.join(change, ".sdd/readiness/coding-ready.json")),
  ).toBe(false);

  shell("superflow-guard.sh", [change, "docs", "--apply"]);
  expect(shell("superflow-state.sh", ["phase", change]).stdout.trim()).toBe(
    "design",
  );
  shell("superflow-guard.sh", [change, "design", "--apply"]);
  expect(shell("superflow-state.sh", ["phase", change]).stdout.trim()).toBe(
    "implement",
  );
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "assets/scripts/superflow-coding-ready.mjs"),
      change,
      "--json",
    ],
    { encoding: "utf8", env },
  );
  expect(result.status, result.stderr).toBe(0);
  const receipt = JSON.parse(
    fs.readFileSync(
      path.join(change, ".sdd/readiness/coding-ready.json"),
      "utf8",
    ),
  );
  expect(receipt.codingReady).toBe(true);
  expect(receipt.evidence).toHaveLength(7);
  expect(
    receipt.evidence.every((item: { exitCode: number }) => item.exitCode === 0),
  ).toBe(true);
  expect(JSON.parse(result.stdout)).toEqual(receipt);
  expect(() =>
    assertCodingReadyForPrompt(path.join(change, "prompt/implementation.md")),
  ).not.toThrow();
}, 30_000);
