# SDD Handoff Context

> OpenSpec/SDD docs remain canonical. This file is a deterministic context pack for Superpowers execution strategy and implementation prompts.

- change_dir: `/Users/chenmankun/cmk-project/superflow-cli/openspec/changes/v0-5-12-global-hooks-optimization`
- context_hash: `db74543e5444b5f7b0c0cf909b9914f2cb39f99a742ef9c95475341eb582c4a7`
- context_compression: `off`
- generated_at: `2026-09-22T09:51:58Z`

## Source Inventory

| Path | Role | SHA256 | Lines |
|---|---|---|---:|
| `.openspec.yaml` | `supporting` | `5aeaf632a0cb1ae443f5da9d730a37fa7a743b0f30f122747584169bebf28810` | 6 |
| `api.md` | `api` | `37864e205aea8fa97daba0cb86ea1928e49efb26e022e4feec67e93c37aacd97` | 69 |
| `design.md` | `design` | `99bad163144859ca6233d5749781ed8e1f5ed5b246c820007996f569e208c362` | 87 |
| `prompt/implementation.md` | `supporting` | `e862a1294c1bf8bfed5090d0b7bc5cd359ce6694ba35c726ce3c3ae1d98be69c` | 46 |
| `prompt/p1-global-hooks-optimization.md` | `supporting` | `a3f4542178d006f02d85731bcbb0ce99f0df59809acf91e99de72033005f9d41` | 23 |
| `proposal.md` | `supporting` | `d0d55aa9e0768bbdc25d326c57798c3195eb28432d52ee95ebc3e080a6742c33` | 33 |
| `requirement-review.md` | `supporting` | `3400f019f4884ac404a8902cb5e2ad4e8e874329137f7642cbe4c29b4cd51451` | 36 |
| `review-checklist.md` | `supporting` | `71a24dddcba18036f474ef2fd69f3e281a2b461e978a3b9de592142a5e4fefd9` | 36 |
| `sdd-quality-gate.md` | `supporting` | `71e559d2ce90369f50ac65dccf78ef503d39a4e89ff33d456b1dae151652d44d` | 42 |
| `source-code-audit.md` | `supporting` | `b25c308c4101833afb48c82020485e5f4e9c776ec0beae20fe85e60dcb1994f2` | 50 |
| `specs/hook-short-circuit/spec.md` | `spec` | `828595e393ea8e43d4a7f0dbbc893fa06dca67a953c89aa7015dfc143dbc80d8` | 64 |
| `specs/install-scope/spec.md` | `spec` | `3609ddbf5aedc3f35f521cfede34b91193033378ad617168c35b45a99fb4b21b` | 44 |
| `specs/managed-projects/spec.md` | `spec` | `c08790d5b950581d26c6741da253681df39802dfc20313cdea39ed72f881a0c6` | 63 |
| `tasks.md` | `task` | `6f679ca0a7ae6c5ff01ff6690a3f2914df40ba4efe6296310bcab97761d44137` | 32 |
| `test-report.md` | `test` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 64 |
| `tests.md` | `test` | `8a881dc79d6317cd7b004869679339a38247afd10953b7f323ee93c78b17e293` | 29 |
| `traceability-matrix.md` | `supporting` | `10bea5201b24ad24d2d52e404844506ecbe161f940d467a38d71b1ae00da52fa` | 24 |

## Required Superpower Boundary

- Superpowers owns source-level HOW: technical design, execution strategy, plan, TDD order, reviewer/tester split, worktree/port orchestration, and verification ownership.
- Superpowers must not replace OpenSpec/SDD design, API, database, field semantics, SQL, or tests.
- If source documents conflict or are incomplete, mark `Blocked` and return to SDD docs instead of inventing a second design.

## Source Excerpts

### `.openspec.yaml`

```text
schema: spec-driven
created: 2026-09-22
database: false
external_config: false
concurrency: false
money: false
```

### `api.md`

```text
# API 变更 — v0-5-12 全局安装架构优化

> 本变更不涉及网络 API / DB。契约面为：CLI 命令行为、本地状态文件 schema、hook 脚本退出契约。

## 1. CLI 命令行为

### `superflow init`

| 项 | 契约 |
|---|---|
| scope 参数 | 保留既有 `--scope global\|project` 语义 |
| 新增副作用 | project scope 时向 `~/.sdd-state.json` 登记 `managedProjects[]` 条目（幂等去重） |
| 新增写入 | `state.platforms[agent].scope` 字段（global/project） |
| 不变 | skills/scripts/rules 分发、hooks 注册目标推导（改由 scope 字段支撑）、sql-sync-hook 双 matcher 注册 |

### `superflow uninstall`

| 项 | 契约 |
|---|---|
| 目标推导 | 读取 `state.platforms[agent].scope`（缺省回落 `global` 并输出提示），经 `getPlatformPaths` 解析目标 |
| 遍历清理 | 清理 `managedProjects[]` 各项目资产；目录不存在的条目直接移除 |
| 幂等 | 目标 settingsFile/资产不存在时成功结束 |
| 不变 | 只清除 superflow 写入的 hooks 条目（clearSddHooks 前缀匹配），用户自定义保留 |

### `superflow update`

| 项 | 契约 |
|---|---|
| 遍历同步 | 遍历 `managedProjects[]` 同步各项目脚本与 hooks；单项目失败不阻断，结尾汇总失败项 |
| 目标推导 | 与 init/uninstall 同源（scope 字段） |

## 2. `~/.sdd-state.json` schema 扩展（向后兼容）

```jsonc
{
  "version": "...",            // 既有，不变
  "platforms": { ... },        // 既有；platforms[agent] 新增 "scope": "global" | "project"
  "managedProjects": {         // 新增；缺失/损坏按空清单处理
    "projects": [
      {
        "root": "/abs/project/path",
        "agents": ["claude", "codex"],
        "scope": "project",
        "hooks": ["superflow-enforce-hook.sh", "..."],
        "registeredAt": "2026-09-22T00:00:00.000Z"
      }
    ]
  }
}
```

兼容规则：字段缺失 → 空清单；结构损坏 → 空清单 + stderr 警告；既有字段一律不修改不删除。

## 3. hook 脚本退出契约（新增短路分支）

| 条件（相对项目根，任一满足即放行） | 行为 |
|---|---|
| `openspec/` 目录存在 | 进入原有门禁逻辑（退出码 0=放行 / 2=拦截 / 原有超时） |
| `.sdd/` 目录存在 | 同上 |
| `.sdd-enforced` 文件存在 | 同上 |
| 三者均不存在 | `exit 0`，不读 stdin、不调用 python3、无输出 |

例外（不参与项目短路）：`superflow-dependency-update-hook.sh`（用户级服务）、`claude/codex-auto-backup-hook.sh`（非 superflow 门禁）。

## 4. 不变契约

- `src/domains/hook.ts` 的 `clearSddHooks/registerHook` 函数签名与行为。
- skills/commands/rules 全局分发路径。
- 脚本在 SDD 项目内的全部判定结果。
```

### `design.md`

