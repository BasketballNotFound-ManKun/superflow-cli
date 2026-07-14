---
name: superflow-pipeline
description: SDD 总入口和路由技能。Use when the user says sdd, SDD 流程, OpenSpec 文档, 需求澄清, 生成 spec/design/tasks/tests, 生成任务 prompt, 进入开发, or asks which SDD/OpenSpec phase to use. Routes OpenSpec documents to openspec-propose, source-level technical design to superflow-design, implementation to openspec-apply-change, and uses SDD skills for quality gates, handoff, prompt splitting, and validation.
---

# SDD Spec Pipeline

This is the lightweight SDD router. Do not load the whole SDD process when a smaller phase skill is enough.

## Choose The Right SDD Skill

- Use `$openspec-explore` when the user is still thinking through a requirement,
  wants to compare options, or needs codebase investigation before a change.
- Use `$superflow-clarify` only when product inputs are complex and must be frozen one
  feature at a time before creating OpenSpec artifacts.
- Long PRDs, Lark/Feishu exports, screenshot-heavy requirements, and mixed
  product documents must not be converted into proposal/tasks in one pass.
  Route them through `$superflow-clarify` first. The clarify phase must create a
  source index and freeze or block one bounded feature/section at a time before
  `$openspec-propose` or `$superflow-docs` can write full documents.
- Use `$openspec-propose` as the primary path for OpenSpec document generation.
  It must create the change with `openspec new`, inspect artifact order with
  `openspec status --change <name> --json`, and write artifacts from
  `openspec instructions <artifact-id> --change <name> --json`.
- Use `$superflow-docs` only as an SDD quality wrapper around `$openspec-propose`
  output: API-first checks, UI/API/DB/test traceability, real-data test
  evidence, quality gates, and prompt handoff checks. Do not let `$superflow-docs`
  replace the OpenSpec skill workflow for core OpenSpec artifacts.
- Use `$superflow-design` after `$superflow-docs` passes when full workflow needs
  Superpowers source-level HOW, technical design, reverse impact analysis,
  TDD/RED strategy, Worker/Tester/Reviewer split, or worktree/port planning.
- Use `$openspec-apply-change` as the primary path when the user wants to
  implement tasks from an OpenSpec change.
- Use `$superflow-implement` only for SDD-specific prompt splitting, P0/P1/P2
  handoff, CR/Px follow-up prompts, reviewer checklists, validation plans, or
  test-report updates that are not covered by `$openspec-apply-change`.
- Use `$superflow-verify` when implementation claims completion and the change needs
  scale-based verification, Superpowers verification/code review, test-report
  closure, branch/worktree handling, retry decisions, or transition to archive.
- Use `$superflow-hotfix` only for small bug fixes with clear intended behavior and
  no API/DB/SQL/status/cross-repo/SDK/real-entry uncertainty. Upgrade to full
  SDD when any hard gate is triggered.
- Use `$superflow-tweak` only for tiny non-runtime wording/process/prompt tweaks.
  Runtime behavior, API, DB, hook, integration, or user-facing changes upgrade
  to full SDD.
- Use `$superflow-archive` after verification passes and the user explicitly confirms
  lifecycle closeout.
- Use `$superflow-table-impact-analysis` whenever a requirement, bug fix, sync task,
  SQL change, status field, Mapper/XML query, or cross-repo shared table affects
  database-backed behavior.

## Non-Negotiable Rules

### 上下文防漂移与状态门禁（阻塞级）

SDD 的核心价值是可追溯事实链、接口验证、hook 质量监控、任务 prompt
和 worktree 并行开发能力。为避免长会话压缩、换 agent、切 worktree 或多终端并行
后丢失细节，任何进入 Superpowers 执行策略、实现 prompt 或验收收口的任务，都必须
把当前 OpenSpec/SDD 文档固化成确定性 handoff，并用状态文件记录阶段。

**必须使用的 Codex 侧脚本：**

- `~/.codex/skills/superflow-pipeline/scripts/superflow-handoff.sh <change-dir> --refresh`
  生成 `.sdd/handoff/sdd-context.md`、`.sdd/handoff/sdd-context.json` 和
  `.sdd/handoff/sdd-context.sha256`。
- `~/.codex/skills/superflow-pipeline/scripts/superflow-env.sh`
  导出 `SDD_STATE`、`SDD_GUARD`、`SDD_HANDOFF`、`SDD_ARCHIVE`、
  `SDD_YAML_VALIDATE` 和跨平台 `SDD_BASH`。
- `~/.codex/skills/superflow-pipeline/scripts/superflow-state.sh init <change-dir> <phase>`
  初始化 `.sdd/state.yaml`。
- `~/.codex/skills/superflow-pipeline/scripts/superflow-yaml-validate.sh <change-dir>`
  校验 `.sdd/state.yaml` 的必备字段、枚举、路径和 hash 格式。
- `~/.codex/skills/superflow-pipeline/scripts/superflow-guard.sh <change-dir> docs|implement|verify|archive`
  校验阶段出口；只有确认要推进阶段时才加 `--apply`。
- `~/.codex/skills/superflow-pipeline/scripts/superflow-archive.sh <change-dir> --dry-run|--apply`
  统一执行归档前状态校验、archive guard 和最终状态推进。
- `~/.codex/hooks/superflow-hook-guard.sh` 是 Codex PreToolUse 阶段写入保护：
  `phase: docs` 阻塞运行时代码写入，`phase: archive|done` 阻塞继续改动。

**权责边界：**

- OpenSpec/SDD 文档仍是 canonical source of truth，尤其是 `api.md`、
  `design.md`、`tests.md`、SQL/DB 证据、字段语义合同和真实入口验证。
- Superpowers 正式接管源码级 HOW：技术详设、任务计划、TDD 顺序、
  Reviewer/Tester 分工、worktree/端口编排和验证职责。HOW 文档落在
  `docs/superpowers/specs/YYYY-MM-DD-<change-id>-technical-design.md`，
  并记录到 `.sdd/state.yaml` 的 `technical_design`。
- Superpowers 不得接管 WHAT/合同：需求、API、DB、SQL、字段语义、tests、
  真实入口验收和 SDD hook/quality gate 仍由 OpenSpec/SDD 文档约束。
- `.sdd/handoff/*` 是压缩恢复和多 agent 协作的上下文包，不是新的需求源。
  如果 handoff 与原文冲突，必须回读原始 OpenSpec/SDD 文档。

**强制记录：**

- `sdd-quality-gate.md` 必须记录 handoff 文件路径、hash、生成命令和生成时间。
- 需求澄清、方案讨论或设计路线仍在变化时，必须增量维护
  `.sdd/handoff/brainstorm-summary.md`，把已确认结论、候选方案、待确认问题、
  放弃方案和下一步决策点分开记录。它是压缩恢复检查点，不替代 OpenSpec/SDD
  原文。
- `brainstorm-summary.md` 定稿后、创建或重写 `design.md` 前，必须执行主动压缩
  门禁：优先使用当前宿主的原生压缩/新会话能力；无法程序化触发时，必须提示用户
  手动压缩或明确确认继续。确认结果写入 `.sdd/state.yaml` 的
  `context_compression` 相关记录或 `sdd-quality-gate.md`。
- `design.md` 的 "Superpowers Technical Design Handoff" 必须引用
  `technical_design` 和 handoff hash，并声明 OpenSpec/SDD 文档仍是
  WHAT/API/DB/tests 的事实源。
- 每个实现 prompt 必须引用 `.sdd/handoff/sdd-context.md`，写明继承的
  `handoff_hash`，并要求 agent 在编码前核对 hash 是否与当前文档一致。
- `test-report.md` 必须记录本批次使用的 handoff hash、状态阶段和执行过的
  SDD hook/guard 脚本。

**阻塞规则：**

