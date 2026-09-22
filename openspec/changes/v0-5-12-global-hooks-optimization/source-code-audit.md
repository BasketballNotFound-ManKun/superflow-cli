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