```text
# Design

## Context

- 现状：10 条 superflow hooks 注册在用户级 `~/.claude/settings.json`（9 PreToolUse + 1 UserPromptSubmit，绝对路径 `~/.claude/scripts/superflow-*`）；任何项目的每次 Edit/Write/Bash 与每次提问都会执行。
- 脚本短路现状分层（源码取证）：6 个脚本依赖 `.sdd-enforced` 门控但无前置文件守护（enforce-hook、hook-guard、contract-hooks、sql-sync-hook、integration-evidence、delivery-check）；3 个完全无短路（managed-work-guard、verify-integration、test-report-lint）；archive-command-hook 在 python3 解析之后才有 `[ -d "$CHANGE_DIR" ]` 判断。
- `src/platform/paths.ts:16-46` 已支持 `getPlatformPaths(agent, scope, projectPath)`，但 init/uninstall/update 调用方均使用默认 `global`。
- `src/domains/hook.ts` 的 `clearSddHooks` / `registerHook` 为通用 read-merge-write（含备份），写入目标由调用方决定，本变更不需要改它。
- 受管状态已有载体 `~/.sdd-state.json`（`state.platforms[agent].hooks` 已在 init.ts 写入）。
- 参照对象 ake-harness（v2.8.21）吸收点：幂等合并的"独占领地"判据（superflow 已有同源的 clearSddHooks 前缀匹配）；registry 遍历思想（简化为 state.json 扩展）；不引入其 launcher 让路机制与 manifest 原子同步（超出本变更需求）。

## Goals / Non-Goals

**Goals:**

- 非 SDD 项目的 hook 触发成本降到"一次进程启动 + 一次文件系统判断"。
- SDD 项目的完整门禁不回退，且不依赖项目级 init 即生效。
- init/uninstall/update 三命令对同一安装状态操作同一目标集合。
- `~/.sdd-state.json` 成为受管项目清单载体，update/uninstall 可遍历。

**Non-Goals:**

- 不迁移 hooks 到项目级 settings（用户目标：全局安装一次、所有项目可用）。
- 不实现 ake-harness 式全局 launcher / 让路机制 / manifest 文件级 sha256 清单。
- 不改变各脚本在 SDD 项目内的门禁判定逻辑。
- 不处理 cc-switch 等第三方托管副本的残留（代码不可达，走迁移文档手动步骤）。

## Decisions

1. **短路判据用"项目性质"而非"init 产物"**：判据为 `openspec/`、`.sdd/`、`.sdd-enforced` 任一存在。备选"项目内存在 `.claude/scripts/superflow-*`（init 产物）"被否——那要求先 init，未 init 的 SDD 项目将失去门禁，违背全局可用目标。判据取并集属宽松放行：多放行只会落到脚本内部原有门控，不会误杀。
2. **短路置于 stdin 读取之前**：`[ -d openspec ] || [ -d .sdd ] || [ -f .sdd-enforced ] || exit 0` 作为脚本首个可执行语句（shebang 与注释之后）；python 脚本用 `os.path` 等价判断 + `sys.exit(0)`。备选"在脚本内保留原位判断"被否——那仍要支付 stdin 读取与 python3 启动成本。
3. **安装范围记录在 state 中并显式化**：`state.platforms[agent]` 增加 `scope` 字段（缺省回落 `global`），init 写入；uninstall/update 读取该字段决定 `getPlatformPaths` 的 scope。备选"三命令各自重新推断"被否——推断不可靠正是本缺陷根因。
4. **受管清单放 `~/.sdd-state.json` 顶层 `managedProjects`**：复用现有载体与读写路径，向后兼容（缺字段按空清单）。备选新建 `~/.superflow/registry.json` 被否——同一份安装状态分裂到两个文件，清残留时会重蹈 scope 不一致覆辙。
5. **遍历失败不阻断**：update/uninstall 遍历受管项目时，单项目失败记录并继续，结尾汇总。遍历删除的项目（目录已不存在）直接从清单移除。
6. **sql-sync-hook 双 matcher 补注释**：Edit|Write 与 Bash 双注册是覆盖 SQL 文件编辑与 git 提交两条路径的有意设计，加注释防止未来被当作重复注册"修复"。

## Risks / Trade-offs

- [判据遗漏某 SDD 项目布局（如 openspec 目录被改名/移动）] → 判据为三项并集且宽松放行；脚本内部原有 `.sdd-enforced` 门控继续兜底；回滚条件：发现任一 SDD 项目门禁未生效且判据三项均不存在。
- [旧安装缺 scope 字段，uninstall 回落 global 清不到项目级残留] → 回落时明确输出提示；受管项目残留可经 `superflow init --project` 重建登记后再 uninstall；验收含残留检查步骤。
- [managedProjects 清单过期（项目被手删/移动）] → 遍历时目录不存在即幂等移除，spec 已覆盖。
- [短路判据误放行（非 SDD 项目恰有 `.sdd-enforced` 等残留标记）] → 代价仅为该次执行原有门控逻辑（其自身会按标记退出），可接受。
- [全局 hooks 绝对路径在多机/多用户间不可移植] → 维持现状（scope 既有决策），不在本变更扩大范围。

## Migration Plan

1. bump 0.5.12 → `npm run build && npm install -g .`
2. 本机迁移：`superflow uninstall`（清用户级 hooks 与全局资产）→ 手动清理 cc-switch 通用配置中的 `superflow-` hooks 残留 → `superflow install`（重装全局）→ 需要项目级资产的受管项目执行 `superflow init`（project scope 登记进清单）。
3. 回滚：重装 0.5.11 即恢复原行为（无 schema 破坏性变更；`managedProjects` 字段被旧版本忽略）。

## Open Questions

- 无——决策点已在澄清阶段确认（见 `.sdd/handoff/brainstorm-summary.md`）。

## Superpowers Technical Design Handoff

- 本变更为单仓 CLI 改造，源码级 HOW 已在本文档 Decisions 章节展开；OpenSpec/SDD 文档（proposal/specs/api/tests）仍是 WHAT、行为合同与验收的唯一事实源，本文档不得与其冲突。
- `.sdd/handoff/sdd-context.*`（hash 记录于 `.sdd/state.yaml` 的 `handoff_hash`）是唯一交接上下文包，实现 prompt 必须继承同一 hash。
- 进入 design 阶段时，如需独立技术详设文件，落 `docs/superpowers/specs/2026-09-22-v0-5-12-global-hooks-optimization-technical-design.md` 并回填 `state.yaml` 的 `technical_design`；当前 docs 阶段以本文档为 HOW 事实源。

## 复杂度减法评审（Complexity Reduction Review）— PASS

### 已拒绝 / 移出范围（rejected / removed / out of scope）

| 已拒绝项 | 拒绝理由 |
|---|---|
| ake-harness 式全局 hook launcher 转发层 | 全局仅一条用户级 hook，整套转发机制属过度设计 |
| manifest 文件级 sha256 清单 | hook 名清单已满足同步需求，sha256 指纹超出当前需要 |
| hooks 项目级迁移 + 全局零 hooks | 违背用户核心目标（全局安装一次、所有项目可用） |
| 独立 ~/.superflow/registry.json | 与 state.json 双载体分裂安装状态，重蹈 scope 不一致 |

### 新增项统计（Complexity budget / New-item counts）

| 维度 | 数量 | 说明 |
|---|---|---|
| 数据表（table） | 0 | 无数据库 |
| 字段（field） | 0 | 无数据库字段；state.json 新增 JSON 键 2 个（platforms[agent].scope、managedProjects） |
| API（网络接口） | 0 | 无新增网络 API |
| Service/组件（service/component） | 1 | state 受管清单读写模块（含损坏保护） |
| 缓存（cache） | 0 | 无缓存 |
| MQ/事件/异步（event/async） | 0 | 无异步 |
| 定时任务（scheduled job） | 0 | 无定时任务 |
| 兼容层（compatibility layer） | 0 | managedProjects 缺失按空清单为向后兼容读取，不构成兼容层 |

### 预算结论

新增组件仅 1 个（state 清单读写），脚本改动为头部追加 1 行短路，CLI 改动为既有函数参数消费——整体做减法（拒绝 4 项机制性复杂度）。所有实现点均取最小实现（simplest implementation）：短路为单行 test 链、清单为单个 JSON 段、scope 为单字段透传，无并行机制、无额外抽象层。复杂度预算 PASS。
```

### `prompt/implementation.md`

