---
name: superflow-implement
description: SDD 实现阶段，基于已完成的 SDD 文档生成分批 implementation prompts, CR/Px follow-up prompts, reviewer checklists, validation plans, and test-report updates. Use when the user says 进入开发、生成任务 prompt、让 agent 开发、分批实现、P0/P1/P2、联调补项、CR 追加、验收、测试回填, or asks to implement from existing OpenSpec docs.
---

# SDD Implement

Use `$openspec-apply-change` as the primary path for implementing tasks from an
OpenSpec change. Use this skill only after SDD docs exist and the user needs
extra SDD-specific prompt splitting, P0/P1/P2 handoff, CR/Px follow-up prompts,
review checklists, validation plans, or test-report updates.

## Preconditions

- `proposal.md`, `api.md`, `design.md`, `tasks.md`, `tests.md`,
  `traceability-matrix.md`, `sdd-quality-gate.md`, `test-report.md`, and
  `review-checklist.md` exist. Prompt files may be absent at entry because this
  skill owns prompt generation; they are mandatory before this phase can exit.
  For full workflow, `docs/superpowers/specs/*-technical-design.md` exists and
  `.sdd/state.yaml` records it as `technical_design`.
  For bug fixes, root-cause reports, incident fixes, CR/Px fixes, and
  report-driven corrections, `bug-fix-plan.md` also exists.
- If the task is embedded under a larger change, root `tasks.md`, `tests.md`,
  `traceability-matrix.md`, `sdd-quality-gate.md`, and `test-report.md`
  reference the task before prompt generation. Root `prompt/implementation.md`
  and root `prompt/<task-name>.md` must be created and cross-linked before
  implementation phase exit.
- `tests.md` contains executable test cases with case IDs, automation commands,
  RED expected failures, GREEN expected passes, DB assertions, log assertions,
  and matching `test-report.md` evidence locations. If tests are vague,
  missing automation commands, or lack RED/GREEN expectations, stop and return
  to `$superflow-docs`.
- `.sdd/handoff/sdd-context.md`, `.sdd/handoff/sdd-context.json`,
  `.sdd/handoff/sdd-context.sha256`, and `.sdd/state.yaml` exist for the
  change/task. If missing, run
  `../superflow-pipeline/scripts/superflow-handoff.sh <change-dir> --refresh` and
  `../superflow-pipeline/scripts/superflow-state.sh init <change-dir> docs`, then
  rerun `../superflow-pipeline/scripts/superflow-guard.sh <change-dir> docs`.
  If the guard fails, stop and return to `$superflow-docs`.
- `.sdd/state.yaml` must be in `phase: implement` before implementation prompt
  execution. If it is still `docs`, run
  `../superflow-pipeline/scripts/superflow-yaml-validate.sh <change-dir>` and
  `../superflow-pipeline/scripts/superflow-guard.sh <change-dir> docs --apply`
  after the docs gate passes. If `superflow-state.sh recover <change-dir>` reports a
  stale handoff, stale prompt, or missing field, return to `$superflow-docs`.
  If it is still `design`, run
  `../superflow-pipeline/scripts/superflow-guard.sh <change-dir> design --apply`
  after the Superpowers technical design gate passes.
- Before splitting into worktrees or subagents, apply
  `../superflow-pipeline/references/dirty-worktree.md`. If SDD docs changed,
  regenerate handoff and require every agent to reread the new hash.
- Existing SDD docs record platform-level impact discovery evidence. Prefer
  understand-anything artifacts when present, but treat them only as locator
  evidence. If missing, stale, incomplete, or unavailable, docs/prompts must
  show the downgrade path: `rg`, source reading, Mapper/XML, configuration,
  database table names, log templates, and sibling-repo search. Missing
  understand-anything alone is not a blocker; missing platform impact discovery
  evidence is a blocker.
- Existing SDD docs record discovery method, understand-anything index status
  when available, analyzed platform scope, impacted modules/interfaces/tables,
  regression risks, source/DB/API confirmation evidence, and validation approach.
- For complex requirements, `feature-gates.md` marks the target feature as `已冻结`.
- The target scope is explicit: one feature, one batch, or one CR/Px follow-up.

