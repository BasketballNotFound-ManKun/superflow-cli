# Superpowers Technical Design Template

Use this template for the Superpowers-owned source-level HOW document.
OpenSpec/SDD documents remain canonical for WHAT, API, database, field
semantics, tests, and acceptance gates.

**Output path**:
`docs/superpowers/specs/YYYY-MM-DD-<change-id>-technical-design.md`

````markdown
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

| Requirement/Scenario | Code anchor     | Current behavior | Target HOW                | Files/methods | Risk   |
| -------------------- | --------------- | ---------------- | ------------------------- | ------------- | ------ |
| <R1/S1>              | `<file>:<line>` | <observed fact>  | <implementation approach> | <files>       | <risk> |

## Architecture Boundary And Call Direction

Use this whenever the change crosses repositories, services, SDKs, MQ,
schedulers, device protocols, callbacks, third-party platforms, mini-programs,
gateway layers, or adapter modules.

| Flow step              | Direction                  | Owner module | Existing entry/exit         | Proposed entry/exit       | Allowed?         | Evidence anchor       | Forbidden shortcut                  |
| ---------------------- | -------------------------- | ------------ | --------------------------- | ------------------------- | ---------------- | --------------------- | ----------------------------------- |
| `<user/system action>` | `<upstream -> downstream>` | `<module>`   | `<existing API/MQ/adapter>` | `<target API/MQ/adapter>` | `yes/no/blocker` | `<file:line/log/doc>` | `<what must not be routed through>` |

Required boundary checks:

```bash
rg -n "<module>|<interface>|<topic>|<protocol>|<callback>" .
rg -n "<existing entry>|<existing exit>|<adapter>|<client>" <repo-a> <repo-b>
```
````

The technical design must prove service ownership and call direction before
choosing an implementation path. Do not turn an outbound adapter, protocol
translator, notification consumer, or device gateway into a business-entry
orchestrator unless the OpenSpec/SDD contract explicitly says that module owns
the new entry point and records the owner approval. If the correct owner is
unclear, mark the design blocked.

## Field And Status Reverse Impact

Use this whenever changing field values, enum/status values, derived fields,
sync flags, online/offline state, deletion/restoration state, payment/refund
state, third-party status, or any value that other code may read.

| Field/status     | Write/update points    | Read/filter points      | Derived/sync points         | Cross-module consumers | Tests covering consumers | Missing coverage/blocker |
| ---------------- | ---------------------- | ----------------------- | --------------------------- | ---------------------- | ------------------------ | ------------------------ |
| `running_status` | `<repository/service>` | `<query/filter/mapper>` | `<heartbeat/realtime/sync>` | `<module/repo>`        | `<case IDs>`             | `<none/blocker>`         |

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

## External Enum Binding

Use this whenever a change sends values to, receives values from, or maps values
for third-party platforms, SDKs, BEM/parking systems, payment/refund systems,
financial display fields, source/origin fields, status synchronization, or any
external dictionary/enum.

| Business field | Local source field/enum    | External system field | External enum/dictionary value | Display/business/financial meaning                 | Source evidence                          | Owner/confirmation time | Unresolved handling | Test evidence        |
| -------------- | -------------------------- | --------------------- | ------------------------------ | -------------------------------------------------- | ---------------------------------------- | ----------------------- | ------------------- | -------------------- |
| `payMode`      | `<table.field / DTO enum>` | `<BEM field>`         | `<0/1/4/5/...>`                | `<cash/wechat/alipay/unknown as displayed by BEM>` | `<doc/log/API sample/user confirmation>` | `<owner + time>`        | `<none/blocker>`    | `<test-report case>` |

Required binding checks:

```bash
rg -n "<external field>|<enum value>|<display text>|<SDK request field>" .
rg -n "<local pay/status/source field>|<converter>|<client request>" src test
```

External enum binding is blocked until the business meaning is confirmed. A
successful request, non-null value, or "field exists" proof is not enough. Do
not invent numeric enum values, source/origin values, financial display
semantics, fallback values, or compatibility mappings without owner approval.

## Execution Architecture

- Worker boundaries:
- Tester boundaries:
- Reviewer boundaries:
- Leader coordination:
- Worktree/port plan:

## TDD And RED Entry Points

| Case ID | Failing command first | Expected RED failure | GREEN command | Evidence target      |
| ------- | --------------------- | -------------------- | ------------- | -------------------- |
| T1      | `<command>`           | <failure>            | `<command>`   | `test-report.md#...` |

## Implementation Plan Shape

| Batch | Scope      | Dependencies | Allowed files | Forbidden files | Done evidence |
| ----- | ---------- | ------------ | ------------- | --------------- | ------------- |
| P0    | <baseline> | none         | <paths>       | <paths>         | <evidence>    |

## Drift And Blockers

| Topic                 | Status  | Required action |
| --------------------- | ------- | --------------- | ----- | -------- |
| <unclear source fact> | blocked | partial         | clear | <action> |

```

## Rules

- Use real source anchors, Mapper/XML anchors, table names, commands, and
  prompt boundaries. Vague module names are not enough.
- For cross-system changes, prove owner module, call direction, existing
  entry/exit points, and forbidden shortcuts before implementation. A design
  that only shows "can call through this module" is not ready.
- For field/status changes, prove reverse impact before coding: writers,
  readers, filters, derived sync paths, external consumers, and tests.
- Do not invent API fields, DB columns, status semantics, fallback behavior, or
  acceptance criteria.
- Keep unresolved source facts as blockers. Do not convert them to guesses.
- Record the same `handoff_hash` as `.sdd/handoff/sdd-context.sha256`.
```
