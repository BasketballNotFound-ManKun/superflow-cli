# Feature-Gated Requirement Workflow

Use this for long PRDs, online docs, screenshots, prototypes, or mixed feature
requests. Process one feature at a time.

## Artifacts

- source-ingestion.md: source list, section range, screenshots, and read status.
- feature-inventory.md: feature list, priority, owner, and dependency.
- feature-gates.md: per-feature status: pending, clarifying, frozen, blocked.
- ui-contract.md: screen field to API/DTO/DB/test mapping.
- gap-analysis.md: unknowns, contradictions, and owner decisions.
- spec-freeze-review.md: final frozen scope and excluded items.
- source-code-audit.md: source fact freeze card, evidence classifications,
  conflict audit, and question eligibility gate.

## Gate

Do not generate full OpenSpec docs until the target feature is frozen.
For existing-system work, understand-anything is locator evidence only. Confirm
current behavior from source, Mapper/SQL, real callers, and read-only DB data
when needed. Classify current versus legacy/unmounted/data-model-only paths and
audit any List/orderIds/batchInsert/one-to-many signal that conflicts with a
single-item real entry before asking an owner question.