If docs are missing, only root-level links exist without task-local docs, or the
feature is not frozen, stop and return to `$superflow-docs` or `$superflow-clarify`.

## Prompt Completeness Is Mandatory

Before implementation phase can exit:

- `prompt/implementation.md` exists as the root prompt index.
- At least one task prompt exists under `prompt/<task-name>.md`; root
  `prompt/implementation.md` alone is not enough when `tasks.md` contains task
  checkboxes.
- `tasks.md`, `traceability-matrix.md`, `sdd-quality-gate.md`, and
  `test-report.md` link the generated prompt files.
- Embedded tasks have both task-local `prompt/<task-name>.md` and root
  `prompt/<task-name>.md`, and both point back to the task-local docs.
- Missing prompts are `Blocked for prompt generation`; do not proceed to
  coding or verification.

## Prompt Splitting Rules

- Split by independently verifiable feature closure, not by a giant backend module.
- Use P0 for baseline only: worktree, branch, compile, SQL/entity/mapper/DTO consistency.
- Keep business prompts small and explicit.
- Every implementation prompt must begin with the mandatory superpower/team
  prefix from `../superflow-pipeline/references/implementation-prompt-template.md`:
  `使用superpower技能，开启合适的团队，最少包含一名开发和一名测试交叉验证进行需求开发，测试验证闭环交付，更新测试文档和api.md：`
  It must also state that missing superpower blocks normal development, and must
  name at least Worker, independent Tester, Reviewer, and Leader responsibilities.
  Do not generate "single-agent only" prompts for implementation work.
- Every implementation prompt must include a "Superpower 技术详设继承" section.
  It must link and summarize `.sdd/state.yaml` `technical_design`
  (`docs/superpowers/specs/*-technical-design.md`) as the source-level HOW
  authority:
  `执行模式 | 团队角色 | 拆分建议 | TDD/RED切入点 | 独立Tester验证点 |
  高风险猜测点 | 禁止自由发挥项 | handoff_hash | 进入prompt的强制要求`.
  The prompt must say that OpenSpec/SDD docs remain the WHAT/API/DB/tests
  source of truth. Superpowers may own technical design, development,
  testing, review, worktrees, and verification choreography, but must not change
  requirements, API, DB, SQL, field semantics, tests, or acceptance gates. If
  the technical design is missing, stale, or contradicts `design.md`/`api.md`/
  `tests.md`, stop and return to `$superflow-docs`.
- When a task changes field values, status/enum values, online/offline state,
  deletion/restoration state, sync markers, payment/refund status, third-party
  status, or any value read by other code, every implementation prompt must
  include "字段/状态反向影响面核实". It must inherit the technical design
  `Field And Status Reverse Impact` matrix and require reverse search across
  source, Mapper XML, entities, DTO/VO, SQL, scheduled jobs, MQ/event consumers,
  callbacks, third-party adapters, shared SDK/tables, and sibling repos when
  applicable. A prompt that only changes the direct setter/writer is blocked.
- When a task changes money, fees, discounts, deductions, refunds, sharing,
  payments, invoices, balances, electricity/service fees, package settlement,
  proration, allocation, reconciliation, or financial display, every prompt
  must include "金额精度边界继承". It must copy the technical design
  `Money Precision Boundary`, keep calculation-state precision until the
  confirmed settlement/display boundary, forbid early `setScale(2)` before
  later slicing or aggregation, and require deterministic residual allocation.
  RED/GREEN coverage must include half-cent, residual, or multi-detail cases
  and prove reconciliation identities in `test-report.md`.
- Every implementation prompt must include a "上下文防漂移与状态继承" section.
  It must link `.sdd/handoff/sdd-context.md` as a clickable Markdown link,
  record the exact `handoff_hash`, and require Worker/Tester/Reviewer to read
  the handoff plus original `api.md`/`design.md`/`tests.md` and
  `technical_design` before coding.
  After any SDD doc change, the team must rerun `superflow-handoff.sh --refresh` and
  compare the new hash. A stale or mismatched hash blocks coding and delivery.
  The prompt must also require `.sdd/state.yaml` phase evidence and
  `superflow-guard.sh <change-dir> implement` before moving to verification.
