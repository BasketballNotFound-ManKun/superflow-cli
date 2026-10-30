---
name: superflow-table-impact-analysis
description: Superflow 内部能力：从表和字段反查全部读写方、跨仓消费入口及需要覆盖的回归影响。由 $superflow 选择，用户无需手动分流。
---

# SDD Table Impact Analysis

Use this skill before freezing design, writing implementation prompts, coding,
or accepting test reports for database-backed behavior.

先沿[来源控制与交付范围](../superflow/references/document-review-coverage.md#source-authority-and-delivery-scope)核对本轮可控源码与验收义务；调查全部已知调用者不自动授予外仓实施或验收责任。

## Core Rule

Do not start from the happy-path writer only. Start from every affected
`table.field`, then reverse-scan all code and business consumers before
declaring the feature complete.

Required impact table:

```text
表/字段 | 写入方 | 读取/过滤方 | 跨仓/外部消费方 | 真实入口 | 反向状态场景 | 验证证据
```

Required semantic table for status/enum/sync/default behavior:

```text
真源字段 | 真源枚举 | 目标字段 | 目标枚举 | 消费方解释 | 业务依据 | 不确定项
```

## Procedure

1. List every affected table and field from docs, SQL, Mapper/XML, entity,
   DTO, sync payload, logs, and DB samples.
2. For each field, search all references. Use understand-anything only as a
   locator when available; if it is missing, stale, incomplete, or unavailable,
   degrade to `rg`, source reading, Mapper/XML, SQL, configuration, log
   templates, database table names, and sibling-repo search. Cover entities,
   Mapper/XML, SQL, services, jobs, MQ listeners, controllers, external
   adapters, sibling repos, SDK/DTOs, and frontend/applet endpoints.
3. Classify each reference:
   writer, reader, filter, default-value logic, old-value retention, state
   recovery, cross-repo sync, user-facing entry point.
4. Add reverse-state scenarios:
   offline -> online, disabled -> enabled, deleted -> restored, missing ->
   reappearing, old invalid value -> valid when upstream omits a field.
5. For status, enum, sync, derived, default, or compatibility behavior, identify
   the source-of-truth field and the consumer-facing meaning. Do not accept
   non-null, present, successful, or "has any value" as correct. Reject
   fallback/default/keep-old-value/null-conversion/alternative-field logic
   unless explicitly approved by the requirement or owner. Approved
   compatibility must document:
   `兜底触发条件 | 业务依据 | 会掩盖的异常 | 监控/告警/暴露方式 | 移除条件 | owner确认`.
6. Put the impact table and semantic table into `design.md`, `tests.md`,
   `traceability-matrix.md`, implementation prompt, and `test-report.md`.
7. Verify the real business entry within approved delivery scope, including actual
   response/state/forbidden effects and applicable reverse-state paths. A backend
   sync task may be that scoped entry. Verify downstream client flows when they
   are approved duties; otherwise record external owners and completion conditions
   without claiming that end-to-end flow has passed.

## Blockers

Mark the task `Blocked` when:

- an in-scope consumer or real entry point is unknown and affects the confirmed business/acceptance decision;
- an approved in-scope downstream entry remains untested (a scoped backend writer/sync entry does not by itself create external duties);
- only the unavailable direction is tested;
- a status field can retain an old invalid value;
- a status/enum/sync value is treated as correct only because it is non-null,
  present, successful, or has any value;
- fallback/default/keep-old-value/null-conversion/alternative-field logic is
  used without explicit business approval and exposure strategy;
- known cross-repo consumers and external coordination dependencies are not enumerated;
- `test-report.md` lacks the required impact table.

## Hook

`~/.codex/hooks/superflow-test-report-lint.py` enforces this for database/status
reports that claim pass or partial pass. A report that only says "sync
succeeded" without consumer-path evidence is blocked.

### 数据库分层证据

按 [数据库合同](../superflow/references/document-review-coverage.md#数据库分层合同)
冻结并继承 `testLayer`、entry.database、生产 statement、mockBoundary 和数据断言。
从表、字段、CAS与事务反向发现DB义务并声明entry.database；纯逻辑明确无持久化理由可免DB。