- 未生成 `.sdd/handoff/sdd-context.*` 就让 Superpowers 写执行策略或生成实现
  prompt，阻塞。
- 方案讨论已发生但没有 `.sdd/handoff/brainstorm-summary.md`，或该文件未区分
  confirmed/candidate/pending/rejected，阻塞创建最终设计。
- `brainstorm-summary.md` 已定稿但未经过主动压缩门禁或用户确认继续，阻塞进入
  `design.md` 生成/重写。
- `design.md`/prompt/test-report 中记录的 handoff hash 与
  `.sdd/handoff/sdd-context.sha256` 不一致，阻塞。
- 会话压缩、换 agent、切 worktree 或并行窗口后，只凭聊天记忆继续设计/编码，
  未先读 handoff 和原始文档，阻塞。
- Superpowers 输出与 OpenSpec/SDD 事实源冲突时，必须回到 SDD docs 修正；
  不得让实现 prompt 夹带第二套需求/API/DB/tests 合同。
- `superflow-guard.sh <change-dir> docs|implement|verify|archive` 不通过时，不得推进到下一阶段。

### SDD Workflow State Machine（阻塞级）

SDD 必须按状态机推进，不能靠聊天上下文、压缩摘要或 agent 自己判断当前阶段。
`.sdd/state.yaml` 是 workflow 状态源；OpenSpec/SDD 文档仍是设计事实源。

**阶段：**

`docs -> design -> implement -> verify -> archive -> done`

**状态字段：**

`.sdd/state.yaml` 至少维护：

`workflow | phase | canonical_spec | design_doc | technical_design | plan | base_ref | build_mode |
build_pause | subagent_dispatch | tdd_mode | review_mode | isolation | verify_mode |
auto_transition | verify_result | verification_report | branch_status | archived |
direct_override | build_command | verify_command | handoff_context | handoff_hash |
superpower_strategy | implementation_prompt | worktree_ports |
context_compression | created_at | verified_at | updated_at`

**上下文压缩模式：**

- 默认 `context_compression: off`，handoff 保留较长文档摘录，适合单仓或中等变更。
- 可在 `<change-dir>/.sdd/config.yaml` 设置 `context_compression: beta`，
  handoff 会压缩摘录长度并在 `.sdd/state.yaml`、`.sdd/handoff/sdd-context.*`
  中记录该模式，适合超长会话、多 agent、多 worktree 交接。
- 可在项目根 `.sdd/config.yaml` 设置 `auto_transition` 和
  `context_compression` 默认值；`SDD_AUTO_TRANSITION` 与
  `SDD_CONTEXT_COMPRESSION` 环境变量拥有最高优先级。
- `context_compression: beta` 必须保留 API/spec/test 合同投影，辅助文档只做
  hash 引用。实现阶段如遇设计、任务或需求细节不清，必须回读原始文件。
- 无论模式如何，`.sdd/handoff/*` 只是恢复索引；任何争议必须回读原始
  OpenSpec/SDD 文档。

**状态命令：**

- `superflow-state.sh status <change-dir>`：输出完整状态。
- `superflow-state.sh next <change-dir>`：根据 phase/workflow/auto_transition 输出下一步 skill。
- `superflow-state.sh recover <change-dir>`：会话压缩、换 agent、切 worktree 后输出恢复动作。
- `superflow-state.sh transition <change-dir> <event>`：只允许合法事件推进：
  `docs-complete`、`design-complete`、`implement-complete`、`verify-pass`、
  `verify-fail`、`archive-reopen`、`archived`。
- `superflow-state.sh scale <change-dir>`：计算 `verify_mode: light|full`。
- `superflow-state.sh task-checkoff <file> <task-text>`：校验任务文本唯一且已勾选。
- `superflow-status.sh <repo-root> [--json]`：列出 active SDD changes、phase、
  workflow、任务完成数和 next skill。

**自动衔接协议：**

- `superflow-guard.sh <phase> --apply` 只负责状态推进。
- 是否自动调用下一个 skill 由 `.sdd/state.yaml` 的 `auto_transition` 决定。
- `auto_transition: false` 时，必须停下并按 `superflow-state.sh next <change-dir>`
  的 `HINT` 提示用户手动进入下一阶段。

**决策点协议：**

- 设计范围、API/DB 合同、执行模式、验证边界、archive closeout 需要用户取舍时，
  使用 `references/decision-point.md` 的格式记录，不用聊天记忆代替。
- 脏工作区、并行 worktree 或跨会话接力前，使用 `references/dirty-worktree.md`
  的检查项，避免覆盖用户改动或拿旧 handoff 继续。
- `build_mode: subagent-driven-development` 时，维护
  `.sdd/subagent-progress.md`，按 `references/subagent-progress.md` 记录
  唯一任务文本、stage、commit、RED/GREEN、双 reviewer 状态、review-fix
  轮次、worktree、端口、证据和 blocker。

**压缩恢复协议：**

当发现会话被压缩、上下文丢失、换 agent、切 worktree 或多终端并行接力时，必须先执行：

```bash
~/.codex/skills/superflow-pipeline/scripts/superflow-state.sh recover <change-dir>
```

然后按输出动作恢复：

- `docs`：重读 OpenSpec/SDD 合同文档和 handoff，必要时重跑 handoff，再跑 docs guard。
- `design`：进入 `$superflow-design`，重读 handoff、`api.md`、`design.md`、
  `tasks.md`、`tests.md` 和 `.sdd/handoff/brainstorm-summary.md`，生成或刷新
  `technical_design` 后跑 design guard。
- `implement`：重读 `.sdd/handoff/sdd-context.md`、`api.md`、`design.md`、
  `tests.md`、`technical_design` 和实现 prompt，从第一个未完成批次继续。
  - 若 `build_pause: plan-ready` 且 `plan` 存在、`isolation/build_mode`
    还没定，不得重写 plan；必须回到计划确认点让用户选择隔离方式、执行模式和
    TDD 策略。
  - 若 `build_pause: plan-ready` 但 `isolation/build_mode` 已存在，视为陈旧暂停；
    先清空 `build_pause`，再按既定 `build_mode` 从第一个未勾选任务恢复。
  - 若 `build_pause: plan-ready` 但 `plan` 缺失，视为坏状态；回到
    `$superflow-implement` 修复或重建计划，禁止直接编码。
  - 若 `build_mode: subagent-driven-development`，主会话只做协调者，必须重读
    `.sdd/subagent-progress.md` 和 `references/subagent-progress.md`，不得直接
    执行 worker task。
- `verify`：进入 `$superflow-verify`，重读 `test-report.md`，重跑 hook/guard，
  完成 Superpowers verification/code review/branch handling，并记录
  `verification_report` 与 `branch_status`。
- `archive`：验证已通过，必须等待用户确认归档。

**轻重验证：**

- 进入 verify 前运行 `superflow-state.sh scale <change-dir>`。
- `light` 只适用于小范围文档/prompt/非运行时代码改动。
- 任一涉及 API、接口自动化、SQL、数据库、Mapper/XML、跨仓、状态/枚举、
  真实入口、MQ、定时任务、第三方、SDK、支付/退款/设备链路的任务，必须是
  `verify_mode: full`。

**预设 workflow：**

- `workflow: hotfix` 或 `workflow: tweak` 只是轻流程预设，不是绕过 SDD。
- 只要触发 API/DB/跨仓/状态字段/真实入口/SQL/SDK/第三方等硬门禁，必须升级为
  `workflow: full`，并回到完整 docs/implement/verify/archive 流程。

### 任务级 SDD 文档完整性门禁（阻塞级）

任何新建或补建的 P/CR/bug-fix/follow-up 任务，都必须先建立“任务本地文档集”，
再挂接到根级聚合文档。不能只在根级 `prompt/`、根级 `tasks.md` 或根级
`traceability-matrix.md` 里留一条链接就进入实现。