- Every implementation prompt must include a "状态机执行决策" section. It must
  record `build_mode`, `isolation`, `tdd_mode`, `review_mode`,
  `subagent_dispatch` when applicable, `implementation_prompt`, and the derived
  `worktree_ports` in `.sdd/state.yaml` with `superflow-state.sh set`. Full
  workflow may not use `build_mode: direct` unless `direct_override: true` is
  explicitly recorded. Full workflow must choose
  `review_mode: off|standard|thorough` before leaving implement; choosing `off`
  requires a written reason.
  Before verification, run `superflow-state.sh scale <change-dir>` and then
  `superflow-guard.sh <change-dir> implement --apply`.
- If `build_mode: subagent-driven-development`, every prompt must require
  `.sdd/subagent-progress.md` from
  `../superflow-pipeline/references/subagent-progress.md`. Worker, Tester,
  Reviewer, and Leader rows must include worktree, port, scope, status,
  stage, implementation commit, RED/GREEN evidence, spec review, quality
  review, review-fix round, evidence, and blocker. Context compression or
  handoff hash changes force all rows back to reread mode before coding
  continues.
- When a subagent task is checked off, the coordinator must run
  `superflow-state.sh task-checkoff <plan_file> <plan_task_text>` and, when mapped,
  `superflow-state.sh task-checkoff <openspec_task_file> <openspec_task_text>`.
  Duplicate task text or unchecked task state blocks continuation.
- Every implementation prompt must include a "平台级影响面发现与事实核实" section.
  It must instruct the development team to use understand-anything as a locator
  when available, or downgrade to `rg`, source reading, Mapper/XML,
  configuration, database table names, log templates, and sibling-repo search
  when it is missing, stale, incomplete, or unavailable. The team must inspect
  the whole platform impact:
  current repo, sibling repos, shared SDKs/DTOs, shared database tables,
  callbacks, scheduled jobs, external platform adapters, and configuration
  consumers. The prompt must require evidence in `test-report.md`:
  `发现方式 | understand 索引状态 | 分析范围 | 受影响模块/接口/表 | 潜在回归点 | 源码/DB/API事实核实 | 验证命令/真实链路`。
  understand-anything output alone is not proof. Missing platform impact
  discovery or missing source/DB/API confirmation blocks coding.
- Every implementation prompt that relies on an existing field, table relation,
  data permission rule, status flow, Mapper/XML query, external parameter, or
  upstream/downstream call must include an "既有代码与数据关系核实" section.
  It must require the Worker/Reviewer to verify in this order:
  platform impact discovery -> source/Mapper/XML anchors -> read-only database
  checks when source is insufficient. The prompt must forbid blind design from
  field names or graph output, and must require the agent to stop and ask the
  user when the relationship is still unclear after those checks.
- Every implementation prompt must include a "字段语义合同" section when risky
  fields are present. The Worker must copy the contract from `design.md` and
  verify it against current source/Mapper/DB before coding:
  `字段 | 来源表/DTO/事件 | 真实语义 | 目标字段 | 目标语义 | 是否可等价 |
  证据锚点 | 禁止用法 | 不确定项/owner`.
  Any unverified field semantics block coding.
- Every implementation prompt that writes, updates, binds, persists, snapshots,
  synchronizes, or advances status must include a "写入闭环核查" section:
  `业务动作 | Java setter/赋值点 | Converter/DTO 映射 | Mapper insert/update |
  DB column | 后续读取方 | 消费入口 | 验证 SQL | 测试用例`.
  The prompt must forbid treating Java assignment as persistence proof.
  Mapper/XML/DB/consumer evidence is required before delivery.
- Every implementation prompt must include a "真实入口调用链" section. It must
  require the Worker to identify the real Controller/RPC/MQ/scheduler/device/
  applet/third-party entry, upstream/downstream services, async callbacks,
  critical field changes, DB state, and final consumer. Service-only or
  test-controller-only evidence is not enough for completion.
