import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "../..");
const SCRIPT_DIR = path.join(
  ROOT,
  "assets",
  "skills",
  "superflow-pipeline",
  "scripts",
);
const GUARD = path.join(SCRIPT_DIR, "superflow-guard.sh");
const EN_GUARD = path.join(
  ROOT,
  "assets",
  "skills-en",
  "superflow-pipeline",
  "scripts",
  "superflow-guard.sh",
);
const HANDOFF = path.join(SCRIPT_DIR, "superflow-handoff.sh");
const STATE = path.join(SCRIPT_DIR, "superflow-state.sh");

let tmp: string;

async function write(file: string, content: string) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content);
}

async function makeCrossServiceChange() {
  const change = path.join(tmp, "openspec", "changes", "appointment-route");
  await write(
    path.join(change, "proposal.md"),
    "# Proposal\n\nAdd appointment route.\n",
  );
  await write(
    path.join(change, "api.md"),
    "# API\n\nPOST /internal/appointment-orders\n",
  );
  await write(
    path.join(change, "design.md"),
    [
      "# Design",
      "",
      "## Superpowers Technical Design Handoff",
      "",
      "OpenSpec/SDD remains canonical for WHAT and contracts.",
      "This change crosses services, MQ, gateway, adapter, and third-party protocol boundaries.",
      "handoff_hash: pending",
      "",
    ].join("\n"),
  );
  await write(
    path.join(change, "tasks.md"),
    "# Tasks\n\n- [ ] P01 route ([prompt/p01.md](prompt/p01.md))\n",
  );
  await write(
    path.join(change, "tests.md"),
    "# Tests\n\nRED then GREEN. Interface automation command: curl /internal/appointment-orders\n",
  );
  await write(
    path.join(change, "traceability-matrix.md"),
    "# Traceability\n\n| Requirement | Prompt |\n|---|---|\n| R1 | prompt/p01.md |\n",
  );
  await write(path.join(change, "review-checklist.md"), "# Review Checklist\n");
  await write(
    path.join(change, "sdd-quality-gate.md"),
    [
      "# Quality Gate",
      "",
      "Document completeness: proposal.md, api.md, design.md, tasks.md, tests.md.",
      "technical_design: docs/superpowers/specs/2026-06-22-appointment-route-technical-design.md",
      "handoff_hash: pending",
      "",
    ].join("\n"),
  );
  await write(
    path.join(change, "test-report.md"),
    [
      "# Test Report",
      "",
      "RED 失败证据: pending.",
      "GREEN 通过证据: pending.",
      "接口自动化: curl pending.",
      "DB 数据库 SELECT pending.",
      "superflow-verify-integration / superflow-delivery-check / superflow-test-report-lint pending.",
      "handoff_hash: pending",
      "",
    ].join("\n"),
  );
  await write(
    path.join(change, "specs", "appointment-route", "spec.md"),
    "# Spec\n",
  );
  await write(
    path.join(
      change,
      "docs",
      "superpowers",
      "specs",
      "2026-06-22-appointment-route-technical-design.md",
    ),
    [
      "# Superpowers Technical Design",
      "",
      "OpenSpec/SDD remains canonical and must not be overwritten.",
      "",
    ].join("\n"),
  );
  return change;
}

