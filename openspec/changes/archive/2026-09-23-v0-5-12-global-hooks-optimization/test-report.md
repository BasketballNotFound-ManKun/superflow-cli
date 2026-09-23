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