- Every implementation prompt that touches database-backed behavior must include
  a "数据表反向影响面核查" section. It must require the team to start from each
  affected table/field and enumerate all writers, readers, filter conditions,
  status/default-value recovery paths, scheduled jobs, MQ consumers, frontend or
  applet endpoints, sibling repos, third-party adapters, and final user-facing
  entry points. The prompt must require reverse-state tests such as offline ->
  online, deleted -> restored, missing -> reappearing, and old invalid value ->
  valid when upstream omits a field. Missing consumer mapping blocks coding.
  Use `$superflow-table-impact-analysis` when available.
- Every implementation prompt that touches status fields, enum fields, sync
  payloads, derived values, defaults, compatibility logic, or cross-system
  interpretation must include a "业务语义优先与禁止默认兜底" section. It must
  require the team to identify:
  `真源字段 | 真源枚举 | 目标字段 | 目标枚举 | 消费方解释 | 业务依据 | 不确定项`.
  The prompt must forbid default values, fallback values, null-to-available
  conversions, old-value retention, and alternative-field substitution unless
  the requirement or owner explicitly approves compatibility for dirty
  historical data or uncontrollable external input. If compatibility is
  approved, the prompt must require:
  `兜底触发条件 | 业务依据 | 会掩盖的异常 | 监控/告警/暴露方式 | 移除条件 | owner确认`.
  Missing semantic proof blocks coding.
- Every implementation prompt must include a "禁止 fallback 与猜测实现" section
  even when no compatibility is planned. It must explicitly forbid defaulting,
  fallback queries, substitute fields, keep-old-value behavior, null-to-valid
  conversion, silent skip, and downstream compensation for upstream missing
  snapshots unless the docs record owner-approved compatibility.
- Every implementation prompt must include a "测试先行与红绿验证" section before
  any coding steps. It must require the Worker to:
  1. read `tests.md` and list the exact case IDs in scope;
  2. create or activate the automated tests first;
  3. run the targeted command before production-code edits and record the RED
     failure output in `test-report.md`;
  4. only then write minimal production code;
  5. rerun the same command and record the GREEN pass output;
  6. keep the same case IDs linked through `tests.md`, prompt, and
     `test-report.md`.
  If a RED run cannot be executed because of missing environment, token, device,
  third-party service, or test data, the prompt must require `Blocked` or
  `Partially verified`; it must not permit coding first and backfilling tests.
- Every implementation prompt for API, CRUD, Mapper/XML, database-backed,
  configuration-driven, MQ, scheduled-job, payment/refund, device, applet, or
  third-party behavior must include an "接口自动化执行清单" section. It must
  extract all relevant L3/L4 cases from `tests.md` and include complete command
  templates: token/cookie setup, curl/Postman/Newman/pytest/RestAssured command,
  request payload source, response assertions, DB SELECT, log keywords, and
  evidence fields to paste into `test-report.md`.
  These cases are hard-gated by
  `superflow-test-report-lint.py --tests <tests.md> <test-report.md>`; a report
  that only contains unit tests, mock evidence, BUILD SUCCESS, or generic
  keywords must be marked `Blocked`/`Partially verified`, not Passed.
- Every prompt must forbid these shortcuts explicitly:
  tests-after only, `BUILD SUCCESS` as proof, skipped tests as pass, mock-only
  pass for real integration, HTTP 200 without business assertions, DB-only
  proof without consumer path, and changing tests to match an implementation
  without updating SDD docs and getting review.
- Every implementation prompt must include an "Agent 执行前自检" section before
  edit permissions. The Worker must fill:
  `真实入口已定位 | 字段语义合同已核对 | 写入闭环已核对 |
  禁止兜底边界已确认 | RED 测试已执行 | 允许修改文件 | 禁止修改文件 |
  阻塞项`.
  Any unchecked or uncertain item blocks production-code edits.
- Every worktree prompt must include a "worktree 启动端口" section. The agent
  must read the current application config first, find the base `server.port`
  and context path, then derive this task's port as `base port + P/CR number`
  (for example P50 with base 9250 uses 9300). The prompt must show the derived
  port, explicit startup command with `--server.port=<derived-port>`, Base URL,
  health check/curl URLs using that port, and a fallback rule to move to the
  next free port only when the derived port is occupied. Do not let worktree
  prompts reuse the main workspace port by default.
