# Business Rules

> **Purpose**: Capture long-lived project business rules, edge cases, state
> transitions, and acceptance criteria.
> **Owners**: Product owner / business owner / engineering owner
> **Maintenance**: `superflow init --language en` creates this template. Fill it
> with project-specific facts before relying on it for delivery decisions.

## 1. Core Business Objects

| Object | Meaning | Uniqueness Rule | Lifecycle States | Key Constraints |
|--------|---------|-----------------|------------------|-----------------|
| `<Object A>` | `<Meaning>` | `<Unique key>` | `<States>` | `<Constraints>` |
| `<Object B>` | `<Meaning>` | `<Unique key>` | `<States>` | `<Constraints>` |

## 2. State Transitions

| State | Entry Condition | Allowed Actions | Forbidden Actions | Exit Condition |
|-------|-----------------|-----------------|-------------------|----------------|
| `<State A>` | `<Condition>` | `<Actions>` | `<Actions>` | `<Condition>` |
| `<State B>` | `<Condition>` | `<Actions>` | `<Actions>` | `<Condition>` |

Rules:

- When a state field, enum, derived value, or sync value changes, reverse-scan
  all readers, writers, filters, exports, scheduled jobs, callbacks, and
  cross-repo consumers.
- Record the real source of truth for derived state. Do not infer semantics
  from field names alone.
- Compatibility or fallback behavior must name the owner, removal condition,
  and observability plan.

## 3. Critical Business Rules

| ID | Rule | Applies To | Edge Case | Acceptance Evidence |
|----|------|------------|-----------|---------------------|
| BR-001 | `<Rule>` | `<Page/API/job>` | `<Edge case>` | `<Test/evidence>` |
| BR-002 | `<Rule>` | `<Page/API/job>` | `<Edge case>` | `<Test/evidence>` |

## 4. Data And Permission Boundaries

| Dimension | Rule | Evidence Source |
|-----------|------|-----------------|
| Tenant / organization / project | `<Isolation rule>` | `<Source/config/table>` |
| User roles | `<Permission rule>` | `<Menu/API/auth point>` |
| Data visibility | `<Query scope>` | `<Mapper/API/page>` |
| Write permissions | `<Mutation rule>` | `<Service/transaction/audit>` |

## 5. Batch, Import, Export, And Error Rules

- Batch operations must define all-or-nothing vs partial-success behavior.
- Import templates must define required fields, formats, enums, duplicates, and
  empty-file behavior.
- Export fields must match page/API semantics; document intentional differences.
- Error messages must identify the object, row, field, or concrete fix.

## 6. Real Acceptance Evidence

Requirements involving external systems, databases, async jobs, message queues,
payments, files, permissions, or state transitions cannot be closed with mock
unit tests alone. `test-report.md` should record:

- Real entry point: page, API, message, scheduled job, or external callback.
- Real parameters: request body, message payload, file sample, or test account.
- Real result: response, database record, log, downstream callback, or UI state.
- Assertion: expected vs actual values.

## 7. Maintenance Notes

- Keep project facts here, not generic process slogans.
- After incidents, rework, or integration misses, add reusable rules here.
- Mark uncertain rules as `To confirm`, with owner and evidence source.
