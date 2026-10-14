---
name: superflow-design
description: Superflow 内部能力：根据冻结合同和现有源码明确复用点、实现方案、影响范围与验证策略。由 $superflow 选择，用户无需手动分流。
---

# SDD Design

Use this after `$superflow-contracts` has produced the OpenSpec/SDD contract documents and
before `$superflow-handoff` creates implementation prompts. This phase lets
Superpowers own source-level HOW without weakening OpenSpec/SDD contracts.

## Ownership

- OpenSpec/SDD owns WHAT and contracts: requirements, API, DB, SQL, field
  semantics, tests, real-entry acceptance, and quality gates.
- Superpowers owns HOW: source-level technical design, reverse impact analysis,
  TDD/RED order, Worker/Tester/Reviewer split, worktree/port plan, and
  implementation risk.
- If HOW conflicts with WHAT, stop and return to `$superflow-contracts`; do not carry the
  conflict into prompts.

## Preconditions

- When the change modifies a database schema, index, constraint, seed data, or
  historical data, `release-sql.md` must already contain the complete executable
  release SQL, an exact target `.sql` path, `copy_policy: verbatim`, and a valid
  `sql_sha256`. Source-level HOW design must not defer SQL design to an
  implementation prompt.

- `proposal.md`, `api.md`, `design.md`, `tasks.md`, `tests.md`,
  `traceability-matrix.md`, `sdd-quality-gate.md`, and `test-report.md` exist.
- `.sdd/state.yaml` exists and is in `phase: design`. If still `docs`, run:
  ```bash
  ../superflow/scripts/superflow-yaml-validate.sh <change-dir>
  ../superflow/scripts/superflow-guard.sh <change-dir> docs --apply
  ```
- `.sdd/handoff/sdd-context.md`, `.json`, and `.sha256` exist and match current
  docs. If docs changed, rerun:
  ```bash
  ../superflow/scripts/superflow-handoff.sh <change-dir> --refresh
  ```

## Procedure

1. Read `.sdd/handoff/sdd-context.md` plus original `api.md`, `design.md`,
   `tasks.md`, and `tests.md`.
   Read applicable project rules and use the Host's normal skill discovery for
   relevant skills referenced by those rules or applicable to the task. Read
   each complete skill file and its relevant references before designing.
   Do not scan personal skill directories, record personal absolute paths, or
   copy user-level rule/skill text into project artifacts. Apply the discovered
   content when designing; freeze only task-relevant constraints through the
   existing `mandatoryEngineeringRules` handoff for implementation and review.
2. If the change has any schema, index, constraint, seed-data, or historical
   migration impact, verify `release-sql.md` before source-level HOW design:
   - front matter sets `database_change: true`, an exact `target_sql_path`,
     `copy_policy: verbatim`, and the normalized SQL payload `sql_sha256`;
   - exactly one `sql` block contains the complete executable release script,
     including prechecks, DDL/DML, and post-verification required by the
     contract;
   - `design.md`, `tasks.md`, and `sdd-quality-gate.md` reference the artifact
     and prohibit implementation agents from editing its SQL;
   - unresolved SQL types, defaults, indexes, migration rules, or target paths
     return to `$superflow-contracts`. They must not be deferred to
     `$superflow-handoff`.
3. If design discussion is still evolving, maintain
   `.sdd/handoff/brainstorm-summary.md` with confirmed, candidate, pending, and
   rejected items. Do not create final technical design from memory only.
   Before choosing HOW, read actual reusable method bodies and their callers,
   Mapper/DDL constraints and write/read effects using
   [the source investigation contract](../superflow/references/document-review-coverage.md).
   Recheck re-reads, outer transactions, swallowed exceptions and loop boundaries;
   no existing behavior may be inferred from method names or fingerprints.
4. Use Superpowers `brainstorming` or equivalent deep design reasoning to
   decide source-level HOW.
5. Write:
   `docs/superpowers/specs/YYYY-MM-DD-<change-id>-technical-design.md`
   using `../superflow/references/superpower-technical-design-template.md`.
6. For each new or changed module interface, add a `Design-It-Twice` card to
   the technical design: two materially different interfaces, seam and adapter
   ownership, the real test surface, reuse evidence, caller consequences, and
   an explicit choice. Renaming the same interface does not count as two
   options; revisit it. This card is advisory and does not add a state gate.
7. Complete `复杂度减法评审` before expanding source-level HOW. For every new
   table, field, API, Service/component, abstraction, cache, async/MQ/event
   flow, scheduled job, or compatibility layer, prove existing reuse options,
   necessity, and why the simplest direct implementation is insufficient.
   Prefer one owner, one write path, one transaction, and set-based operations
   when they satisfy the contract. Remove speculative extension points,
   duplicate DTO/API layers, derivable persistence, premature caches, and
   async compensation without measured need. Record the retained and removed
   counts; unresolved simpler alternatives keep the design blocked. For
   data-intensive paths (large or growing collections, batch processing,
   imports/exports, aggregation, repeated scans, or fan-out), also record
   current/expected scale and growth boundary, work and primary cost per
   request/job, alternatives considered, and evidence validating the choice.
   Match evidence to risk: source/query analysis or representative functional
   cases may suffice; do not require benchmarks for small tasks. Mark this not
   applicable with a brief reason when data volume is not material.