```text
# Implementation Prompt — v0-5-12 全局安装架构优化

> 交接上下文包：[.sdd/handoff/sdd-context.md](../.sdd/handoff/sdd-context.md)（hash 以 `.sdd/state.yaml` 的
> `handoff_hash` 与 `.sdd/handoff/sdd-context.sha256` 一致为准，漂移即阻塞实现，禁止凭聊天记忆继续）。

## 必读合同（按序，全部为可点击链接）

1. [proposal.md](../proposal.md) — Why 与变更范围
2. [api.md](../api.md) — CLI/状态文件/脚本退出契约
3. [specs/hook-short-circuit/spec.md](../specs/hook-short-circuit/spec.md)、[specs/install-scope/spec.md](../specs/install-scope/spec.md)、[specs/managed-projects/spec.md](../specs/managed-projects/spec.md) — 行为合同
4. [design.md](../design.md) — 源码级 HOW（含 Superpowers Technical Design Handoff 与复杂度减法评审，技术详设继承本文与 design.md 的 technical_design 结论）
5. [tasks.md](../tasks.md) — 任务清单（按组推进、逐项勾选）
6. [tests.md](../tests.md) — TC-01~TC-12 用例与 RED/GREEN 契约（自动化命令见用例表）
7. [traceability-matrix.md](../traceability-matrix.md) — 需求↔设计↔任务↔测试↔源码锚点
8. [source-code-audit.md](../source-code-audit.md) — 源码事实冻结卡

## 强制执行顺序

1. 填写下方"Agent 执行前自检表"并回填 [test-report.md](../test-report.md)。
2. 先写 RED：按 tests.md 为 scope 推导、清单读写各写失败用例（TC-04、TC-06 应先失败）。
3. 组 2（scope 修复）→ 组 3（受管清单）→ 组 1（脚本短路，最小 diff：脚本头部插入，不动原逻辑）。
4. 每组完成跑 `npm test`；全量通过后执行组 4 回归与发版验收。

## 禁止项（继承 traceability-matrix，违反即返工）

1. 禁止迁移全局 hooks 到项目级；2. 禁止引入 launcher 转发层；3. 禁止修改 sql-sync-hook 双 matcher 行为（只补注释）；4. 禁止给 dependency-update-hook / auto-backup hooks 加项目短路；5. 禁止在短路分支读 stdin 或调 python3；6. 禁止让 state.json 损坏阻塞任何命令（空清单回落 + 警告）。

## 边界

- 允许修改：`assets/scripts/superflow-*.{sh,py}`（头部短路）、`src/app/commands/{init,uninstall,update}.ts`、state 读写相关模块、`test/unit/` 新增用例。
- 禁止修改：`src/domains/hook.ts` 函数签名与行为、skills/commands/rules 分发路径、既有测试断言（除非 RED 证明其锚定旧行为且 spec 已改）。
- 不适用声明：数据库/SQL、外部集成配置、并发幂等、金额精度均不涉及（`.openspec.yaml` 已声明）。
- 字段/状态反向影响面继承（读取/过滤点、派生/同步点）：见 [技术详设](../../../../docs/superpowers/specs/2026-09-22-v0-5-12-global-hooks-optimization-technical-design.md) 矩阵——scope 字段读取/过滤点为 uninstall/update 目标推导，managedProjects 派生/同步点为无，损坏/缺失一律回落不阻断。

## Agent 执行前自检表（编码前填写，回填 test-report.md）

```
真实入口已定位：superflow init/uninstall/update CLI + hook runner 触发脚本
字段语义合同已核对：state.json scope/managedProjects 字段语义见 api.md
写入闭环已核对：state 写入→三命令读取→资产清理/同步链路见 design.md D3/D4
禁止兜底边界已确认：损坏 state 按空清单+警告属 spec 要求，非兜底
RED 测试已执行：[待填，附失败输出位置]
允许修改文件：见上文"允许修改"
禁止修改文件：见上文"禁止修改"
阻塞项：无
```
```

### `prompt/p1-global-hooks-optimization.md`

```text
# P1 任务 Prompt — v0-5-12 全局安装架构优化

> 总入口与完整合同：[implementation.md](implementation.md)。
> 本文件是该变更唯一实现任务（单任务变更）的执行清单，继承同一 handoff hash 与禁止项。

## 执行清单（对应 [tasks.md](../tasks.md) 分组）

| 组 | 内容 | 关键验证 |
|---|---|---|
| 2 | scope 一致性修复（types/state/uninstall/update） | TC-04/05/10 + `npx vitest run test/unit/install-scope.test.ts` |
| 3 | 受管项目清单（登记/遍历清理/遍历同步） | TC-06~09 |
| 1 | 8 个 hook 脚本前置短路（bash 首可执行行前 / py import 块后） | TC-01~03 空目录 exit 0 无输出 |
| 4 | 全量回归 + 发版迁移 + 装版二次验证 | 594 用例、残留 0、拦截 exit 2 |

## 完成定义

全部任务勾选 + [test-report.md](../test-report.md) 终态 PASS + 发版 tag 合规（release:check 通过）。

## 继承声明（防上下文漂移）

- 上下文漂移防护：以 [.sdd/handoff/sdd-context.md](../.sdd/handoff/sdd-context.md) 为唯一交接包，hash 以 `.sdd/state.yaml` 的 `handoff_hash` 为准；会话压缩/换手后必须先 recover，禁止凭聊天记忆继续。
- Superpower 技术详设继承（technical_design，源码级 HOW）：见 [技术详设](../../../../docs/superpowers/specs/2026-09-22-v0-5-12-global-hooks-optimization-technical-design.md) 的精确修改点与 TDD 顺序；WHAT/API/tests 合同仍由 OpenSpec 文档约束，本文不得覆盖。
- 字段/状态反向影响面继承（读取/过滤点、派生/同步点）：scope 字段读取/过滤点为 uninstall/update 目标推导；managedProjects 派生/同步点为无；损坏/缺失一律回落不阻断。
```

### `proposal.md`

```text
# Proposal

## Why

superflow 的 10 条门禁 hooks 全部注册在用户级 `~/.claude/settings.json`（绝对路径指向 `~/.claude/scripts/superflow-*`），且多数脚本没有"当前项目是否需要门禁"的前置判据——任何项目的每次 Edit/Write/Bash、每次提问，都要为 10 个进程支付启动、stdin 读取与 python3 解析的成本。同时 init/uninstall/update 各自推导 scope，不一致时会清错 settings 文件留残留（0.5.11 修过同类问题）。

## What Changes

- **hook 前置短路**：所有 superflow 门禁 hook 脚本（9 个 `.sh`/`.py`）在解析 stdin 之前增加防御性短路——当前项目不存在 `openspec/` 目录、`.sdd/` 目录、`.sdd-enforced` 标记时立即 `exit 0`。非 SDD 项目单次 hook 成本降为一次进程启动 + 一次文件系统判断；SDD 项目行为不变（脚本内部原有门控逻辑不动）。
- **scope 一致性修复**：init、uninstall、update 统一经 `getPlatformPaths(agent, scope, projectPath)` 推导目标；uninstall/update 不再默认操作用户级 settingsFile，而是按 init 时记录的安装范围清理，避免清错文件留残留。
- **受管项目清单**：`~/.sdd-state.json` 扩展 `managedProjects` 段（schema 向后兼容，新增字段）。init 以项目 scope 运行时登记项目根；uninstall 遍历清单清理各项目残留；update 遍历清单同步各项目脚本与 hooks。
- **设计说明补注**：`superflow-sql-sync-hook.py` 双 matcher（Edit|Write + Bash）是有意设计，补注释防止被"修复"。
- **用户级 hook 注册保留**：全局注册位置不变（满足"全局安装一次、所有项目可用"）；dependency-update-hook 属用户级服务，原样保留。

## Capabilities

### New Capabilities

- `hook-short-circuit`: superflow hook 脚本的防御性前置短路——非 SDD 项目零开销退出，SDD 项目完整门禁。
- `install-scope`: init/uninstall/update 的安装范围一致性与目标推导——scope 不一致时不得清错文件、不得留残留。
- `managed-projects`: 基于 `~/.sdd-state.json` 的受管项目清单——登记、遍历同步、遍历清理。

### Modified Capabilities

<!-- 无既有 specs（openspec/specs 为空），全部为新增能力。 -->

## Impact

- **脚本**：`assets/scripts/superflow-*.{sh,py}`（9 个门禁脚本头部短路；短路置于 stdin 读取与 python3 调用之前）。
- **CLI 源码**：`src/app/commands/init.ts`（hook 注册段）、`src/app/commands/uninstall.ts`、`src/app/commands/update.ts`、`src/platform/paths.ts`（消费既有 scope 参数）、`src/domains/hook.ts`（不变，写入目标由调用方决定）。
- **状态文件**：`~/.sdd-state.json` 新增 `managedProjects` 字段（向后兼容：缺失字段按空清单处理；旧字段一律不动）。
- **不受影响**：skills/commands/rules 的全局分发路径；`dependency-update-hook.sh`；`claude-auto-backup-hook.sh`/`codex-auto-backup-hook.sh`（非 superflow 门禁，另有用途，按现状评估是否纳入短路）。
- **发版与迁移**：bump 0.5.12；本机迁移顺序 `superflow uninstall` → 手动清理 cc-switch 通用配置中的 superflow hooks 残留（代码清不到的第三方托管副本）→ `superflow install` → 受管项目按需 `superflow init --project`。
```

### `requirement-review.md`

