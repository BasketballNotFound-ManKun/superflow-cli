import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { writeExecutionReceipt, writeIndependentReview } from "../helpers/execution-receipt.js";
import { makeContractChange, MINIMAL_DESIGN_REVIEW, write, writeRequirementReview } from "../helpers/contract-change.js";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "../..");
const SCRIPT_DIR = path.join(
  ROOT,
  "assets",
  "skills",
  "superflow",
  "scripts",
);
const GUARD = path.join(SCRIPT_DIR, "superflow-guard.sh");
const EN_GUARD = path.join(
  ROOT,
  "assets",
  "skills-en",
  "superflow",
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

const CONTENT_CONCURRENCY_CONTRACT = [
  "## Concurrency And Idempotency Ownership",
  "Business concurrency key: stable record identity and its expected version.",
  "Atomic write boundary: UPDATE content_record SET content = :content, version = version + 1 WHERE id = :id AND version = :expectedVersion.",
  "Transaction boundary: the production proxy commits content and version together; exceptions roll back both before returning.",
  "Success changes one row; a zero affected-row result distinguishes a missing record from a version conflict.",
  "Retry uses a coherent reloaded content/version snapshot after the caller resolves the conflict.",
  "External call boundary: this save makes no external call and has no external side effects.",
  "A unique index is not the default concurrency protection.",
  "",
].join("\n");

const EXTERNAL_ENUM_CONTRACT = [
  "## External Enum Binding",
  "External field: settlementCategory; external enum: POSTED.",
  "Display/business meaning: posted settlement; owner approved the provider contract.",
  "Unknown/blocker: none after provider resolution.",
  "",
].join("\n");

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
  await writeRequirementReview(change);
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
  const change = await makeContractChange(tmp);
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
    "## Architecture Boundary And Call Direction",
    "",
    "The business-entry owner calls the existing service entry and outbound adapter; no bypass is allowed.",
    "",
    "## Field And Status Reverse Impact",
    "The settlement entry writes amounts; existing consumers read the same exact-decimal fields.",
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
    "[HOW](../docs/superpowers/specs/2026-06-22-appointment-route-technical-design.md)",
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
  const promptLinks =
    "\n\n[Implementation](prompt/implementation.md) [P01](prompt/p01.md)\n";
  for (const document of [
    "tasks.md",
    "traceability-matrix.md",
    "sdd-quality-gate.md",
    "test-report.md",
  ]) {
    await fs.promises.appendFile(path.join(change, document), promptLinks);
  }
  await writeRequirementReview(change);
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

async function prepareDatabaseChange(
  options: {
    releaseSql?: boolean;
    validHash?: boolean;
  } = {},
) {
  const change = await makeContractChange(tmp);
  const append = async (rel: string, content: string) => {
    const file = path.join(change, rel);
    await fs.promises.appendFile(file, content);
  };

  await append(
    "proposal.md",
    "\nDatabase change required: ALTER TABLE app_user ADD COLUMN nickname VARCHAR(64).\n",
  );
  await append(
    "design.md",
    "\nFrozen release SQL: [release-sql.md](release-sql.md), copy verbatim.\n",
  );
  await append(
    "tasks.md",
    "\n- [ ] Copy [release-sql.md](release-sql.md) verbatim to the exact target and verify sql_sha256.\n",
  );
  await append(
    "sdd-quality-gate.md",
    "\nFrozen release SQL gate: [release-sql.md](release-sql.md) must be copied verbatim and its sql_sha256 verified.\n",
  );

  if (options.releaseSql !== false) {
    const sql = [
      "ALTER TABLE app_user",
      "    ADD COLUMN nickname VARCHAR(64) DEFAULT NULL;",
      "",
      "SHOW CREATE TABLE app_user;",
      "",
    ].join("\n");
    const hash = createHash("sha256").update(sql).digest("hex");
    await write(
      path.join(change, "release-sql.md"),
      [
        "---",
        "change: app-user-nickname",
        "database_change: true",
        "target_sql_path: sql/v1.0.0/v1.0.0.test2.sql",
        "copy_policy: verbatim",
        `sql_sha256: ${options.validHash === false ? "0".repeat(64) : hash}`,
        "---",
        "",
        "# Frozen Release SQL",
        "",
        "```sql",
        sql.trimEnd(),
        "```",
        "",
      ].join("\n"),
    );
  }

  await execFileAsync("bash", [STATE, "init", change, "docs"]);
  await execFileAsync("bash", [HANDOFF, change, "--write"]);
  await replacePendingHash(change);
  return change;
}

// Real state/handoff/Bash/Python integration: macOS CI passes reach 4.9s.
// Keep a local integration budget; unit defaults and CI job limits stay strict.
describe("superflow-guard.sh", { timeout: 15_000 }, () => {
  beforeEach(async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "superflow-guard-"));
  });

  afterEach(async () => {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  describe.each([["zh", GUARD], ["en", EN_GUARD]])("decision/advisory checks (%s)", (language, guard) => {
    it.each([
      "> Record owner-decided <date> <context> after confirmation.",
      "owner-decided: <date> | owner: reviewer | decision: reject repeats",
      "```markdown\nowner-decided: 2026-10-15 | owner: reviewer | decision: reject repeats\n```",
      "> owner-decided: 2026-10-15 | owner: reviewer | decision: reject repeats",
      "owner-decided: 2026-02-30 | owner: reviewer | decision: reject repeats",
    ])("does not accept instruction/example as owner confirmation: %s", async (record) => {
      const change = await prepareDatabaseChange();
      await fs.promises.appendFile(path.join(change, "source-code-audit.md"), "\nVerification command: rg route src\n");
      await fs.promises.appendFile(path.join(change, "sdd-quality-gate.md"), [
        "", "## Concurrency And Idempotency Ownership",
        "business idempotency key: stable request identity",
        "application-layer atomic claim: claim before writing",
        "short transaction boundary: commit claim and finalize independently; roll back failed writes",
        "state machine: claimed -> success / failed",
        "retry contract: reuse identity after confirmed failure",
        "external call boundary: outside claim transaction; none in this fixture",
        "unique index is not the default protection", "",
      ].join("\n"));
      await fs.promises.appendFile(path.join(change, "design.md"), `\n${language === "en" ? "Reject duplicate requests." : "错误码：拒绝重复请求。"}\n${record}\n`);
      await execFileAsync("bash", [HANDOFF, change, "--write"]);
      await replacePendingHash(change);
      await expect(execFileAsync("bash", [guard, change, "docs"], {
        env: { ...process.env, SUPERFLOW_OWNER_DECISION_ENFORCE: "1" },
      })).rejects.toMatchObject({ stderr: expect.stringContaining("without a valid owner-decided record") });
    });

    it("accepts a dated owner confirmation outside examples", async () => {
      const change = await prepareDatabaseChange();
      await fs.promises.appendFile(path.join(change, "source-code-audit.md"), "\nVerification command: rg route src\n");
      await fs.promises.appendFile(path.join(change, "sdd-quality-gate.md"), [
        "", "## Concurrency And Idempotency Ownership",
        "business idempotency key: stable request identity",
        "application-layer atomic claim: claim before writing",
        "short transaction boundary: commit claim and finalize independently; roll back failed writes",
        "state machine: claimed -> success / failed",
        "retry contract: reuse identity after confirmed failure",
        "external call boundary: outside claim transaction; none in this fixture",
        "unique index is not the default protection", "",
      ].join("\n"));
      await fs.promises.appendFile(path.join(change, "design.md"), `\n${language === "en" ? "Reject duplicate requests." : "错误码：拒绝重复请求。"}\nowner-decided: 2026-10-15 | owner: product-owner | decision: ${language === "en" ? "Reject duplicate requests with a deterministic business conflict." : "拒绝重复请求并返回确定的业务冲突。"}\n`);
      await execFileAsync("bash", [HANDOFF, change, "--write"]);
      await replacePendingHash(change);
      await expect(execFileAsync("bash", [guard, change, "docs"], {
        env: { ...process.env, SUPERFLOW_OWNER_DECISION_ENFORCE: "1" },
      })).resolves.toMatchObject({ stdout: expect.stringContaining("SDD guard passed") });
    });

    it("leaves potentially conflicting scenario wording advisory even in enforce mode", async () => {
      const change = await prepareDatabaseChange();
      await fs.promises.appendFile(path.join(change, "source-code-audit.md"), "\nVerification command: rg route src\n");
      await fs.promises.appendFile(path.join(change, "sdd-quality-gate.md"), [
        "", "## Concurrency And Idempotency Ownership",
        "business idempotency key: stable request identity",
        "application-layer atomic claim: claim before writing",
        "short transaction boundary: commit claim and finalize independently; roll back failed writes",
        "state machine: claimed -> success / failed",
        "retry contract: reuse identity after confirmed failure",
        "external call boundary: outside claim transaction; none in this fixture",
        "unique index is not the default protection", "",
      ].join("\n"));
      await fs.promises.appendFile(path.join(change, "specs/appointment-route/spec.md"), `\n- **THEN** ${language === "en" ? "Reject invalid requests; do not skip input validation." : "拒绝非法请求，不得跳过输入校验。"}\n`);
      await execFileAsync("bash", [HANDOFF, change, "--write"]);
      await replacePendingHash(change);
      const result = await execFileAsync("bash", [guard, change, "docs"], {
        env: { ...process.env, SUPERFLOW_OWNER_DECISION_ENFORCE: "1" },
      });
      expect(result.stdout).toContain("SDD guard passed");
      expect(result.stderr).toContain("[WARN]");
    });
  });

  it("rejects full docs without a closed requirement review", async () => {
    const change = await makeContractChange(tmp);
    await fs.promises.rm(path.join(change, "requirement-review.md"));
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("missing file: requirement-review.md"),
    });
  });

  it("accepts state-file-only handoff binding without prose backfill", async () => {
    const change = await makeContractChange(tmp);
    // The tweak workflow keeps this test focused on the hash binding rule;
    // the full workflow additionally freezes technical-design matrices that
    // are unrelated to the handoff hash gate.
    await execFileAsync("bash", [STATE, "init", change, "tweak", "design"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    // Deliberately leave "pending" placeholders in the Markdown documents:
    // the machine-readable binding lives in .sdd/state.yaml, and the guard
    // must not force a hash copy into every prose file after each refresh.
    await execFileAsync("bash", [GUARD, change, "design"]);
    await execFileAsync("bash", [STATE, "set", change, "handoff_hash", "0".repeat(64)]);
    await expect(execFileAsync("bash", [GUARD, change, "design"])).rejects.toMatchObject({
      stderr: expect.stringContaining("state handoff_hash does not match"),
    });
  });

  it.each([
    [
      "blocked implementation readiness",
      "implementation_readiness: READY",
      "implementation_readiness: BLOCKED",
      "requirement review implementation readiness",
    ],
    [
      "open external contract",
      "open_external_contracts: 0",
      "open_external_contracts: 1",
      "requirement review has no open external contracts",
    ],
    [
      "open source investigation",
      "open_source_investigations: 0",
      "open_source_investigations: 1",
      "requirement review has no open source investigations",
    ],
    [
      "open owner decision",
      "open_owner_decisions: 0",
      "open_owner_decisions: 1",
      "requirement review has no open owner decisions",
    ],
  ])("rejects full docs with %s", async (_name, from, to, expected) => {
    const change = await makeContractChange(tmp);
    const review = path.join(change, "requirement-review.md");
    await write(review, fs.readFileSync(review, "utf8").replace(from, to));
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).rejects.toMatchObject({ stderr: expect.stringContaining(expected) });
  });

  it("rejects database design that defers release SQL to implementation", async () => {
    const change = await prepareDatabaseChange({ releaseSql: false });

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("missing file: release-sql.md"),
    });
  });

  it("rejects a frozen release SQL hash mismatch", async () => {
    const change = await prepareDatabaseChange({ validHash: false });

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("sql_sha256 mismatch"),
    });
  });

  it("accepts complete release SQL frozen before implementation", async () => {
    const change = await prepareDatabaseChange();

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("SDD guard passed for phase docs"),
    });
  });

  it("enforces the frozen release SQL gate in English installs", async () => {
    const change = await prepareDatabaseChange({ releaseSql: false });

    await expect(
      execFileAsync("bash", [EN_GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("missing file: release-sql.md"),
    });
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
    const change = await makeContractChange(tmp);
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
    const change = await makeContractChange(tmp);
    const design = path.join(change, "design.md");
    await write(
      design,
      fs.readFileSync(design, "utf8").replace(/New-item counts:.*\n/, ""),
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
    const change = await makeContractChange(tmp);
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
    const change = await makeContractChange(tmp);
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

  it("requires source-code-audit for a full existing-system change", async () => {
    const change = await makeContractChange(tmp);
    await fs.promises.rm(path.join(change, "source-code-audit.md"));
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("missing file: source-code-audit.md"),
    });
    await expect(
      execFileAsync("bash", [EN_GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("missing file: source-code-audit.md"),
    });
  });

  it.each([
    ["real user entry", "Real user entry", "real user entry"],
    ["all writers", "All writers", "all writers inventory"],
    [
      "current and legacy classification",
      "Evidence classifications: current; legacy;",
      "complete evidence classification set",
    ],
    ["DB check reason", "DB check", "DB check or skip reason"],
  ])(
    "blocks docs when source fact audit lacks %s",
    async (_name, removed, expected) => {
      const change = await makeContractChange(tmp);
      const audit = path.join(change, "source-code-audit.md");
      await write(
        audit,
        fs.readFileSync(audit, "utf8").replaceAll(removed, ""),
      );
      await execFileAsync("bash", [STATE, "init", change, "docs"]);
      await execFileAsync("bash", [HANDOFF, change, "--write"]);
      await replacePendingHash(change);

      await expect(
        execFileAsync("bash", [GUARD, change, "docs"]),
      ).rejects.toMatchObject({ stderr: expect.stringContaining(expected) });
    },
  );

  it("accepts a complete source fact freeze card in both guards", async () => {
    const change = await makeContractChange(tmp);
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("guard passed for phase docs"),
    });
    await expect(
      execFileAsync("bash", [EN_GUARD, change, "docs"]),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("guard passed for phase docs"),
    });
  });

  it("requires an explicit PASS verdict for the review", async () => {
    const change = await makeContractChange(tmp);
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
      stderr: expect.stringContaining(
        "complexity reduction review PASS verdict",
      ),
    });
  });

  it("blocks docs when the complexity review verdict is BLOCKED", async () => {
    const change = await makeContractChange(tmp);
    const gate = path.join(change, "sdd-quality-gate.md");
    await write(
      gate,
      fs
        .readFileSync(gate, "utf8")
        .replace(
          "Minimal Design Review: PASS.",
          "Minimal Design Review: BLOCKED.",
        ),
    );
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "complexity reduction review PASS verdict",
      ),
    });
  });

  it("blocks English docs when the complexity review verdict is BLOCKED", async () => {
    const change = await makeContractChange(tmp);
    const gate = path.join(change, "sdd-quality-gate.md");
    await write(
      gate,
      fs
        .readFileSync(gate, "utf8")
        .replace(
          "Minimal Design Review: PASS.",
          "Minimal Design Review: BLOCKED.",
        ),
    );
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    await replacePendingHash(change);

    await expect(
      execFileAsync("bash", [EN_GUARD, change, "docs"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "complexity reduction review PASS verdict",
      ),
    });
  });

  it("requires a minimal design review in the source-level technical design", async () => {
    const change = await makeContractChange(tmp);
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
    const change = await makeContractChange(tmp);
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
    const change = await makeContractChange(tmp);
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
    const change = await makeContractChange(tmp);
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
    const change = await makeContractChange(tmp);
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
    const change = await makeContractChange(tmp);
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

  describe.each([
    ["zh", GUARD],
    ["en", EN_GUARD],
  ])("content concurrency contract (%s)", (_language, guard) => {
    async function prepareContentConcurrency(withAtomicBoundary = true) {
      const change = await makeContractChange(tmp);
      const technical =
        "docs/superpowers/specs/2026-06-22-appointment-route-technical-design.md";
      await write(
        path.join(change, "proposal.md"),
        "# Proposal\nSave a coherent content snapshot with version-based concurrency.\n",
      );
      await write(
        path.join(change, ".openspec.yaml"),
        "schema: spec-driven\napplicability:\n  database: false\n  external_config: false\n  concurrency: true\n  money: false\n",
      );
      const contract = withAtomicBoundary
        ? CONTENT_CONCURRENCY_CONTRACT
        : CONTENT_CONCURRENCY_CONTRACT.split("\n")
            .filter((line) => !line.startsWith("Atomic write boundary:"))
            .join("\n");
      await fs.promises.appendFile(
        path.join(change, technical),
        [
          "\n## Architecture Boundary And Call Direction",
          "The existing content entry calls the existing content service; no new adapter.",
          "## Field And Status Reverse Impact",
          "The save writes a coherent content/version pair; existing readers consume that same snapshot.",
          contract,
        ].join("\n\n"),
      );
      await fs.promises.appendFile(
        path.join(change, "sdd-quality-gate.md"),
        `\n${contract}`,
      );
      await write(
        path.join(change, "prompt/implementation.md"),
        `# Navigation\n[HOW](../${technical})\n[Context](../.sdd/handoff/sdd-context.json)\n`,
      );
      for (const document of [
        "tasks.md",
        "traceability-matrix.md",
        "sdd-quality-gate.md",
        "test-report.md",
      ])
        await fs.promises.appendFile(
          path.join(change, document),
          "\n[Main](prompt/implementation.md) [Batch](prompt/p01.md)\n",
        );
      await execFileAsync("bash", [STATE, "init", change, "docs"]);
      for (const [key, value] of Object.entries({
        technical_design: technical,
        build_mode: "team-prompt",
        isolation: "worktree",
        tdd_mode: "tdd",
        review_mode: "standard",
      }))
        await execFileAsync("bash", [STATE, "set", change, key, value]);
      await execFileAsync("bash", [HANDOFF, change, "--write"]);
      return change;
    }

    it("accepts pure content CAS without an external action claim or pending state", async () => {
      const change = await prepareContentConcurrency();
      for (const phase of ["docs", "design", "implement"])
        await expect(
          execFileAsync("bash", [guard, change, phase]),
        ).resolves.toMatchObject({
          stdout: expect.stringContaining(`guard passed for phase ${phase}`),
        });
    });

    it("rejects a content concurrency contract without its atomic boundary", async () => {
      const change = await prepareContentConcurrency(false);
      await expect(
        execFileAsync("bash", [guard, change, "design"]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("atomic write/claim boundary"),
      });
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

  it("honors explicit applicability decisions over keyword hints", async () => {
    const change = await prepareMoneyPrecisionChange();
    const previousHash = fs
      .readFileSync(
        path.join(change, ".sdd", "handoff", "sdd-context.sha256"),
        "utf-8",
      )
      .trim();
    await write(
      path.join(change, ".openspec.yaml"),
      [
        "schema: superflow/v1",
        "applicability:",
        "  database: false",
        "  external_config: false",
        "  concurrency: false",
        "  money: false",
        "",
      ].join("\n"),
    );
    await fs.promises.appendFile(
      path.join(change, "proposal.md"),
      "\nNo retry or duplicate request handling is added.\n",
    );
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    const currentHash = fs
      .readFileSync(
        path.join(change, ".sdd", "handoff", "sdd-context.sha256"),
        "utf-8",
      )
      .trim();
    for (const document of [
      "design.md",
      "sdd-quality-gate.md",
      "test-report.md",
    ]) {
      const file = path.join(change, document);
      fs.writeFileSync(
        file,
        fs.readFileSync(file, "utf-8").replaceAll(previousHash, currentHash),
      );
    }

    await expect(
      execFileAsync("bash", [GUARD, change, "design"]),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("guard passed for phase design"),
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

  it("requires the canonical precision source reference in implementation prompts", async () => {
    const change = await prepareMoneyPrecisionChange({ designContract: true });
    const prompt = path.join(change, "prompt/implementation.md");
    await write(
      prompt,
      fs
        .readFileSync(prompt, "utf8")
        .replace(
          "[HOW](../docs/superpowers/specs/2026-06-22-appointment-route-technical-design.md)",
          "",
        ),
    );
    await execFileAsync("bash", [HANDOFF, change, "--write"]);

    await expect(
      execFileAsync("bash", [GUARD, change, "implement"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "prompt canonical technical design reference",
      ),
    });
  });

  describe.each([
    ["zh", GUARD],
    ["en", EN_GUARD],
  ])("canonical prompt inheritance (%s)", (_language, guard) => {
    const technicalDesign =
      "docs/superpowers/specs/2026-06-22-appointment-route-technical-design.md";
    const link = `[HOW](../${technicalDesign})`;

    async function prepareCanonicalPrompt(copiedContract = false) {
      const change = await prepareMoneyPrecisionChange({
        designContract: true,
        promptContract: copiedContract,
      });
      await write(
        path.join(change, "prompt/implementation.md"),
        [
          "# Implementation navigation",
          link,
          "[Context](../.sdd/handoff/sdd-context.json)",
          copiedContract ? MONEY_PRECISION_CONTRACT : "",
        ].join("\n\n"),
      );
      await write(
        path.join(change, "prompt/p01.md"),
        "# Batch\n[Main](implementation.md)\n",
      );
      await execFileAsync("bash", [HANDOFF, change, "--write"]);
      return change;
    }

    it("accepts a thin main prompt referencing the complete canonical risk contract", async () => {
      const change = await prepareCanonicalPrompt();
      await expect(
        execFileAsync("bash", [guard, change, "implement"]),
      ).resolves.toMatchObject({
        stdout: expect.stringContaining("guard passed for phase implement"),
      });
    });

    it("accepts inline code in a canonical link label", async () => {
      const change = await prepareCanonicalPrompt();
      const file = path.join(change, "prompt/implementation.md");
      await write(file, fs.readFileSync(file, "utf8").replace(
        link, "[`technical_design`](../" + technicalDesign + ")",
      ));
      await execFileAsync("bash", [HANDOFF, change, "--write"]);
      await expect(execFileAsync("bash", [guard, change, "implement"])).resolves.toMatchObject({ stdout: expect.stringContaining("guard passed for phase implement") });
    });

    it.each(["pre", "script", "div"])("rejects HTML %s blocks as canonical navigation", async (tag) => {
      const change = await prepareCanonicalPrompt();
      const file = path.join(change, "prompt/implementation.md");
      await write(file, fs.readFileSync(file, "utf8").replace(link, `<${tag}>\n${link}\n</${tag}>`));
      await execFileAsync("bash", [HANDOFF, change, "--write"]);
      await expect(execFileAsync("bash", [guard, change, "implement"])).rejects.toMatchObject({ stderr: expect.stringContaining("prompt canonical technical design reference") });
    });

    it.each(["enum", "owner"])("rejects missing external %s obligations in the canonical source", async (missing) => {
      const change = await prepareCanonicalPrompt();
      await fs.promises.appendFile(path.join(change, "proposal.md"), "\nIntegrate third-party enum bindings.\n");
      await write(path.join(change, ".openspec.yaml"), "schema: spec-driven\napplicability:\n  database: false\n  external_config: false\n  concurrency: false\n  money: false\n");
      const contract = missing === "enum"
        ? EXTERNAL_ENUM_CONTRACT.replace("External Enum Binding", "External Binding").replace("external enum: POSTED.", "")
        : EXTERNAL_ENUM_CONTRACT.replace("owner approved the provider contract.", "");
      await write(path.join(change, "api.md"), `# API\n${contract}`);
      await fs.promises.appendFile(path.join(change, "sdd-quality-gate.md"), `\n${EXTERNAL_ENUM_CONTRACT}`);
      await execFileAsync("bash", [HANDOFF, change, "--write"]);
      await expect(execFileAsync("bash", [guard, change, "docs"])).rejects.toMatchObject({ stderr: expect.stringContaining(missing === "enum" ? "external enum column" : "owner confirmation column") });
    });

    it("inherits applicable field, external enum/configuration and concurrency contracts from the canonical source", async () => {
      const change = await prepareCanonicalPrompt();
      await fs.promises.appendFile(
        path.join(change, "proposal.md"),
        "\nIntegrate a third-party SDK with third-party enum bindings and persist concurrent updates.\n",
      );
      await fs.promises.appendFile(
        path.join(change, technicalDesign),
        `\n${EXTERNAL_ENUM_CONTRACT}\n${EXTERNAL_CONFIG_CONTRACT}\n${CONTENT_CONCURRENCY_CONTRACT}`,
      );
      await execFileAsync("bash", [HANDOFF, change, "--write"]);
      await expect(
        execFileAsync("bash", [guard, change, "implement"]),
      ).resolves.toMatchObject({
        stdout: expect.stringContaining("guard passed for phase implement"),
      });
    });

    it("rejects missing canonical obligations even when the prompt copies a complete contract", async () => {
      const change = await prepareCanonicalPrompt(true);
      const file = path.join(change, technicalDesign);
      await write(
        file,
        fs
          .readFileSync(file, "utf8")
          .replace(
            "Currency contract is CNY; the provider minor unit boundary is declared separately from internal scale.",
            "",
          ),
      );
      await execFileAsync("bash", [HANDOFF, change, "--write"]);
      await expect(
        execFileAsync("bash", [guard, change, "implement"]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          "money precision boundary minor-unit boundary",
        ),
      });
    });

    it.each([
      "missing",
      "wrong-existing",
      "fenced",
      "comment",
      "quoted",
      "inline-code",
    ])(
      "rejects %s canonical references even with copied keywords",
      async (kind) => {
        const change = await prepareCanonicalPrompt(true);
        const file = path.join(change, "prompt/implementation.md");
        const replacements: Record<string, string> = {
          missing: "technical_design: source-level HOW",
          "wrong-existing": "technical_design: [HOW](../design.md)",
          fenced: `technical_design\n\`\`\`markdown\n${link}\n\`\`\``,
          comment: `technical_design\n<!-- ${link} -->`,
          quoted: `technical_design\n> ${link}`,
          "inline-code": `technical_design: \`${link}\``,
        };
        await write(
          file,
          fs.readFileSync(file, "utf8").replace(link, replacements[kind]),
        );
        await execFileAsync("bash", [HANDOFF, change, "--write"]);
        await expect(
          execFileAsync("bash", [guard, change, "implement"]),
        ).rejects.toMatchObject({
          stderr: expect.stringContaining(
            "prompt canonical technical design reference",
          ),
        });
      },
    );

    it("rejects canonical source drift after a valid handoff", async () => {
      const change = await prepareCanonicalPrompt();
      await fs.promises.appendFile(
        path.join(change, technicalDesign),
        "\nChanged precision policy.\n",
      );
      await expect(
        execFileAsync("bash", [guard, change, "implement"]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("handoff"),
      });
    });
  });

  it("checks shared inheritance at the main implementation prompt", async () => {
    const change = await prepareMoneyPrecisionChange({
      designContract: true,
      promptContract: true,
    });
    await write(path.join(change, "prompt", "implementation.md"), "# Incomplete Prompt\n");

    await expect(
      execFileAsync("bash", [GUARD, change, "implement"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("prompt canonical technical design reference"),
    });
  });

  it("accepts navigation-only batches when the main prompt carries public contracts", async () => {
    const change = await prepareMoneyPrecisionChange({ designContract: true, promptContract: true });
    const oldHash = fs.readFileSync(path.join(change, ".sdd/handoff/sdd-context.sha256"), "utf8").trim();
    fs.appendFileSync(path.join(change, "prompt/implementation.md"), "\nField And Status Reverse Impact: inherit the canonical design.\n");
    await write(path.join(change, "prompt/p01.md"), "# Batch\n[Main](implementation.md)\n\n| Prompt | Task IDs | Entry IDs | Case IDs |\n|---|---|---|---|\n| [Main](implementation.md) | 1.1 | entry-1 | C1 |\n");
    const hash = (await execFileAsync("bash", [HANDOFF, change, "--hash-only"])).stdout.trim();
    for (const document of ["design.md", "sdd-quality-gate.md", "test-report.md"])
      await write(path.join(change, document), fs.readFileSync(path.join(change, document), "utf8").replaceAll(oldHash, hash));
    await execFileAsync("bash", [HANDOFF, change, "--write"]);
    for (const guard of [GUARD, EN_GUARD])
      await expect(execFileAsync("bash", [guard, change, "implement"])).resolves.toMatchObject({ stdout: expect.stringContaining("guard passed for phase implement") });
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
    const change = await makeContractChange(tmp);
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
    const change = await makeContractChange(tmp);
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

  // Fifteen real build/case captures need headroom under parallel test load.
  it("requires frozen entry review before a full verify can lint its report", async () => {
    const change = await makeContractChange(tmp);
    await write(path.join(change, "tasks.md"), "# Tasks\n\n- [x] P01 route\n");
    await execFileAsync("bash", [STATE, "init", change, "docs"]);
    await execFileAsync("bash", [STATE, "set", change, "verify_mode", "light"]);
    await execFileAsync("bash", [STATE, "set", change, "branch_status", "handled"]);

    for (const guard of [GUARD, EN_GUARD]) {
      await expect(execFileAsync("bash", [guard, change, "verify"])).rejects
        .toMatchObject({
          stderr: expect.stringContaining("full SDD verify requires .sdd/reviews/document-review.json"),
        });
    }

    const review = path.join(change, ".sdd/reviews/document-review.json");
    const caseIds = Array.from({ length: 15 }, (_, index) => `C${index + 1}`);
    await write(review, JSON.stringify({
      coverage: {
        schemaVersion: "superflow.review-coverage.v1",
        entries: caseIds.map((id) => ({ id: `E${id.slice(1)}`, route: `POST /E${id.slice(1)}`, kind: "api" })),
        cases: caseIds.map((id) => ({ id, entryId: `E${id.slice(1)}`, level: "api" })),
        decisions: caseIds.map((id) => ({ disposition: "FIX", caseIds: [id] })),
      },
    }));
    await write(path.join(change, "tests.md"),
      `# Tests\n\n${caseIds.join(" ")}\n\nRED/GREEN curl real API and database SELECT.\n`);
    const rows = caseIds.slice(0, 13).map((id) =>
      `| ${id} | E${id.slice(1)} | api | PASS | logs/${id}.json |`);
    for (const id of caseIds.slice(0, 13)) {
      writeExecutionReceipt(change, id, `E${id.slice(1)}`);
    }
    await write(path.join(change, "test-report.md"), [
      "# Test Report",
      "RED failure evidence; GREEN pass evidence.",
      "接口自动化 curl http://localhost:8080/api; HTTP 200 response assert.",
      "数据库 SELECT completed; log ERROR checked.",
      "表/字段 | 写入方 | 读取/过滤方 | 真实入口 | 反向状态场景 | 验证证据",
      "superflow-test-report-lint passed.",
      "| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |",
      "|---|---|---|---|---|",
      ...rows,
      "验证结果: PASS",
      "Verification Result: PASS",
      "Archive Readiness: PASS",
    ].join("\n"));
    const localLint = path.join(tmp, ".codex/hooks/superflow-test-report-lint.py");
    await fs.promises.mkdir(path.dirname(localLint), { recursive: true });
    await fs.promises.copyFile(path.join(ROOT, "assets/scripts/superflow-test-report-lint.py"), localLint);
    await fs.promises.chmod(localLint, 0o755);

    for (const guard of [GUARD, EN_GUARD]) {
      await expect(execFileAsync("bash", [guard, change, "verify"])).rejects
        .toMatchObject({
          stderr: expect.stringContaining("用例 C14 缺少逐项执行结果"),
        });
    }

    for (const id of caseIds.slice(13)) {
      writeExecutionReceipt(change, id, `E${id.slice(1)}`);
    }
    const remainingRows = caseIds.slice(13).map((id) =>
      `| ${id} | E${id.slice(1)} | api | PASS | logs/${id}.json |`);
    const partialReport = await fs.promises.readFile(path.join(change, "test-report.md"), "utf8");
    await write(path.join(change, "test-report.md"), partialReport.replace(
      "验证结果: PASS", `${remainingRows.join("\n")}\n验证结果: PASS`,
    ));
    writeIndependentReview(change);
    fs.symlinkSync(path.join(change, "capture-package/dist"), path.join(tmp, ".codex/dist"), "dir");
    for (const guard of [GUARD, EN_GUARD]) {
      await expect(execFileAsync("bash", [guard, change, "verify"]))
        .resolves.toMatchObject({
          stdout: expect.stringContaining("guard passed for phase verify"),
        });
    }
  }, 30_000);

  it("keeps a tweak verify usable without a full SDD entry review", async () => {
    const change = path.join(tmp, "openspec", "changes", "small-tweak");
    await write(path.join(change, "tasks.md"), "# Tasks\n\n- [x] Finish tweak\n");
    await write(path.join(change, "tests.md"), "# Tests\n\nCheck the documented result.\n");
    await write(path.join(change, "test-report.md"), [
      "# Test Report",
      "RED failure evidence; GREEN pass evidence.",
      "superflow-test-report-lint passed.",
      "Verification Result: PASS",
      "Archive Readiness: PASS",
    ].join("\n"));
    await execFileAsync("bash", [STATE, "init", change, "tweak", "docs"]);
    await execFileAsync("bash", [STATE, "set", change, "branch_status", "handled"]);
    await expect(execFileAsync("bash", [GUARD, change, "verify"]))
      .resolves.toMatchObject({
        stdout: expect.stringContaining("guard passed for phase verify"),
      });
  });

  describe.each([["zh", GUARD], ["en", EN_GUARD]])("current verification scope (%s)", (_language, guard) => {
    async function prepareCurrentReport(risk: "red" | "concurrency", currentEvidence: boolean) {
      const change = path.join(tmp, "openspec/changes/current-report");
      await write(path.join(change, "tasks.md"), "# Tasks\n- [x] 1.1 Finish current work\n");
      await write(path.join(change, "tests.md"), "# Tests\nCheck the current result.\n");
      await write(path.join(change, ".openspec.yaml"), `schema: spec-driven\napplicability:\n  database: false\n  external_config: false\n  concurrency: ${risk === "concurrency"}\n  money: false\n`);
      const evidence = risk === "red" ? "RED failure evidence." : "Concurrency And Idempotency Ownership: concurrent duplicate and retry cases passed.";
      const report = [
        "# Test Report",
        "GREEN pass evidence.",
        "superflow-test-report-lint passed.",
        risk === "concurrency" ? "RED failure evidence." : "",
        currentEvidence ? evidence : "",
        "Verification Result: PASS",
        "Archive Readiness: PASS",
        "## History",
        "Verification Result: FAIL",
        "Archive Readiness: BLOCKED",
        evidence,
      ].join("\n");
      await write(path.join(change, "test-report.md"), report);
      await execFileAsync("bash", [STATE, "init", change, "tweak", "verify"]);
      await execFileAsync("bash", [STATE, "set", change, "branch_status", "handled"]);
      return { change, report };
    }

    it.each(["red", "concurrency"] as const)("does not let history supply current %s evidence", async (risk) => {
      const { change, report } = await prepareCurrentReport(risk, false);
      await expect(execFileAsync("bash", [guard, change, "verify"])).rejects.toMatchObject({ stderr: expect.stringContaining(risk === "red" ? "RED evidence" : "concurrency and idempotency runtime evidence") });
      expect(fs.readFileSync(path.join(change, "test-report.md"), "utf8")).toBe(report);
    });

    it.each(["red", "concurrency"] as const)("accepts current %s evidence while retaining historical failure", async (risk) => {
      const { change, report } = await prepareCurrentReport(risk, true);
      await expect(execFileAsync("bash", [guard, change, "verify"])).resolves.toMatchObject({ stdout: expect.stringContaining("guard passed for phase verify") });
      expect(fs.readFileSync(path.join(change, "test-report.md"), "utf8")).toBe(report);
    });

    it("does not let the caller directory supply another report's evidence", async () => {
      const { change } = await prepareCurrentReport("red", false);
      await write(path.join(tmp, "test-report.md"), "# Unrelated Report\nRED failure evidence. GREEN pass evidence. superflow-test-report-lint passed.\n");
      await expect(execFileAsync("bash", [guard, change, "verify"], { cwd: tmp })).rejects.toMatchObject({ stderr: expect.stringContaining("RED evidence") });
    });
  });

  it.each([GUARD, EN_GUARD])("accepts completed tasks through verify and archive: %s", async (guard) => {
    const change = path.join(tmp, "openspec/changes/completed-tweak");
    await write(path.join(change, "tasks.md"), "# Tasks\n- [x] 1.1 Finish documented tweak\n");
    await write(path.join(change, "tests.md"), "# Tests\nCheck the documented result.\n");
    await write(path.join(change, "test-report.md"), "# Report\nRED failure evidence; GREEN pass evidence.\nsuperflow-test-report-lint passed.\nVerification Result: PASS\nArchive Readiness: PASS\n");
    await execFileAsync("bash", [STATE, "init", change, "tweak", "verify"]);
    await execFileAsync("bash", [STATE, "set", change, "branch_status", "handled"]);
    for (const phase of ["verify", "archive"])
      await expect(execFileAsync("bash", [guard, change, phase, "--apply"])).resolves.toMatchObject({ stdout: expect.stringContaining(`guard passed for phase ${phase}`) });
  });

  it("blocks archive without an explicit PASS closeout marker", async () => {
    const change = await makeContractChange(tmp);
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

  it.each([GUARD, EN_GUARD].flatMap((guard) => [
    "example", "final", "readiness", "aliases", "unknown", "equivalent", "legacy",
  ].map((scope) => [guard, scope])))(
    "uses final body closeout results before archive: %s (%s)",
    async (guard, scope) => {
      const change = path.join(tmp, "custom/tasks/closeout");
      await write(path.join(change, "tasks.md"), "- [x] 已完成\n");
      const report = path.join(change, "test-report.md");
      await write(report, "Verification Result: PASS\nArchive Readiness: PASS\n");
      await execFileAsync("bash", [STATE, "init", change, "hotfix", "archive"]);
      for (const [key, value] of [
        ["verify_result", "pass"],
        ["verification_report", "test-report.md"],
        ["branch_status", "handled"],
        ["verified_at", "2026-10-12T00:00:00Z"],
      ]) {
        await execFileAsync("bash", [STATE, "set", change, key, value]);
      }
      await expect(execFileAsync("bash", [guard, change, "archive"]))
        .resolves.toMatchObject({ stdout: expect.stringContaining("guard passed") });
      const failures: Record<string, string[]> = {
        example: [
          "验证结果: FAIL\n归档就绪: FAIL\n```text\n验证结果: PASS\n归档就绪: PASS\n```\n",
        ],
        final: [
          "验证结果: PASS\n归档就绪: PASS\n验证结果: FAIL\n归档就绪: FAIL\n",
          "Verification Result: PASS\nArchive Readiness: PASS\n验证结果: FAIL\n归档就绪: FAIL\n",
        ],
        readiness: [
          "Verification Result: PASS\nArchive Readiness: PASS\nArchive Readiness: FAIL\n",
          "Verification Result: PASS\nArchive Readiness: PASS\n归档就绪: FAIL\n",
        ],
        aliases: [
          "验证结果: PASS\n归档就绪: PASS\n验证结果: 失败\n",
          "Verification Result: PASS\nArchive Readiness: PASS\n归档就绪: 失败\n",
        ],
        unknown: [
          "验证结果: PASS\n归档就绪: PASS\n验证结果: 未知\n",
          "Verification Result: PASS\nArchive Readiness: PASS\nArchive Readiness: 未知\n",
        ],
        equivalent: [],
        legacy: [],
      };
      for (const text of failures[scope]) {
        await write(report, text);
        await expect(execFileAsync("bash", [guard, change, "archive"]))
          .rejects.toMatchObject({ code: 1 });
      }
      const passes = scope === "readiness" ? [
        "Verification Result: PASS\nArchive Readiness: READY\n",
      ] : scope === "equivalent" ? [
        "验证结果: 通过\n归档就绪: 就绪\n",
        "Verification Result: PASS\n验证结果: 通过\nArchive Readiness: READY\n归档就绪: 就绪\n",
      ] : scope === "legacy" ? [
        "验证结论: 通过\n归档就绪: 就绪\n",
      ] : [];
      for (const text of passes) {
        await write(report, text);
        await expect(execFileAsync("bash", [guard, change, "archive"]))
          .resolves.toMatchObject({ stdout: expect.stringContaining("guard passed") });
      }
    },
  );

  it("requires test-environment fingerprint for full verification", async () => {
    const change = await makeContractChange(tmp);
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
