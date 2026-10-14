# Document Templates

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
- Level L0-L4
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

Select applicable signals using [test-guide.md](test-guide.md), keeping project level numbers.
Table: `Change/risk | Case ID | Signal | Actual environment/backend | Command | Assertion | Evidence path | Inapplicability reason/blocker`.
Database layers inherit only `testLayer` / `mockBoundary` from
[document-review-coverage.md](document-review-coverage.md). Reuse project scenario
regression assets for critical business flows and bug reproductions.

Freeze operation chains, valid empty responses, anomaly regressions, and startup
scripts under test-guide.md. tests.md references the existing single-command entry
and verified settings; templates do not duplicate business policies. Report
simulated/real/browser boundaries per case set.
