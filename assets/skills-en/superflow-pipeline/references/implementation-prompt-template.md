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
- External Integration Configuration And Deployment Contract copied from the
  API, quality gate, and technical design for third-party platforms/tools,
  SDKs, MQ/Kafka, callbacks, payment providers, cloud services, or other
  external integrations. Cover local/test/production sources and provisioning,
  injection/creation, runtime/provisioning owners and timing, readiness
  evidence, rollback, secret handling, and blockers. Do not hard-code
  environment-dependent external values or treat test auto-creation as
  production readiness evidence.
- Concurrency And Idempotency Ownership copied from the technical design for
  concurrent requests, batch issue/activation/renewal, duplicate callbacks or
  consumption, and repeated external delivery. Define a stable business
  idempotency key, application-layer atomic claim owner, short transaction
  boundary, PENDING/SUCCESS/FAILED state machine, retry reuse of the original
  business code, external-call boundary, and uncertain-result reconciliation.
  Release database locks before external calls. A unique index is not the
  default; it is only an optional fallback with explicit natural uniqueness,
  historical cleanup, NULL/soft-delete behavior, and conflict handling.
- Money Precision Boundary copied from the technical design when monetary
  behavior changes. Keep calculation-state precision until the confirmed
  settlement/display boundary, record scale and rounding mode, forbid early
  rounding, and define deterministic residual allocation. For additive
  identities, name the authoritative total, calculate only N-1 components
  independently, and derive the complement as `authoritative total - sum(other
  components)`. Do not calculate and round every component independently.
- Read `money-precision-algorithms.md`; inherit exact decimal construction,
  currency and provider minor units, rounding level/mode/policy source,
  residual strategy and stable tie-breaker, pre/post-round audit, and
  positive/zero/negative tests. FX changes also inherit base/quote metadata,
  rate source/time, canonical path, and target settlement rounding.
- RED test executed.
- Allowed and forbidden files confirmed.
- Blockers listed.

## Completion Gate

Do not claim completion until build/test, real-entry execution, DB/log evidence,
test-report update, and SuperBridge Flow hook scripts pass or are marked blocked
with concrete reasons.

For monetary changes, completion also requires half-cent, residual, or
multi-detail allocation tests and reconciliation evidence proving that original,
discount, actual, and allocated totals satisfy the contract identities.
