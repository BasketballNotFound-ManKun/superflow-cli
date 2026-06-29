---
name: superflow-docs
description: Use when confirmed OpenSpec artifacts need SDD contract docs such as API-first checks, traceability, quality gates, tests, mock docs, review checklist, test-report skeleton, and handoff before Superpowers technical design.
---

# SDD Docs

Use this skill after a feature is frozen or after `$openspec-propose` has
created the base OpenSpec artifacts. This skill is an SDD contract-doc wrapper;
it must not replace the installed OpenSpec skills for core artifact generation
and must not generate implementation prompts.

## OpenSpec First

For new OpenSpec document generation, invoke `$openspec-propose` first. The
OpenSpec skill must drive:

- `openspec new change "<name>"`
- `openspec status --change "<name>" --json`
- `openspec instructions <artifact-id> --change "<name>" --json`
- artifact creation in the dependency order returned by the OpenSpec CLI

Only after the OpenSpec artifacts exist should this skill add or refine SDD
quality artifacts such as API contract details, traceability, quality gates,
mock/test strategy, review checklist, and test-report skeleton.

Do not hand-write fixed OpenSpec templates when `openspec instructions` can
provide the schema-specific template, rules, dependencies, and output path.
Do not invent new fields or requirements.

## Preconditions

For complex requirements, verify these before writing docs:

- `source-ingestion.md`, `feature-inventory.md`, and `feature-gates.md` prove
  that the original PRD/Lark/Feishu/screenshots were processed section by
  section, not summarized into tasks in one whole-document pass. Each feature
  used by docs must have a source range/page/screenshot reference and a frozen
  or explicitly blocked gate. If this evidence is missing for a long or mixed
  requirement source, stop and return to `$superflow-clarify`.
- The OpenSpec/SDD docs include platform-level impact discovery evidence.
  Prefer understand-anything artifacts when present, but treat them only as
  locator evidence. If missing, stale, incomplete, or unavailable, the docs must
  show the downgrade path: `rg`, source reading, Mapper/XML, configuration,
  database table names, log templates, and sibling-repo search. Do not stop only
  because understand-anything is missing; stop when no platform impact discovery
  evidence exists.
- The docs record: discovery method, understand-anything index status when
  available, analyzed platform scope, impacted modules/interfaces/tables,
  sibling repo or SDK implications, regression risks, source/DB/API
  confirmation evidence, and validation approach.
- For cross-repository, service-to-service, SDK, MQ, scheduler, device,
  callback, third-party, mini-program, gateway, or adapter designs, the docs
  include a module responsibility and call-direction judgment before freezing
  API/tasks/tests. The judgment must identify the business-entry owner, outbound
  adapter owner, existing entry/exit points, proposed entry/exit points, and
  forbidden shortcuts. If the design would route a business entry through an
  outbound adapter/protocol translator/device gateway, stop and return to
  `$superflow-clarify` unless owner approval is explicitly recorded.
- For any design that depends on existing source behavior, table relationships,
  data permissions, field ownership, status derivation, external parameters, or
  upstream/downstream calls, the docs include a verified evidence chain:
  platform impact discovery scope, source/Mapper/XML anchors, and read-only DB
  checks when source is insufficient. Graph output or chat explanation alone is
  not sufficient. If this evidence is missing and the relationship affects
  design, stop and return to `$superflow-clarify`.
- For any database-backed design, the docs include table-to-code reverse impact
  evidence: every affected table/field, all writers/readers/filters, sibling
  repo or third-party consumers, real user-facing endpoints, reverse-state
  scenarios, and validation cases. If the docs only describe the write/sync
  path and do not prove consumers, stop and return to `$superflow-clarify`. Use
  `$superflow-table-impact-analysis` when available.
- For any status, enum, sync, derived, default, or compatibility behavior, the
  docs include business semantic evidence:
  `真源字段 | 真源枚举 | 目标字段 | 目标枚举 | 消费方解释 | 业务依据 | 不确定项`.
  If the docs only prove that a value exists, is non-null, or lets the request
  succeed, stop and return to `$superflow-clarify`. If fallback/default/keep-old-value
  behavior is proposed without explicit requirement or owner approval, stop.
- For low-freedom implementation handoff, docs include the five hard gates:
  field semantic contract, write-through persistence closure, real-entry call
  chain, no-fallback/no-guessing boundary, and pre-coding agent self-check. If
  any gate is missing from `design.md`, `tests.md`, or quality gate, stop and
  complete the docs first.
