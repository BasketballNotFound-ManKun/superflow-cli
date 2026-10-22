---
name: superflow-handoff
description: Use when SDD/OpenSpec contract docs and Superpowers technical design exist and implementation prompts, batch plans, worktree plans, TDD strategy, reviewer/tester checkpoints, validation plans, or test-report updates are needed.
---

# SDD Handoff

## Preconditions

Read [decision continuity](../superflow/references/document-templates.md#behavior-decision-matrix),
[final HOW inputs](../superflow/references/document-readiness.md#final-document-review-inputs)
and [traceability](../superflow/references/traceability-matrix.md). superflow-propose
owns base OpenSpec artifacts; this phase owns execution navigation, not a new API,
database, technical design or acceptance strategy.

Full SDD needs proposal/spec/API/design/tasks/tests, traceability, quality gates,
test-report and review checklist, with state.technical_design pointing to real HOW.
Return missing contracts to superflow-contracts/design; changed behavior or
authorization returns to superflow-clarify rather than an implementer's guess.

## Canonical body repair

Use [body repair](../superflow/references/document-readiness.md#canonical-body-repair)
to update canonical text and consumers together. Full SDD uses observed-delivery.v1;
execution cases freeze runner-captured.v1 and executionContext. Old incomplete
receipts/prompts must be regenerated and reviewed under current rules.

## Generate one navigation contract

Read the [main template](../superflow/references/implementation-prompt-template.md#thin-prompt-contract).
Generate prompt/implementation.md in this order: goal/authorization, Canonical links,
Execution navigation, strategy/recovery and delivery reconciliation. Reference
canonical behavior, source HOW, tests, applicable SQL and risk contracts without
copying algorithms, SQL, raw hashes or commands. Shared constraints remain binding
through that one main entry.

Generate [batches](../superflow/references/batch-prompt-template.md) only for actual
work decomposition. A single main prompt is sufficient; batch numbers do not create
a need for batches. Each batch holds the main link, its Task/Entry/Case IDs,
files/dependencies/recovery, without duplicating full checklists or inapplicability prose.

Use `| Prompt | Task IDs | Entry IDs | Case IDs |` on both hosts. Main rows link
actual batches; batch rows link back with matching ID sets. A single-main row links
to itself. Task existence comes from the tasks index, relationships from existing
coverage.decisions.taskIds/caseIds and cases.entryId. VERIFY_EXISTING may have no new
task; EXCLUDED cannot invent case coverage. Registered IDs do not prove entry
completeness; source-contract reviewers still reverse-search real callers.

## Preserve execution ownership

Inherit selected build_mode/isolation/TDD/review from [Flow Owner](../superflow/references/flow-owner.md).
Ordinary new work uses the current Owner for implementation/testing and required
independent perspectives. Preserve frozen team/subagent and independent-Tester
duties without generating mandatory team scripts. Document-only authorization does
not permit coding; Git, publication and archive each require existing explicit
authorization. Continue authorized work rather than asking after every phase.
After compaction read the recovery point and resume incomplete actions.

Verification inherits [the test guide](../superflow/references/test-guide.md) and
current tests.md commands/assertions/environment. Keep credential sources rather
than secrets or personal paths. Startup/login/DB/device/browser work applies only
when frozen as required; no generic captcha, curl, Maven or port is imposed.
Reuse valid evidence and rerun affected or contract-required paths.

## Freeze and verify current handoff

Preserve explicit context_compression and use the manifest's Decision/Entry/Case
index to read required canonical bodies. Refresh with the installed sibling
../superflow/scripts/superflow-handoff.sh and --check mode/source/body identity.
Keep the existing canonical hash algorithm: .sdd/state.yaml owns the binding,
sdd-context.sha256 and manifest own identity. Link them instead of embedding hashes.

Finish body/consumer changes before a common freeze and actual three-view document
review/incremental recheck; do not repeatedly send stale hashes while still editing.
Source, runtime evidence and task checkboxes retain their owners. Progress and
test-report updates do not change frozen requirement identity.

## Document Delivery Exit

The four aggregates tasks/traceability-matrix/sdd-quality-gate/test-report link the
actual generated prompts. Review current final HOW under
[the shared inputs](../superflow/references/document-readiness.md#final-document-review-inputs).
Actually run `superflow check <change> --level coding-ready` and verify exit code and
current receipt. Failure means Blocked for docs and repair by the relevant phase,
not a contract to improvise while coding. Handoff to build only after current
readiness. Document-only work stops; authorized implementation continues via superflow-build.

## Review repair handoff

Preserve the [Reviewer](../superflow/references/reviewer-checklist.md)'s original
state/report. Owner records per-finding responses and evidence separately. Actual
independent re-review creates a new report linked to the original and response.
Hashes or a clean projection do not replace a real return. Missing required tests,
open findings or absent re-review remain PARTIAL/Blocked, never a rewritten conclusion.

Runtime test-report remains reference-only in every context_compression mode; progress is not a second frozen contract.