7. For cross-repository, service-to-service, SDK, MQ, scheduler, device,
   callback, third-party, mini-program, gateway, or adapter changes, include
   `Architecture Boundary And Call Direction`. Prove owner module, call
   direction, existing entry/exit points, proposed entry/exit points, evidence
   anchors, and forbidden shortcuts. If the proposed HOW turns an outbound
   adapter/protocol translator/device gateway into a business-entry
   orchestrator, stop and return to `$superflow-contracts` unless the OpenSpec/SDD
   contract explicitly grants that ownership with approval evidence.
8. For third-party platforms/tools, SDKs, MQ/Kafka, callbacks, payment
   gateways, cloud services, or other external integrations, include
   `External Integration Configuration And Deployment Contract`. Inventory
   every endpoint, app/tenant/project ID, Topic, Tag, Consumer Group,
   namespace, webhook, ACL/role, feature switch, timeout, and credential
   reference. Prove the source and injection/provisioning method for local,
   test, and production environments, plus owner, creation timing, readiness
   check, rollback, and unresolved blockers. Runtime values and server-side
   resources must not exist only as hard-coded annotations/constants. Test
   auto-creation or pre-existing resources must not be treated as proof that
   production will provision them. Missing production provisioning evidence
   blocks design completion.
9. For concurrent requests, batch issue/activation/renewal, duplicate callbacks,
   duplicate consumption, or repeated external delivery, include
   `Concurrency And Idempotency Ownership`. Use a stable business idempotency
   key and an application-layer atomic claim in a short transaction; persist
   `PENDING` before the external call, release database locks before calling
   externally, model success/failure/uncertain states, and reuse the original
   business code on retry. A unique index is not the default and may only be an
   optional fallback with proven natural uniqueness, historical cleanup,
   NULL/soft-delete semantics, and a conflict contract. Check-then-insert,
   process-local locks, and random IDs alone are blocked.
   When the selected design is version-based optimistic locking, record the
   exact database atomic compare-and-set statement and affected-row decision:
   the update predicate contains both the stable row identity and expected
   version; a zero-row result distinguishes missing data from version conflict.
   The TDD plan references the `tests.md` concurrent stale-version case proving
   one winner, one conflict, and one increment. Do not defer this decision to
   the managed Executor prompt.
10. For field/status/enum/sync changes, include `Field And Status Reverse
Impact` and prove writers, readers, filters, derived sync paths, consumers,
   and tests. Direct setter-only design is blocked.
11. For third-party, SDK, BEM/parking, payment/refund, financial display,
   source/origin, status sync, or external dictionary fields, include
   `External Enum Binding`. Prove local source fields/enums, external fields,
   external enum values, display/business/financial meaning, source evidence,
   owner confirmation, unresolved handling, and test evidence. A request
   succeeding or a field being non-null is not enough; unconfirmed values are
   blockers and must be returned to `$superflow-contracts` or the user.
12. For amount, fee, discount, deduction, refund, sharing, payment, invoice,
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
   `../superflow/references/money-precision-algorithms.md` and also
   freeze the exact representation, currency/minor-unit boundary, rounding
   level and policy source, deterministic residual strategy with stable
   tie-breaker, and positive/zero/negative evidence. For FX changes, freeze the
   directional rate metadata and one canonical conversion path.
13. Record state:
   ```bash
   ../superflow/scripts/superflow-state.sh set <change-dir> technical_design docs/superpowers/specs/YYYY-MM-DD-<change-id>-technical-design.md
   ../superflow/scripts/superflow-state.sh set <change-dir> design_doc design.md
   ```
14. Update `design.md` with `Superpowers Technical Design Handoff`, update
   `sdd-quality-gate.md` with the technical design path and hash, then run
   `../superflow/scripts/superflow-handoff.sh <change-dir> --refresh`.
   If the guard reports a stale or missing hash, record the printed hash in
   `design.md`, `sdd-quality-gate.md`, prompts, and `test-report.md`, then run
   `--refresh` again. Do not set `design_doc` to the Superpowers document;
   `design_doc` is the OpenSpec/SDD contract design, while `technical_design`
   is the Superpowers HOW document.
15. Run:

```bash
../superflow/scripts/superflow-yaml-validate.sh <change-dir>
../superflow/scripts/superflow-guard.sh <change-dir> design --apply
```

## Completion

Do not continue to `$superflow-handoff` until the design guard passes. The next
phase may generate prompts, but this phase must not skip any required SDD
contract document or replace API/DB/tests with Superpowers prose.

### 数据库分层证据

按 [数据库合同](../superflow/references/document-review-coverage.md#数据库分层合同)
冻结并继承 `testLayer`、entry.database、生产 statement、mockBoundary 和数据断言。
确定 schema 来源、引擎主版本、生产 Service/Mapper 边界、影响行数和非目标/旧轮次隔离断言。