```text
# Requirement Review — v0-5-12 全局安装架构优化

review_verdict: PASS
implementation_readiness: READY
open_blockers: 0
open_external_contracts: 0
open_source_investigations: 0
open_owner_decisions: 0

## 闭环矩阵（Closure Matrix）

| 需求点 | 输入 | 处理 | 输出 | 异常 | 闭环结论 |
|---|---|---|---|---|---|
| 非 SDD 项目 hook 零开销 | hook 触发事件 | 脚本头部三判据短路 | exit 0 | 判据误判→宽松放行落回原门控 | 闭环（TC-01~03） |
| SDD 项目门禁不回退 | openspec/.sdd/.sdd-enforced 存在 | 放行进入原逻辑 | 原有拦截/放行/超时 | 无新异常路径 | 闭环（TC-11） |
| scope 一致 | state.platforms[agent].scope | 三命令同源推导 | 同一目标集合 | 记录缺失→回落 global+提示 | 闭环（TC-04/05/10） |
| 受管清单登记 | project scope init | 幂等登记 managedProjects | state.json 更新 | 旧文件缺字段→空清单回落 | 闭环（TC-06/07/10） |
| 遍历清理 | uninstall | 遍历清单清理+移除条目 | 资产清除 | 目录不存在→移除条目继续 | 闭环（TC-08） |
| 遍历同步 | update | 遍历清单同步脚本/hooks | 资产同步 | 单项目失败→汇总不阻断 | 闭环（TC-09） |

## 评审发现（Review Findings）

- F1（BLOCKER→已关闭）：交接原案"hooks 全迁项目级"与用户核心目标（全局安装一次、所有项目可用）冲突。处理：用户 2026-09-22 确认修正为方案一（全局保留+短路），brainstorm-summary 已记录 rejected 项。canonical 文档（proposal/design/specs）已按修正方向编写，无残留旧案表述。
- F2（IMPORTANT→已关闭）：短路判据若用 init 产物会让未 init 的 SDD 项目失去门禁。处理：spec 明确判据为项目性质三项并集，与 init 解耦；禁止项已入 traceability-matrix。
- F3（IMPORTANT→已关闭）：scope 记录缺失的旧安装可能在 uninstall 时清不到项目级残留。处理：spec 要求回落 global 并显式提示；design 迁移计划给出重建登记路径；tests TC-10 覆盖。
- F4（MINOR→已关闭）：dependency-update-hook 依赖 npm 与全局 CLI，曾被一并视为"门禁 hooks"。处理：api.md 明确其为用户级服务、不参与项目短路；spec 有独立 Requirement。
- F5（MINOR→已关闭）：cc-switch 第三方托管副本残留代码不可达。处理：proposal/design 迁移计划写明手动清理步骤，非本变更代码范围。

## 未关闭阻塞项（Open Blockers）

- 无——F1~F5 均已在 canonical 文档中关闭，无 open blockers、无 open external contracts、无 open source investigations、无 open owner decisions。

## 可测性确认

- 12 个用例（TC-01~TC-12）覆盖全部 spec scenarios；含 RED/GREEN 契约；无 Blocked 用例。
- 实现就绪度：READY（文档集完整、handoff 已冻结、无未决问题）。
```

### `review-checklist.md`

```text
# Review Checklist — v0-5-12 全局安装架构优化

## 评审范围

- 脚本短路：`assets/scripts/superflow-*`（9 个门禁脚本头部）
- CLI：`src/app/commands/{init,uninstall,update}.ts`、新增/调整的 state 读写模块
- 文档与双端一致性：中英文 Skill/文档同步、Codex/Claude 双端行为一致

## 安全（最高优先）

- [ ] 短路分支无 stdin 读取、无解释器调用（防注入面缩小）
- [ ] state.json 读写对损坏输入 fail-safe（不抛错、不写坏文件）
- [ ] 遍历清理只删除清单内项目资产，路径不存在越界（`..`、绝对路径拼接）防护

## 正确性

- [ ] 三项判据（openspec/.sdd/.sdd-enforced）并集实现与 spec 一致
- [ ] scope 回落 global 时输出提示；project 安装后 uninstall 不清用户级
- [ ] managedProjects 幂等去重；目录不存在条目移除且命令成功
- [ ] update 遍历单项目失败不阻断且汇总输出
- [ ] dependency-update-hook 与 auto-backup hooks 未被改动

## 兼容与迁移

- [ ] 旧 state 文件（无新字段）全命令正常
- [ ] 0.5.11 重装可回滚（无破坏性 schema 变更）
- [ ] 迁移步骤（uninstall → 清 cc-switch → install）在输出/文档中可发现

## 双端与文档

- [ ] Codex 与 Claude 路径行为一致（settingsFile/hooks.json 两侧短路判据相同）
- [ ] 中英文文档同步无语义漂移

## 评审结论

- [ ] 上述全部通过，或发现项已按桶分类并修复后复检通过
```

### `sdd-quality-gate.md`

```text
# SDD Quality Gate — v0-5-12 全局安装架构优化

## 任务本地文档完整性

- [x] `.openspec.yaml`（openspec new change 生成）
- [x] [proposal.md](proposal.md)
- [x] [api.md](api.md)
- [x] specs：[hook-short-circuit](specs/hook-short-circuit/spec.md)、[install-scope](specs/install-scope/spec.md)、[managed-projects](specs/managed-projects/spec.md)
- [x] [design.md](design.md)
- [x] [tasks.md](tasks.md)
- [x] [tests.md](tests.md)
- [x] [traceability-matrix.md](traceability-matrix.md)
- [x] [review-checklist.md](review-checklist.md)
- [x] [source-code-audit.md](source-code-audit.md)
- [x] [test-report.md](test-report.md)（占位，实现期回填）
- [x] [prompt/implementation.md](prompt/implementation.md) 与 [prompt/p1-global-hooks-optimization.md](prompt/p1-global-hooks-optimization.md)

## 门禁记录

| 门禁 | 结果 | 证据 |
|---|---|---|
| openspec validate --strict | 通过 | `openspec validate` 输出（2026-09-22） |
| source-code-audit 完整性 | 通过 | 源码事实冻结卡 10 项、证据分类全集、提问资格门禁、四类检索证据齐全，无 DB 必查项 |
| 影响面发现 | 通过 | rg+源码阅读（understand 索引缺失已声明并降级），见 source-code-audit.md 头部 |
| brainstorm 决策冻结 | 通过 | [.sdd/handoff/brainstorm-summary.md](.sdd/handoff/brainstorm-summary.md)，四决策点已确认，无 pending |
| tests 可执行性 | 通过 | 12 用例含自动化命令与 RED/GREEN；无 DB/网络依赖，无 Blocked 用例 |
| handoff/防漂移门禁 | 通过 | handoff_hash 冻结于 `.sdd/state.yaml`（`8dac6fef…40808`），与 `.sdd/handoff/sdd-context.sha256` 一致；实现 prompt 必须继承同一 hash，hash 漂移即阻塞实现 |
| 复杂度减法评审（Minimal Design Review） | PASS | 见 [design.md](design.md) 复杂度减法评审章节：拒绝 4 项机制性复杂度，新增组件预算 1，判定 PASS |
| 需求反向评审 | PASS | [requirement-review.md](requirement-review.md)：review_verdict PASS、READY、open_blockers 0 |
| 技术详设质量门（technical design quality gate） | 通过 | [技术详设](../../../docs/superpowers/specs/2026-09-22-v0-5-12-global-hooks-optimization-technical-design.md)已记录 technical_design 并回填 state.yaml；限于源码级 HOW（TDD 顺序、精确修改点、验证分工），含复杂度减法评审 PASS；WHAT/API/tests 合同仍由 OpenSpec 文档约束 |

## 不适用硬门禁声明

- 数据库/SQL：本变更无任何表/字段/SQL 变更（`.openspec.yaml` 声明 `database: false`）。
- 外部集成配置：无外部系统配置注入点（`external_config: false`）。
- 并发与幂等：单机单用户本地 JSON，无并发场景（`concurrency: false`）。
- 金额精度：无金额相关字段（`money: false`）。

## 硬门禁自评

- API/DB/SQL/跨仓/状态机/真实外部入口：不涉及（本地 CLI/脚本/JSON）。`verify_mode` 预判：**light**（无 L3 网络接口与 DB；L3 为本地 CLI 集成），实现完成后以 `superflow-state.sh scale` 复核。
- 平台级影响面：已覆盖脚本层、CLI 层、本机状态文件、sibling 参照仓（只读）。
```

### `source-code-audit.md`