**任务本地必备文件：**
- `.openspec.yaml`
- `proposal.md`，说明背景、目标、非目标、影响范围、验收标准
- `bug-fix-plan.md`，仅 bug fix / incident / report-driven 修复必备
- `api.md`
- `spec.md` 或 `specs/<capability>/spec.md`
- `design.md`
- `tasks.md`
- `tests.md`
- `traceability-matrix.md`
- `review-checklist.md`
- `sdd-quality-gate.md`
- `test-report.md`
- `prompt/<p-or-cr-task-name>.md`

**根级挂接必备：**
- 根级 `tasks.md` 必须链接任务目录、任务 prompt、`api.md`、`tests.md`、
  `test-report.md`。
- 根级 `tests.md` 必须挂入任务用例 ID、自动化命令、DB/log 断言和真实入口。
- 根级 `traceability-matrix.md` 必须挂入任务 requirement、测试用例、文档和禁止项。
- 根级 `sdd-quality-gate.md` 必须显式写明任务本地文档完整性已通过。
- 根级 `test-report.md` 必须链接任务本地报告。
- 根级 `prompt/implementation.md` 必须链接根级任务 prompt。
- 根级 `prompt/<p-or-cr-task-name>.md` 必须存在，并指向任务本地文档集和任务本地
  prompt。

**阻塞规则：**
- 缺任一任务本地必备文件，阻塞生成实现 prompt 或进入编码。
- 只有根级 prompt、没有任务本地 `prompt/`，阻塞。
- 只有根级 traceability、没有任务本地 `traceability-matrix.md`，阻塞。
- 只有 bug-fix-plan/design/tasks/tests，没有 `proposal.md`，阻塞。
- `sdd-quality-gate.md` 写“文档完整性通过”但未列出实际文件清单，阻塞。
- 任务文档补齐前，不得把状态写成 `PASS`；只能写 `Blocked for docs`。

### 平台级影响面发现门禁（understand-anything 只是导航，不是事实源）

无论是新需求、修复 bug、CR/Px follow-up，还是只生成实现 prompt，SDD 流程都必须先
发现整个平台代码影响面，再开展设计和修复分析。`understand-anything` 只能作为
locator / 代码地图 / 影响面初筛工具，不能作为设计事实源，不能替代当前源码、
Mapper/XML、数据库样例、接口契约和真实消费入口验证。

**影响面发现方式（优先但可降级）：**
- 优先检查当前仓库是否存在 understand-anything 相关索引/产物，例如
  `.understand-anything/`、`understand-anything.md`、`understand anything.md`、
  或项目约定的 understand-anything 图谱文件。
- 如果索引存在，可以用它快速定位整个平台相关代码，包括当前仓库、同平台
  sibling repo、共享 SDK、公共 DTO、数据库表消费方、定时任务、回调入口、外部平台
  适配器和配置引用。
- 如果索引缺失、过期、范围不完整或无法调用，不得把“缺少 understand-anything”
  作为唯一阻塞原因；必须降级为 `rg`、源码阅读、Mapper/XML、数据库只读核查、
  sibling repo 搜索、日志模板和真实接口入口反查。
- 在 `design.md`、`bug-fix-plan.md`、`tasks.md`、`tests.md`、`prompt/pXX-xxx.md`
  或 `test-report.md` 中至少写明：
  `影响面发现方式 | understand 索引状态 | 已分析代码范围 | 影响模块/接口/表 | 潜在回归点 | 后续事实核实方式`。
- 发现跨仓、SDK、共享表或公共协议影响时，继续触发对应的跨仓 SDK/引用项目版本门禁、
  跨仓数据合同门禁和真实集成测试门禁。

**阻塞规则：**
- 没有任何平台级影响面发现证据，只阅读当前文件、当前 Service、当前接口，阻塞。
- 只阅读当前文件、当前 Service、当前接口，不分析平台级调用和消费方，阻塞。
- 把 understand-anything 图谱、聊天解释或旧索引当成最终事实源，未回读当前源码、
  Mapper/XML、数据库样例、接口契约和真实消费入口，阻塞。
- 未在最终 SDD 完整性自检中展示影响面发现方式、understand 索引状态和事实核实摘要，
  阻塞。

### 既有代码与数据关系核实门禁（阻塞级）

当 SDD 任务需要判断已有代码里的字段来源、表关系、接口调用链、数据权限、
状态流转、外部平台参数、Mapper/XML 查询条件或跨仓消费关系时，必须先用证据
核实，再进入设计。禁止从字段名、历史记忆、单个截图或口头猜测直接推导业务关系。

**强制核实顺序：**

1. 先做平台级影响面发现：优先用 understand-anything 图谱定位相关模块、类、
   接口、Mapper、表、跨仓引用和上下游消费方；索引缺失或不可信时，降级使用
   `rg`、源码目录、Mapper/XML、日志模板、配置、数据库表名和 sibling repo 搜索。
   记录发现方式、索引状态、节点/文件范围和 1-hop 影响面。
2. 再阅读源码和 Mapper/XML，核对字段注释、`@TableName`、resultMap、查询条件、
   join 条件、权限过滤、枚举转换、DTO 入参出参和调用链。
3. 若源码仍无法证明真实数据关系，连接开发/测试数据库只读核查：
   `SHOW CREATE TABLE`、`DESC`、字段样例、关联数据、索引和实际枚举值。
4. 如果影响面发现、源码和数据库核查后仍不能确定，必须把问题列为
   `待用户澄清/产品确认/数据 owner 确认`，并停止冻结设计或生成实现 prompt。

**文档必须记录的证据：**

- `影响面发现方式、understand 索引状态和分析范围`
- `源码锚点：文件/类/方法/Mapper/XML 行为`
- `数据库核查：库表字段、样例 SQL、样例结果或未执行原因`
- `关系判断结论：确定/部分确定/不确定`
- `不确定时的澄清问题和阻塞范围`

**阻塞规则：**

- 只凭字段名相似或记忆判断表关系，阻塞。
- 没有源码锚点就把字段写成真源，阻塞。
- 数据库能核查但没有核查，也没有说明无法连接原因，阻塞。
- 仍不确定却继续设计表结构、数据权限或调用链，阻塞。

### 数据表反向影响面门禁（阻塞级）

当需求新增、修改、同步、回填或依赖任何业务表/状态字段时，必须从“表和字段”
反向扫描全部读写与消费入口，再设计 API、同步逻辑和测试。不能只从本次要改的
上游流程正向推导。

此场景必须使用 `$superflow-table-impact-analysis`；若该 skill 不可用，仍必须按
本节规则执行并在交付中说明降级原因。

**触发条件（任一满足即触发）：**
- 新增/修改表、字段、索引、枚举、默认值、初始化数据或同步规则。
- 引入状态字段，例如 `running_status`、`connector_status`、`own_status`、
  `is_online`、`is_use`、`deleted/is_deleted`。
- 某张表被跨仓同步、复制实体、API 查询、定时任务、MQ 消费、前端/小程序入口、
  第三方适配器或启动/扫码/支付/退款等业务入口间接使用。

**强制反查步骤：**
1. 以每张表和字段为 key 反查全部引用。understand-anything 可用时作为定位工具；
   不可用或不可信时，必须用 `rg`、Mapper/XML、实体注解、SQL、DTO、枚举、
   日志模板、配置和 sibling repo 搜索完成反查。
2. 对每个引用点分类：写入方、读取方、过滤条件、默认值/保留旧值逻辑、状态恢复
   逻辑、跨仓同步方、前端/小程序/第三方真实入口。
3. 识别“反向恢复”场景：下线后上线、删除后重建、缺失后重新出现、旧值为不可用
   但上游本次未传字段、历史脏数据被新过滤条件消费。
4. 将所有会消费该字段的接口/任务/MQ 写入 `design.md`、`tests.md`、
   `traceability-matrix.md` 和实现 prompt；至少覆盖一个最终用户真实入口。
