# Batch Prompt Template

## Header

- Batch: P{n} - {name}
- Goal: {business closure}
- Change directory: {path}
- Worktree: {path}
- Branch: {branch}
- Ports: app={port}, debug={port}
- Handoff: .sdd/handoff/sdd-context.md
- Handoff hash: {hash}
- Technical design: {path}

## Required Reading

List handoff, api.md, design.md, tests.md, tasks.md, traceability-matrix.md,
review-checklist.md, sdd-quality-gate.md, test-report.md, and technical design.

## Execution Rules

- Follow OpenSpec/SDD for WHAT and contract.
- Follow Superpowers technical design for source-level HOW.
- Do not change forbidden files or root aggregate docs from a worker batch.
- Use TDD: record RED failure before GREEN success.
- Do not mark mock-only or unit-only evidence as real integration.

## Implementation Steps

Number each step and link it to design.md and tests.md.

## Acceptance Commands

Include build, unit test, integration test, real API/event execution, DB query,
log check, and hook commands.

## Report Format

- Scope completed
- Files changed
- Commands executed
- RED evidence
- GREEN evidence
- Real-entry evidence
- DB/log evidence
- Hook evidence
- Deviations
- Blockers
