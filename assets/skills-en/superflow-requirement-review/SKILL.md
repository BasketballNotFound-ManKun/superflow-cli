---
name: superflow-requirement-review
description: Perform source-backed reverse review of clarified requirements and OpenSpec/SDD drafts to find closure gaps, factual conflicts, missing scenarios, over-design, under-design, API/UI/DB/test drift, and unverifiable contracts, then drive remediation and re-review. Use for requirement review, reverse review, challenge the design, find omissions, testability review, or pre-design/pre-implementation review.
---

# Superflow Requirement Review

Independently challenge the current OpenSpec change with source-backed evidence. This is not
an advisory side path: blocking findings must repair canonical documents and pass re-review
before the docs phase can close.

## Boundaries

- Use after complex requirements are clarified and reviewable drafts exist.
- Do not replace owner clarification or source/Mapper/DB/real-caller verification.
- Keep all output inside the current `openspec/changes/<change>/`.
- Do not stop at a findings list; repair canonical documents and re-review.
- Do not add speculative tables, APIs, services, caches, states, or compatibility layers.

## Required Inputs

Read the applicable source index, feature gates, proposal, API, specs, design, source audit,
database contract, frozen release SQL, tasks, tests, traceability, quality gate, test report,
current source, Mapper/XML, real frontend/mini-program/H5 callers, sibling repositories, and
read-only database evidence when needed. Missing evidence is a finding, not permission to guess.

## Workflow

1. Record the change, phase, bounded feature, sources, handoff hash, and confirmed/pending
   decisions. Review one frozen feature at a time.
2. Establish evidence through platform impact discovery, source, Mapper/SQL, real callers, and
   read-only DB checks. Treat graph output only as a locator. Classify evidence as `current`,
   `legacy`, `unmounted`, `data-model-only`, `owner-confirmed`, or `blocked`.
   Classify every unresolved item by resolution ownership:
   - `SOURCE_INVESTIGATION`: source, dependency, configuration, logs, or read-only DB can resolve
     it. Continue investigating; do not ask the user or exit review.
   - `OWNER_DECISION`: multiple valid product choices remain. Return to clarification and ask one
     decision at a time.
   - `EXTERNAL_CONTRACT`: third-party/cross-service request, response, signing, idempotency,
     enum, callback, or responsibility contract. If it changes API, SQL, state, security, or test
     assertions, it blocks PASS until evidence freezes it; merely documenting `Blocked` is not
     closure.
   - `EXECUTION_EVIDENCE`: implementation contract is frozen and only deployment, migration,
     real-call, or runtime evidence remains. It may block delivery, not requirement review.
3. Reverse-check six dimensions:
   - business closure: input, trigger, precondition, processing, output, failure, recovery, repeat;
   - source facts: real entry, all writers/readers/filters, legacy behavior, cross-repo consumers;
   - contract consistency: PRD/UI/API/DTO/DB/status/SQL/tests/tasks;
   - failure boundaries: authorization, concurrency, idempotency, timeout, uncertainty, ordering;
   - minimal design: reuse, duplicate fields, parallel APIs, speculative abstractions;
   - deliverability: task, RED/GREEN, real entry, DB/log evidence, acceptance result.
4. For database-backed changes, invoke `superflow-table-impact-analysis`, or record an equivalent
   downgrade when unavailable.
5. Create or update `requirement-review.md` with baseline, closure matrix, findings, minimal-design
   review, remediation evidence, and final verdict. Its front matter must record the exact
   machine-readable result. PASS requires `review_verdict: PASS`,
   `implementation_readiness: READY`, `open_blockers: 0`, `open_external_contracts: 0`,
   `open_source_investigations: 0`, and `open_owner_decisions: 0`; otherwise use BLOCKED and real
   counts. Include an `Open Blockers` table with category, affected implementation contract,
   resolution owner, next evidence/question, and status.

Use finding levels:

- `BLOCKER`: incorrect requirement fact, API/DB/status/security/entry/acceptance contract.
- `IMPORTANT`: likely omission, rework, or untestable behavior that docs must correct.
- `SUGGESTION`: non-blocking improvement for owner judgment.

Each finding records ID, level, dimension, location, issue, evidence, impact, minimal correction,
and status.

## Remediation And Re-review

For every confirmed `BLOCKER/IMPORTANT` finding:

1. Repair the canonical source document, not only the review report.
2. Synchronize affected API, design, spec, SQL, tasks, tests, traceability, and quality gates.
3. Record `finding -> repaired file -> test/evidence` closure.
4. Return to `superflow-clarify` if remediation changes an owner-confirmed contract.

Re-review from the original sources and code evidence. Pass only when all blocking/important
findings are closed, contract drift is explained, minimal-design review passes, source
investigations are exhausted, owner decisions are recorded, and implementation-affecting
external contracts are evidenced and frozen. Only execution evidence that cannot change the
implementation contract may remain blocked in tests or release readiness.

After remediation, refresh handoff, run the docs guard and strict OpenSpec validation, and record
the report path and verdict in `sdd-quality-gate.md` and `test-report.md`.

## Prohibitions

- Do not review product text without source and real-entry evidence.
- Do not infer current behavior from a permissive data model.
- Do not accept non-null values, HTTP 200, or compilation as semantic correctness.
- Do not invent fallbacks, defaults, states, or compatibility layers to close findings.
- Do not store findings in another workflow namespace.
- Do not pass docs/design with unresolved blocking findings.
- Do not close an implementation-affecting external contract because it is documented, assigned
  to an owner, or deferred to integration.
- Do not combine `review_verdict: PASS` with `implementation_readiness: BLOCKED`.