async function makeExternalEnumChange() {
  const change = path.join(tmp, "openspec", "changes", "bem-pay-mode");
  await write(
    path.join(change, "proposal.md"),
    "# Proposal\n\nSync BEM payOrigin and payMode.\n",
  );
  await write(
    path.join(change, "api.md"),
    "# API\n\nBEM monthly ticket issue API.\n",
  );
  await write(
    path.join(change, "design.md"),
    [
      "# Design",
      "",
      "## Superpowers Technical Design Handoff",
      "",
      "OpenSpec/SDD remains canonical for WHAT and contracts.",
      "The BEM request includes payOrigin, payMode, 支付来源, 支付方式, and 财务口径 fields.",
      "handoff_hash: pending",
      "",
    ].join("\n"),
  );
  await write(
    path.join(change, "tasks.md"),
    "# Tasks\n\n- [ ] P01 map BEM pay mode ([prompt/p01.md](prompt/p01.md))\n",
  );
  await write(
    path.join(change, "tests.md"),
    "# Tests\n\nRED then GREEN. Interface automation command: curl /bem/monthly-ticket\n",
  );
  await write(
    path.join(change, "traceability-matrix.md"),
    "# Traceability\n\n| Requirement | Prompt |\n|---|---|\n| R1 | prompt/p01.md |\n",
  );
  await write(path.join(change, "review-checklist.md"), "# Review Checklist\n");
  await write(
    path.join(change, "sdd-quality-gate.md"),
    [
      "# Quality Gate",
      "",
      "Document completeness: proposal.md, api.md, design.md, tasks.md, tests.md.",
      "technical_design: docs/superpowers/specs/2026-07-03-bem-pay-mode-technical-design.md",
      "handoff_hash: pending",
      "",
    ].join("\n"),
  );
  await write(
    path.join(change, "test-report.md"),
    [
      "# Test Report",
      "",
      "RED 失败证据: pending.",
      "GREEN 通过证据: pending.",
      "接口自动化: curl pending.",
      "DB 数据库 SELECT pending.",
      "superflow-verify-integration / superflow-delivery-check / superflow-test-report-lint pending.",
      "handoff_hash: pending",
      "",
    ].join("\n"),
  );
  await write(
    path.join(change, "specs", "bem-pay-mode", "spec.md"),
    "# Spec\n",
  );
  await write(path.join(change, "prompt", "p01.md"), "# Prompt\n");
  await write(
    path.join(
      change,
      "docs",
      "superpowers",
      "specs",
      "2026-07-03-bem-pay-mode-technical-design.md",
    ),
    [
      "# Superpowers Technical Design",
      "",
      "OpenSpec/SDD remains canonical and must not be overwritten.",
      "",
      "## Field And Status Reverse Impact",
      "",
      "| Field/status | Write/update points | Read/filter points | Derived/sync points | Cross-module consumers | Tests covering consumers | Missing coverage/blocker |",
      "|---|---|---|---|---|---|---|",
      "| `payMode` | `BemClient` | `BEM` | none | BEM | pending | none |",
      "",
    ].join("\n"),
  );
  return change;
}

type MoneyPrecisionOptions = {
  designContract?: boolean;
  promptContract?: boolean;
  reportEvidence?: boolean;
};

const MONEY_PRECISION_CONTRACT = [
  "## Money Precision Boundary",
  "",
  "Calculation-state source and intermediate precision are preserved.",
  "The settlement/display-state rounding boundary uses scale 2 and RoundingMode.HALF_UP.",
  "Allocation and reconciliation use deterministic residual handling.",
  "Forbidden early rounding: do not round before later slicing or aggregation.",
  "Test evidence covers half-cent, residual, and multi-detail allocation cases.",
  "",
].join("\n");

async function makeMoneyPrecisionChange(options: MoneyPrecisionOptions = {}) {
  const change = await makeCrossServiceChange();
  await write(
    path.join(change, "proposal.md"),
    "# Proposal\n\nCalculate package settlement amount and allocation.\n",
  );
  await write(
    path.join(change, "api.md"),
    "# API\n\nReturn amount, discount, and actual fee.\n",
  );
  await write(
    path.join(change, "design.md"),
    [
      "# Design",
      "",
      "## Superpowers Technical Design Handoff",
      "",
      "OpenSpec/SDD remains canonical for WHAT and contracts.",
      "handoff_hash: pending",
      "",
    ].join("\n"),
  );
  await write(
    path.join(change, "tests.md"),
    "# Tests\n\nRED then GREEN. Interface automation command: curl /settlement.\n",
  );
  await write(
    path.join(change, "sdd-quality-gate.md"),
    [
      "# Quality Gate",
      "",
      "Document completeness: proposal.md, api.md, design.md, tasks.md, tests.md.",
      "technical_design: docs/superpowers/specs/2026-06-22-appointment-route-technical-design.md",
      "Money Precision Boundary is required.",
      "handoff_hash: pending",
      "",
    ].join("\n"),
  );
  const technicalDesign = [
    "# Superpowers Technical Design",
    "",
    "OpenSpec/SDD remains canonical and must not be overwritten.",
    "",
    options.designContract ? MONEY_PRECISION_CONTRACT : "",
  ].join("\n");
  await write(
    path.join(
      change,
      "docs",
      "superpowers",
      "specs",
      "2026-06-22-appointment-route-technical-design.md",
    ),
    technicalDesign,
  );
  const prompt = [
    "# Prompt",
    "",
    "Superpower 技术详设继承: technical_design is the source-level HOW.",
    "上下文防漂移: sdd-context and handoff_hash pending.",
    options.promptContract ? MONEY_PRECISION_CONTRACT : "",
  ].join("\n");
  await write(path.join(change, "prompt", "implementation.md"), prompt);
  await write(path.join(change, "prompt", "p01.md"), prompt);
  const report = [
    "# Test Report",
    "",
    "RED 失败证据: expected assertion failed.",
    "GREEN 通过证据: expected assertion passed.",
    "接口自动化: curl /settlement.",
    "DB 数据库 SELECT completed.",
    "superflow-verify-integration / superflow-delivery-check / superflow-test-report-lint passed.",
    options.reportEvidence
      ? "Money Precision Boundary: half-cent, residual, and multi-detail cases passed; original = discount + actual, allocated total reconciliation passed."
      : "",
    "handoff_hash: pending",
    "",
  ].join("\n");
  await write(path.join(change, "test-report.md"), report);
  return change;
}

