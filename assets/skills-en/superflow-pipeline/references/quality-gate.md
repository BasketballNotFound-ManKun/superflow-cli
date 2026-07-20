# Quality Gate Checklist

## Documentation Gate

- Requirements processed feature by feature and frozen.
- API contract generated before implementation.
- spec/design/tasks/tests/review/quality/report files exist.
- Traceability covers requirement, design, task, test, prompt, and report.
- Handoff files exist and hash is current.
- design.md records OpenSpec/SDD as WHAT and Superpowers as HOW.
- sdd-quality-gate.md records guard command and result.
- design.md and sdd-quality-gate.md include a Minimal Design Review with reuse
  evidence, necessity, simplest implementation, removed/rejected complexity,
  counts of new tables/fields/APIs/services/caches/async flows/jobs/compatibility
  layers, and a PASS/BLOCKED verdict. Only PASS may leave docs/design.

## Design Gate

- Technical design exists for full workflow.
- Technical design repeats the Minimal Design Review at source level. It extends
  existing modules first and rejects speculative abstractions, parallel APIs or
  models, derivable persistence, premature caches, and async compensation when
  a direct synchronous design satisfies the contract.
- Field/status reverse impact matrix exists when risky fields or states change.
- Architecture boundary and call-direction matrix exists for cross-service or
  external flows.
- External Integration Configuration And Deployment Contract exists for
  third-party platforms/tools, SDKs, MQ/Kafka, callbacks, payment providers,
  cloud services, or other external integrations. It inventories environment
  sources and provisioning for endpoints, app/tenant/project IDs,
  Topic/Tag/Consumer Group, namespace, webhook, ACL/role, switches, timeouts,
  and credential references; names runtime/provisioning owners, timing,
  readiness evidence, rollback, secret handling, and blockers; and forbids
  environment-dependent hard-coded values. Test auto-creation, existing test
  resources, or local startup do not prove production readiness.
- Concurrency And Idempotency Ownership exists for concurrent requests, batch
  issue/activation/renewal, duplicate callbacks/consumption, or repeated
  external delivery. It defines the business idempotency key,
  application-layer atomic claim owner, short transaction boundary,
  PENDING/SUCCESS/FAILED state machine, retry code reuse, external-call
  boundary, and uncertain-result reconciliation. A unique index is not the
  default; it is only an optional fallback with explicit natural uniqueness,
  historical cleanup, NULL/soft-delete behavior, and conflict handling.
- Money precision boundary exists when amount, fee, discount, deduction,
  refund, sharing, payment, invoice, balance, electricity fee, service fee,
  package settlement, proration, allocation, reconciliation, or financial
  display changes. It must separate calculation state from settlement/display
  state, forbid early rounding, and include half-cent, residual, or
  multi-detail allocation evidence. For additive identities, it must name the
  authoritative total and derive the final complement as `authoritative total -
  sum(other components)` instead of calculating and rounding every component
  independently.
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