- Every implementation prompt must make referenced Markdown files clickable.
  When listing SDD/OpenSpec docs, prompt files, SQL summaries, reports, or
  related local docs, use Markdown links such as `[design.md](../design.md)` or
  `[P64 prompt](p64-export-plot-display.md)` instead of plain text paths.
  Links must be relative to the prompt file location and must point to the real
  file. Keep code/source file paths as plain inline code when line precision is
  more useful, but any referenced `.md` handoff document must be clickable.
- Each prompt must state allowed files, forbidden files, dependencies, exact API contract, DB fields, tests, and report format.
- Database-backed prompts must include this table in the prompt and require it
  to be filled in `test-report.md`:
  `表/字段 | 写入方 | 读取/过滤方 | 跨仓/外部消费方 | 真实入口 | 反向状态场景 | 验证证据`.
- If a prompt touches sibling repos, SDKs, public jars, protocol DTOs, enums,
  validation annotations, serialization field types, or Maven/Gradle dependencies,
  it must include a "引用项目版本升级" section. That section must name current
  version, target version, dependency file to update, build/install/deploy command,
  and dependency-resolution evidence required in `test-report.md`.
- Do not allow same-version SNAPSHOT overwrite as closure for public SDK changes;
  require an explicit version bump such as `1.0.8-SNAPSHOT -> 1.0.9-SNAPSHOT`
  unless the user or release owner explicitly provides a different version.
- If a batch has already been executed, do not edit its old prompt. Create a new CR/Px or next-number prompt.
- Do not mix unrelated changes into the current implementation prompt.
- For parallel worktree execution, worker prompts must update only their own
  `embedded-changes/pXX-*` delivery files (`tasks.md`, `test-report.md`,
  `sdd-quality-gate.md`, and related P-local docs). They must not edit
  top-level aggregate OpenSpec files such as root `tasks.md`,
  `test-report.md`, `traceability-matrix.md`, `sdd-quality-gate.md`, or
  `tests.md`; those files are updated later by a Leader closeout prompt to
  avoid merge conflicts.

Use references only as needed:

- `../superflow-pipeline/references/batch-split-guide.md`
- `../superflow-pipeline/references/batch-prompt-template.md`
- `../superflow-pipeline/references/superpower-technical-design-template.md`
- `../superflow-pipeline/references/p0-baseline-template.md`
- `../superflow-pipeline/references/implementation-prompt-template.md`
- `../superflow-pipeline/references/orchestration.md`
- `../superflow-pipeline/references/reviewer-checklist.md`
- `../superflow-pipeline/references/quality-gate.md`
- `../superflow-pipeline/references/validation-integrity.md`
- `../superflow-pipeline/references/decision-point.md`
- `../superflow-pipeline/references/dirty-worktree.md`
- `../superflow-pipeline/references/subagent-progress.md`
- `../superflow-pipeline/references/project-config.md`

## Implementation Gate

Before saying a batch is complete:

- Verify task document completeness first. Required task-local files:
  `.openspec.yaml`, `proposal.md`, bug-fix `bug-fix-plan.md` when applicable,
  `api.md`, `spec.md` or `specs/<capability>/spec.md`, `design.md`,
  `docs/superpowers/specs/*-technical-design.md` for full workflow, `tasks.md`,
  `tests.md`, `traceability-matrix.md`, `review-checklist.md`,
  `sdd-quality-gate.md`, `test-report.md`, and task-local
  `prompt/<task-name>.md`. For embedded tasks, also verify root
  `prompt/<task-name>.md`, root `prompt/implementation.md`, root `tasks.md`,
  root `tests.md`, root `traceability-matrix.md`, root `sdd-quality-gate.md`,
  and root `test-report.md` all reference the task. Missing files or links mean
  `Blocked for docs`, not ready for coding.
- Verify prompt cross-links next: the task-local prompt and root prompt both
  exist when applicable, `prompt/implementation.md` references the root prompt,
  `tasks.md` references it, `traceability-matrix.md` references it, and
  `tests.md` / `test-report.md` contain the matching validation entry.
- Verify Red-Green evidence before accepting code: `test-report.md` must show
  the pre-code RED command/output for each bug fix or new behavior case, then
  the same command/output passing after implementation. If tests were written
  only after code or RED was not observed, mark `Blocked`.
