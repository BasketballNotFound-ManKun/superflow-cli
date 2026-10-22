# Main Implementation Prompt Template

## Thin Prompt Contract

The artifact is `prompt/implementation.md`: one execution navigator, not a second
business design. Use this shape for every execution mode and retain declared
build_mode/isolation/tdd_mode/review_mode. HOW, algorithms, SQL and commands remain
owned by design/technical_design, release-sql and tests respectively. Read
[Flow Owner](flow-owner.md), [test guide](test-guide.md) and the
[Reviewer checklist](reviewer-checklist.md), rather than copying their procedures
into every batch.

## Output order

1. Goal, confirmed authorization, exclusions and current workspace.
2. **Canonical links** to spec/API/design/technical_design/tasks/tests, applicable contracts, quality gates and release-sql.
3. **Execution navigation** below; **Acceptance IDs** come from existing coverage.
4. Execution strategy and recovery location: declared modes, dependencies, next incomplete task and test-report.
5. Delivery reconciliation: actual cases/entries/versions, open findings, independent re-review and resources; verify Git authorization separately.

## Execution navigation

| Prompt | Task IDs | Entry IDs | Case IDs |
|---|---|---|---|
| [This execution](implementation.md) | 1.1, 1.2 | E1, E2 | C1, C2 |

With only a main prompt, link to itself. For batches, link each actual batch from
this table, such as `[Batch one](batch-a.md)`. Each batch links back to the main
prompt and declares the same ID sets as its main-table row. Check task existence
with the current tasks index; check relationships using existing
`coverage.decisions.taskIds/caseIds` and `coverage.cases.entryId`.
VERIFY_EXISTING may have no new implementation task; EXCLUDED must not invent a
case. Navigate every applicable case/task and satisfy actual predecessors.

## Example artifact

```markdown
# Implementation navigation
## Goal and authorization
Deliver the approved scope; Git, publication and archive each follow confirmed authorization.
## Canonical links
- [Behavior](../api.md), [HOW](../design.md), [Tasks](../tasks.md)
- [Acceptance and execution context](../tests.md), [Traceability](../traceability-matrix.md)
- [Current handoff](../.sdd/handoff/sdd-context.json)
## Execution navigation
| Prompt | Task IDs | Entry IDs | Case IDs |
|---|---|---|---|
| [This execution](implementation.md) | 1.1, 1.2 | E1, E2 | C1, C2 |
## Execution strategy
Inherit declared modes and continuously implement, verify, review, repair and actually re-review ready tasks.
Keep the recovery point and this run's evidence in ../test-report.md.
```

## Contract inheritance

Preserve `context_compression`, check the state binding and current manifest, then
read canonical bodies required by the Decision/Entry/Case risk. Do not unconditionally
read a full projection and then every original again. `technical_design` owns
source-level HOW. Reference Field And Status Reverse Impact and external enum,
configuration, concurrency/idempotency or money precision contracts only where
applicable. The navigator inherits constraints without redesigning business logic.
For database changes reference release-sql.md; copy its SQL verbatim to target_sql_path
and verify sql_sha256 there. Prompts do not duplicate SQL, raw hashes or commands.

## Owner Mode Prompt Generation Contract

The current Agent implements/tests authorized work and coordinates required
independent reviewers; preserve frozen team/subagent boundaries. Continue ready
tasks after updates. Stop dependent work only for real decisions, unavailable
permissions/environment, user pauses or existing non-convergence limits. New caller
or entry discoveries return to the current document owner to repair canonical
bodies/consumers and refreeze before continuing. Delivery references the actual
current independent report and its history/response/re-review chain. Missing required
checks or unresolved items remain PARTIAL/Blocked. Session exit provides no background
wake-up; retain task, evidence, resources and next action for recovery.

Runtime test-report is evidence: reference it without projecting its body in every context_compression mode.