```text
# Source Code Audit — v0-5-12 全局安装架构优化

> 影响面发现方式：`rg` + 源码阅读 + 本机配置实读（2026-09-22）。本仓库无 understand-anything 索引，
> understand 定位工具降级为 rg 直查；已声明该降级不影响结论（见下"提问资格门禁"）。

## 源码事实冻结卡（Source Fact Freeze Card）

| # | 业务结论（Business conclusion） | understand 定位（locator） | 数据模型（Data model） | 所有写入方（All writers） | 真实用户入口（Real user entry） | 当前调用方（Current callers） | 遗留冲突（Legacy conflict） | DB 是否必查（DB check/skip reason） | 结论等级（Conclusion level） | owner 决策（owner decision） |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | hook 注册目标由 scope 决定，调用方全用默认 global | rg: getPlatformPaths | 无 | init.ts/update.ts（注册）、uninstall.ts（清除） | superflow init/uninstall/update CLI | init.ts:433-447、update.ts:150-156、uninstall.ts:121 | 三命令 scope 推导各自为政 | DB 核查跳过：纯本地文件，无数据库 | current（现行入口） | 统一读 state.platforms[agent].scope |
| 2 | 本机 10 条 superflow hooks 注册在用户级 settings.json | 实读 ~/.claude/settings.json | JSON hooks 树 | registerHook（hook.ts） | 每次 Edit/Write/Bash/提问（Claude/Codex hook runner） | Claude Code / Codex | cc-switch 托管副本代码不可达 | DB 核查跳过：同上 | current（现行入口） | 保留全局注册位置（方案一，owner-confirmed） |
| 3 | 门禁脚本多数无前置短路，短路成本含 stdin+python3 | 逐脚本取证 assets/scripts | 无 | superflow install/update 分发 | hook 触发（工具调用/提问） | hook runner | archive-hook 短路在 python3 之后 | DB 核查跳过：同上 | current（现行入口） | 短路置于 stdin 读取之前 |
| 4 | 9 个门禁脚本不依赖 superflow 二进制 | rg: superflow 调用面 | 无 | 同上 | 同上 | 同上 | dependency-update-hook 例外（npm/CLI） | DB 核查跳过：同上 | current（现行入口） | dependency-update-hook 不短路（owner-confirmed） |
| 5 | 受管状态已有载体 ~/.sdd-state.json | 实读 state 文件 | JSON（version/platforms/backups 等） | init.ts（state 写入） | superflow init | init/update/uninstall/doctor | 无 managedProjects 字段 | DB 核查跳过：同上 | current（现行入口） | 新增 managedProjects 段，向后兼容 |
| 6 | hook 清单来自 manifest 定义 | rg: getManifestHooks | manifest JSON | assets 定义 | install/update | init/update/doctor/pair-admission | 无 | DB 核查跳过：同上 | current（现行入口） | 不改清单定义 |
| 7 | clearSddHooks/registerHook 为通用 read-merge-write | 源码阅读 hook.ts | settings JSON | init/update/uninstall | 间接 | 上述三命令 | 双 matcher 注册曾疑似重复（非缺陷） | DB 核查跳过：同上 | current（现行入口） | 不改 hook.ts（owner-confirmed） |
| 8 | sql-sync-hook 双 matcher 覆盖编辑+提交两路径 | rg + init.ts:445-447 | 无 | registerHook | git commit / SQL 文件编辑（Mapper/XML 变更路径） | hook runner | 历史上被误判为重复注册 | DB 核查跳过：同上 | current（现行入口） | 保留并补注释（owner-confirmed） |
| 9 | ake-harness 参照：吸收遍历与幂等合并，不引 launcher | 兄弟仓（sibling repo）源码阅读 bin/lib/*.js | registry.json + manifest | sync-engine | ake-harness install CLI | doctor/repair/update --all | superflow 无全局多 hook 转发需求 | DB 核查跳过：同上 | current（现行入口） | 只吸收遍历与幂等思想（owner-confirmed） |
| 10 | 本仓库此前无 openspec/ 目录，CLI 回落 home 配置 | 实读目录树 | spec-driven config | openspec CLI | 本次变更流程 | openspec CLI | 误建目录已删除 | DB 核查跳过：同上 | current（现行入口） | change 落仓库内 |

## 证据分类全集（Evidence classifications）

一行结论：证据分类全集 = current（现行入口）+ legacy（遗留）+ unmounted（无前端调用）+ data-model-only（仅数据模型可表达）+ owner-confirmed（owner 已确认）+ blocked（阻塞）；本变更命中 current、legacy、unmounted、owner-confirmed 四类，无 data-model-only、无 blocked。

- current（现行入口）：#1-#8、#10 全部经当前源码与本机文件核实；
- legacy（遗留入口）：0.5.11 前的迁移残留路径（uninstall 旧逻辑，代码仍在但仅作回落）；
- unmounted（无前端调用）：本仓为 CLI 资产仓库，无前端/小程序/H5 消费方挂载点；
- data-model-only（仅数据模型可表达）：无（无数据库模型）；
- owner-confirmed（owner 已确认）：方案一方向、dependency-update-hook 不短路、sql-sync-hook 双 matcher 保留、ake-harness 只吸收思想（2026-09-22 用户确认）；
- blocked（阻塞）：无。

## 提问资格门禁（Question Eligibility Gate）

- 提问前已完成：源码检索（rg 全量）、本机配置实读（settings.json / state.json）、ake-harness 兄弟仓源码阅读、hook 脚本逐个取证。
- 仓库可查事实（0 项遗留为澄清题）：全部 10 项事实均由源码/实读支撑，无一转化为用户澄清题。
- 已发生的提问仅 4 个决策点（D1-D4）+ 1 次目标修正，全部属 owner 决策边界，符合本门禁。

## 检索证据（Search Evidence）

- 源码检索（Source search）：rg "hookScriptsForAgent|getPlatformPaths|clearSddHooks|settingsFile" src/ —— 定位 #1/#6/#7 全部调用方；无未解释命中。
- Mapper/SQL 检索（Mapper and SQL）：rg "Mapper|\.sql|SELECT|INSERT" src/ assets/ —— 本仓无 Mapper/XML/SQL 资产（superflow 为 Node CLI），唯一 SQL 相关物为 superflow-sql-sync-hook.py（检查器脚本本身），已取证。
- 前端/小程序/H5 调用方检索（Frontend / mini-program / H5）：本仓产物仅含 CLI/Skill/Hook 资产；rg "window|document\.|wx\.|uni\." assets/ 无前端消费入口，结论 unmounted。
- 兄弟仓检索（sibling repo）：/Users/chenmankun/ake-project/ake-harness（只读参照，v2.8.21），无代码级依赖；rg 确认 superflow 与 ake-harness 无相互 import。
- 外部集成配置：无外部系统配置注入点（无 MQ/第三方/支付），external_config 声明 false。

## 阻塞级核查结论

- DB 核查跳过（reason）：本变更不涉及任何数据库、表、Mapper/XML（纯 CLI/脚本/本地 JSON），无必查项。
- cardinality（基数）冲突审计：不适用——无 List/orderIds/一对多/关系表信号。
- 结论等级汇总：10 项均为 current；无 blocked；遗留冲突均已给出处理决策。
```

### `specs/hook-short-circuit/spec.md`