async function prepareMoneyPrecisionChange(
  options: MoneyPrecisionOptions = {},
) {
  const change = await makeMoneyPrecisionChange(options);
  await execFileAsync("bash", [STATE, "init", change, "docs"]);
  await execFileAsync("bash", [
    STATE,
    "set",
    change,
    "technical_design",
    "docs/superpowers/specs/2026-06-22-appointment-route-technical-design.md",
  ]);
  await execFileAsync("bash", [
    STATE,
    "set",
    change,
    "build_mode",
    "team-prompt",
  ]);
  await execFileAsync("bash", [STATE, "set", change, "isolation", "worktree"]);
  await execFileAsync("bash", [STATE, "set", change, "tdd_mode", "tdd"]);
  await execFileAsync("bash", [
    STATE,
    "set",
    change,
    "review_mode",
    "standard",
  ]);
  await execFileAsync("bash", [HANDOFF, change, "--write"]);
  await replacePendingHash(change);
  return change;
}

async function replacePendingHash(change: string) {
  const hash = fs
    .readFileSync(
      path.join(change, ".sdd", "handoff", "sdd-context.sha256"),
      "utf8",
    )
    .trim();
  for (const rel of ["design.md", "sdd-quality-gate.md", "test-report.md"]) {
    const file = path.join(change, rel);
    const text = fs.readFileSync(file, "utf8").replaceAll("pending", hash);
    fs.writeFileSync(file, text);
  }
}

describe("superflow-guard.sh", () => {
  beforeEach(async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "superflow-guard-"));
  });

  afterEach(async () => {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("requires architecture boundary matrix for cross-service design", async () => {
    const change = await makeCrossServiceChange();
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [
      STATE,
      "set",
      change,
      "technical_design",
      "docs/superpowers/specs/2026-06-22-appointment-route-technical-design.md",
    ]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [GUARD, change, "design"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "architecture boundary and call direction matrix",
      ),
    });
  });

  it("requires external enum binding matrix for BEM payment semantics", async () => {
    const change = await makeExternalEnumChange();
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [
      STATE,
      "set",
      change,
      "technical_design",
      "docs/superpowers/specs/2026-07-03-bem-pay-mode-technical-design.md",
    ]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [GUARD, change, "design"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("external enum binding matrix"),
    });
  });

  it("requires money precision boundary in settlement design", async () => {
    const change = await prepareMoneyPrecisionChange();

    await expect(
      execFileAsync("bash", [GUARD, change, "design"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("money precision boundary"),
    });
  });

  it("requires money precision boundary in the English design guard", async () => {
    const change = await prepareMoneyPrecisionChange();

    await expect(
      execFileAsync("bash", [EN_GUARD, change, "design"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("money precision boundary"),
    });
  });

  it("requires money precision inheritance in implementation prompts", async () => {
    const change = await prepareMoneyPrecisionChange({ designContract: true });

    await expect(
      execFileAsync("bash", [GUARD, change, "implement"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("prompt money precision inheritance"),
    });
  });

  it("requires money precision reconciliation evidence before verify", async () => {
    const change = await prepareMoneyPrecisionChange({
      designContract: true,
      promptContract: true,
    });

    await expect(
      execFileAsync("bash", [GUARD, change, "verify"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("money precision runtime evidence"),
    });
  });

  it("accepts a complete money precision design and prompt contract", async () => {
    const change = await prepareMoneyPrecisionChange({
      designContract: true,
      promptContract: true,
      reportEvidence: true,
    });

    await expect(
      execFileAsync("bash", [GUARD, change, "design"]),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("guard passed for phase design"),
    });
    await expect(
      execFileAsync("bash", [GUARD, change, "implement"]),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("guard passed for phase implement"),
    });
  });

  it("blocks direct phase writes outside repair mode", async () => {
    const change = await makeCrossServiceChange();
    await execFileAsync("bash", [STATE, "init", change, "docs"]);

    await expect(
      execFileAsync("bash", [STATE, "set", change, "phase", "verify"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("setting phase directly is blocked"),
    });

    await execFileAsync("bash", [STATE, "set", change, "phase", "verify"], {
      env: { ...process.env, SUPERFLOW_FORCE_PHASE: "1" },
    });
    const { stdout } = await execFileAsync("bash", [STATE, "phase", change]);
    expect(stdout.trim()).toBe("verify");
  });
});
