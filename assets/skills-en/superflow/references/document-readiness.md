# Document Delivery Readiness Contract

The base review example below is not a complete receipt. From 0.5.10, also apply
[requirement × real-entry review](document-review-coverage.md): add `coverage` and
`reviewedPairs` to source-contract/e2e-environment rounds. Old receipts require re-review.

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


## Canonical body repair

Repair prose through the Behavior Decision Matrix's Canonical owner: spec/API in contracts,
HOW in design, verification in contracts' tests responsibility, navigation in handoff. The current
Flow Owner takes over these responsibilities, checks original requirements and actual code,
replaces wrong passages and updates every consumer reference. Isolate superseded decisions as
history. Search for old values, algorithms and cases; document priority cannot preserve opposite
current instructions. Refresh handoff and actual independent reviews, then Coding Ready.
Rebinding hashes or editing receipts proves neither repair nor rereview. Apply current
observed-delivery.v1; executable cases freeze runner-captured.v1 and executionContext. Missing
fields require prose repair and actual review while BLOCKED. Keep historical files PARTIAL;
every PASS receipt requires capture. Source-only implementation evolution keeps build's
checkCode:false contract checks without making implementation code immutable.

## Final document review inputs

A full workflow first completes investigation, canonical prose and full HOW. Set
state.technical_design and register its actual path in coverage.sources with role: contract.
Run `superflow-handoff.sh <change-dir> --refresh`; read-only `--manifest` exposes the same
source set and normalized fingerprint, without substituting for reading canonical prose.
Declared HOW may be outside change only within a verifiable Git project root. Supported suffixes
are .md/.yaml/.yml; reject .sdd/.git, test-report.md, outside-project paths and unsupported
suffixes. HOW must actually belong to handoff; a contract field alone is insufficient. Paths are
change-relative; reuse the handoff algorithm rather than inventing a HOW hash.

After HOW enters current handoff, source-contract reads code facts/contracts and HOW,
architecture-minimality reads ownership, boundaries and complexity, and e2e-environment reads
test/environment executability. Reviewers independently derive scope and counterexamples from
original requirements before comparing the author's inventory. Read relevant canonical prose,
method bodies, unchanged callers, batch bypasses and shared-state consumers. Early reviews may
inform exploration, but rebinding inputHash cannot turn them into final approval. After prose
and reference repairs, actually rereview affected conclusions. Current records for all three lenses
bind the current normalized handoff inputHash. Keep historical findings and rereview evidence;
fields/hashes prove input identity, not reading, independence or sufficiency. Handoff completes
final document review and delivery before Coding Ready, without a fourth round or fixed Agent count.

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
  "schemaVersion": "superflow.environment-readiness.v2",
  "handoffHash": "<current hash>",
  "scope": "local-dev",
  "overall": "READY",
  "ownerHelpRequired": [],
  "executionContract": {
    "applicationLocation": "local",
    "dependencyPolicy": "shared-dev",
    "allowLocalProvisioning": false,
    "allowRemoteDevDependencies": true,
    "allowedOverrides": ["server.port"],
    "forbiddenOverrides": ["spring.datasource.url"],
    "services": [
      {
        "id": "service-a",
        "configSource": { "type": "bundled-profile", "ref": "application-prod.yml" },
        "startupCommandSource": "tests.md#startup"
      }
    ],
    "dependencies": [
      {
        "id": "redis",
        "kind": "redis",
        "provisioning": "shared-dev",
        "configSource": { "type": "bundled-profile", "ref": "application-prod.yml#spring.redis" }
      }
    ]
  },
  "checks": [
    { "id": "service-config", "type": "file", "target": "../../../service-a/application-prod.yml", "contractRef": "service:service-a", "status": "READY" },
    { "id": "redis", "type": "tcp", "host": "redis.dev.internal", "port": 6379, "contractRef": "dependency:redis", "status": "READY" }
  ]
}
```

Supported checks are `file`, `directory`, `executable`, `tcp`, and `http`.
Never embed credentials or tokens in URLs. Production writes and DB/Redis/MQ
mutations are not preflight operations.

`executionContract` is the single environment source of truth. Freeze the
application location, dependency policy, local-provisioning and shared-dev
permissions, allowed/forbidden overrides, and the config source for every
service and dependency. `configSource.type` is one of `bundled-profile`,
`external-file`, `environment`, `cli-override`, or `generated-fixture`.
Do not mix `local-isolated`, `shared-dev`, and `shared-test`; use `mixed` and
declare each dependency's `provisioning` when mixing is intentional. Every
service and dependency needs a matching `contractRef` probe. Legacy v1 reports
prove reachability only and cannot satisfy Coding Ready.

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

## Current delivery policy

All SDD Coding Ready admission and continuation require
`workflowPolicy: "observed-delivery.v1"`; every declared executable case freezes
`executionEvidence: "runner-captured.v1"` and `executionContext`. The existing command
does not repair business prose or coverage. Missing fields remain BLOCKED until the
document owner repairs and rereviews them. Retain old READY and files only as history
or PARTIAL; they cannot authorize continuation.

Complete validation and current independent-review references follow [test-guide.md](test-guide.md#current-delivery-policy). Reviewer report shape remains owned by [reviewer-checklist.md](reviewer-checklist.md).
