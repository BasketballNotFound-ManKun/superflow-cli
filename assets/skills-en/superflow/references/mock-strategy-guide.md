# Mock Strategy and Boundary Guide

## Scope and source of truth

Read for isolation design or substituted-evidence reporting. Select signals with
[test-guide.md](test-guide.md). Database layers, mockBoundary, and execution
receipts inherit only
[document-review-coverage.md](document-review-coverage.md#database-layer-contract).
This guide describes isolation, not permission to reduce frozen real acceptance.

| Scenario | Isolatable boundary | Proven scope / remaining obligation |
|---|---|---|
| Pure logic unit test | Data-access/HTTP/MQ dependencies outside tested logic | Branches, parameters, failure handling; not real SQL or persistence |
| Required persistence/transaction/CAS | External clients in mockBoundary.allowed | Never mock production Service/Mapper; execute production statements on the actual same-engine DB |
| External payment/SMS/device | Contract-approved clients, sandboxes, simulated messages | Local handling; real capabilities need separate sandbox/real-entry proof or blockers |
| MQ/Redis/OSS | Interface boundaries for pure logic | Memory queues, local cache/files cannot close real protocol, locking, persistence, or external-chain requirements |

Actual same-engine Docker/Testcontainers databases are not mocks. Reuse when the
frozen environment permits; never substitute for a required shared environment.
H2/SQLite cannot replace MySQL dialect, locking, transaction, or persistence
semantics. Without a DB preserve logic proof and mark required DB cases
BLOCKED/PARTIAL.

## Declaration and reporting

Record actual capability, replacement object, mockBoundary, assumptions, proven
scope, unverified scope, real verification commands/blockers, and evidence paths
in existing tests.md / test-report.md. Separate `Mock verification`, `Test endpoint
verification`, and `Real-entry verification`. Auxiliary logic cases may pass;
mock-only cannot close required database or real-chain cases of the same entry.

## Example: isolated payment client, actual persistence

When the contract permits isolating PaymentClient, return a fixed success response
to the **real** business Service and Mapper. On frozen MySQL, assert order-ID
before/after, amounts, state, and required side effects. This proves handling and
persistence, not actual gateway charging; verify charging separately or report a
blocker. A pure Service unit test may mock Mapper but reports logic only, never
successful database integration.

## Prohibited

- Mocking the tested subject or production Service/Mapper in required DB cases.
- Replacing business/DB-value assertions with fixed success, counts, HTTP 200, or nonzero affected rows.
- Mixing substituted and real evidence or counting skipped/unexecuted cases as complete passes.
- Silently changing frozen backends, weakening assertions under delivery pressure, or leaving mocks in production.
