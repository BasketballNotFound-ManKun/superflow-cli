---
name: superflow-design
description: Use when OpenSpec/SDD contract documents exist and source-level technical design, reverse impact analysis, TDD strategy, or Superpowers design handoff must be produced before implementation prompts.
---

# SDD Design

Use this after `$superflow-docs` has produced the OpenSpec/SDD contract documents and
before `$superflow-implement` creates implementation prompts. This phase lets
Superpowers own source-level HOW without weakening OpenSpec/SDD contracts.

## Ownership

- OpenSpec/SDD owns WHAT and contracts: requirements, API, DB, SQL, field
  semantics, tests, real-entry acceptance, and quality gates.
- Superpowers owns HOW: source-level technical design, reverse impact analysis,
  TDD/RED order, Worker/Tester/Reviewer split, worktree/port plan, and
  implementation risk.
- If HOW conflicts with WHAT, stop and return to `$superflow-docs`; do not carry the
  conflict into prompts.

## Preconditions

- `proposal.md`, `api.md`, `design.md`, `tasks.md`, `tests.md`,
  `traceability-matrix.md`, `sdd-quality-gate.md`, and `test-report.md` exist.
- `.sdd/state.yaml` exists and is in `phase: design`. If still `docs`, run:
  ```bash
  ../superflow-pipeline/scripts/superflow-yaml-validate.sh <change-dir>
  ../superflow-pipeline/scripts/superflow-guard.sh <change-dir> docs --apply
  ```
- `.sdd/handoff/sdd-context.md`, `.json`, and `.sha256` exist and match current
  docs. If docs changed, rerun:
  ```bash
  ../superflow-pipeline/scripts/superflow-handoff.sh <change-dir> --refresh
  ```

## Procedure

1. Read `.sdd/handoff/sdd-context.md` plus original `api.md`, `design.md`,
   `tasks.md`, and `tests.md`.
2. If design discussion is still evolving, maintain
   `.sdd/handoff/brainstorm-summary.md` with confirmed, candidate, pending, and
   rejected items. Do not create final technical design from memory only.
3. Use Superpowers `brainstorming` or equivalent deep design reasoning to
   decide source-level HOW.
4. Write:
   `docs/superpowers/specs/YYYY-MM-DD-<change-id>-technical-design.md`
   using `../superflow-pipeline/references/superpower-technical-design-template.md`.
5. For cross-repository, service-to-service, SDK, MQ, scheduler, device,
   callback, third-party, mini-program, gateway, or adapter changes, include
   `Architecture Boundary And Call Direction`. Prove owner module, call
   direction, existing entry/exit points, proposed entry/exit points, evidence
   anchors, and forbidden shortcuts. If the proposed HOW turns an outbound
   adapter/protocol translator/device gateway into a business-entry
   orchestrator, stop and return to `$superflow-docs` unless the OpenSpec/SDD
   contract explicitly grants that ownership with approval evidence.
6. For field/status/enum/sync changes, include `Field And Status Reverse
   Impact` and prove writers, readers, filters, derived sync paths, consumers,
   and tests. Direct setter-only design is blocked.
7. For amount, fee, discount, deduction, refund, sharing, payment, invoice,
   balance, electricity fee, service fee, package settlement, proration,
   allocation, reconciliation, or financial display changes,
   include `Money Precision Boundary`. Prove calculation-state fields,
   settlement/display-state fields, rounding boundary, scale, rounding mode,
   allocation/reconciliation rule, and tests covering half-cent or residual
   cases. If the design rounds money before later slicing, proration,
   aggregation, discounting, or allocation, stop and redesign the calculation
   boundary. When an additive identity has an authoritative total, the design
   must calculate only N-1 components independently and derive the final
   complement as `authoritative total - sum(other components)`. Independently
   calculating and rounding all components before rebuilding the total is
   blocked. A claimed exception must name the actual source of truth and owner
   evidence. Read
   `../superflow-pipeline/references/money-precision-algorithms.md` and also
   freeze the exact representation, currency/minor-unit boundary, rounding
   level and policy source, deterministic residual strategy with stable
   tie-breaker, and positive/zero/negative evidence. For FX changes, freeze the
   directional rate metadata and one canonical conversion path.
8. Record state:
   ```bash
   ../superflow-pipeline/scripts/superflow-state.sh set <change-dir> technical_design docs/superpowers/specs/YYYY-MM-DD-<change-id>-technical-design.md
   ../superflow-pipeline/scripts/superflow-state.sh set <change-dir> design_doc design.md
   ```
9. Update `design.md` with `Superpowers Technical Design Handoff`, update
   `sdd-quality-gate.md` with the technical design path and hash, then run
   `../superflow-pipeline/scripts/superflow-handoff.sh <change-dir> --refresh`.
   If the guard reports a stale or missing hash, record the printed hash in
   `design.md`, `sdd-quality-gate.md`, prompts, and `test-report.md`, then run
   `--refresh` again. Do not set `design_doc` to the Superpowers document;
   `design_doc` is the OpenSpec/SDD contract design, while `technical_design`
   is the Superpowers HOW document.
10. Run:
   ```bash
   ../superflow-pipeline/scripts/superflow-yaml-validate.sh <change-dir>
   ../superflow-pipeline/scripts/superflow-guard.sh <change-dir> design --apply
   ```

## Completion

Do not continue to `$superflow-implement` until the design guard passes. The next
phase may generate prompts, but this phase must not skip any required SDD
contract document or replace API/DB/tests with Superpowers prose.