- `design.md` stays the OpenSpec/SDD design contract: requirement mapping,
  API/DB/field semantics, source facts, real-entry call chain, no-fallback
  boundary, risks, and acceptance hooks. It must not try to own all source-level
  implementation choreography.
- `design.md` includes a "Superpowers Technical Design Handoff" placeholder
  that states the boundary and target path for the later `$superflow-design` phase:
  OpenSpec/SDD owns WHAT/contracts, Superpowers owns source-level HOW. Do not
  write the final technical design in `$superflow-docs`.
- `.sdd/handoff/sdd-context.md`, `.sdd/handoff/sdd-context.json`, and
  `.sdd/handoff/sdd-context.sha256` exist for the change/task. Generate them
  with `../superflow-pipeline/scripts/superflow-handoff.sh <change-dir> --refresh`
  after core OpenSpec/SDD docs are written and before `$superflow-design` or
  implementation prompt generation. Also initialize
  `.sdd/state.yaml` with
  `../superflow-pipeline/scripts/superflow-state.sh init <change-dir> docs`.
- `sdd-quality-gate.md` records the handoff command, context hash, and
  `../superflow-pipeline/scripts/superflow-guard.sh <change-dir> docs` result.
  Missing handoff/state evidence is `Blocked for context drift guard`.
- `.sdd/state.yaml` records `phase: docs`, `workflow`, `handoff_context`,
  `handoff_hash`, `context_compression`, and any known `build_command` /
  `verify_command`.
  Do not manually edit phase. When docs are complete, run
  `../superflow-pipeline/scripts/superflow-yaml-validate.sh <change-dir>` and
  `../superflow-pipeline/scripts/superflow-guard.sh <change-dir> docs --apply`; the
  guard must advance state through `docs-complete` into `phase: design` for
  full workflow and print the deterministic next step.
- For very large requirements, multi-agent handoff, or repeated context
  compression risk, create project `.sdd/config.yaml` or
  `<change-dir>/.sdd/config.yaml` with `context_compression: beta` before
  running `superflow-handoff.sh --refresh`. See
  `../superflow-pipeline/references/project-config.md`.
- If docs hit a real decision point, use
  `../superflow-pipeline/references/decision-point.md` and record the decision
  in `design.md` or `sdd-quality-gate.md` before regenerating handoff.
- `tests.md` can freeze executable tests before implementation. For each
  scenario/API/database-backed path, it must include concrete test data source,
  automation command, assertion, RED expected failure, GREEN expected pass,
  DB/log evidence, and matching `test-report.md` section. If test data,
  token, device, third-party dependency, or environment is unavailable, mark
  that case `Blocked`/`Partially verified`; do not leave it as an open TODO.
- `feature-gates.md` exists and the current feature is `已冻结`.
- `ui-contract.md` contains page-to-API/DTO/DB mapping.
- `gap-analysis.md` has no unresolved blocker for the current feature.
- A precise `api.md` section exists or can be generated from the confirmed API draft.

If any precondition fails, stop and return to `$superflow-clarify`.
If the base OpenSpec change does not exist, stop and invoke `$openspec-propose`.

## Required Documents

Generate or update through OpenSpec instructions first, then SDD checks as
applicable:

- `proposal.md`
- `bug-fix-plan.md` for bug fixes, production/test incident reports, root-cause
  reports, CR/Px fixes, and report-driven corrections
- `api.md`
- `specs/<capability>/spec.md`
- `design.md`
- `tasks.md`
- `tests.md`
- `test-report.md` skeleton
- `sdd-quality-gate.md`
- `traceability-matrix.md` when tasks are split
- `mock.md` when external dependencies exist
- `review-checklist.md` when implementation will be split
- `.sdd/state.yaml`
- `.sdd/handoff/sdd-context.md`
- `.sdd/handoff/sdd-context.json`
- `.sdd/handoff/sdd-context.sha256`
- `.sdd/config.yaml` when context compression mode differs from default

For every embedded P/CR/bug-fix/follow-up task, create the same document set
inside that task directory before updating aggregate/root documents:

- `.openspec.yaml`
- `proposal.md`
- `bug-fix-plan.md` when applicable
- `api.md`
- `spec.md` or `specs/<capability>/spec.md`
- `design.md`
- `tasks.md`
- `tests.md`
- `traceability-matrix.md`
- `review-checklist.md`
- `sdd-quality-gate.md`
- `test-report.md`

