# Implementation Prompt Template

Use this as the prefix for every implementation prompt.

## Context Drift And State Inheritance

- Handoff: [.sdd/handoff/sdd-context.md](../.sdd/handoff/sdd-context.md)
- Handoff JSON: [.sdd/handoff/sdd-context.json](../.sdd/handoff/sdd-context.json)
- Handoff hash: {handoff_hash}
- State: .sdd/state.yaml

If any SDD/OpenSpec doc changes, rerun superflow-handoff.sh --refresh and compare
the new hash before continuing.

## Contract Boundary

OpenSpec/SDD is canonical for requirements, API, DB, SQL, tests, and acceptance.
Superpowers technical design is canonical for source-level HOW and execution.

## Required Preflight

- Real entry located.
- Field semantic contract checked.
- Write-loop checked.
- No-fallback boundary confirmed.
- RED test executed.
- Allowed and forbidden files confirmed.
- Blockers listed.

## Completion Gate

Do not claim completion until build/test, real-entry execution, DB/log evidence,
test-report update, and SuperBridge Flow hook scripts pass or are marked blocked
with concrete reasons.
