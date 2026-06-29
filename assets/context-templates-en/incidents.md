# Incidents, Rework, And Defect Reviews

> **Purpose**: Capture incidents, rework, missed tests, and integration misses
> so similar issues do not repeat.
> **Owners**: QA owner / engineering owner / module owner

## 1. Incident Index

| ID | Title | Found At | Severity | Status | Related Rule |
|----|-------|----------|----------|--------|--------------|
| INC-001 | `<Title>` | `YYYY-MM-DD` | `<P0/P1/P2/P3>` | `<Open/fixed/reviewed>` | `<business-rules/decisions>` |

## 2. Review Template

```markdown
### INC-001: <Title>

- **Found at**: YYYY-MM-DD HH:mm
- **Found by**: Production alert / QA / customer feedback / integration / code review
- **Impact**: Users, orders, data, APIs, jobs, or environments affected.
- **Immediate cause**: The technical trigger.
- **Root cause**: Why design, process, tests, or code failed to catch it earlier.
- **Fix commit / PR**: <link or SHA>
- **Verification evidence**: Test command, real request, log, DB row, or screenshot.
- **Prevention**:
  - Documentation rule: which `docs/sdd-context/*.md` file was updated.
  - Code guard: which test, assertion, alert, or guard was added.
  - Process guard: which workflow phase now checks this.
- **Reviewer**: <name>
```

## 3. Common Categories

| Category | Typical Symptom | Superflow Phase To Harden |
|----------|-----------------|---------------------------|
| Requirement drift | Field semantics, state flow, or edge case misunderstood | clarify / docs |
| Source impact missed | Only one reference changed, other consumers missed | design |
| Database contract missed | Code depends on fields that release SQL does not ship | docs / verify |
| Mock-only false pass | Mock unit tests pass but real entry fails | implement / verify |
| Async flow unverified | MQ, scheduled job, or callback lacks real evidence | verify |
| Context drift | Long session compression loses original constraints | handoff / guard |

## 4. Required Backfill

After an incident review, update at least one long-lived rule:

- Business rule issue: [business-rules.md](./business-rules.md).
- Architecture or engineering decision issue: [decisions.md](./decisions.md).
- External integration issue: [external-systems.md](./external-systems.md).
- Test strategy issue: current OpenSpec change `tests.md` and `test-report.md`.

Explaining the issue only in chat does not count as a completed review.