Then update root `tasks.md`, root `tests.md`, root `traceability-matrix.md`,
root `sdd-quality-gate.md`, and root `test-report.md`. Missing any task-local
required document or root cross-link is `Blocked for docs`; do not proceed to
`$superflow-design`.

Use references only as needed:

- `../superflow-pipeline/references/openspec-format.md`
- `../superflow-pipeline/references/document-templates.md`
- `../superflow-pipeline/references/api-design-template.md`
- `../superflow-pipeline/references/quality-standards.md`
- `../superflow-pipeline/references/quality-gate.md`
- `../superflow-pipeline/references/traceability-matrix.md`
- `../superflow-pipeline/references/mock-strategy-guide.md`
- `../superflow-pipeline/references/test-execution-template.md`
- `../superflow-pipeline/references/test-guide.md`
- `../superflow-pipeline/references/validation-integrity.md`
- `../superflow-pipeline/references/decision-point.md`
- `../superflow-pipeline/references/dirty-worktree.md`
- `../superflow-pipeline/references/project-config.md`

## Rules

- API is design input, not post-implementation documentation.
- New requirements and bug fixes must include platform-level impact discovery
  before finalizing design/tasks/tests. Use understand-anything as a locator
  when available, but do not use it as the design authority. Do not rely only
  on the current service's local design; verify whether sibling repos, shared
  SDKs, common DTOs, shared database tables, scheduled jobs, callbacks, external
  platform adapters, or configuration consumers are affected.
- Do not freeze cross-module design from "this module can technically call it"
  evidence. `design.md` or `traceability-matrix.md` must include:
  `链路步骤 | 调用方向 | 业务入口 owner | 出口/适配 owner | 既有入口/出口 |
  拟新增入口/出口 | 是否符合职责 | 证据锚点 | 禁止绕路`.
  Outbound adapters, protocol translators, MQ notification consumers, and
  device gateways must not be promoted into business-entry orchestrators unless
  the contract says they own that entry and records approval.
- Do not finalize a design by guessing existing relationships from names. For
  existing-code-backed decisions, start with platform impact discovery, then
  verify with source/Mapper/XML anchors, then database checks if source is not conclusive.
  If the relation is still unclear, write a blocker and ask the user; do not
  turn an assumption into a requirement, table design, API contract, or prompt.
- Do not finalize database-backed design from a forward-only flow. For each
  affected table/field, `design.md` or `traceability-matrix.md` must include:
  `表/字段 | 写入方 | 读取/过滤方 | 跨仓/外部消费方 | 真实入口 | 反向状态场景 | 必测用例`.
  Status fields must include recovery scenarios such as offline -> online,
  deleted -> restored, missing -> reappearing, and old invalid value -> valid
  after an upstream omission.
- Do not finalize status/enum/sync/default design from "has a value" evidence.
  `design.md` or `traceability-matrix.md` must include:
  `真源字段 | 真源枚举 | 目标字段 | 目标枚举 | 消费方解释 | 业务依据 | 不确定项`.
  Default values, fallback values, null-to-available conversions, old-value
  retention, and alternative-field substitution are forbidden unless explicitly
  required for dirty historical data or uncontrollable external input. Approved
  compatibility must document:
  `兜底触发条件 | 业务依据 | 会掩盖的异常 | 监控/告警/暴露方式 | 移除条件 | owner确认`.
- `design.md`, `tests.md`, `sdd-quality-gate.md`, or `test-report.md` must name
  the relationship judgment as `确定/部分确定/不确定` when a bug fix hinges on
  existing data or call-chain behavior.
- `design.md` must reference the frozen `api.md` fields and errors.
- `design.md` must include a "字段语义合同" table for every risky field:
  `字段 | 来源表/DTO/事件 | 真实语义 | 目标字段 | 目标语义 | 是否可等价 |
  证据锚点 | 禁止用法 | 不确定项/owner`.
- `design.md` or `traceability-matrix.md` must include a "写入闭环" table for
  every persisted or synchronized value:
  `业务动作 | Java setter/赋值点 | Converter/DTO 映射 | Mapper insert/update |
  DB column | 后续读取方 | 消费入口 | 验证 SQL | 测试用例`.
- `design.md` must include a "真实入口调用链" table:
  `用户/外部动作 | 上游服务/接口 | 本仓入口 | MQ/异步回调 | 关键字段变化 |
  DB 状态 | 结算/通知/展示消费点 | 真实验证方式`.
- `design.md` or `sdd-quality-gate.md` must include a "禁止 fallback 与猜测实现"
  section. It must explicitly list forbidden defaults, fallback queries,
  substitute fields, keep-old-value behavior, null conversion, and downstream
  compensation. Approved compatibility must include owner confirmation and
  exposure/removal rules.
