# Superpowers Technical Design Template

Use this template for the Superpowers-owned source-level HOW document.
OpenSpec/SDD documents remain canonical for WHAT, API, database, field
semantics, tests, and acceptance gates.

**Output path**:
`docs/superpowers/specs/YYYY-MM-DD-<change-id>-technical-design.md`

```markdown
---
change: <change-id>
status: draft|ready|final
handoff_hash: <sha256>
canonical_sources:
  - ../../openspec/changes/<change-id>/proposal.md
  - ../../openspec/changes/<change-id>/api.md
  - ../../openspec/changes/<change-id>/design.md
  - ../../openspec/changes/<change-id>/tests.md
---

# Superpowers Technical Design: <change title>

## Boundary

- This document owns source-level HOW only.
- OpenSpec/SDD remains canonical for requirements, API, DB, field semantics,
  SQL, tests, and acceptance gates.
- If this document conflicts with canonical sources, stop and return to
  `$superflow-docs`; do not let implementation prompts carry the conflict forward.

## Source-Level HOW

| Requirement/Scenario | Code anchor | Current behavior | Target HOW | Files/methods | Risk |
|---|---|---|---|---|---|
| <R1/S1> | `<file>:<line>` | <observed fact> | <implementation approach> | <files> | <risk> |

## Minimal Design Review

| Design item | Existing capability/reuse evidence | Necessary? | Simplest implementation | Removed/rejected complexity | Evidence/blocker |
| ----------- | ---------------------------------- | ---------- | ----------------------- | --------------------------- | ---------------- |
| `<table/API/service/component/sync>` | `<existing source/API/table/dependency>` | `keep/remove/blocked` | `<minimum implementation>` | `<no parallel abstraction/cache/async/compat layer>` | `<anchor or blocker>` |

New-item counts: tables 0; fields 0; APIs 0; services/components 0; caches 0; MQ/events 0; scheduled jobs 0; compatibility layers 0. Replace each count with the actual design total. Extend existing modules first. Do not persist values
that can be derived safely, and do not add async compensation or caching when a
single synchronous transaction closes the contract. Every retained item must
explain why a simpler option fails; remove it when there is no evidence.

## Architecture Boundary And Call Direction

Use this whenever the change crosses repositories, services, SDKs, MQ,
schedulers, device protocols, callbacks, third-party platforms, mini-programs,
gateway layers, or adapter modules.

| Flow step | Direction | Owner module | Existing entry/exit | Proposed entry/exit | Allowed? | Evidence anchor | Forbidden shortcut |
|---|---|---|---|---|---|---|---|
| `<user/system action>` | `<upstream -> downstream>` | `<module>` | `<existing API/MQ/adapter>` | `<target API/MQ/adapter>` | `yes/no/blocker` | `<file:line/log/doc>` | `<what must not be routed through>` |

Required boundary checks:

```bash
rg -n "<module>|<interface>|<topic>|<protocol>|<callback>" .
rg -n "<existing entry>|<existing exit>|<adapter>|<client>" <repo-a> <repo-b>
```

The technical design must prove service ownership and call direction before
choosing an implementation path. Do not turn an outbound adapter, protocol
translator, notification consumer, or device gateway into a business-entry
orchestrator unless the OpenSpec/SDD contract explicitly says that module owns
the new entry point and records the owner approval. If the correct owner is
unclear, mark the design blocked.

## External Integration Configuration And Deployment Contract

Use this whenever the change integrates with a third-party platform/tool, SDK,
MQ/Kafka, callback, payment gateway, cloud service, or other external system.

| External dependency/resource | Config/resource item | Local source/provisioning | Test source/provisioning | Production source/provisioning | Injection/creation method | Runtime owner | Provisioning owner/time | Readiness evidence | Rollback | Secret handling | Blocker |
| ---------------------------- | -------------------- | ------------------------- | ------------------------ | ------------------------------ | ------------------------- | ------------- | ----------------------- | ------------------ | -------- | --------------- | ------- |
| `<TDMQ>` | `<Consumer Group>` | `<auto/manual/IaC>` | `<existing resource>` | `<pre-created by ops>` | `<config/secret/IaC/console>` | `<service>` | `<owner + before deploy>` | `<console/API/trace>` | `<disable/rollback>` | `<secret reference only>` | `<none/blocker>` |

Required checks:

```bash
rg -ni "https?://|endpoint|base.?url|app.?id|tenant|project.?id|topic|tag|consumer.?group|namespace|webhook|acl|role|secret|token|password|timeout" <source-and-config-paths>
rg -ni "@.*Listener|new.*Client|builder\(|System\.getenv|ConfigurationProperties|Value\(" <source-and-config-paths>
```

Do not hard-code environment-dependent endpoints, resource names, identifiers,
credentials, ACLs, or operational switches in annotations, constants, or
business code. Stable protocol constants may remain code constants only when
the design proves they are not environment-specific and no server-side
resource must be provisioned. Test auto-creation, a successful local startup,
or an already-existing test resource is not evidence that production is
ready. Every server-side resource must have an explicit production owner,
creation timing, readiness check, and rollback path. Missing production
provisioning evidence is a blocker.

## Concurrency And Idempotency Ownership

Complete this section for concurrent requests, batch issue/activation/renewal,
duplicate callbacks, duplicate consumption, or repeated external delivery.

| Scenario | Business idempotency key | Claim owner/resource | Application-layer atomic claim | Short transaction boundary | State machine | Retry code reuse | External-call boundary | Uncertain-result handling | Unique-index role | Test evidence |
| -------- | ------------------------ | -------------------- | ------------------------------ | -------------------------- | ------------- | ---------------- | ---------------------- | ------------------------- | ----------------- | ------------- |
| `<batch issue>` | `<package+vehicle+period>` | `<period row>` | `<lock owner then persist PENDING>` | `<commit claim independently>` | `PENDING/SUCCESS/FAILED` | `<reuse original business code>` | `<call after commit>` | `<block duplicates and reconcile>` | `<not default; optional fallback>` | `<concurrent/duplicate/retry cases>` |

Application-layer atomic claim is the default: use a stable business
idempotency key, lock an explicit owner resource in a short transaction,
persist `PENDING`, commit, and release the database lock before the external
call. Update the state after the call; every retry reuses the original business
code. An uncertain result blocks duplicate delivery and remains reconcilable.
Do not use check-then-insert, process-local locks, or random IDs as cross-instance
idempotency, and do not hold a database lock across an external call. A unique
index is not the default; it is only an optional database fallback when natural
uniqueness, historical cleanup, NULL/soft-delete behavior, and conflict handling
are explicitly contracted.

## Field And Status Reverse Impact

Use this whenever changing field values, enum/status values, derived fields,
sync flags, online/offline state, deletion/restoration state, payment/refund
state, third-party status, or any value that other code may read.

| Field/status | Write/update points | Read/filter points | Derived/sync points | Cross-module consumers | Tests covering consumers | Missing coverage/blocker |
|---|---|---|---|---|---|---|
| `running_status` | `<repository/service>` | `<query/filter/mapper>` | `<heartbeat/realtime/sync>` | `<module/repo>` | `<case IDs>` | `<none/blocker>` |

Required reverse-search commands:

```bash
rg -n "<field>|<enum>|<status>|<column>" .
rg -n "<setter>|<getter>|<mapper column>|<dto field>" src test
```

If the value is database-backed, also inspect Mapper XML, entity annotations,
DTO/VO fields, SQL migrations, scheduled jobs, MQ/event consumers, callbacks,
third-party adapters, and sibling repos when the table or DTO is shared.

The technical design must say which references are intentionally unchanged and
why. A change is not ready when only the direct setter/writer is designed.

## Money Precision Boundary

Use this whenever the change involves amount, fee, discount, deduction, refund,
sharing, payment, invoice, balance, electricity fee, service fee, package
settlement, proration, allocation, reconciliation, or financial display.

| Amount identity | Authoritative total | Exact type/construction | Currency and unit | Calculation-state source | Rounding level/boundary | Scale/mode/source | Allocation strategy/tie-breaker | Complement derivation | Audit evidence | Test evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `original = discount + actual` | `original` | `<BigDecimal from string>` | `<currency; internal scale; provider minor unit>` | `<rate * quantity>` | `<order/payment adapter>` | `<scale/mode/contract>` | `<largest remainder/business key>` | `actual = original - discount` | `<pre/post round; residual recipient>` | `<positive/zero/refund/half-unit/tied residual IDs>` |

Use `money-precision-algorithms.md` to complete the contract. State exact
representation and construction; currency and ISO/provider minor-unit boundary;
rounding level, mode, and policy source; residual strategy and stable
tie-breaker; negative/refund symmetry; persistence precision/scale and overflow
checks. Never assume every currency has two decimals or treat implicit database
conversion as the rounding policy.

For FX changes, additionally record:

| Base/quote | Rate source/time | Rate precision | Canonical path | Target unit/rounding | Round-trip tolerance | Evidence |
|---|---|---|---|---|---|---|
| `<base/quote>` | `<source/timestamp>` | `<scale>` | `<direct/triangulated order>` | `<currency/provider rule>` | `<contract tolerance>` | `<case IDs>` |

Required precision checks:

```bash
rg -ni "setScale|round|RoundingMode|BigDecimal|double|float|money\\(" <source-and-test-paths>
rg -ni "amount|fee|price|discount|deduction|refund|pay|invoice|balance|serviceFee|chargeFee" <source-and-test-paths>
```

The design must separate calculation-state money from settlement/display-state
money. Intermediate calculations must keep original rate, product, proportion,
process evidence, and allocation precision. Round only at explicit outbound
boundaries such as settlement posting, persistence fields that require cents,
payment/fiscal interfaces, invoices, exports, or display. For multi-detail
allocation, compute the high-precision target first, then distribute the final
rounded amount deterministically so totals match and identities such as
`original = discount + actual` hold. When an additive identity exists and its
total is the authoritative source, calculate only the required N-1 components
independently and derive the final complement as `authoritative total - sum(other
components)`. Do not independently calculate and round every component and then
rebuild the authoritative total. If complement derivation is not applicable,
record why, identify the actual source of truth, and provide owner evidence.
Do not calculate later slices, discounts, ratios, or unit prices from
already-rounded money.

## Execution Architecture

- Worker boundaries:
- Tester boundaries:
- Reviewer boundaries:
- Leader coordination:
- Worktree/port plan:

## TDD And RED Entry Points

| Case ID | Failing command first | Expected RED failure | GREEN command | Evidence target |
|---|---|---|---|---|
| T1 | `<command>` | <failure> | `<command>` | `test-report.md#...` |

## Implementation Plan Shape

| Batch | Scope | Dependencies | Allowed files | Forbidden files | Done evidence |
|---|---|---|---|---|---|
| P0 | <baseline> | none | <paths> | <paths> | <evidence> |

## Drift And Blockers

| Topic | Status | Required action |
|---|---|---|
| <unclear source fact> | blocked|partial|clear | <action> |
```

## Rules

- Use real source anchors, Mapper/XML anchors, table names, commands, and
  prompt boundaries. Vague module names are not enough.
- For cross-system changes, prove owner module, call direction, existing
  entry/exit points, and forbidden shortcuts before implementation. A design
  that only shows "can call through this module" is not ready.
- For field/status changes, prove reverse impact before coding: writers,
  readers, filters, derived sync paths, external consumers, and tests.
- For money changes, prove the precision boundary before coding: calculation
  state, settlement/display state, final rounding point, allocation rule, and
  half-cent/residual tests.
- Do not invent API fields, DB columns, status semantics, fallback behavior, or
  acceptance criteria.
- Keep unresolved source facts as blockers. Do not convert them to guesses.
- Record the same `handoff_hash` as `.sdd/handoff/sdd-context.sha256`.
