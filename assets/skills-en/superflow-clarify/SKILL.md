---
name: superflow-clarify
description: Use when reading PRDs, online documents, local requirement files, screenshots, prototypes, or oral requirements and the agent must clarify one feature at a time before producing OpenSpec/SDD artifacts.
---

# SDD Clarify

Use this skill for the first phase of SDD: understand one feature, bind text to images,
ask only current-feature questions, draft the API shape, and freeze the feature before
any full SDD document or implementation prompt is generated.

## Hard Gates

- Before freezing any new requirement or bug fix, perform platform-level impact
  discovery. Prefer understand-anything artifacts when present, such as
  `.understand-anything/`, `understand-anything.md`, `understand anything.md`,
  or the project-specific graph output, but treat them only as locator evidence.
  If artifacts are missing, stale, incomplete, or unavailable, degrade to `rg`,
  source reading, Mapper/XML, configuration, database table names, log
  templates, and sibling-repo search. Do not block only because
  understand-anything is missing; block only when no platform-level impact
  discovery evidence exists.
- Do not freeze a feature from product text or understand-anything output alone
  when code impact is relevant. Current source, Mapper/XML, database samples,
  API contracts, or real consumer entry points must confirm the design.
- When the feature depends on existing code relationships, field ownership,
  table joins, data permissions, status transitions, or upstream/downstream
  calls, verify the relationship before freezing with current evidence:
  platform-level impact discovery -> source/Mapper/XML anchors -> read-only
  database checks when source is insufficient. If the relationship is still
  unclear, ask the programmer/user to clarify and mark the feature blocked; do
  not invent a design from field names, graph output, or assumptions.
- When a feature adds, changes, synchronizes, or relies on a database table or
  status field, perform table-to-code reverse impact analysis before freezing:
  start from each table/field, find all writers, readers, filters, status
  recovery paths, scheduled jobs, MQ consumers, frontend/applet endpoints,
  third-party adapters, and sibling-repo consumers. Include reverse cases such
  as unavailable -> available, deleted -> restored, missing -> reappearing, and
  old invalid values left behind when upstream omits a field. If the final
  user-facing entry points are unknown, block and ask; do not freeze a design
  that only proves the sync/write path.
  Use `$superflow-table-impact-analysis` for this step when available.
- When a feature relies on a status, enum, sync field, derived field, default
  value, or compatibility behavior, freeze the business semantics before API or
  design freezing. Record:
  `Source field | Source enum | Target field | Target enum | Consumer meaning | Business basis | Unknowns`.
  Do not treat non-null, present, successful, or "has any value" as correct.
  Do not accept fallback/default/keep-old-value behavior unless the requirement
  or owner explicitly approves it for dirty historical data or uncontrollable
  external input. If semantics are unclear, mark the feature blocked instead of
  inventing a fallback.
- Process one feature at a time, in product-document order.
- For long PRDs, Lark/Feishu exports, screenshots, or mixed product docs, do
  not read the whole document and generate all tasks in one pass. First create
  a source index, then process one bounded section or feature at a time. Each
  section must record source range/page/screenshot IDs, AI understanding,
  open questions, API draft, confirmation status, and freeze result before the
  next section is analyzed.
- Do not clarify the next feature until the current feature is confirmed by the programmer.
- Do not generate `spec.md`, `design.md`, `tasks.md`, `tests.md`, or implementation prompts before the current feature is frozen.
- Do not rely on conversation memory for unpersisted requirement details.
- Do not make page-invisible fields required. If the backend needs a field not shown in the UI, mark it as backend default or backend-derived.
- Stop whenever the programmer has not confirmed the AI understanding or the rough API draft.

## Required Outputs

Create or update these files in the active OpenSpec change directory:

