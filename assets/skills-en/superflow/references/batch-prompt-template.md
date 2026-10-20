# Batch Prompt Template

## Thin Prompt Contract

Every execution mode uses this thin Prompt structure. Long scripts below are applicability
references, not text to copy wholesale. The main Prompt is the sole contract navigator; batch
Prompts link to it and contain only their incremental scope:

| Part | Generated content |
|---|---|
| Canonical links | Current handoff, Decision ID matrix, technical design, tasks/tests and applicable gates |
| Execution policy | Inherited mode/isolation/TDD/review, authorization, stopping and recovery boundaries |
| Incremental goals/files | Batch task IDs, dependencies, exact file scope, order and exclusions |
| Acceptance IDs | Batch entry/case IDs and tests.md command/assertion/evidence section links |
| Delivery reconciliation | Task/case outcomes, independent review, blockers and recovery location |

Inherit matrices by link and ID instead of copying tables; maintain actual commands/assertions only
in tests.md. Keep applicability reasons with their canonical owner, without repeating “money not
applicable” in every batch. Read and verify SQL content, target path and sql_sha256 only from
release-sql.md; do not hard-code their values in Prompts. Existing handoff/hash checks still apply.
The current document owner resolves contract conflicts and refreshes handoff before execution;
implementers cannot choose a competing design inside the Prompt.


## Execution mode inheritance

Read [Flow Owner](flow-owner.md) and inherit the selected technical-design/state
mode. New ordinary work defaults to `owner`: the current Agent implements and
tests, coordinating independent views according to risk and frozen obligations.
Preserve team/subagent roles and isolation when selected. Team checklists below
define responsibilities; a separate Tester is fixed only when required by the
contract. Self-tests are not independent verification. Continue all work,
verification, review, repair, and delivery after updates; do not commit to save
progress. Document-only work does not execute code.


Inherit verification only from tests.md and read [test-guide.md](test-guide.md).
Apply startup, API, DB, and team checklists to frozen applicable cases; give source
reasons for inapplicability, keeping missing required environments blocked. Reuse
healthy instances matching the tested build; load new code/configuration before
verification. Independently inspect raw evidence; implementers rerun invalidated
or contract-required paths, not every environment merely because roles changed.

## Owner-mode prompt generation contract

When `build_mode: owner` is selected, generate the actual batch prompt using
this structure instead of copying the Team/Subagent playbook below. Retain all
required contracts, applicable tests, and independent-verification obligations.

1. **Goal and scope**: authorization, task IDs, exact files, dependencies,
   exclusions, and actual isolation.
2. **Required reading and source-level HOW**: link handoff, api.md, design.md,
   tasks.md, tests.md, quality gate, review checklist, technical_design, and
   applicable release-sql.md.
3. **Execution decisions**: record `build_mode: owner`, isolation, tdd_mode,
   review_mode, implementation_prompt, current implementation/test responsibility,
   and actual required independent Reviewer/Tester responsibilities.
4. **Contract inheritance**: carry every applicable semantic, write-loop, impact,
   and real-entry contract required by the phase skill, plus frozen case IDs,
   commands, assertions, and evidence paths. Add no business design or raw hash copy.
5. **Continuous execution**: dependency-ready work, applicable RED/GREEN and real
   verification, required independent review, repair/retest/review, existing verify
   gates. Continue after updates; return only at an actual stop boundary.
6. **Recovery and delivery**: Owner Recovery in test-report, resource identity
   and cleanup, evidence/remaining-item reconciliation, and existing operation
   authorization for Git, release, and archive.

## Team/Subagent mode template

The following playbook is for selected team/subagent execution; ordinary owner
mode uses the generation contract above.

## Header

- Batch: P{n} - {name}
- Goal: {business closure}
- Change directory: {path}
- Worktree: {path}
- Branch: {branch}
- Ports: app={port}, debug={port}
- Handoff: .sdd/handoff/sdd-context.md
- Handoff binding: `.sdd/state.yaml` → `.sdd/handoff/sdd-context.sha256`; link the context pack without copying the hash into this prompt.
- Technical design: {path}

## Required Reading

List handoff, api.md, design.md, tests.md, tasks.md, traceability-matrix.md,
review-checklist.md, sdd-quality-gate.md, test-report.md, and technical design.

## Execution Rules

- Follow OpenSpec/SDD for WHAT and contract.
- Follow Superpowers technical design for source-level HOW.
- For database changes, read `release-sql.md`, copy its single SQL block
  verbatim to the exact `target_sql_path`, and verify `sql_sha256`. Never
  author, append, reorder, split, or optimize SQL during implementation. Return
  omissions to docs and refresh the handoff.
- Do not change forbidden files or root aggregate docs from a worker batch.
- Use TDD: record RED failure before GREEN success.
- Do not mark mock-only or unit-only evidence as real integration.
- For third-party platforms/tools, SDKs, MQ/Kafka, callbacks, payment
  providers, cloud services, or other external integrations, inherit
  `External Integration Configuration And Deployment Contract`. Cover
  local/test/production sources and provisioning, injection/creation,
  runtime/provisioning owners and timing, readiness evidence, rollback, secret
  handling, and blockers. Do not hard-code environment-dependent values or
  infer production readiness from test auto-creation.
- Link frozen Concurrency And Idempotency Ownership decisions, per-entry transaction
  boundaries and Case IDs; verify applicability and effective source paths. The Prompt
  does not select PENDING states, short transactions or an atomic-claim design.
  Repeated external actions inherit their idempotency contract; content saves inherit
  their revision-conflict/whole-operation rollback contract. Missing decisions return
  to the document owner, not template examples. Required concurrency, idempotency,
  rollback and real-entry verification still execute.
- For monetary changes, inherit `Money Precision Boundary`, retain
  calculation-state precision until the confirmed settlement/display boundary,
  record scale and rounding mode, forbid early rounding before slicing or
  allocation, and define deterministic residual handling. For additive
  identities, calculate only N-1 components independently and derive the final
  complement as `authoritative total - sum(other components)`; do not calculate
  and round every component independently.
- Inherit `money-precision-algorithms.md`: exact decimal construction, currency
  and provider minor units, rounding policy source, deterministic residual
  tie-breaker, signed-value tests, and conditional FX conversion metadata.

## Implementation Steps

Number each step and link it to design.md and tests.md.

## Acceptance Commands

Include build, unit test, integration test, real API/event execution, DB query,
log check, and hook commands.

## Report Format

- Scope completed
- Files changed
- Commands executed
- RED evidence
- GREEN evidence
- Real-entry evidence
- DB/log evidence
- Hook evidence
- Money precision evidence: half-cent/residual/multi-detail cases and
  reconciliation of original, discount, actual, and allocated totals
- Deviations
- Blockers
