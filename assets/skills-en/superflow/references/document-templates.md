# Document Templates

## Behavior Decision Matrix

Before generation, the Agent determines domains from actual changes, call chains and read/write
impact. Freeze true/false in existing `.openspec.yaml` applicability.money / applicability.concurrency
with document evidence; do not create a second applicability file. For false domains, generated
documents/Prompts omit those domain sections and repeated N/A keywords. Deleting prose, rewording
or declaring false cannot hide real money/concurrency risks. Existing domain guards and Agent
semantic review still assess applicable risks; unknown remains under investigation, not false.

Maintain one behavior decision matrix in design.md. proposal/spec/api/technical design/tasks/tests
reference its Decision ID and canonical section while retaining their necessary details.
superflow-clarify owns confirmed goals/scope; superflow-contracts owns WHAT/API/data/acceptance;
superflow-design owns source HOW; superflow-handoff generates handoff only. This indexes existing
document owners, without new state, approval or truth sources. Before design exists, record decision
IDs in proposal; move them into the matrix with backlinks when design is written.

| Decision ID | Confirmed behavior/exclusion | Canonical owner (file#section) | Requirement/entry ID | Consumer references (proposal/api/HOW/tasks/tests) | Confirmation evidence/status |
|---|---|---|---|---|---|
| <D-ID> | <condition→behavior→side effects> | <single owner> | <R/E-ID> | <section or task/case ID> | <actual evidence or unresolved> |

### Conflict resolution

Before generating or refreshing handoff, the current document owner compares scope, defaults,
rejection policy, write timing, transactions/rollback and acceptance row by row. Repair stale
summaries, non-goals, tasks and examples within confirmed scope; return to clarification when
confirmed behavior would change. Unresolved conflicts, unknown source facts or new decisions
remain not ready. Saying “document X wins” does not resolve a contradiction for implementers.
Repair every consumer reference, then refresh handoff and rerun existing review gates.

Activate concurrency, money, database and external-integration domains independently from confirmed
scope and source evidence. Record inapplicability once with its canonical owner; consumers reference
it. Empty tables, placeholders, examples and template defaults are not decisions. A template does
not create domain obligations or reduce applicable mandatory verification gates.


## proposal.md

- Problem
- Goals
- Non-goals
- Scope
- Risks
- Open questions

## api.md

- Endpoint and message contracts
- Field mapping
- Compatibility
- Examples
- Test commands

## design.md

- Source-of-truth contracts
- Architecture boundary
- Data model
- Minimal Design Review: reuse evidence, necessity, simplest implementation,
  removed/rejected complexity, and blockers
- Count every new table, field, API, service, cache, async flow, scheduled job,
  and compatibility layer; remove items without evidence
- New-item counts: tables 0; fields 0; APIs 0; services/components 0; caches 0; MQ/events 0; scheduled jobs 0; compatibility layers 0. Replace each count.
- Field semantics
- Write/read loop
- No-fallback decisions
- Record each confirmed behavior decision in the body with an actual date,
  owner and conclusion: `owner-decided: YYYY-MM-DD | owner: <name/role> | decision: <confirmed conclusion>`.
  Instructions, block quotes, code examples and unfilled placeholders are not
  confirmation. Gates check structure/date only; Agents review provenance and adequacy.
- Superpowers technical design handoff

## release-sql.md (required for database changes)

- Front matter: `database_change: true`, exact `target_sql_path`,
  `copy_policy: verbatim`, and normalized payload `sql_sha256`
- Exactly one complete executable `sql` block with required prechecks,
  DDL/DML, migration, and post-verification
- No placeholder path or deferred SQL design
- Implementation agents only copy the block verbatim and verify the hash;
  omissions return to docs

## tests.md

- Case ID
- Existing project level, where applicable
- Preconditions
- RED expectation
- GREEN expectation
- Command
- Response, DB, and log assertions
- Evidence location in test-report.md

## test-report.md

- Environment
- Commands
- RED evidence
- GREEN evidence
- Real-entry evidence
- DB/log evidence
- Hook output
- Blocked or skipped cases with reasons

## tests.md: frozen verification signals

Select applicable signals using [test-guide.md](test-guide.md), retaining existing project levels
where applicable. Existing case prose/tables express change/risk, Case ID, signal, actual
environment/backend, command, assertion, evidence and inapplicability/blockers; templates do not
create fixed tables or levels.
Database layers inherit only `testLayer` / `mockBoundary` from
[document-review-coverage.md](document-review-coverage.md). Reuse project scenario
regression assets for critical business flows and bug reproductions.

Freeze operation chains, valid empty responses, anomaly regressions and startup scripts under
test-guide.md. Applicable version/snapshot cases inherit project decisions/Cases for loading,
continued saving after success, auxiliary refresh/internal re-save, coherent content/token,
content-write/bump consistency, real commit/rollback and external effects. tests.md references
existing single-command entries and verified settings; templates do not choose business policies.
Report simulated/real/browser boundaries per case set.