- Verify interface automation evidence: for every in-scope L3/L4 API or real
  business entry, `test-report.md` must include command, request payload source,
  response assertion, DB SELECT evidence, log evidence, and actual environment
  details. Missing token/device/third-party/test data means
  `Blocked`/`Partially verified`, not Passed.
- Verify Markdown handoff links: every referenced `.md` file inside generated
  prompt docs is formatted as a clickable relative Markdown link and the target
  file exists from the prompt file's directory.
- Verify platform impact discovery evidence: the team analyzed whole-platform
  impact using understand-anything when available or a documented downgrade path
  when unavailable, and `test-report.md` records affected
  modules/interfaces/tables plus source/DB/API confirmation and regression
  validation. Missing platform impact discovery or missing fact confirmation
  means `Blocked`, not complete.
- Verify existing-code/data relationship evidence when the implementation
  depended on existing behavior: graph scope, source anchors, DB checks or
  reason skipped, final judgment, and unresolved questions. If any key
  relationship remains unclear, mark the batch `Blocked` and ask the user
  instead of weakening or inventing the design.
- Verify the five hard gates before accepting a batch: field semantic contract,
  write-through persistence closure, real-entry call chain, no-fallback/
  no-guessing boundary, and agent pre-coding self-check. Missing evidence means
  `Blocked`, even if code compiles and tests pass.
- Verify Superpower execution strategy inheritance before accepting a batch:
  the prompt consumed `.sdd/state.yaml` `technical_design`, kept OpenSpec/SDD
  as the WHAT/API/DB/tests authority, and did not let Superpowers overwrite
  contracts. Missing, stale, or drifting technical design means `Blocked`.
- Verify field/status reverse impact before accepting a batch when any field,
  status, enum, sync marker, online/offline, deletion/restoration, payment/
  refund, or third-party state changed: the prompt and report list writers,
  readers, filters, derived/sync paths, consumers, intentional non-changes, and
  consumer tests. Missing reverse impact evidence means `Blocked`.
- Verify context drift guard before accepting a batch: the prompt and
  `test-report.md` record the same hash as `.sdd/handoff/sdd-context.sha256`,
  `.sdd/state.yaml` exists, and
  `~/.codex/skills/superflow-pipeline/scripts/superflow-guard.sh <change-dir> implement`
  or `verify` passes for the current phase. Stale hash, missing state, or guard
  failure means `Blocked`.
- Verify workflow state before accepting a batch: `.sdd/state.yaml` records
  `build_mode`, `isolation`, `tdd_mode`, `review_mode`, `verify_mode`,
  `technical_design`, `implementation_prompt`, `verification_report`,
  `context_compression`, and current `phase`.
  `superflow-yaml-validate.sh <change-dir>` and
  `superflow-state.sh recover <change-dir>` must give a coherent recovery action
  after context compression. Missing or contradictory state means `Blocked`.
- Verify subagent progress when parallel execution was used:
  `.sdd/subagent-progress.md` exists, all rows reference the current
  `handoff_hash`, current transaction has a unique task text, stage is
  `checkoff|done`, implementation commit is visible, RED/GREEN evidence is
  present, spec and quality reviews passed, review-fix round is <= 3, task
  checkoff commands passed, no active row has an unresolved blocker, and Leader
  closeout copied worker/tester/reviewer evidence into the delivery docs.
- Verify table reverse impact evidence for database-backed work: all affected
  fields have writers/readers/filters/consumer endpoints mapped, reverse-state
  scenarios tested, and at least one final business entry point verified. A
  sync-task-only pass or DB-only assertion is not enough.
- Verify business semantic evidence for status/enum/sync/default work: the
  source-of-truth field, enum mapping, target field, consumer interpretation,
  and business basis are recorded and tested. A non-null value, HTTP 200,
  successful sync, or fallback/default result is not proof. Unapproved fallback,
  default, old-value retention, null conversion, or alternative-field
  substitution means `Blocked`, not complete.
- Verify compile/build output.
- Verify tests actually ran; `BUILD SUCCESS` alone is not proof.
- Verify tests did not merely pass after implementation. The report must prove
  the test suite could catch the original failure or absent behavior.