5. 若无法确认某个消费方入口或字段语义，必须标记阻塞并问 owner，不能只验证同步
   任务本身成功。

**阻塞规则：**
- 只证明“同步任务执行成功”，没有证明消费该表的真实入口通过，阻塞。
- 只看写入方，不反查读取/过滤/启动前校验/扫码/小程序入口，阻塞。
- 状态字段只测置为不可用，不测恢复可用和旧值清理，阻塞。
- 跨仓表没有列出全部消费仓和接口，阻塞。
- `tests.md` 没有表级反向影响面用例，阻塞。

### 业务语义优先与禁止默认兜底门禁（阻塞级）

SDD 设计、评审、实现 prompt 和测试报告中，字段/状态/枚举/同步值必须先证明
业务语义正确，再证明链路能跑通。禁止把“非空”“有值”“不报错”“接口返回成功”
当作正确结果。

**强制设计要求：**
- 对每个状态字段、枚举字段、同步字段，必须写清：
  `真源字段 | 真源枚举 | 目标字段 | 目标枚举 | 消费方解释 | 业务依据 | 不确定项`。
- 如果上下游字段名相似、数值相同或看起来可转换，仍必须回到源码、数据库样例、
  接口文档和真实消费入口确认语义；不能只按字段名、默认值或历史记忆设计。
- 禁止为了让链路通过而新增默认值、空值转可用、保留旧值、兼容值、fallback、
  “取另一个看起来有值的字段”等兜底逻辑。
- 只有需求、产品、owner 或兼容方案明确要求处理历史脏数据/外部不可控输入时，
  才允许设计兜底。此时必须记录：
  `兜底触发条件 | 业务依据 | 会掩盖的异常 | 监控/告警/暴露方式 | 移除条件 | owner确认`。
- 测试必须断言业务语义，例如“运行态对外解释为可用”“离线态对外解释为不可用”，
  不能只断言字段存在、非空、接口 200 或同步任务成功。

**阻塞规则：**
- 只写默认值/兜底值，没有业务依据和 owner 确认，阻塞。
- 用“有值”的字段替代真实业务真源，例如用枪口状态替代桩运行状态，阻塞。
- 只验证返回有值或链路成功，不验证值是否符合消费方业务语义，阻塞。
- 兜底让异常数据、缺失字段、旧错误状态静默通过，且没有暴露机制，阻塞。
- 无法证明字段值符合业务语义时，必须标记 `Blocked`，不得冻结设计或生成实现 prompt。

### 金额精度边界门禁（阻塞级）

凡涉及金额、费用、优惠、抵扣、退款、分账、支付、发票、余额、电费、服务费、
套餐结算、比例分摊、明细分配、对账或财务展示，必须从 docs、技术详设、实现
prompt、代码评审、测试到 verify 继承同一份 `Money Precision Boundary`。

- 最终结算/持久化/支付/开票/导出/展示边界前保留计算态原始精度。
- 禁止提前 `setScale(2)` 后继续切片、分摊、汇总、抵扣或反推单价。
- 多明细必须用确定性规则处理尾差，分配合计必须等于目标金额。
- 存在加法恒等式且总额是真源时，只允许独立计算 N-1 个组成项；最后一个组成项
  必须按 `权威总额 - 其余组成项合计` 差额反推。禁止所有组成项分别计算、分别
  舍入后再相加重建权威总额。
- tests.md 和 test-report.md 必须覆盖半分、尾差或多明细场景，并证明原始金额、
  优惠金额、实付/退款金额和分配合计满足合同恒等式。
- 缺少权威总额、差额反推公式、舍入边界、scale/rounding mode、分配规则或对账
  证据时标记 `Blocked`。不适用差额反推时必须写明真实真源和 owner 证据。

### 低自由度研发 Agent 五项硬门禁（阻塞级）

面向低能力或高自由发挥风险的研发 agent，SDD 文档必须把可猜测空间压到最低。
以下五项门禁必须写入 `design.md`、`tests.md`、`traceability-matrix.md`、
`sdd-quality-gate.md` 和实现 prompt。缺一项即阻塞进入编码。

#### 1. 字段语义合同门禁

凡涉及 ID、状态、类型、金额、额度、时间、设备号、站点、用户、订单、订阅、
外部流水、枚举或跨表关联字段，必须建立字段语义合同：

`字段 | 来源表/DTO/事件 | 真实语义 | 目标字段 | 目标语义 | 是否可等价 |
证据锚点 | 禁止用法 | 不确定项/owner`

要求：
- 不能用字段名相似、类型相同、值非空来判断两个字段等价。
- 像 `{externalDeviceId}`、`{siteId}`、`{portId}`、`{tenantId}`、
  `{businessId}`、`{contractId}`、`{benefitType}` 这类字段，
  必须写清真源和消费方解释。
- 若字段语义未确认，必须标记 `Blocked`，不得继续设计、生成 prompt 或编码。

#### 2. 写入闭环门禁

凡设计写了“回填、落库、更新、绑定、持久化、快照、同步、状态推进”，必须证明
从 Java 到数据库再到消费方的闭环：

`业务动作 | Java setter/赋值点 | Converter/DTO 映射 | Mapper insert/update |
DB column | 后续读取方 | 消费入口 | 验证 SQL | 测试用例`

要求：
- 只看到 Java setter 不等于已落库；必须核对 Mapper XML、注解 SQL、BaseMapper、
  resultMap 和条件更新。
- 成组字段必须作为一个合同验证，例如业务绑定三元组
  `{contract_id}/{business_id}/{benefit_type}`，不得只证明其中一个字段。
- 若写入闭环缺 Mapper/DB/消费方任一证据，阻塞。

#### 3. 调用链真实入口门禁

设计和 prompt 必须按真实用户或真实系统入口描述链路：

`用户/外部动作 | 上游服务/接口 | 本仓入口 | MQ/异步回调 | 关键字段变化 |
DB 状态 | 结算/通知/展示消费点 | 真实验证方式`

要求：
- 不能只写 Service 方法或工具类；必须写到 Controller/RPC/MQ/定时任务/设备/小程序/
  第三方真实入口。
- 同一能力存在多条路径时必须拆开，例如用户入口、后台操作、外部集成、MQ 补偿。
- 测试 Controller、mock endpoint、绕过鉴权端点只能作为局部证据，不能替代真实入口。

#### 4. 禁止 fallback 与猜测实现门禁

实现 prompt 必须明确禁止研发 agent 临场自由发挥：

- 禁止因为字段缺失、查不到数据或链路不通就新增默认值、兜底反查、替代字段、
  保留旧值、空值转可用、静默跳过。
- 禁止在下游结算/展示/通知层补偿上游本该写入的业务快照，除非设计明确批准。
- 禁止修改测试断言来迎合实现。
- 只有产品、owner 或兼容方案明确批准历史脏数据/外部不可控输入时，才允许兜底；
  必须记录：
  `兜底触发条件 | 业务依据 | 会掩盖的异常 | 暴露/告警方式 | 移除条件 | owner确认`。

#### 5. Agent 执行前自检门禁

每份实现 prompt 必须要求研发 agent 在编码前填写自检表，并回填到
`test-report.md` 或 P-local 执行记录：

`真实入口已定位 | 字段语义合同已核对 | 写入闭环已核对 |
禁止兜底边界已确认 | RED 测试已执行 | 允许修改文件 | 禁止修改文件 |
阻塞项`

任一项未填、填“不确定”但继续编码、或未记录证据，均视为阻塞。

### 测试先行与接口自动化门禁（阻塞级）

SDD 文档必须先冻结测试，再允许生成实现 prompt。研发 agent 不得先编码再临场补
测试，也不得把人工随手调用、编译成功或接口 200 当作验收。

