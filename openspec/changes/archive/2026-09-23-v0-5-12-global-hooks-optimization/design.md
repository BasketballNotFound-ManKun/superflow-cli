---
archived-with: 2026-09-23-v0-5-12-global-hooks-optimization
status: final
---
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
