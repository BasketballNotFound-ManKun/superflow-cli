# Batch Prompt Template

## Thin Prompt Contract

The artifact contains only this batch's navigation: main-prompt link,
Task/Entry/Case IDs, file scope, predecessors and recovery location.
**Canonical links**, applicability and shared strategy are inherited from the main
prompt; **Acceptance IDs** reference tests. All execution modes use the same shape.

## Current batch

```markdown
# Batch A
## Execution navigation
| Prompt | Task IDs | Entry IDs | Case IDs |
|---|---|---|---|
| [Main prompt](implementation.md) | 1.1 | E1 | C1 |
## Files and dependencies
- Files: read exact modification boundaries from this batch's task/HOW references.
- Predecessors: list actual completed dependencies; handle incomplete ones first.
## Recovery and delivery
Continue under the inherited strategy and write actual results, open findings and next action to test-report's current record.
```

The three ID sets match this batch's row in the main table and come from the same
coverage/task indexes. Batches may reuse an entry with different cases; identical
text with different batch numbers is not a task decomposition.

## Reading and execution

Preserve `context_compression` and verify the current manifest. Use the
Decision/Entry/Case index to read canonical bodies for this batch. Technical HOW,
risk contracts, verbatim SQL, real-environment duties and independent review are
owned by the main prompt's canonical references; this batch adds its file,
dependency and recovery differences. Repair conflicting bodies
and consumers before refreshing handoff/readiness. Existing modes, isolation and
authorization remain authoritative. Use the [main template](implementation-prompt-template.md),
[test guide](test-guide.md) and [Reviewer checklist](reviewer-checklist.md).

Runtime test-report is evidence: reference it without projecting its body in every context_compression mode.