**测试冻结要求：**
- `tests.md` 必须为每个 spec scenario、API、状态/枚举分支、DB 写入闭环和真实
  消费入口生成可执行测试用例，包含：
  `用例ID | 层级L1/L2/L3/L4 | 前置数据 | 操作步骤 | 自动化命令 | 断言 |
  RED预期失败 | GREEN预期通过 | DB核查 | 日志核查 | test-report证据位置`。
- 涉及接口、CRUD、Mapper/XML、数据库字段、配置驱动行为或跨系统链路时，至少
  有一个 L3/L4 自动化接口用例。用例必须写出完整 Base URL、token/cookie 获取
  方式、curl/Postman/Newman/pytest/RestAssured 等可执行命令、请求体、响应断言、
  DB SELECT 和日志关键词。
- Bug fix、CR/Px follow-up 和回归修复必须写 Red-Green 用例：先定义修复前应失败
  的同一路径，再定义修复后同一路径应通过。没有 RED 失败证据，不得宣称该测试能
  防住回归。
- 测试断言必须验证业务语义和持久化闭环，不能只断言 HTTP 200、字段非空、接口
  不报错、`BUILD SUCCESS` 或 mock 返回成功。
- 如果真实环境、真实 token、第三方系统、设备、支付或测试数据不可用，必须把
  用例状态标记为 `Blocked` 或 `Partially verified`，写明缺口和替代证据边界；
  不得把 mock-only 或跳过测试写成 Passed。

**实现前阻塞规则：**
- `tests.md` 没有可执行自动化命令，阻塞。
- `test-report.md` 没有 Red-Green 证据占位和接口自动化证据表，阻塞。
- prompt 未引用 `tests.md` 的具体用例 ID、自动化命令和 RED/GREEN 要求，阻塞。
- 研发 agent 未先执行 RED 测试或未记录失败原因就开始生产代码，阻塞。

### 阶段与文档门禁

- Complex PRD work must start with `$superflow-clarify`.
- Current feature must be confirmed and marked `已冻结` before moving to the next feature.
- OpenSpec artifact creation must go through the installed OpenSpec skills
  first. Prefer `$openspec-propose` for proposal/design/spec/tasks generation,
  then layer SDD checks on top.
- OpenSpec/SDD owns WHAT and contracts. Superpowers owns source-level HOW in
  `docs/superpowers/specs/*-technical-design.md`, but must not replace
  OpenSpec/SDD requirements, API, database, field semantics, tests, or gates.
- API documentation is design input, not a post-coding supplement.
- Do not generate implementation prompts before `api.md`, `design.md`, `tasks.md`, and `tests.md` exist.
- Do not generate implementation prompts before
  `docs/superpowers/specs/*-technical-design.md` exists, `.sdd/state.yaml`
  records it as `technical_design`, and `sdd-quality-gate.md` confirms it is
  limited to source-level HOW. If it is missing, return to `$superflow-docs`.
- Do not generate implementation prompts before `.sdd/handoff/sdd-context.md`,
  `.sdd/handoff/sdd-context.json`, `.sdd/handoff/sdd-context.sha256`, and
  `.sdd/state.yaml` exist for the change/task. Generate them with
  `scripts/superflow-handoff.sh <change-dir> --refresh` and
  `scripts/superflow-state.sh init <change-dir> docs`. The prompt must record and
  inherit the same handoff hash.
- Do not generate implementation prompts before `tests.md` contains executable
  test cases, Red-Green expectations, interface automation commands, DB/log
  assertions, and matching `test-report.md` evidence placeholders.
- When writing Markdown SDD docs, especially task prompts, any referenced
  `.md` document must be a clickable Markdown link. Use relative links from the
  current document, for example `[design.md](../design.md)` from a prompt file
  or `[P64 prompt](prompt/p64-export-plot-display.md)` from the change root.
  Do not leave handoff docs as plain text such as `design.md` or
  `prompt/p64-export-plot-display.md` when they are meant for navigation.
- Do not make UI-invisible fields required unless the programmer confirmed backend default or backend-derived behavior.
- Do not modify already executed prompts; create a CR/Px or later-number prompt for integration fixes.

#### 完整 SDD 文档请求行为要求（强制）

当用户明确要求按 SDD/OpenSpec 流程生成完整文档，或当前需求已经冻结且没有
开放问题时，不得在只生成基础 OpenSpec 文档后停下来询问是否继续。

**正确顺序：**

1. 先使用已安装的 OpenSpec skill 生成 proposal/design/spec/tasks 等核心
   OpenSpec artifacts。
2. 然后继续补齐 SDD 质量文档：`api.md`、`tests.md`、
   `review-checklist.md`、`sdd-quality-gate.md`，以及任务要求的
   traceability/test-report 占位。
3. 如需求已明确，应继续生成或更新实现 prompt，例如
   `prompt/pXX-xxx.md` 和 `prompt/implementation.md` 总入口引用。
4. 最终一次性汇报已生成/更新的文件清单、仍有占位或开放问题的文件、以及
   进入开发前的下一步。

**如果信息不足：**

- 能生成的文档继续生成，不因单个文档有缺口而停止整个流程。
- 在对应文件写明待补充项，并在最终输出中明确说明。
- 只有存在影响需求冻结的开放问题时，才把 prompt 标记为待需求冻结后生成。

### Prompt 衔接门禁（不可遗漏，阻塞级）

当一个独立 P 任务完成 SDD docs 阶段后，必须确保实现 prompt 已生成并完成交叉挂接，
禁止出现"只有 embedded 文档，没有 prompt"的悬空状态。默认行为是生成 prompt；
只有用户明确说"只讨论/只完善文档/不要生成 prompt"时，才允许不生成，并必须在最终
回复中报告阻塞状态。提醒用户"进入开发前再生成 prompt"不能替代本阶段生成 prompt。

**生成或更新 `embedded-changes/pXX-xxx/` 下任一文档时，必须执行以下检查清单（不可跳过）：**

- [ ] `prompt/pXX-xxx.md` 是否已实际生成？
- [ ] `prompt/implementation.md` 中是否已包含该 PXX 的总入口引用？
- [ ] 根 `tasks.md` 中该 PXX 的条目是否已指向对应的 prompt 文件？
- [ ] `traceability-matrix.md` 是否已包含该 prompt 或实现入口引用？
- [ ] `tests.md` 和 `test-report.md` 是否已包含该 PXX 的验证用例和 Red-Green/阻塞证据占位？
- [ ] prompt 内引用的 `.md` 文档是否全部使用可点击 Markdown 相对链接，且目标文件存在？
- [ ] `.sdd/handoff/sdd-context.md`、`.json`、`.sha256` 是否已生成并记录到
      `design.md`、`sdd-quality-gate.md`、prompt 和 `test-report.md`？
- [ ] `.sdd/state.yaml` 是否已初始化，并能反映当前阶段？
- [ ] `~/.codex/skills/superflow-pipeline/scripts/superflow-guard.sh <change-dir> docs`
      是否通过？
- [ ] PXX 完成验收前是否已执行 `~/.codex/hooks/superflow-test-report-lint.py --tests <tests.md> <embedded test-report.md>`，并确认测试数字、真实链路证据、源码锚点、`Tests are skipped`、跨仓证据口径一致？
- [ ] 如用户明确禁止生成 prompt，最终输出是否写明 `Prompt 衔接检查未通过` 和缺失文件？

**阻塞规则（以下任一情况视为交付不完整）：**

1. PXX 的 embedded 文档目录中不存在实现 prompt 文件（`prompt/pXX-xxx.md`）
2. 根 `tasks.md`、`prompt/implementation.md`、`traceability-matrix.md` 中任一处缺少该 prompt 引用
3. `tests.md` 或 `test-report.md` 缺少该 PXX 的验证入口、失败证据或阻塞判定
4. prompt 内引用的 `.md` 交接文档不是可点击相对链接，或链接目标不存在
5. `.sdd/handoff/*` 或 `.sdd/state.yaml` 缺失，或 handoff hash 未被 prompt 继承
6. 当前阶段未生成 prompt，且用户没有明确禁止生成 prompt

