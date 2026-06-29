---
name: superflow-implement
description: Use when SDD/OpenSpec contract docs and Superpowers technical design exist and implementation prompts, batch plans, worktree plans, TDD strategy, reviewer/tester checkpoints, validation plans, or test-report updates are needed.
---

# SuperFlow Implement

## Role

This phase turns frozen contracts and source-level technical design into safe
execution prompts. It does not rewrite the WHAT. OpenSpec/SDD remains canonical
for requirements, API, DB, SQL, tests, and acceptance gates. Superpowers owns the
source-level HOW and the execution plan.

## Entry Gate

Before generating prompts, reload and verify:

- .sdd/state.yaml
- .sdd/handoff/sdd-context.md
- .sdd/handoff/sdd-context.json
- .sdd/handoff/sdd-context.sha256
- api.md
- design.md
- tasks.md
- tests.md
- traceability-matrix.md
- review-checklist.md
- sdd-quality-gate.md
- test-report.md
- technical_design from state, when present

Run:

- ../superflow-pipeline/scripts/superflow-yaml-validate.sh <change-dir>
- ../superflow-pipeline/scripts/superflow-guard.sh <change-dir> design --apply

If docs changed, run:

- ../superflow-pipeline/scripts/superflow-handoff.sh <change-dir> --refresh
- ../superflow-pipeline/scripts/superflow-state.sh init <change-dir> docs
- ../superflow-pipeline/scripts/superflow-guard.sh <change-dir> docs

## Prompt Contract

Every implementation prompt must include these sections:

- Required reading: handoff, API contract, design, tests, quality gate,
  review checklist, traceability, and technical design.
- Context drift and state inheritance: clickable handoff link, handoff_hash,
  current phase, and refresh rules.
- Superpowers technical design inheritance: source-level HOW, TDD entry points,
  team roles, reviewer/tester checkpoints, risky assumptions, and forbidden
  improvisation.
- State-machine execution decision: build_mode, isolation, tdd_mode,
  review_mode, implementation_prompt, and worktree ports.
- Platform impact discovery: code search scope, modules, APIs, tables,
  regression points, and evidence anchors.
- Existing code and data relationship check: real entry, mapper/XML, entity,
  DTO, converter, SQL, scheduled job, MQ, callback, and sibling repo references.
- Field semantic contract: source field, source meaning, target field, target
  meaning, equivalence, evidence anchor, forbidden usage, and owner for unknowns.
- Write-loop verification: business action, setter/assignment, converter, mapper
  insert/update, DB column, downstream reader, consumer entry, SQL check, test
  case.
- Real-entry call chain: user or external action, upstream service, repository
  entry point, async callback, DB state, downstream consumer, and validation
  method.
- No fallback or guesswork: any default, silent skip, alternate field, retained
  stale value, or compensation must be approved with owner, monitoring, exposure,
  and removal rules.
- TDD red-green plan: failing test evidence before the fix, green evidence after
  the fix, and regression command.
- Interface automation checklist: base URL, auth flow, request body, response
  assertion, DB assertion, log assertion, and external callback evidence when
  relevant.
- Agent preflight checklist: real entry located, field contract checked,
  write-loop checked, no-fallback boundary confirmed, RED test run, allowed
  files, forbidden files, blockers.
- Worktree start port: isolated worktree path, branch, app port, debug port, and
  collision fallback.
- Completion report: changed files, executed commands, real evidence, skipped
  tests with reason, design deviations, blockers, and next-batch dependencies.

## Batch Split Rules

Use references/batch-split-guide.md and references/batch-prompt-template.md.
Split by business closure, not by file type. Each batch must have independent
entry, implementation scope, verification, and report obligations.

Workers may update only their own embedded-changes/pXX-* docs. Root aggregate
docs are updated by the leader during closeout after related worktrees merge.

## Hard Gates

Block prompt generation or execution when any of these are missing:

- task-local docs for every embedded change;
- handoff files and matching hash;
- technical_design for full workflow;
- field/status reverse impact matrix when risky fields or states are touched;
- architecture boundary and call-direction matrix for cross-service or external
  flows;
- executable tests.md commands for L3/L4 or real-entry requirements;
- SQL risk review for DB changes;
- real-entry acceptance path for integrations;
- superflow-guard implement passing.

## Completion

Before moving to verify, run:

- ../superflow-pipeline/scripts/superflow-guard.sh <change-dir> implement --apply

Do not claim completion from unit tests alone. Runtime code changes require
compile/build evidence, app start evidence when applicable, real API or event
execution, DB/log checks, hook output, and test-report updates.
