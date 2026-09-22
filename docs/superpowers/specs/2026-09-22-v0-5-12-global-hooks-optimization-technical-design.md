# 技术详设 — v0-5-12 全局安装架构优化（Superpowers Technical Design）

> WHAT/API/tests 合同见 OpenSpec change `openspec/changes/v0-5-12-global-hooks-optimization/`
> （[design.md](../../openspec/changes/v0-5-12-global-hooks-optimization/design.md) 为源码级 HOW 事实源）。
> 本文件只补实现编排：TDD 顺序、精确修改点、验证分工。与其冲突时以 OpenSpec 文档为准。

## 精确修改点（源码级）

| 文件 | 修改 |
|---|---|
| `src/types.ts` | `PlatformState` 增加可选 `scope: InstallScope`；`SddState` 增加可选 `managedProjects` |
| `src/domains/state.ts` | 新增受管清单读写（损坏保护：空清单+警告标志）与登记/移除函数 |
| `src/app/commands/init.ts` | hook 注册段写 `state.platforms[agent].scope`；project scope 时登记清单 |
| `src/app/commands/uninstall.ts` | 目标推导读 scope（回落 global+提示）；遍历清单清理+移除条目 |
| `src/app/commands/update.ts` | 目标推导读 scope；遍历清单同步，失败收集汇总 |
| `assets/scripts/superflow-*.{sh,py}` ×9 | 头部（shebang/注释后、stdin 前）插三判据短路 |
| `assets/scripts/superflow-archive-command-hook.sh` | 既有 `[ -d "$CHANGE_DIR" ]` 判断提前至 stdin 解析前 |
| `assets/scripts/superflow-sql-sync-hook.py` + `init.ts` 注册处 | 双 matcher 设计注释（行为不变） |

## TDD 顺序（对应 tests.md）

1. RED：TC-04/05（scope 推导）、TC-06/07（清单读写/损坏回落）→ 实现 `types.ts`+`state.ts` → GREEN。
2. RED：TC-10 骨架（隔离 HOME CLI 链路）→ 实现 init/uninstall/update 改造 → GREEN。
3. TC-08/09（遍历清理/同步容错）→ 实现遍历 → GREEN。
4. TC-01~03（脚本短路）→ 逐脚本头部插入，bash 直测。
5. TC-11/12 回归与真实环境验证（组 4）。

## 验证分工

- 实现者：`npm test` 全量 + TC-01~03 bash 直测 + 隔离 HOME CLI 链路。
- 评审：按 review-checklist.md 安全/正确性/兼容三段核查 diff。
- 真实入口：发版装版后本机两场景冒烟（非 SDD 项目短路、本仓库门禁），记录 `claude --debug` hook 耗时。

## 禁止项

继承 [traceability-matrix.md](../../openspec/changes/v0-5-12-global-hooks-optimization/traceability-matrix.md) 六条（不迁项目级、不引 launcher、双 matcher 不动、用户级服务不短路、短路不读 stdin、损坏 state 不阻断）。

## 复杂度减法评审（Complexity Reduction Review）— PASS

- 复用（reuse）：全部修改点复用既有模块——`getPlatformPaths` 的既有 scope 参数、`loadState/saveState` 既有读写、`clearSddHooks/registerHook` 既有注册、`collectUpdateFailure` 既有失败收集；不新增平行机制。
- 最简实现（simplest implementation）：短路为单行 test 链；清单为单个 JSON 段；scope 为单字段透传；无新抽象层。
- 已拒绝（rejected）：launcher 转发层、manifest sha256 指纹、hooks 项目级迁移、独立 registry 文件（理由见 OpenSpec design.md 复杂度减法评审）。

### 新增项统计（Complexity budget / New-item counts）

| 维度 | 数量 | 说明 |
|---|---|---|
| 数据表（table） | 0 | 无数据库 |
| 字段（field） | 0 | 无数据库字段；state.json 新增 JSON 键 2 个 |
| API（网络接口） | 0 | 无新增网络 API |
| Service/组件（service/component） | 1 | state 受管清单读写函数（同文件内扩展，非新模块） |
| 缓存（cache） | 0 | 无缓存 |
| MQ/事件/异步（event/async） | 0 | 无异步 |
| 定时任务（scheduled job） | 0 | 无定时任务 |
| 兼容层（compatibility layer） | 0 | managedProjects 缺失按空清单为兼容读取，不构成兼容层 |

## Architecture Boundary And Call Direction（架构边界与调用方向）

| 模块 | 职责 | 入口（owner） | 出口 | 禁止绕路 |
|---|---|---|---|---|
| assets/scripts 脚本层 | 门禁判定与前置短路 | hook runner（stdin JSON，cwd=项目根） | exit 0/2 + stderr 提示 | 禁止反向调用 superflow CLI（dependency-update-hook 除外） |
| domains/state 清单层 | 受管清单读写（损坏保护） | init/uninstall/update 命令层 | `~/.sdd-state.json` | 禁止脚本层直接读写 state |
| commands 命令层 | scope 推导与清单遍历编排 | CLI 参数 | 调用清单层 + getPlatformPaths | 禁止绕过 getPlatformPaths 自行拼 base 路径 |
| platform/paths 路径层 | 目标路径唯一推导 | 命令层 | PlatformPaths | 禁止在其他层重复推导 base |

调用方向单向：commands → domains/state → platform；hook 脚本独立进程运行，不 import CLI；入口/出口与既有分层一致，本变更不新增跨层调用。

## Field And Status Reverse Impact（字段/状态反向影响面）

| 字段/状态 | 写入点 | 读取/过滤点 | 派生/同步点 | 反向恢复场景 |
|---|---|---|---|---|
| `platforms[agent].scope` | init（step 4 后写记录） | uninstall/update 目标推导 | 无 | 旧 state 无字段 → 回落 global + 显式提示；重装 init 后恢复 |
| `managedProjects[]` | init project scope 登记（幂等）；uninstall 遍历移除 | uninstall/update 遍历 | 无 | 项目目录已删除 → 条目移除；字段损坏 → 空清单 + 警告，文件其余字段不动 |
| hooks 注册条目（settingsFile） | init/update 的 registerHook（先 clearSddHooks 后写） | hook runner | clearSddHooks 先清后写 | uninstall 清除 → 重装恢复；用户自定义条目全流程保留 |
