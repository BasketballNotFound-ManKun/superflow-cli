# Architecture Design Template

Use this when designing a new module or a cross-service change.

## Required Content

- Context and goals.
- Existing architecture evidence: entry points, owners, services, queues,
  scheduled jobs, SDKs, adapters, and storage.
- Target module boundaries.
- Call direction table: step, caller, callee, owner module, allowed or forbidden,
  evidence anchor, and reason.
- Data model and persistence responsibility.
- Failure handling, retries, idempotency, and observability.
- Real-entry verification plan.

## Boundary Rule

Do not justify a design only because code can call another module. Prove that the
call direction matches ownership and the existing architecture contract.