**以上任一条件触发时，必须阻止进入开发阶段，并在输出中显式报告：**
> ⚠️ Prompt 衔接检查未通过：P{xx} 缺少实现 prompt 或交叉挂接。必须先生成
> `prompt/pXX-xxx.md` 并更新 `prompt/implementation.md`、`tasks.md`、
> `traceability-matrix.md`、`tests.md`、`test-report.md`，不得只提醒后续生成。

**必须在最终回复展示自检证据（不可省略）：**

```text
SDD 完整性自检：
- prompt 文件：已生成/缺失 -> <path>
- implementation 总入口：已挂接/缺失 -> <grep 结果摘要>
- tasks.md：已挂接/缺失 -> <grep 结果摘要>
- traceability-matrix.md：已挂接/缺失 -> <grep 结果摘要>
- tests.md：已补验证用例/缺失 -> <用例 ID>
- test-report.md：已补 Red-Green 占位/缺失 -> <章节名>
- test-report 证据 lint：已通过/未执行/阻塞 -> <命令与摘要>
- prompt Markdown 链接：已核对/缺失 -> <抽样链接或缺失列表>
- SDD handoff：已生成/缺失/hash不一致 -> <sdd-context.md、hash、guard 摘要>
- 平台级影响面发现：已完成/缺失 -> <发现方式、understand 索引状态、影响面摘要、事实核实摘要>
- 跨仓/SDK/依赖版本门禁：不涉及/已落实/缺失 -> <版本号或阻塞说明>
```

### 跨仓 SDK / 引用项目版本门禁（阻塞级）

当 SDD 任务涉及 sibling repo、SDK、公共模块、Maven/Gradle 依赖、RPC DTO、协议类、
starter、connector 或任何被当前项目引用的外部项目时，必须把"引用版本"作为交付物，
不能只改本地源码或同版本 SNAPSHOT。

**触发条件（任一满足即触发）：**
- 修改 `*-api`、`*-sdk`、公共 jar、协议类、DTO、枚举、校验注解或序列化字段类型。
- 修改 sibling repo 后，当前仓库通过 Maven/Gradle 依赖、RPC、HTTP SDK 或本地 jar 消费它。
- 字段类型、方法签名、setter/getter、接口入参出参发生变化。
- 需要先在另一个仓库 `mvn install/deploy`，当前仓库才能编译或运行。

**强制要求：**
- 在 `bug-fix-plan.md` / `design.md` / `tasks.md` / prompt 中写明：
  `引用项目 | 当前版本 | 目标版本 | 当前仓库依赖文件 | 发布/安装命令 | 验证命令`。
- 修改被引用项目的协议/API 时，必须升级版本号，例如 `1.0.8-SNAPSHOT -> 1.0.9-SNAPSHOT`；
  不得只覆盖同版本 SNAPSHOT。
- 当前项目必须同步更新依赖版本，并验证实际解析到新版本。
- `test-report.md` 必须记录版本证据：SDK 新版本、当前项目依赖版本、`mvn dependency:tree`
  或等价解析结果、编译结果。
- 如果版本号由发布平台统一管理，必须把"由谁发布/发布到哪里/当前仓库如何引用"写成阻塞项。

**阻塞规则：**
- 被引用项目改了代码但未升级版本号，阻塞。
- 当前仓库未更新依赖版本，阻塞。
- 只在本机同版本 SNAPSHOT 覆盖安装，阻塞。
- 测试报告没有版本解析证据，阻塞。

### 数据库 SQL 门禁（不可绕过，迁移类任务为硬门禁）

开发环境数据库结构与设计文档一致是业务代码正确运行的前提。历史上多次出现研发 agent 忘记执行增量 SQL，导致字段缺失、默认值缺失、初始化数据缺失，最终用业务代码绕过数据库问题，产生隐蔽 bug。以下规则必须严格执行：

#### 通用规则（所有涉及数据库的任务）

- **写代码前必须先检查数据库**：研发 agent 在写任何业务代码前，必须先对照 design.md / api.md / spec.md / tasks.md 中涉及的表、字段、索引、默认值、枚举值、初始化数据，连接开发环境数据库执行 DESC / SHOW CREATE TABLE / SHOW COLUMNS / SELECT 等命令确认实际结构。
- **发现缺失必须先执行 SQL**：如果数据库结构或数据不满足设计要求，研发 agent 必须先找到本需求的汇总 SQL 文件，连接开发环境数据库执行对应脚本，执行成功后再继续开发。
- **禁止用代码绕过数据库缺失**：不得因为字段缺失、默认值缺失、初始化数据缺失而在业务代码里写绕过逻辑、兼容逻辑或假修复。根因是 SQL 未执行时，修复方向应是执行 SQL，不是改代码。
- **只维护需求级汇总 SQL 文件**：同一个需求下所有新增表、改表、索引、默认值、初始化数据脚本，统一追加到该需求的汇总 SQL 文件（如 `sql/{version}.sql`），禁止各任务各自新建独立 SQL 文件。
- **独立 P/CR 任务必须回写版本总 SQL**：开发库已有、局部 SQL 已执行、agent 回复里写过 SQL，都不等于交付完成。只要源码/Mapper 依赖了表结构或初始化数据，必须确认版本总 SQL 已包含对应变更。
- **任务完成必须有 SQL 收口对账表**：涉及数据库的任务必须输出 `P编号 | 表 | 字段/索引/数据 | 源码引用 | 总SQL位置 | 开发库状态 | 测试库状态 | 处理结论`。没有该表不得标记完成。
- **发布前必须做三方对账**：最终脚本必须对齐 `源码/Mapper 读写字段`、`开发库结构`、`测试库现状 + 版本总 SQL 执行后结构`。测试库已有字段不得重复 ADD；类型/注释不一致时生成 MODIFY 或写明不采纳理由。
- **SQL 脚本采用简单直接格式**：不使用 INFORMATION_SCHEMA 判断、PREPARE/EXECUTE、动态 SQL 等过度兼容脚本。开发/测试环境应直接暴露问题，脚本执行失败就应该失败。
- **SQL 文件变更后必须执行本地检查**：新增或修改 `sql/**/*.sql` 后，必须执行 `~/.codex/hooks/superflow-sql-sync-hook.py --check-staged` 或由本地 `pre-commit` 自动执行；检查不通过不得提交。
- **任务交付必须包含数据库核查证据**：报告中必须写明检查了哪些表/字段/索引/初始化数据，执行了哪个汇总 SQL 文件里的哪段脚本，执行结果是什么。没有真实数据库核查证据时不得标记任务完成。

#### 跨仓数据合同门禁（阻塞级）

同一张业务表被多个服务读取、复制实体、复用 Mapper 或通过外部集成/网关链路间接消费时，必须把表结构当作跨仓合同处理。单仓 SQL 执行成功不代表其他消费仓可运行。

**触发条件（任一满足即触发）：**
- 多仓共享同一数据库表、视图、字典或初始化数据
- 一个仓库复制了另一个仓库的 PO/Entity/Mapper/DTO
- MyBatis-Plus `@TableName` + `BaseMapper` 自动 SELECT 实体字段
- 表结构变更、字段删除、字段迁移、状态字段从持久化改为动态计算
- 查询条件从旧字段切换到新字段，例如单字段 `plot_id` 切换到 JSON/多站点快照字段
- 真实链路入口在 A 服务，业务校验落在 B 服务或 sibling service