- `design.md` must include a "Superpowers Technical Design Handoff" placeholder
  after the OpenSpec/SDD contract decisions are written. It records
  `handoff_hash`, the intended technical design path, and states:
  OpenSpec/SDD owns WHAT/API/DB/tests/gates; Superpowers owns source-level HOW,
  TDD/RED order, team split, worktree/port plan, and verification choreography.
  The final technical design is created by `$superflow-design`, not `$superflow-docs`.
- `test-report.md` skeleton must include an "Agent 执行前自检" section with:
  `真实入口已定位 | 字段语义合同已核对 | 写入闭环已核对 |
  禁止兜底边界已确认 | RED 测试已执行 | 允许修改文件 | 禁止修改文件 |
  阻塞项`.
- `tasks.md`, `tests.md`, and later prompts must use the same field names as `api.md`.
- `tests.md` is a pre-implementation contract. It must not be a vague checklist.
  Every case must include:
  `用例ID | 需求/Scenario | 层级L1/L2/L3/L4 | 前置数据 | 操作步骤 |
  自动化命令 | 响应断言 | DB断言 | 日志断言 | RED预期失败 | GREEN预期通过 |
  test-report证据位置`.
- Each visible UI field, button action, list column, dropdown, and enum must map to API/DTO/DB/tests or be explicitly out of scope.
- Every spec scenario must have at least one test case.
- Every implementation batch must have at least one test that can fail before
  code changes. For new behavior this is the new API/service/mapper/unit test;
  for bug fixes this is the reported failure path. If the behavior cannot be
  executed before implementation, write the blocker and required data instead
  of pretending RED is complete.
- Any page-invisible required field is a blocker unless marked backend default or backend-derived.
- For every L3/L4, frontend payload, dropdown, enum, external dependency, export,
  import, or cross-system case, `tests.md` must name the real test data source
  and exact evidence required in `test-report.md`; placeholder data cannot prove
  real integration.
- For every API case, `tests.md` must include an executable interface command
  (`curl`, Postman/Newman, pytest, RestAssured, or project-native test command),
  token/cookie setup, request payload, expected response fields and business
  assertions. It must also list the DB SELECT and log keywords that prove the
  request changed or read the correct state.
- For every affected table/field, `tests.md` must include at least one consumer
  test against a real business entry point, not only a table write or sync-task
  assertion. If a field participates in filtering, startup checks, QR scan,
  order creation, payment/refund, notification, scheduled jobs, or third-party
  adapters, those consuming paths must be listed as required validation or
  explicitly blocked.
- For every status/enum/sync field, `tests.md` must assert the consumer-facing
  business meaning of each involved value. Non-null checks, HTTP 200, successful
  sync-task execution, or "field exists" assertions are insufficient.
- `test-report.md` skeleton must include Red-Green evidence for bug fixes and
  CR/Px follow-ups: failing evidence before the fix, then the same path passing
  after the fix.
- `test-report.md` skeleton must include these sections before implementation:
  `RED 失败证据`, `GREEN 通过证据`, `接口自动化证据`, `DB 核查证据`,
  `日志核查证据`, `未自动化/阻塞用例`, and `Partially verified 边界`.
  Each section must reference concrete `tests.md` case IDs.
- `sdd-quality-gate.md` must include blocking checks for:
  executable tests frozen, RED/GREEN expectations present, interface automation
  commands present, DB/log assertions present, and mock/skipped cases excluded
  from Passed.
- `sdd-quality-gate.md` must include a blocking check that
  `.sdd/handoff/sdd-context.*` exists, the hash is recorded, and
  `../superflow-pipeline/scripts/superflow-guard.sh <change-dir> docs` passes.
- `sdd-quality-gate.md` must include a state-machine check:
  `.sdd/state.yaml` exists, `phase: docs` before docs completion, and
  `superflow-state.sh next <change-dir>` / `recover <change-dir>` have clear output.
- External dependency failures must be modeled as blocked, partially verified,
  or real integration passed. A generic fallback error is not a pass unless the
  requirement explicitly says so.
- Do not proceed to `$superflow-design` until quality gates pass.
- Do not mark document completeness as passed unless `sdd-quality-gate.md`
  lists the actual task-local required files and root cross-links.

## Handoff

When SDD docs pass quality gates, continue with `$superflow-design` for Superpowers
technical design before prompt splitting or coding orchestration.