```text
# Spec Delta

## Purpose

定义 superflow 门禁 hook 脚本的前置短路行为：让非 SDD 项目的 hook 触发成本降为一次进程启动加一次文件系统判断，同时保证 SDD 项目（无论是否执行过项目级 init）的完整门禁不被削弱。

## ADDED Requirements

### Requirement: 非 SDD 项目短路退出

所有 superflow 门禁 hook 脚本 MUST 在当前工作目录所属项目不满足 SDD 项目判据时，以退出码 0 立即退出，不执行任何门禁逻辑。

SDD 项目判据为以下任一存在（相对项目根）：

- `openspec/` 目录
- `.sdd/` 目录
- `.sdd-enforced` 文件

#### Scenario: 普通项目 Edit 触发 PreToolUse hook

- **WHEN** 当前项目不存在 `openspec/`、`.sdd/` 与 `.sdd-enforced`，且 PreToolUse hook 被触发
- **THEN** 脚本以退出码 0 退出，不读取 stdin、不调用 python3、不产生任何输出

#### Scenario: 存在 openspec 目录的项目

- **WHEN** 当前项目存在 `openspec/` 目录
- **THEN** 脚本放行进入原有门禁执行逻辑，行为与短路引入前一致

#### Scenario: 仅存在 .sdd 目录的项目

- **WHEN** 当前项目不存在 `openspec/` 但存在 `.sdd/` 目录
- **THEN** 脚本放行进入原有门禁执行逻辑

#### Scenario: 存在 .sdd-enforced 标记的项目

- **WHEN** 当前项目不存在 `openspec/` 与 `.sdd/` 但存在 `.sdd-enforced` 文件
- **THEN** 脚本放行进入原有门禁执行逻辑

### Requirement: 短路先于输入解析

短路判断 MUST 置于 stdin 读取与解释器依赖（python3 等）调用之前，保证短路路径的成本与输入内容大小无关。

#### Scenario: 大体积 hook 输入

- **WHEN** hook 收到大体积 stdin 输入且当前项目不满足 SDD 判据
- **THEN** 脚本在不读取 stdin 的情况下短路退出

### Requirement: SDD 项目门禁行为不回退

短路引入 MUST NOT 改变任何脚本在 SDD 项目内的既有判定结果，包括拦截、放行、警告与超时行为。

#### Scenario: 受管项目写入受保护路径

- **WHEN** 活跃 SDD 变更存在且写入与 `.sdd/state.yaml` 冲突的路径
- **THEN** 对应 hook 按原有逻辑拦截（退出码 2），与引入短路之前行为一致

### Requirement: 用户级服务脚本不参与项目短路

`superflow-dependency-update-hook.sh` 属用户级服务（检查 superflow 自身依赖更新），MUST NOT 增加项目判据短路；其余非 superflow 门禁脚本（如 auto-backup hooks）行为不变。

#### Scenario: 无关项目提问触发 dependency-update-hook

- **WHEN** 任意项目中 UserPromptSubmit 触发 dependency-update-hook
- **THEN** 该脚本照常执行依赖检查，不受项目短路判据影响
```

### `specs/install-scope/spec.md`

```text
# Spec Delta

## Purpose

定义 init / uninstall / update 三个命令在安装范围（scope）上的一致性行为：对同一份安装状态，三个命令必须操作同一个目标文件集合，杜绝因 scope 推导不一致导致清错文件或留残留。

## ADDED Requirements

### Requirement: 安装范围决定操作目标

init、uninstall、update MUST 依据同一份安装范围记录推导操作目标（settingsFile、scripts、skills、rules 等路径）；同一安装状态下，三命令解析出的目标路径 MUST 一致。

#### Scenario: 全局安装后的卸载

- **WHEN** init 以 global 范围安装后执行 uninstall
- **THEN** uninstall 清理用户级 settingsFile 中的 superflow hooks 与全局资产，不触碰任何项目级文件

#### Scenario: 项目安装后的卸载

- **WHEN** init 以 project 范围安装到项目 P 后在 P 内执行 uninstall
- **THEN** uninstall 清理 P 的项目级文件，用户级 settingsFile 中的 hooks 不被清除

#### Scenario: 安装范围记录缺失

- **WHEN** 安装范围记录缺失（旧版本安装产物）且执行 uninstall
- **THEN** 按默认 global 范围回落处理，并在输出中明确提示所采用的回落范围

### Requirement: 目标缺失时幂等

uninstall 与 update MUST 在目标 settingsFile 或资产不存在时幂等处理（跳过并继续），不得报错中断。

#### Scenario: settingsFile 不存在时卸载

- **WHEN** uninstall 运行且对应 settingsFile 不存在
- **THEN** 命令以成功结束，输出中说明该目标无需清理

### Requirement: 清理范围与注册范围匹配

uninstall 清理 hooks 时 MUST 只清除本工具写入的 superflow hooks 条目，不得清除用户或其他工具的 hooks 配置。

#### Scenario: settingsFile 含用户自定义 hooks

- **WHEN** uninstall 清理含用户自定义 hooks 的 settingsFile
- **THEN** 仅移除 superflow hooks 条目，用户自定义条目原样保留
```

### `specs/managed-projects/spec.md`

```text
# Spec Delta

## Purpose

定义基于 `~/.sdd-state.json` 的受管项目清单：登记以项目 scope 初始化的项目，支撑 update 遍历同步与 uninstall 遍历清理，使多项目受管资产可统一维护。

## ADDED Requirements

### Requirement: 受管项目登记

init 以 project scope 运行时 MUST 将项目根路径登记进 `~/.sdd-state.json` 的 `managedProjects` 段，并记录各 agent 的安装范围与 hooks 清单；重复 init 同一项目 MUST 幂等更新而非产生重复条目。

#### Scenario: 项目级初始化登记

- **WHEN** 在项目 P 以 project scope 执行 init
- **THEN** `managedProjects` 中存在 P 的条目（含项目根路径与 agent 信息）

#### Scenario: 重复初始化

- **WHEN** 对已登记的项目 P 再次执行 project scope init
- **THEN** P 的条目被更新，清单中不出现重复条目

### Requirement: 遍历清理

uninstall MUST 遍历 `managedProjects`，逐项目清理其受管资产并从清单移除对应条目。

#### Scenario: 清单项目存在

- **WHEN** uninstall 运行且清单中项目 P 的目录存在
- **THEN** P 的项目级 superflow 资产与 hooks 被清理，P 从清单移除

#### Scenario: 清单项目已不存在

- **WHEN** uninstall 运行且清单中项目 P 的目录已被删除
- **THEN** P 从清单移除，uninstall 继续处理其余项目，不报错中断

### Requirement: 遍历同步

update MUST 遍历 `managedProjects`，将各项目的脚本与 hooks 同步到当前版本；单个项目同步失败 MUST NOT 阻断其他项目，失败项在结束时汇总输出。

#### Scenario: 多项目同步

- **WHEN** update 运行且清单含项目 P1、P2
- **THEN** P1、P2 的受管脚本与 hooks 均被同步到当前版本

#### Scenario: 单项目失败不阻断

- **WHEN** update 遍历中项目 P1 同步失败（如目录权限不足）
- **THEN** P2 仍被同步，P1 的失败原因在最终输出中汇总呈现

### Requirement: 状态文件向后兼容

`managedProjects` 段缺失或损坏时 MUST 按空清单处理；既有字段（version、platforms、backups 等）MUST NOT 被修改或删除。

#### Scenario: 旧版本状态文件

- **WHEN** `~/.sdd-state.json` 由旧版本创建、不含 `managedProjects` 字段
- **THEN** init/update/uninstall 正常运行，按空清单处理，旧字段保持不变

#### Scenario: 清单内容损坏

- **WHEN** `managedProjects` 内容不是预期结构
- **THEN** 按空清单处理并给出警告输出，不中断命令，不破坏文件其余部分
```

### `tasks.md`

