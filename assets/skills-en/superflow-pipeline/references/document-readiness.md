# Document Delivery Readiness Contract

## Applicability

Declare applicability in `.openspec.yaml`. Keyword scans may suggest a risk but
must not override an explicit, source-backed decision.

```yaml
schema: superflow/v1
applicability:
  cross_repo: true
  complex_logic: true
  mermaid: required
  environment: required
  database: false
  external_config: false
  concurrency: false
  money: false
```

`money: false` means this change does not alter money calculation, rounding,
allocation, or financial display. It is not a bypass when source impact proves
that money behavior changes.

## Three-Review Receipt

Path: `.sdd/reviews/document-review.json`

```json
{
  "schemaVersion": "superflow.document-review.v1",
  "handoffHash": "<current 64-character handoff hash>",
  "verdict": "PASS",
  "openOwnerDecisions": [],
  "rounds": [
    { "round": 1, "lens": "source-contract", "inputHash": "<same hash>", "findings": [] },
    { "round": 2, "lens": "architecture-minimality", "inputHash": "<same hash>", "findings": [] },
    { "round": 3, "lens": "e2e-environment", "inputHash": "<same hash>", "findings": [] }
  ]
}
```

Do not delete findings. After repair, retain them with `"status": "closed"`,
evidence, and the closure location. Every round is rechecked against the current
hash; a PASS for an old hash is invalid.

## Environment Preflight

Path: `.sdd/readiness/environment.json`

```json
{
  "schemaVersion": "superflow.environment-readiness.v1",
  "handoffHash": "<current hash>",
  "scope": "local-dev",
  "overall": "READY",
  "ownerHelpRequired": [],
  "checks": [
    { "id": "service-config", "type": "file", "target": "../../../service-a/application-dev.yml", "status": "READY" },
    { "id": "redis", "type": "tcp", "host": "127.0.0.1", "port": 6379, "status": "READY" },
    { "id": "service-health", "type": "http", "url": "http://127.0.0.1:8080/health", "expectedStatus": [200], "status": "READY" }
  ]
}
```

Supported checks are `file`, `directory`, `executable`, `tcp`, and `http`.
Never embed credentials or tokens in URLs. Production writes and DB/Redis/MQ
mutations are not preflight operations.

## Complex Diagrams

When `cross_repo` or `complex_logic` is true, include a Mermaid
`sequenceDiagram` for the real call and a `flowchart` or `stateDiagram` for
branches, compensation owner, and forbidden fallback.

## Coding Ready

```bash
superflow check <change> --level docs
superflow check <change> --level coding-ready
```

The second command writes `.sdd/readiness/coding-ready.json`. Any SDD document
or handoff-hash change invalidates the old receipt. A developer Agent may only
receive a change with a current receipt.

## Cross-System Failure Ownership

Record `Failure signal | Interpreter | Compensation owner | Retry allowed? |
Idempotency basis | Accepted race window | Extreme fallback | Owner approval`.
Default to fail-fast, fail-closed, at-most-once, and caller-owned compensation.
Retry, reroute, resend, or distributed compensation requires explicit owner
approval and a proven idempotency basis.
