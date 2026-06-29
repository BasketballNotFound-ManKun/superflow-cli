---
name: superflow-table-impact-analysis
description: Use when a requirement, bug fix, sync task, migration, or test plan touches database tables, status fields, Mapper/XML queries, cross-repo shared data, or persisted user-facing behavior.
---

# SDD Table Impact Analysis

Use this skill before freezing design, writing implementation prompts, coding,
or accepting test reports for database-backed behavior.

## Core Rule

Do not start from the happy-path writer only. Start from every affected
`table.field`, then reverse-scan all code and business consumers before
declaring the feature complete.

Required impact table:

```text
Table/field | Writer | Reader/filter | Cross-repo/external consumer | Real entry | Reverse-state scenario | Verification evidence
```

Required semantic table for status/enum/sync/default behavior:

```text
Source field | Source enum | Target field | Target enum | Consumer meaning | Business basis | Unknowns
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
   `Fallback trigger | Business basis | Masked anomaly | Monitoring/alert/exposure | Removal condition | Owner approval`.
6. Put the impact table and semantic table into `design.md`, `tests.md`,
   `traceability-matrix.md`, implementation prompt, and `test-report.md`.
7. Verify at least one final business entry point, not only the sync task or
   DB update. Examples: applet QR scan, start charge, payment/refund,
   notification, callback, scheduled job, third-party query.

## Blockers

Mark the task `Blocked` when:

- a consumer or real entry point is unknown;
- only the writer/sync path is tested;
- only the unavailable direction is tested;
- a status field can retain an old invalid value;
- a status/enum/sync value is treated as correct only because it is non-null,
  present, successful, or has any value;
- fallback/default/keep-old-value/null-conversion/alternative-field logic is
  used without explicit business approval and exposure strategy;
- cross-repo consumers are not enumerated;
- `test-report.md` lacks the required impact table.

## Hook

`~/.codex/hooks/superflow-test-report-lint.py` enforces this for database/status
reports that claim pass or partial pass. A report that only says "sync
succeeded" without consumer-path evidence is blocked.