**强制要求：**
1. 指定表结构真源：明确本需求以哪个 SQL 文件、哪个库的 `SHOW CREATE TABLE`、哪个仓库模型作为最终合同。
2. 列出全部消费仓：包括直接 CRUD 仓库、外部集成仓库、定时任务、回调服务、导入导出服务和测试端点。
3. 对每个消费仓执行字段对账：`@TableName` 实体字段、`BaseMapper` 默认查询列、Mapper XML/resultMap、手写 SQL、查询条件必须逐项对照 `information_schema.columns` 或 `SHOW CREATE TABLE`。
4. 不存在列不得映射：实体旧字段必须删除，或显式标注 `@TableField(exist = false)`；不得让 MyBatis-Plus 自动生成包含不存在列的 SELECT。
5. 查询逻辑同步迁移：字段从持久化状态改成派生状态、从单站点改成多站点、从主表字段改到流水表后，消费仓查询条件必须同步，不得继续按旧字段过滤。
6. 版本总 SQL 只能表达真实最终结构：不得为了迁就旧实体给测试库补回已废弃字段；如果代码依赖废弃字段，结论是代码合同漂移。
7. test-report 必须记录跨仓对账表：`表 | 真源结构 | 消费仓 | 实体/Mapper/SQL 字段 | 实际库字段 | 处理结论 | 验证证据`。

**阻塞规则：**
- 任一消费仓存在实体映射不存在列、Mapper 查询不存在列、查询条件依赖已删除字段时，阻塞进入真实验收。
- 只有主仓编译通过、主仓 SQL 执行成功、主仓接口通过，不能关闭跨仓数据合同任务。
- 测试库缺字段时，必须先判断字段是否属于当前最终合同；如果不是最终合同字段，禁止补库绕过，必须修消费仓代码。

#### 数据库迁移类任务硬门禁（涉及以下任一条件时触发）

**触发条件（任一满足即触发硬门禁）：**
- 新增表
- 删除字段
- 物理删除旧字段
- 表结构重构
- 旧数据迁移
- 状态字段从持久化改为动态计算
- 分页筛选依赖新表或新状态逻辑
- 总版 SQL 和开发库迁移 SQL 分离
- 需要迁移当前开发库/测试库已有数据

**硬门禁要求：**

1. **实现 prompt 必须自动包含"强制执行顺序"章节**：superflow-implement 生成 prompt/pXX-xxx.md 时，如检测到任务涉及上述任一条件，必须在 prompt 中自动加入"强制执行顺序"章节，不可遗漏。
2. **必须先完成数据库操作，再开始 Java 编码**：顺序为：核对当前数据库结构 → 执行表结构改造 SQL → 执行旧数据迁移 SQL → 回填 test-report 证据 → 才允许开始 Java 编码。
3. **失败必须阻塞**：表结构改造或数据迁移失败时，必须停止并报告，禁止先写业务代码绕过。
4. **质量门必须包含 D1~D5 检查**：sdd-quality-gate.md 或对应 quality gate 产物中，数据库迁移类任务必须包含：数据库前置核查、表结构改造 SQL、旧数据迁移 SQL、迁移证据已回填 test-report、Java 编码是否允许开始。任一未通过即阻塞。

### SQL 风险评审门禁（不可绕过，所有 SQL 任务为前置门禁）

项目发布前通常会经过平台 SQL 解析校验和人工/自动化风险评审。两层评审各自暴露
问题但串行返工成本高，因此 SDD 流程在进入实现阶段前必须完成 **L0 风险前置评审**，
把语法兼容、迁移幂等、性能、可维护性和业务语义风险提前消化。

**触发条件**：任何涉及数据库变更、SQL 脚本、Mapper/XML 字段调整、初始化
数据迁移的 P/CR 任务。

**强制要求**：

1. **完成 SQL 风险评审 checklist**：在 `tasks.md` 中按
   `references/sql-risk-review-checklist.md` §3 的模板包含完整 checklist，
   禁用项（B1-B8）和警告项（W1-W13）逐条勾选处理结论；评审人签字后才能进入
   实现阶段。
2. **SQL 文件头必填**：每个 `sql/v*.x/*.sql` 文件按 reference §4 模板写明目标
   MySQL 版本、关联批次、风险等级、评审人、涉及表、变更摘要。
   `superflow-sql-sync-hook.py` 对缺文件头的 SQL 输出警告。
3. **hook 阻断 B1-B8 禁用项**：`superflow-sql-sync-hook.py` 在 commit/edit 阶段强制
   阻断 §2.1 的 8 条禁用项；评审通过的豁免必须按 §5 写
   `-- allow-dynamic-ddl:` 或 `-- allow-sql-risk-rule:` 注释。
4. **警告项必须落到 test-report**：W1-W13 警告项不阻断提交流程，但必须由
   Worker 在 test-report.md 中显式记录处理结论（已修复 / 评审豁免 / 不适用及
   理由）；缺失处理结论的批次视为交付不完整。
5. **跨仓数据合同对账同步触发**：涉及跨仓共享表（多仓消费、复制实体、字段迁移）
   时，SQL 风险评审与 superflow-pipeline "跨仓数据合同门禁" 联动，任一未完成都
   阻塞。
6. **业务代码逆向审查**：W11 关系表误判、W12 JSON 兜底精确度、W13 宽索引无用
   这类规则 hook 自动化检测不到，必须人工源码审查；详细 SOP 见
   `references/sql-risk-review-checklist.md` §6。
7. **DML 段事务包裹**：单文件 SQL 应当把 DDL 段与 DML 段分节，DML 段显式包
   `START TRANSACTION; ... COMMIT;`。DDL 在 MySQL 隐式提交，事务包不住；DML
   段事务包裹提供失败整体回滚能力。
8. **目标 SQL 解析器兼容性实测**：评审通过后，发布/提测前必须使用目标环境的
   SQL parser 或发布平台做一次解析校验。重点关注时间精度语法、JSON 函数链、
   schema 限定符、REGEXP 转义、DDL 选项和目标数据库版本是否兼容。

**阻塞规则**：

- 任一 P/CR 任务的 `tasks.md` 缺少 SQL 风险评审 checklist，阻塞。
- SQL 文件头缺失或不符合 §4 模板，警告级但 reviewer 必须在评审记录中确认是否
  豁免。
- B1-B8 违规未显式豁免，阻塞。
- W1-W13 警告项在 test-report.md 无处理结论，阻塞。
- W11/W12/W13 漏掉源码审查，阻塞。
- 跨仓 SQL 风险评审未与跨仓数据合同对账联动，阻塞。

详细规则、checklist 模板、文件头模板、豁免机制、与 hook 的联动见
`references/sql-risk-review-checklist.md`。

### 集成测试门禁（不可绕过，阻塞级）

历史上多次出现 agent 编码后只执行单元测试、编译通过就宣称任务完成，但从未启动应用、未调用真实接口、未验证数据库状态，导致交付质量不达标。以下规则必须严格执行：

#### 三层门禁模型（prompt + hook + 验收脚本）

所有涉及接口、CRUD、Mapper/XML、数据库字段、配置驱动行为或跨系统链路的
实现 prompt，必须同时落下三层门禁：

1. **Prompt 完成定义**：明确"单元测试通过不等于完成"，任务完成必须包含
   应用新进程启动、真实 curl/API 调用、数据库查询、日志检查和 test-report
   证据回填。
2. **Hook 过程拦截**：启用 `.sdd-enforced` / `.db-verified`，禁止跳过
   worktree、数据库前置核查和版本总 SQL 收口；运行时代码提交前必须有
   test-report 证据。
3. **验收脚本判定**：在交付前执行
   `~/.codex/hooks/superflow-verify-integration.sh <test-report.md>`。脚本不替代
   真实测试命令，但用于阻断空泛报告、后续补测话术和缺证据交付。
