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

const EXTERNAL_CONFIG_CONTRACT = [
  "## External Integration Configuration And Deployment Contract",
  "",
  "| External dependency/resource | Config/resource item | Local source/provisioning | Test source/provisioning | Production source/provisioning | Injection/creation method | Runtime owner | Provisioning owner/time | Readiness evidence | Rollback | Secret handling | Blocker |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|",
  "| TDMQ | Consumer Group | local config | test existing resource | production pre-created resource | IaC or console provisioning | energy service | operations before deployment | console and message trace readiness | disable consumption and rollback | Secret reference, no credential value | none |",
  "",
  "Do not hard-code environment-dependent external configuration or server-side resources.",
  "Test auto-creation or test readiness does not prove production readiness.",
  "",
].join("\n");

const MINIMAL_DESIGN_REVIEW = [
  "## Minimal Design Review",
  "",
  "New-item counts: tables 0; fields 0; APIs 0; services/components 0; caches 0; MQ/events 0; scheduled jobs 0; compatibility layers 0.",
  "Reuse evidence: extend the existing user service and API.",
  "Simplest implementation: one direct synchronous write path.",
  "Removed/rejected complexity: do not add a parallel service, cache, async flow, or compatibility layer.",
  "",
].join("\n");

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
      "This change crosses services, gateway, and adapter boundaries.",
      MINIMAL_DESIGN_REVIEW,
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
      "Minimal Design Review: PASS.",
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
  await write(path.join(change, "prompt", "p01.md"), "# Prompt\n");
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
      MINIMAL_DESIGN_REVIEW,
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
      EXTERNAL_CONFIG_CONTRACT,
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
  legacyDesignContract?: boolean;
  preIndustryDesignContract?: boolean;
  promptContract?: boolean;
  reportEvidence?: boolean;
  fxChange?: boolean;
  fxContract?: boolean;
};

const LEGACY_MONEY_PRECISION_CONTRACT = [
  "## Money Precision Boundary",
  "",
  "Calculation-state source and intermediate precision are preserved.",
  "The settlement/display-state rounding boundary uses scale 2 and RoundingMode.HALF_UP.",
  "Allocation and reconciliation use deterministic residual handling.",
  "Forbidden early rounding: do not round before later slicing or aggregation.",
  "Test evidence covers half-cent, residual, and multi-detail allocation cases.",
  "",
].join("\n");

const MONEY_PRECISION_CONTRACT = [
  LEGACY_MONEY_PRECISION_CONTRACT,
  "Exact decimal representation uses BigDecimal constructed from string, never double.",
  "Currency contract is CNY; the provider minor unit boundary is declared separately from internal scale.",
  "The rounding level is order settlement; policy source is the business contract.",
  "Allocation uses largest remainder with a stable tie-break by business key.",
  "Test evidence covers positive, zero, and negative values.",
  "Audit evidence records pre-round and post-round values and the residual recipient.",
  "Persistence uses DECIMAL with precision and scale aligned to the API contract.",
  "The authoritative total is original amount for original = discount + actual.",
  "Derive the complement amount: actual = authoritative total minus discount.",
  "Do not calculate and round every component independently; must not calculate components separately.",
  "",
].join("\n");

const PRE_INDUSTRY_MONEY_PRECISION_CONTRACT = [
  LEGACY_MONEY_PRECISION_CONTRACT,
  "The authoritative total is original amount for original = discount + actual.",
  "Derive the complement amount: actual = authoritative total minus discount.",
  "Do not calculate and round every component independently; must not calculate components separately.",
  "",
].join("\n");

const FX_PRECISION_CONTRACT = [
  "FX base/quote is CNY/USD; rate source and rate timestamp are recorded.",
  "The canonical conversion path uses the contracted direct rate.",
  "Target settlement rounding uses the USD provider minor unit.",
  "",
].join("\n");

