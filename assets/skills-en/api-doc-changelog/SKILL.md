---
name: api-doc-changelog
description: Standardize API documentation changelog annotations. Use when writing or updating api.md, preparing frontend integration docs, marking API/field-level changes, or reviewing API docs before handoff.
---

# API Documentation Changelog Standard

Use this skill when `api.md` must show what changed between the previous
baseline and the current delivery. The goal is to make API deltas visible to
frontend, QA, and integration agents without forcing them to diff a large file.

## Required Structure

Add a changelog overview before the first normal API section:

```markdown
## 0. Change Overview

> Baseline: v1.0 | Current: v1.1 | Date: YYYY-MM-DD

### Added APIs

| API | Summary |
|-----|---------|
| `POST /api/example` | Adds example creation |

### Changed APIs

| API | Change Summary |
|-----|----------------|
| `GET /api/example` | Adds query parameter `keyword`; response adds `tag` |

### Deprecated APIs

| API | Replacement | Removal Plan |
|-----|-------------|--------------|
| `GET /api/old` | `GET /api/new` | v2.0 |
```

If there are no API changes, write that explicitly:

```markdown
No API contract changes in this delivery.
```

## API-Level Labels

For each changed API heading, append one label:

- `[Added]`
- `[Changed]`
- `[Deprecated]`

Stable APIs from earlier versions do not need labels. Remove old labels during
the next delivery cycle so labels always mean "changed in this delivery".

Example:

```markdown
#### `GET /api/orders` `[Changed]`
```

## Field-Level Labels

In request and response field tables, append change notes to the description
column:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `keyword` | String | No | Search keyword `[Added]` |
| `status` | Integer | No | Status enum `[Changed: adds 3=Pending Review]` |
| `oldField` | String | No | ~~Deprecated; use `newField`~~ `[Deprecated]` |

Rules:

- Be concrete. Write what changed, not just "changed".
- Mark added, changed, deprecated, and removed fields.
- Remove prior delivery labels in the next delivery cycle.
- JSON examples do not need inline labels; field tables are the source of truth.

## Change Classification

Mark a change when any of these happen:

- API added, removed, or deprecated.
- Request parameter added, removed, renamed, made required, or made optional.
- Response field added, removed, renamed, or type-changed.
- Enum value added, removed, or meaning-changed.
- Validation rule, sorting, permission behavior, error code, or idempotency
  behavior changes.

Do not mark a change for typo fixes, formatting, or explanatory notes that do
not change the contract.

## Superflow Integration

During `superflow-docs`:

1. If `api.md` is new, write "initial version" in the overview.
2. If `api.md` exists, compare the current contract against the baseline and
   update the overview plus inline labels.
3. Before handoff, verify that frontend-facing changes are visible both in the
   overview and near the affected API/field.

The full historical API change log can stay near the end of `api.md`; the
overview is the delivery-specific delta.