```text
# Tasks

> 实现入口：[prompt/implementation.md](prompt/implementation.md)；任务级 prompt：[prompt/p1-global-hooks-optimization.md](prompt/p1-global-hooks-optimization.md)。

## 1. hook 前置短路

- [x] 1.1 为 6 个有 `.sdd-enforced` 门控的脚本加前置短路（enforce-hook、hook-guard、contract-hooks、sql-sync-hook、integration-evidence、delivery-check）：在 stdin 读取之前插入 `[ -d openspec ] || [ -d .sdd ] || [ -f .sdd-enforced ] || exit 0`（py 脚本用 `os.path` 等价判断）；验证：在无标记目录执行脚本并喂入 hook JSON，进程立即退出 0 且无输出
- [x] 1.2 为 3 个无短路脚本加同样的前置短路（managed-work-guard、verify-integration、test-report-lint）；验证：同 1.1 方式
- [x] 1.3 调整 archive-command-hook：把 `[ -d "$CHANGE_DIR" ]` 短路提前到 stdin/python3 解析之前；验证：无标记目录下执行不产生 python3 进程（`ps` 或耗时对比）
- [x] 1.4 确认 dependency-update-hook 与 auto-backup hooks 不加短路（spec 要求）；验证：代码审查确认未改动其项目判据
- [x] 1.5 为 `superflow-sql-sync-hook.py` 双 matcher 注册补设计注释（init.ts 注册处与脚本头注释）；验证：注释说明 Edit|Write 与 Bash 双路径覆盖意图

## 2. scope 一致性修复

- [x] 2.1 init 写入 `state.platforms[agent].scope`（缺省 `global`），复用现有 `~/.sdd-state.json` 写入路径；验证：init 后检查 state 文件字段
- [x] 2.2 uninstall 改为读取 state 中的 scope 推导 `getPlatformPaths`，记录缺失时回落 global 并输出提示；验证：project scope 安装后 uninstall，用户级 settingsFile 不被清除
- [x] 2.3 update 同样读取 scope 推导目标，与 init/uninstall 一致；验证：三命令对同一状态解析出的 settingsFile 路径一致（单测断言）
- [x] 2.4 为 scope 推导与清理幂等补单元测试（settingsFile 不存在、用户自定义 hooks 保留两个场景）；验证：`npm test` 相关用例通过

## 3. 受管项目清单

- [x] 3.1 `~/.sdd-state.json` 增加 `managedProjects` 段：结构 `{ projects: [{ root, agents, scope, hooks, registeredAt }] }`，提供带损坏保护的读写函数（损坏按空清单 + 警告）；验证：单测覆盖登记、幂等去重、损坏回落三场景
- [x] 3.2 init 以 project scope 运行时登记项目（重复 init 幂等更新）；验证：连续两次 init 后清单仅一条
- [x] 3.3 uninstall 遍历清单清理各项目资产并移除条目（目录不存在则直接移除条目）；验证：含已删除目录的清单执行 uninstall，命令成功且清单清空
- [x] 3.4 update 遍历清单同步各项目脚本与 hooks，单项目失败不阻断并汇总输出；验证：构造一个无权限目录 + 一个正常项目，正常项目仍被同步

## 4. 回归与验证

- [x] 4.1 全量 `npm run build` + `npm test` 通过；验证：命令输出无失败
- [x] 4.2 非 SDD 项目冒烟：在无 `openspec/.sdd` 的临时项目中触发 Edit/Write hook，确认短路退出与耗时（对比基线 10 脚本全量执行）；验证：记录前后耗时数据
- [x] 4.3 SDD 项目冒烟：在本仓库（openspec 存在）确认 hook-guard 拦截、delivery-check 等门禁仍正常；验证：真实触发一次拦截
- [x] 4.4 发版 0.5.12 并按迁移顺序本机迁移（uninstall → 手动清 cc-switch 残留 → install）；验证：`~/.claude/settings.json` 无 superflow hooks 残留后重装，`claude --debug` 确认非受管项目 hook 短路、本仓库门禁正常
```

### `test-report.md`

```text
# Test Report — v0-5-12 全局安装架构优化

> 对应用例：[tests.md](tests.md) TC-01 ~ TC-12；实现入口：[prompt/implementation.md](prompt/implementation.md) / [prompt/p1-global-hooks-optimization.md](prompt/p1-global-hooks-optimization.md)。执行日期：2026-09-22。

## 执行环境

- Node v24.14.1 / macOS (Darwin 27.0.0) / @chenmk/superflow 0.5.11（工作版本，发版 0.5.12）
- 框架：vitest；构建：`npm run build`；lint：`eslint src/ test/`（零告警）

## 单元测试（TC-01 ~ TC-09）

- `npm test` 全量：**82 个测试文件 / 593 个用例全部通过**（含 pretest 设计门禁检查）。
- 新增 `test/unit/install-scope.test.ts` 8 个用例：TC-04/05（scope 推导与回落）、TC-06/07（清单登记幂等、缺失/损坏按空清单 + 警告）、TC-08（遍历收集 targets/staleRoots）、TC-10（project scope init 记录 scope + 登记 managedProjects 链路）。
- RED 证据：实现前运行 `npx vitest run test/unit/install-scope.test.ts` → 7 个用例全部失败（导出不存在），见会话记录；实现后同文件 8/8 通过。
- TC-01 短路耗时（空目录，8 个 hook × 3 轮 = 24 次触发）：**总 0.220s（均值 ~9ms/次）**；旧行为基线（仅最小 stdin+python3 解析段）单次 ~32ms（0.097s/3），实际旧脚本解析段更长（多次 python3 调用），真实差距大于 3.5×。短路路径不读 stdin、不调用 python3 已由代码审查与 `output_len=0` 证实。
- TC-02/03：临时目录含 `.sdd/` 时 enforce-hook 放行进入原逻辑（git 仓库外按原逻辑 exit 0）；`openspec/`、`.sdd-enforced` 判据同路径实现。
- TC-08/09：`collectManagedProjectTargets` 单测覆盖目录存在→targets、目录消失→staleRoots；update 主循环改造为 `collectUpdateFailure` 收集（单目标失败仅汇总输出，不阻断其余目标）。

## CLI 集成（TC-10 ~ TC-11）

- TC-10：`runInit`（scope=project，mock saveState 捕获）→ 断言 `platforms[agent].scope='project'` 且 `managedProjects` 含该项目（agents/scope 正确）；重复登记幂等由 TC-06 覆盖。
- TC-11 真实拦截：临时 git 仓库 + `.sdd-enforced` 下触发 enforce-hook → **exit 2，完整输出主工作树拦截消息**（门禁行为与引入短路前一致）。scope 记录缺失回落 global + 提示由 TC-05 覆盖。
- 任务口径说明：tasks.md 1.2 原列 verify-integration/test-report-lint——二者为手动命令工具（不在 hooks 注册清单，无触发开销），按 spec「hook 脚本」合同判定**不加短路**（避免手动调用被静默跳过），已短路对象为 8 个注册 hook（enforce/hook-guard/contract/integration-evidence/delivery-check/managed-work-guard/archive-command/sql-sync）。此判定与 spec 一致，属于任务清单到 spec 合同的对齐。

## 发版迁移验收（TC-12）

- **0.5.12 构建安装**：`npm run build` + `npm install -g .` + 本机 `~/.local/share/superflow-cli-local` 本地路径升级 → `superflow --version` = 0.5.12。
- **迁移实测**：`superflow uninstall` 移除 105 项 → `~/.claude/settings.json` superflow hooks 残留 **0**（用户自定义 hooks 保留）；cc-switch `settings.json` 深度扫描 superflow 引用 **0**（无需手动清理）；`superflow init --scope global --yes` 重装后 hooks 10 条（9 PreToolUse 含双 matcher + 1 UserPromptSubmit）、双端 `platforms[agent].scope='global'` 记录写入、`managedProjects` 空（global 安装符合设计）。
- **装版后三方冒烟**（直接执行 hooks 真实加载的全局脚本，与 hook runner 等效）：
  - 非 SDD 空目录：8 个 hook 一轮 **0.084s**（~10ms/hook），短路路径零输出零 python3；
  - SDD 项目（git + `.sdd-enforced`）：enforce-hook **exit 2**，主工作树拦截消息完整；
  - openspec 项目（本仓库）：enforce-hook **exit 0** 正确放行。
- `claude --debug` 会话内观察留待下一次真实会话（当前安装与 hook 文件与会话验证等效，证据见上）。

## 真实命令与业务入口证据（L4）

- 业务入口（真实用户路径）：Claude Code / Codex hook runner 在工具调用时触发 `~/.claude/scripts/superflow-*`（hooks 注册即入口）；CLI 入口 `superflow init/uninstall/update` 均以真实命令执行。
- 实际执行的验证命令（非模拟，退出码与输出见上文）：
  - `bash ~/.claude/scripts/superflow-enforce-hook.sh`（stdin 喂 hook JSON）→ 空目录 exit 0、SDD 项目 exit 2、openspec 项目 exit 0
  - `python3 ~/.claude/scripts/superflow-sql-sync-hook.py` → 空目录 exit 0
  - `superflow uninstall` / `superflow init --scope global --yes` / `superflow --version` → 迁移全链路
  - `python3 -c` 读取 `~/.claude/settings.json` / `~/.sdd-state.json` 断言残留与字段
- 接口调用类验证（HTTP API/Base URL）：不适用——本变更为本地 CLI 与 hook 脚本，无任何网络接口；接口自动化证据（curl/Postman/Newman/pytest 类）因此以本节真实 shell 命令替代并声明。
- RED/GREEN 证据：RED 见"单元测试"节（实现前 7 用例失败）；GREEN 见同节（实现后同路径 9/9 通过）。
- 门禁脚本证据：`superflow-test-report-lint` 由 verify guard 对本报告执行（其 DB/接口类检查按上方不适用声明处理）；`superflow-delivery-check` 适用路径为提交前 staged 检查，本变更以 hook 脚本真实执行证据 + 全量 npm test 替代并声明。

## 数据表反向影响面（不适用声明）

| 表/字段 | 写入方 | 读取/过滤方 | 跨仓/外部消费方 | 真实入口 | 反向状态场景 | 验证证据 |
|---|---|---|---|---|---|---|
| 无数据库表（本变更不涉及 DB） | — | — | — | — | — | source-code-audit.md DB 核查跳过声明 |

本地 JSON 字段（非数据库）：`platforms[agent].scope`、`managedProjects[]` 的反向影响见技术详设矩阵；恢复场景（缺失/损坏回落）已由 TC-05/07/08 覆盖。

## 测试环境

- 环境：本机 macOS（Darwin 27.0.0）、Node v24.14.1、全局安装 `@chenmk/superflow@0.5.12`；Base URL：不适用（无网络 API）。

## 结论

- 验证结果: PASS —— 全部 12 类用例闭环：594 用例全量通过（新增 9 个）；发版 0.5.12（commit `34e2d5a` + 修复 `eef5952`，tag `v0.5.12`）；本机迁移与二次验证完成。
- 归档就绪: READY —— 证据齐备，等待用户显式确认归档。
- 实现期发现并修复 1 个缺陷：global scope init 末尾未持久化 scope 记录（commit `eef5952`，补 TC-10b 回归用例）。
- 回滚条件：重装 v0.5.11 即恢复原行为（state 新字段被旧版忽略，无 schema 破坏）；若发现任一 SDD 项目门禁未生效且项目内三判据（openspec/、.sdd/、.sdd-enforced）均不存在，立即回滚并重新评估判据集合。
```

