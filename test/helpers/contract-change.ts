import fs from "node:fs";
import path from "node:path";

export const MINIMAL_DESIGN_REVIEW = [
  "## Minimal Design Review",
  "",
  "New-item counts: tables 0; fields 0; APIs 0; services/components 0; caches 0; MQ/events 0; scheduled jobs 0; compatibility layers 0.",
  "Reuse evidence: extend the existing user service and API.",
  "Simplest implementation: one direct synchronous write path.",
  "Removed/rejected complexity: do not add a parallel service, cache, async flow, or compatibility layer.",
  "",
].join("\n");

const SOURCE_CODE_AUDIT = [
  "# Source Code Audit",
  "",
  "## Source Fact Freeze Card",
  "",
  "| Business conclusion | understand-anything locator | Data model | All writers | Real user entry | Current callers | Legacy conflict | DB check or skip reason | Conclusion level | owner decision |",
  "|---|---|---|---|---|---|---|---|---|---|",
  "| One request follows one current route | graph locator only | one route record | API service | frontend mini-program H5 caller | current controller | legacy batch API is unmounted | DB check skipped because source and callers are sufficient | owner-confirmed | owner approved current behavior |",
  "",
  "Evidence classifications: current; legacy; unmounted; data-model-only; owner-confirmed; blocked.",
  "",
  "## Question Eligibility Gate",
  "",
  "Source search: complete. Mapper and SQL search: complete. Frontend mini-program H5 caller search: complete. Sibling repo search: complete. DB check reason recorded above.",
  "",
  "## Conflict Audit",
  "",
  "List/orderIds/batchInsert/one-to-many signals were compared with the real current entry and did not redefine current behavior.",
  "",
].join("\n");

export async function write(file: string, content: string) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content);
}

export async function writeRequirementReview(change: string) {
  await write(
    path.join(change, "requirement-review.md"),
    [
      "---",
      "change: test-change",
      "review_verdict: PASS",
      "implementation_readiness: READY",
      "open_blockers: 0",
      "open_external_contracts: 0",
      "open_source_investigations: 0",
      "open_owner_decisions: 0",
      "---",
      "",
      "# Requirement Review",
      "",
      "## Closure Matrix",
      "",
      "| Feature | Input/trigger | Processing | Output | Failure | Recovery/repeat | Evidence | Verdict |",
      "|---|---|---|---|---|---|---|---|",
      "| F1 | covered | covered | covered | covered | covered | source-backed | PASS |",
      "",
      "## Review Findings",
      "",
      "No open BLOCKER or IMPORTANT findings.",
      "",
      "## Open Blockers",
      "",
      "| ID | Category | Affected contract | Owner | Next evidence/question | Status |",
      "|---|---|---|---|---|---|",
      "| None | None | None | None | None | Closed |",
      "",
    ].join("\n"),
  );
}

export async function makeContractChange(root: string) {
  const change = path.join(root, "openspec", "changes", "appointment-route");
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
  await write(path.join(change, "source-code-audit.md"), SOURCE_CODE_AUDIT);
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
  await writeRequirementReview(change);
  return change;
}
