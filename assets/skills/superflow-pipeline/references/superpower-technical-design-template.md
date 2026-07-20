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

## 复杂度减法评审

| 设计项 | 现有能力/复用证据 | 是否必要 | 最简实现 | 删除/拒绝项 | 证据/阻塞 |
| ------ | ----------------- | -------- | -------- | ----------- | --------- |
| `<表/API/Service/组件/同步机制>` | `<现有源码/API/表/依赖>` | `保留/删除/阻塞` | `<最小闭环实现>` | `<不新增的平行抽象/缓存/异步/兼容层>` | `<锚点或阻塞>` |

新增项统计：表 0；字段 0；API 0；Service/组件 0；缓存 0；MQ/事件 0；定时任务 0；兼容层 0。按实际设计替换数量，不适用时保留 0。优先扩展
现有模块；可安全推导的状态不重复持久化；单事务同步可闭环时不引入异步、补偿或
缓存。每个保留项都要说明更简单方案为何不能满足合同，没有证据则删除。

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

批量开通、批量续费、并发请求、重复回调、重复消费或重复外部下发时必须填写。

| 场景 | 业务幂等键 | 原子占用 owner/资源 | 应用层原子占用操作 | 短事务边界 | 状态流转 | 重试复用编码 | 外部调用边界 | 结果不确定处理 | 唯一索引角色 | 测试证据 |
| ---- | ---------- | ------------------- | ------------------ | ---------- | -------- | ------------ | ------------ | -------------- | ------------ | -------- |
| `<批量下发>` | `<套餐+车辆+周期>` | `<周期记录>` | `<锁定 owner 后写 PENDING>` | `<独立事务提交占用>` | `PENDING/SUCCESS/FAILED` | `<复用原业务单号>` | `<提交后调用>` | `<阻止重复并进入对账>` | `<非默认；必要时兜底>` | `<并发/重复/重试用例>` |

应用层原子占用是默认方案：先用稳定业务幂等键在短事务内锁定明确的 owner 资源，
写入 `PENDING` 并提交，再释放数据库锁后执行外部调用。外部调用成功或失败后更新
状态；重试必须复用原业务单号。结果不确定时必须阻止重复下发并保留人工对账入口。
禁止用“先查再插”、单进程锁或随机单号冒充跨实例幂等，也禁止在外部调用期间持有
长事务或数据库锁。唯一索引不是默认方案；仅当自然唯一语义、历史数据清理、NULL/
软删除行为和冲突处理合同都已明确时，才可作为数据库兜底。

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

## Money Precision Boundary

Use this whenever the change involves amount, fee, discount, deduction, refund,
sharing, payment, invoice, balance, electricity fee, service fee, package
settlement, proration, allocation, reconciliation, or financial display.

| Amount identity | Authoritative total | Exact type/construction | Currency and unit | Calculation-state source | Rounding level/boundary | Scale/mode/source | Allocation strategy/tie-breaker | Complement derivation | Audit evidence | Test evidence |
| --------------- | ------------------- | ----------------------- | ----------------- | ------------------------ | ----------------------- | ----------------- | ------------------------------- | --------------------- | -------------- | ------------- |
| `original = discount + actual` | `original` | `<BigDecimal from string>` | `<CNY; internal scale; provider minor unit>` | `<rate * quantity>` | `<order/payment adapter>` | `<2/HALF_UP/contract>` | `<largest remainder/business key>` | `actual = original - discount` | `<pre/post round; residual recipient>` | `<positive/zero/refund/half-unit/tied residual IDs>` |

Use `money-precision-algorithms.md` to complete the contract. State the exact
decimal representation and construction source; currency and ISO/provider
minor-unit boundary; rounding level, mode, and policy source; deterministic
residual strategy and stable tie-breaker; negative/refund symmetry; persistence
precision/scale and overflow checks. Never assume every currency has two
decimal places or use database implicit conversion as the rounding policy.

For FX changes, additionally record:

| Base/quote | Rate source/time | Rate precision | Canonical path | Target unit/rounding | Round-trip tolerance | Evidence |
| ---------- | ---------------- | -------------- | -------------- | -------------------- | -------------------- | -------- |
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
- For money changes, prove the precision boundary before coding: calculation
  state, settlement/display state, final rounding point, allocation rule, and
  half-cent/residual tests.
- Do not invent API fields, DB columns, status semantics, fallback behavior, or
  acceptance criteria.
- Keep unresolved source facts as blockers. Do not convert them to guesses.
- Record the same `handoff_hash` as `.sdd/handoff/sdd-context.sha256`.
```