- `source-ingestion.md`: source documents, read ranges, screenshots, attachments, failed reads.
- `feature-gates.md`: per-feature status and gates.
- `feature-inventory.md`: all discovered features and whether they reached spec/task/tests.
- `ui-contract.md`: page fields, controls, buttons, list columns, dropdowns, API/DTO/DB mapping.
- `gap-analysis.md`: UI/document/source gaps and over-design risks.
- `spec-freeze-review.md`: freeze card for the current feature.
- Platform impact evidence in one of the above documents: discovery method,
  understand-anything index status when available, analyzed platform scope,
  impacted modules/interfaces/tables, regression risks, source/DB/API
  confirmation plan, and validation approach.
- Existing-code/data relationship evidence in one of the above documents when
  applicable: graph scope, source anchors, database checks or reason skipped,
  final relationship judgment, and unresolved clarification questions.
- Table reverse impact evidence when database-backed behavior is involved:
  table/field list, all read/write/filter consumers, real user-facing entry
  points, reverse-state scenarios, and tests required to prove those consumers.
- Business semantic evidence when status/enum/sync/default behavior is involved:
  source-of-truth field, enum mapping, consumer interpretation, business basis,
  explicitly rejected fallback/default choices, and unresolved owner questions.

Use the detailed workflow in:

- `../superflow-pipeline/references/feature-gated-workflow.md`
- `../superflow-pipeline/references/api-design-template.md`

## Per-Feature Procedure

0. For any multi-section requirement source, build or update
   `source-ingestion.md` and `feature-inventory.md` before analysis:
   `source | section/page/range | candidate feature | screenshots | status`.
   Mark every candidate as `pending`, `confirmed`, `blocked`, or `out-of-scope`.
   Do not summarize the whole PRD into tasks before this index exists.
1. Read only the current feature's text, neighboring screenshots, and relevant attachments.
2. Output AI understanding: business goal, user action, page entry, visible fields, buttons, list columns, dropdowns.
3. Bind each screenshot/image to the current feature or mark it unassigned.
4. Write the current feature into `feature-inventory.md` and `feature-gates.md`.
5. Produce `ui-contract.md` rows for all visible and implied fields.
6. Produce `gap-analysis.md`, especially:
   - UI has it, backend lacks it.
   - Backend has it, UI lacks it.
   - Document has it, UI lacks it.
   - UI has it, document lacks it.
7. Identify real validation data needed by this feature, especially park codes,
   operator/site ids, tokens, frontend payloads, external SDK data, devices,
   payment/refund ids, exports, imports, or database seed records. If missing,
   add a blocker instead of assuming placeholders.
8. For existing-code-dependent decisions, write the evidence chain:
   platform impact discovery method, understand-anything nodes/files if used,
   source/Mapper/XML anchors, DB query evidence or why DB was not needed. If
   any key relation is unresolved, stop and ask only current-feature
   clarification questions.
9. For database-backed behavior, add a table reverse impact table before
   freezing:
   `Table/field | Writer | Reader/filter | Cross-repo/external consumer | Real entry | Reverse-state scenario | Required test`.
   If any consumer or real entry is unknown, mark the feature blocked.
10. For status/enum/sync/default behavior, add a semantic mapping table before
    freezing:
    `Source field | Source enum | Target field | Target enum | Consumer meaning | Business basis | Unknowns`.
    If a proposed default, fallback, old-value retention, or null conversion is
    not explicitly approved by the requirement or owner, mark it rejected and do
    not include it in the design.
11. Ask only current-feature clarification questions.
12. Wait for programmer confirmation.
13. Draft a rough API contract: path, action, core request, core response. Field types can be approximate.
14. Wait for programmer confirmation of the rough API.
15. Produce a precise API section with field names, types, requiredness, defaults, enums, errors, examples, and curl.
16. Mark the feature as `frozen` only when understanding, rough API, precise API,
    and validation data needs are confirmed or explicitly blocked.
17. Only after the current feature is frozen or blocked, move to the next
    indexed feature. Do not batch-confirm multiple features from memory or a
    compressed chat summary.

## Handoff

When the feature is frozen, tell the user to continue with `$openspec-propose`
for OpenSpec document generation. After `$openspec-propose` creates the base
artifacts, use `$superflow-docs` only for SDD quality gates, traceability, API/test
evidence, and prompt handoff checks.