4. **交付完整性判定**：提交前 staged 完所有变更后执行
   `~/.codex/hooks/superflow-delivery-check.sh --check-staged <repo-root>`。脚本用于
   阻断只改代码不回填当前 P 任务 `tasks.md`、`test-report.md`、
   `sdd-quality-gate.md`，以及测试报告仍残留“待执行/待补充/后续补测”的交付。
   并行研发 worktree 中，脚本还会阻断普通 Worker 修改根级汇总
   `tasks.md`、`test-report.md`、`traceability-matrix.md`、`sdd-quality-gate.md`
   和 `tests.md`，这些文件只允许 Leader/集成收口 worktree 最后统一更新。

缺少任一层时，不得把实现 prompt 标记为可执行完成态；已执行的 Worker
报告只能标记为 `Partially verified` 或 `Blocked`。

#### 通用规则（所有涉及接口实现的 prompt）

- **生成 prompt 时必须从 tests.md 提取 L3 接口用例**：superflow-implement 生成 `prompt/pXX-xxx.md` 时，必须读取 `tests.md` 中所有标注 `[自动化]` 的 L3 接口测试用例，将完整的 curl 命令（含 Method、URL、Headers、Body）、前置条件、断言标准嵌入 prompt 的"接口验证"章节。不得只写抽象的"接口验证必须覆盖 XXX"而不给出具体命令。
- **prompt 必须包含应用启动和进程验证步骤**：每个实现 prompt 必须明确要求：编译 → 停止旧进程 → 重新编译 → 启动应用 → 进程验证（PID、启动时间、端口绑定、日志时间戳）→ 健康检查。不得跳过启动直接测试，不得复用旧进程。
- **prompt 必须包含 Token 获取规范**：每个实现 prompt 必须包含完整的登录流程（/captcha/image + /login，Content-Type 为 application/x-www-form-urlencoded，userName 字段），不得省略或假设固定 token。
- **prompt 必须包含数据库验证步骤**：每个实现 prompt 必须要求执行 `SHOW CREATE TABLE`、`SELECT` 等数据库查询来验证数据状态，不能只靠接口返回值判断。
- **prompt 必须包含日志检查步骤**：每个实现 prompt 必须要求 `grep ERROR` 检查应用日志，不得只验证接口返回不检查日志。
- **prompt 必须包含验收脚本步骤**：每个实现 prompt 必须要求在完成前执行 `~/.codex/hooks/superflow-verify-integration.sh <test-report.md>`，脚本失败时不得提交、不得交付、不得写"后续补测"。
- **prompt 必须包含交付完整性检查步骤**：每个实现 prompt 必须要求在提交前执行 `~/.codex/hooks/superflow-delivery-check.sh --check-staged <repo-root>`，脚本失败时不得提交；必须先更新当前 P 任务的 `tasks.md`、`test-report.md`、`sdd-quality-gate.md`。
- **并行 Worker 禁止编辑根级汇总文档**：实现 prompt 必须要求普通研发 agent 只更新自己的 `embedded-changes/pXX-*` 目录；不得修改根级 `tasks.md`、`test-report.md`、`traceability-matrix.md`、`sdd-quality-gate.md`、`tests.md`。这些汇总文档由 Leader 在所有 P 任务合并后单独执行，必要时通过 `touch .sdd-aggregate-closeout` 打开汇总收口门禁。
- **任务完成定义必须包含集成测试证据**：prompt 中的"任务完成"条件必须明确列出：代码已修改、编译通过、**应用已启动**、**接口已真实调用**、**数据库已验证**、**日志无 ERROR**、test-report 已回填。缺少任一证据不得标记完成。
- **真实入口优先于测试端点**：涉及第三方、外部集成、支付、设备、回调、客户端或跨系统链路时，必须至少保留一条真实外部入口证据。测试 Controller、mock endpoint、绕过鉴权端点只能证明局部代码路径，不能替代真实入口验收。
- **区分 mock 通过与真实链路通过**：test-report 必须把 `Mock 验证`、`测试端点验证`、`真实入口验证` 分开记录；只有真实入口的请求参数、响应、日志 trace、DB 证据都闭环时，才能写 `Real integration passed`。

#### 阻塞规则

1. **如果 prompt 中缺少 L3 接口用例的完整 curl 命令** → 阻塞，补充后才能进入开发。
2. **如果 prompt 中缺少应用启动和进程验证步骤** → 阻塞，补充后才能进入开发。
3. **如果 prompt 中缺少 Token 获取规范** → 阻塞，补充后才能进入开发。
4. **如果 prompt 中缺少 `superflow-verify-integration.sh` 执行步骤** → 阻塞，补充后才能进入开发。
5. **如果 prompt 中缺少 `superflow-delivery-check.sh --check-staged` 执行步骤** → 阻塞，补充后才能进入开发。
6. **如果 Worker 报告"完成"但没有提供启动证据**（PID、启动时间、健康检查 UP）→ 标记未完成，必须补充。
7. **如果 Worker 报告"完成"但没有提供接口调用证据**（curl 命令、响应摘要）→ 标记未完成，必须补充。
8. **如果 Worker 报告"完成"但没有提供数据库验证证据**（SHOW CREATE / SELECT 结果）→ 标记未完成，必须补充。
9. **如果 Worker 没有执行或没有通过 `superflow-verify-integration.sh`** → 标记未完成，必须补充真实证据后重跑。
10. **如果 Worker 没有执行或没有通过 `superflow-delivery-check.sh --check-staged`** → 标记未完成，必须补齐当前 P 任务交付文档后重跑。
11. **如果跨系统链路只提供 mock/test controller 证据**，但缺少真实外部入口 payload、响应和 trace 日志 → 标记未完成，必须补充真实入口证据或写明外部阻塞。

### 文档完整性强制门禁（不可裁剪）

- **Do not skip any file in the embedded change document checklist regardless of perceived complexity.** Every embedded change must include `.openspec.yaml`, `api.md`, `spec.md`, `design.md`, `tasks.md`, `tests.md`, `review-checklist.md`, and `sdd-quality-gate.md`. No exceptions.
- **Do not mark any task or sub-change complete until all files in the checklist are generated and cross-referenced.** "编译成功" or "代码已修改" does not equal "文档完成".
- **Do not generate implementation prompts that only reference `api.md` and `spec.md`.** `design.md`, `tests.md`, `review-checklist.md`, and `sdd-quality-gate.md` must be in the required reading list of every implementation prompt.
- **Top-level documents are generated/indexed before parallel development and closed out after merge.** When creating embedded change docs, update root `tasks.md`, `traceability-matrix.md`, `sdd-quality-gate.md`, `tests.md`, and `test-report.md` only as initial index/placeholders. During parallel Worker implementation, do not edit these root aggregate documents; each Worker updates only its own `embedded-changes/pXX-*` files. After all related P worktrees merge, a Leader/closeout task updates root aggregate status in one separate commit.

## Shared References

Load only the reference needed for the current phase:

- Requirement gate: `references/feature-gated-workflow.md`
- API contract: `references/api-design-template.md`
- OpenSpec format: `references/openspec-format.md`
- Document quality: `references/quality-standards.md`
- Quality gate: `references/quality-gate.md`
- Batch prompt split: `references/batch-split-guide.md`
- Batch prompt template: `references/batch-prompt-template.md`
- Implementation orchestration: `references/orchestration.md`
- SQL risk review: `references/sql-risk-review-checklist.md`
- Project config: `references/project-config.md`
- Decision points: `references/decision-point.md`
- Dirty worktree policy: `references/dirty-worktree.md`
- Subagent progress: `references/subagent-progress.md`
- Context drift guard scripts:
  `scripts/superflow-env.sh`, `scripts/superflow-handoff.sh`, `scripts/superflow-state.sh`,
  `scripts/superflow-yaml-validate.sh`, `scripts/superflow-guard.sh`,
  `scripts/superflow-archive.sh`, `scripts/superflow-status.sh`

When unsure, ask which phase the user is in: requirement clarification, SDD document generation, or implementation.