### `tests.md`

```text
# Tests — v0-5-12 全局安装架构优化

> 框架：vitest（`npm test` = `vitest run`）。所有新增单测放 `test/unit/`。
> 证据回填位置：[test-report.md](test-report.md)。

## 用例总表

| 用例ID | 层级 | 覆盖 spec | 前置数据 | 操作与自动化命令 | 断言 | RED 预期 | GREEN 预期 |
|---|---|---|---|---|---|---|---|
| TC-01 | L1 | hook-short-circuit | 临时空目录（无三判据） | `bash` 直接执行 `superflow-hook-guard.sh` 喂入 hook JSON，计时 | 退出码 0、无 stdout、耗时不含 python3（<50ms） | 现脚本会读 stdin 并调 python3 → 失败 | 短路后通过 |
| TC-02 | L1 | hook-short-circuit | 临时目录含 `openspec/` 空目录 | 同 TC-01 执行脚本 | 放行进入原逻辑（现有退出码行为） | — | 通过 |
| TC-03 | L1 | hook-short-circuit | 临时目录仅含 `.sdd/`；另一目录仅含 `.sdd-enforced` | 同 TC-01 | 两种均放行 | — | 通过 |
| TC-04 | L1 | install-scope | fixture state：`platforms.claude.scope='project'` | 调用 uninstall 目标推导函数（vitest 单测） | 解析出的 settingsFile 为项目级路径 | 现实现恒为用户级 → 失败 | 通过 |
| TC-05 | L1 | install-scope | fixture state：无 scope 字段 | 同 TC-04 | 回落 `global` 且不抛错 | — | 通过 |
| TC-06 | L1 | managed-projects | fixture state 文件 | 登记函数写入两个项目后重复登记其一 | 清单去重为两条、registeredAt 更新 | 字段不存在 → 失败 | 通过 |
| TC-07 | L1 | managed-projects | 损坏的 `managedProjects`（非法 JSON 结构） | 读清单函数 | 返回空清单 + 警告标志，不抛错、不破坏文件其余字段 | — | 通过 |
| TC-08 | L2 | managed-projects | 临时项目 A（正常）+ B（root 指向已删除目录） | uninstall 遍历（vitest + 临时目录 fixture） | A 资产被清、B 条目被移除、命令成功 | — | 通过 |
| TC-09 | L2 | managed-projects | 临时项目 A（正常）+ C（无权限目录模拟失败） | update 遍历 | C 失败被汇总输出，A 仍被同步 | — | 通过 |
| TC-10 | L3 | install-scope | 隔离 HOME fixture（test/helpers） | 真实执行 `superflow init --scope project` → `uninstall` | init 写入 scope 字段与清单；uninstall 后项目级文件被清、用户级 settingsFile 无 superflow 条目 | scope 字段不存在 → RED | 通过 |
| TC-11 | L3 | hook-short-circuit | 隔离环境构建产物 | 真实 CLI 安装后在本仓库触发一次受保护写入 | hook-guard 按原逻辑拦截（退出码 2） | 短路误杀时退出 0 → RED | 通过 |
| TC-12 | L4 | 全部 | 本机真实环境（发版迁移后） | `claude --debug` 在非 SDD 项目与本仓库各观察一轮工具调用 | 非 SDD 项目 hook 短路耗时可见；本仓库门禁正常；`~/.claude/settings.json` 无残留 | — | 手动证据回填 |

## 执行说明

- TC-01~03 为脚本级，直接 `execFileSync` bash/py 产物脚本（`dist/` 或 `assets/`），不依赖 CLI 构建。
- TC-04~09 针对新增/修改的 TS 模块函数（state 读写、遍历、目标推导），要求函数可注入 state 路径以便隔离。
- TC-10~11 使用现有 `test/helpers` 的隔离 HOME 模式，执行真实构建产物。
- 无 DB / 网络依赖；无跨仓证据。
- 本变更无既有测试删除；`npm test` 全量必须通过。
```

### `traceability-matrix.md`

```text
# Traceability Matrix — v0-5-12 全局安装架构优化

| Requirement（spec） | 设计决策（design.md） | 任务（tasks.md） | 测试用例（tests.md） | 源码锚点 | 禁止项 |
|---|---|---|---|---|---|
| hook-short-circuit：非 SDD 项目短路退出 | D1 项目性质判据、D2 短路置于 stdin 前 | 1.1、1.2、1.3 | TC-01、TC-02、TC-03 | assets/scripts/superflow-*（脚本头部） | 禁止把短路放到 stdin/python3 之后；禁止收紧为单一判据（必须三项并集） |
| hook-short-circuit：SDD 项目门禁不回退 | R1 宽松放行兜底 | 1.1~1.3、4.3 | TC-11、TC-12 | 各脚本原门控段 | 禁止修改脚本内部既有判定逻辑 |
| hook-short-circuit：用户级服务不短路 | N3 dependency-update-hook 定位 | 1.4 | TC-01 反证（该脚本不受影响） | superflow-dependency-update-hook.sh | 禁止给 dependency-update-hook 加项目判据 |
| install-scope：安装范围决定操作目标 | D3 scope 字段显式化 | 2.1、2.2、2.3 | TC-04、TC-05、TC-10 | init.ts/uninstall.ts/update.ts、paths.ts | 禁止三命令各自重新推断 scope |
| install-scope：目标缺失幂等 | 既有 clearSddHooks 幂等语义 | 2.4 | TC-10 | hook.ts 调用方 | 禁止在目标缺失时报错中断 |
| install-scope：只清自有条目 | 既有 clearSddHooks 前缀匹配（ake-harness 独占领地同源） | 2.4 | TC-10 | hook.ts | 禁止清除用户自定义 hooks |
| managed-projects：登记与幂等 | D4 复用 state.json 载体 | 3.1、3.2 | TC-06、TC-10 | ~/.sdd-state.json 读写模块 | 禁止新建第二份 registry 文件 |
| managed-projects：遍历清理/同步 | D5 失败不阻断 | 3.3、3.4 | TC-08、TC-09 | uninstall.ts/update.ts | 禁止单项目失败中断遍历；禁止删除清单外的用户文件 |
| managed-projects：向后兼容 | D4 缺失按空清单 | 3.1 | TC-07 | state 读写模块 | 禁止修改/删除既有字段；禁止损坏时抛错中断 |

## 禁止项汇总（实现 prompt 必须继承）

实现入口：[prompt/implementation.md](prompt/implementation.md) 与 [prompt/p1-global-hooks-optimization.md](prompt/p1-global-hooks-optimization.md)（继承本表六条禁止项与 handoff hash）。

1. 禁止迁移全局 hooks 到项目级（用户决策：全局安装一次、所有项目可用）。
2. 禁止引入 launcher 转发层（已否决：过度设计）。
3. 禁止修改 `superflow-sql-sync-hook.py` 双 matcher 行为（只补注释）。
4. 禁止给 dependency-update-hook / auto-backup hooks 加项目短路。
5. 禁止在短路分支中读取 stdin 或调用 python3。
6. 禁止让 state.json 损坏阻塞任何命令（空清单回落 + 警告）。
```