async function makeMoneyPrecisionChange(options: MoneyPrecisionOptions = {}) {
  const change = await makeCrossServiceChange();
  await write(
    path.join(change, "proposal.md"),
    options.fxChange
      ? "# Proposal\n\nCalculate package settlement amount, allocation, and FX rate currency conversion.\n"
      : "# Proposal\n\nCalculate package settlement amount and allocation.\n",
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
      MINIMAL_DESIGN_REVIEW,
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
      "Minimal Design Review: PASS.",
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
    MINIMAL_DESIGN_REVIEW,
    "",
    options.legacyDesignContract
      ? LEGACY_MONEY_PRECISION_CONTRACT
      : options.preIndustryDesignContract
        ? PRE_INDUSTRY_MONEY_PRECISION_CONTRACT
        : options.designContract
          ? [
              MONEY_PRECISION_CONTRACT,
              options.fxContract ? FX_PRECISION_CONTRACT : "",
            ].join("\n")
          : "",
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
    options.promptContract
      ? [
          MONEY_PRECISION_CONTRACT,
          options.fxContract ? FX_PRECISION_CONTRACT : "",
        ].join("\n")
      : "",
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
      ? [
          "Money Precision Boundary: half-cent, residual, and multi-detail cases passed; original = discount + actual, allocated total reconciliation passed.",
          "The authoritative total was original amount; the complement amount actual was derived as authoritative total minus discount.",
          "Currency CNY reconciled in provider minor units. Positive, zero, and negative cases passed.",
          "Audit captured pre-round and post-round values plus the residual recipient.",
          "Tied remainder allocation and idempotent repeated execution passed.",
          options.fxContract
            ? "FX base/quote CNY/USD used the recorded rate source; target settlement rounding used the USD provider minor unit."
            : "",
        ].join(" ")
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

  it("rejects a release version used as a nested change directory", async () => {
    const change = path.join(
      tmp,
      "openspec",
      "changes",
      "v1.1.1",
      "account-permission-optimization",
    );
    await fs.promises.mkdir(change, { recursive: true });

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "non-canonical OpenSpec change directory",
      ),
    });
  });

  it("rejects a symlink alias for an OpenSpec change", async () => {
    if (process.platform === "win32") return;
    const changes = path.join(tmp, "openspec", "changes");
    const target = path.join(changes, "v1-1-1-account-permission-optimization");
    const alias = path.join(changes, "account-permission-alias");
    await fs.promises.mkdir(target, { recursive: true });
    await fs.promises.symlink(target, alias, "dir");

    await expect(
      execFileAsync("bash", [GUARD, alias, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "symlinked OpenSpec change directory is forbidden",
      ),
    });
  });

  it("requires a complexity reduction review before docs can pass", async () => {
    const change = await makeCrossServiceChange();
    const design = path.join(change, "design.md");
    await write(
      design,
      fs.readFileSync(design, "utf8").replace(MINIMAL_DESIGN_REVIEW, ""),
    );
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("complexity reduction review"),
    });
  });

  it("requires a complexity budget instead of a title-only review", async () => {
    const change = await makeCrossServiceChange();
    const design = path.join(change, "design.md");
    await write(
      design,
      fs
        .readFileSync(design, "utf8")
        .replace(/New-item counts:.*\n/, ""),
    );
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("complexity budget"),
    });
  });

  it("requires the same complexity review in the English docs guard", async () => {
    const change = await makeCrossServiceChange();
    const design = path.join(change, "design.md");
    await write(
      design,
      fs.readFileSync(design, "utf8").replace(MINIMAL_DESIGN_REVIEW, ""),
    );
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [EN_GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("complexity reduction review"),
    });
  });

  it("does not force the full complexity matrix onto tweak workflow", async () => {
    const change = await makeCrossServiceChange();
    const design = path.join(change, "design.md");
    const gate = path.join(change, "sdd-quality-gate.md");
    await write(
      design,
      fs.readFileSync(design, "utf8").replace(MINIMAL_DESIGN_REVIEW, ""),
    );
    await write(
      gate,
      fs
        .readFileSync(gate, "utf8")
        .replace("Minimal Design Review: PASS.\n", ""),
    );
    await execFileAsync("bash", [STATE, "init", change, "tweak", "docs"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("guard passed for phase docs"),
    });
  });

  it("requires an explicit PASS verdict for the review", async () => {
    const change = await makeCrossServiceChange();
    const gate = path.join(change, "sdd-quality-gate.md");
    await write(
      gate,
      fs
        .readFileSync(gate, "utf8")
        .replace("Minimal Design Review: PASS.", "Minimal Design Review"),
    );
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("complexity reduction review PASS verdict"),
    });
  });

  it("blocks docs when the complexity review verdict is BLOCKED", async () => {
    const change = await makeCrossServiceChange();
    const gate = path.join(change, "sdd-quality-gate.md");
    await write(
      gate,
      fs
        .readFileSync(gate, "utf8")
        .replace("Minimal Design Review: PASS.", "Minimal Design Review: BLOCKED."),
    );
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("complexity reduction review PASS verdict"),
    });
  });

  it("blocks English docs when the complexity review verdict is BLOCKED", async () => {
    const change = await makeCrossServiceChange();
    const gate = path.join(change, "sdd-quality-gate.md");
    await write(
      gate,
      fs
        .readFileSync(gate, "utf8")
        .replace("Minimal Design Review: PASS.", "Minimal Design Review: BLOCKED."),
    );
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [EN_GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("complexity reduction review PASS verdict"),
    });
  });

  it("requires a minimal design review in the source-level technical design", async () => {
    const change = await makeCrossServiceChange();
    const technicalDesign = path.join(
      change,
      "docs",
      "superpowers",
      "specs",
      "2026-06-22-appointment-route-technical-design.md",
    );
    await write(
      technicalDesign,
      fs
        .readFileSync(technicalDesign, "utf8")
        .replace(MINIMAL_DESIGN_REVIEW, ""),
    );
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
      stderr: expect.stringContaining("technical design minimal design review"),
    });
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

  it("requires external configuration and deployment contract", async () => {
    const change = await makeCrossServiceChange();
    await write(
      path.join(change, "proposal.md"),
      "# Proposal\n\nIntegrate TDMQ RocketMQ Consumer Group for a third-party platform.\n",
    );
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
        "external integration configuration and deployment contract",
      ),
    });
  });

  it("requires external configuration contract in the English guard", async () => {
    const change = await makeCrossServiceChange();
    await write(
      path.join(change, "proposal.md"),
      "# Proposal\n\nIntegrate TDMQ RocketMQ Consumer Group for a third-party platform.\n",
    );
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
      execFileAsync("bash", [EN_GUARD, change, "design"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "external integration configuration and deployment contract",
      ),
    });
  });

  it("requires concurrency and idempotency ownership contract", async () => {
    const change = await makeCrossServiceChange();
    await write(
      path.join(change, "proposal.md"),
      "# Proposal\n\n批量下发月票需要处理并发、重复提交和幂等。\n",
    );
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
        "concurrency and idempotency ownership contract",
      ),
    });
  });

  it("requires concurrency ownership contract in the English guard", async () => {
    const change = await makeCrossServiceChange();
    await write(
      path.join(change, "proposal.md"),
      "# Proposal\n\nBatch issue monthly tickets with concurrent retries.\n",
    );
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
      execFileAsync("bash", [EN_GUARD, change, "design"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "concurrency and idempotency ownership contract",
      ),
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

  it("rejects a precision design without authoritative-total complement derivation", async () => {
    const change = await prepareMoneyPrecisionChange({
      legacyDesignContract: true,
    });

    await expect(
      execFileAsync("bash", [GUARD, change, "design"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("authoritative total"),
    });
  });

  it("requires a directional FX contract for currency conversion", async () => {
    const change = await prepareMoneyPrecisionChange({
      designContract: true,
      fxChange: true,
    });

    await expect(
      execFileAsync("bash", [GUARD, change, "design"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("FX direction"),
    });
  });

  it("rejects a pre-industry contract without exact units and rounding policy", async () => {
    const change = await prepareMoneyPrecisionChange({
      preIndustryDesignContract: true,
    });

    await expect(
      execFileAsync("bash", [GUARD, change, "design"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("exact representation"),
    });
  });

  it("accepts a complete directional FX precision contract", async () => {
    const change = await prepareMoneyPrecisionChange({
      designContract: true,
      fxChange: true,
      fxContract: true,
    });

    await expect(
      execFileAsync("bash", [GUARD, change, "design"]),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("guard passed for phase design"),
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

  it("blocks verify when tasks are not fully checked off", async () => {
    const change = await makeCrossServiceChange();
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [STATE, "set", change, "verify_mode", "light"]);
    await execFileAsync("bash", [
      STATE,
      "set",
      change,
      "branch_status",
      "handled",
    ]);

    await expect(
      execFileAsync("bash", [GUARD, change, "verify"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("unchecked task(s) remain"),
    });
  });

  it("blocks archive without an explicit PASS closeout marker", async () => {
    const change = await makeCrossServiceChange();
    await write(path.join(change, "tasks.md"), "# Tasks\n\n- [x] P01 route\n");
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [STATE, "set", change, "verify_mode", "light"]);
    await execFileAsync("bash", [
      STATE,
      "set",
      change,
      "verify_result",
      "pass",
    ]);
    await execFileAsync("bash", [
      STATE,
      "set",
      change,
      "verification_report",
      "test-report.md",
    ]);
    await execFileAsync("bash", [
      STATE,
      "set",
      change,
      "branch_status",
      "handled",
    ]);
    await execFileAsync("bash", [
      STATE,
      "set",
      change,
      "verified_at",
      "2026-07-14T00:00:00Z",
    ]);
    await execFileAsync("bash", [STATE, "set", change, "phase", "archive"], {
      env: { ...process.env, SUPERFLOW_FORCE_PHASE: "1" },
    });

    await expect(
      execFileAsync("bash", [GUARD, change, "archive"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("archive readiness PASS marker"),
    });

    await fs.promises.appendFile(
      path.join(change, "test-report.md"),
      "\nVerification Result: PASS\nArchive Readiness: PASS\n",
    );
    await expect(
      execFileAsync("bash", [GUARD, change, "archive"]),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("guard passed for phase archive"),
    });
  });

  it("requires test-environment fingerprint for full verification", async () => {
    const change = await makeCrossServiceChange();
    await write(path.join(change, "tasks.md"), "# Tasks\n\n- [x] P01 route\n");
    await write(
      path.join(change, "test-report.md"),
      [
        "# Test Report",
        "",
        "RED failure evidence and GREEN pass evidence.",
        "Interface automation: curl http://localhost:8080/api.",
        "DB SELECT and log ERROR checks passed.",
        "superflow-verify-integration / superflow-delivery-check / superflow-test-report-lint passed.",
        "Verification Result: PASS",
        "Archive Readiness: PASS",
        "",
      ].join("\n"),
    );
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [STATE, "set", change, "verify_mode", "full"]);
    await execFileAsync("bash", [
      STATE,
      "set",
      change,
      "branch_status",
      "handled",
    ]);

    await expect(
      execFileAsync("bash", [GUARD, change, "verify"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("full verification test environment"),
    });
  });
});
