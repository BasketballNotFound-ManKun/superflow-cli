# Quality Gate Checklist

## Documentation Gate

- Requirements processed feature by feature and frozen.
- API contract generated before implementation.
- spec/design/tasks/tests/review/quality/report files exist.
- Traceability covers requirement, design, task, test, prompt, and report.
- Handoff files exist and hash is current.
- design.md records OpenSpec/SDD as WHAT and Superpowers as HOW.
- sdd-quality-gate.md records guard command and result.

## Design Gate

- Technical design exists for full workflow.
- Field/status reverse impact matrix exists when risky fields or states change.
- Architecture boundary and call-direction matrix exists for cross-service or
  external flows.
- SQL risk review exists for DB changes.
- No fallback or guesswork is allowed without explicit owner approval.

## Implementation Gate

- Every prompt references handoff hash and technical design.
- Every prompt includes TDD RED/GREEN plan.
- Every L3/L4 test has executable command and evidence target.
- Workers update only task-local docs.
- Root aggregate docs are closed out by the leader.

## Verification Gate

- test-report.md records RED and GREEN evidence.
- Real-entry evidence is separated from mock and test endpoint evidence.
- DB and log assertions are recorded when applicable.
- superflow-test-report-lint, superflow-verify-integration, and
  superflow-delivery-check results are recorded or blocked with reasons.