- If a sibling repo or SDK was changed, verify its version was bumped, current
  project dependency version was updated, and dependency resolution proves the
  current project uses the new artifact.
- For interface, CRUD, Mapper/XML, database-backed, or configuration-driven
  changes, require the three-layer gate: prompt completion definition,
  `.sdd-enforced`/`.db-verified` hook markers, and
  `~/.codex/hooks/superflow-verify-integration.sh <test-report.md>` before delivery.
- Before committing an implementation batch, require
  `~/.codex/hooks/superflow-delivery-check.sh --check-staged <repo-root>` after
  staging changes. This check must pass together with `superflow-verify-integration`;
  if it reports missing `tasks.md`, `test-report.md`, `sdd-quality-gate.md`, or
  stale completion placeholders, update the delivery documents before commit.
- Before marking any SDD task as delivered, require
  `~/.codex/hooks/superflow-test-report-lint.py --tests <tests.md> <embedded test-report.md>`
  for the current P/CR report. This lint must pass for implementation reports
  and must at least be reviewed for aggregate/root reports. It catches false
  green evidence (`Tests are skipped` + `BUILD SUCCESS`), contradictory
  `Tests run` or `N/N` counts for the same command, missing L3/L4 real-entry
  evidence, stale source anchors, and cross-repo test evidence that omits the
  exact skipTests workaround.
- Report Maven evidence by command, not by wishful grouping. If
  `mvn test -Dtest='*P47*'` does not match a class such as
  `PackageRecordServiceImplTest`, record a separate command for that class
  instead of folding the extra test into the wildcard count.
- Do not quote deleted or rejected implementation details as current evidence.
  If a report must mention an old method or old wording, it must be clearly
  marked as deleted/old and must not appear in the current functional evidence
  table.
- If `superflow-delivery-check.sh` blocks top-level aggregate document changes during
  parallel work, remove those root document edits from the worker commit and
  keep only P-local delivery updates. Only a Leader/closeout worktree may create
  `.sdd-aggregate-closeout` and update aggregate OpenSpec documents in a
  separate commit.
- Treat unit tests as supporting evidence only. The implementation prompt must
  require real Spring Boot startup, process/port/health evidence, real curl/API
  calls, database queries, log checks, and test-report evidence.
- If the batch touches database-backed Java/XML code, verify the version-level
  summary SQL file has been updated. Do not accept "the dev database already
  has it" as completion evidence.
- Record a SQL closeout table for every DB-related batch:
  `P编号 | 表 | 字段/索引/数据 | 源码引用 | 总SQL位置 | 开发库状态 | 测试库状态 | 处理结论`.
- For release SQL closeout, compare three sides: source/Mapper fields,
  development database structure, and `test database current state + version
  summary SQL final state`.
- For L3/L4 tests, record curl, real request parameters and their source,
  response, assertions, DB evidence, logs, and external request/response when
  relevant in `test-report.md`.
- For every table field used by filters, status checks, QR scan, order creation,
  startup, payment/refund, notifications, scheduled jobs, or third-party sync,
  `test-report.md` must show the consumer-path evidence. If the team does not
  know which frontend/applet/API entry consumes a field, the batch is `Blocked`,
  not passed.
- For bug fixes and CR/Px follow-ups, require Red-Green evidence: the exact
  failing curl/test/workflow before the fix, then the same path passing after
  the fix.
- Do not mark placeholder-only, mock-only, skipped, generic external-failure, or
  missing-test-data cases as passed; report them as blocked or partially
  verified.
- Do not accept "ask whether to start the app" as a valid closure. If local
  startup or real API integration cannot run, record the exact blocker and mark
  the batch `Blocked` or `Partially verified`.
- Run or request `openspec validate <change-id> --strict`.
- Report blockers instead of silently weakening the design.

## Follow-Up CR Rules

Use a CR/Px prompt when frontend integration discovers:

- missing API
- missing field
- page-invisible required field
- over-designed field
- wrong enum/status
- pagination naming mismatch
- SQL/schema drift

CR/Px prompts must include the real frontend payload, screenshot or page path, error response, and validation evidence required after the fix.
