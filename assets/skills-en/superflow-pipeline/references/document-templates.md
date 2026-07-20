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
