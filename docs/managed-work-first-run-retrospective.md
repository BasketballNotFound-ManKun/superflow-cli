# 首次托管运行复盘

## 2026-09-17 源码复验与修复

基线为 `526d3d1`，修改保留在本地工作区。本次边界实验确认：任务勾选和测试报告
回填会误使 handoff 失效，含 `pending` 的业务规则却会漏检；部分模板仍要求正文
复制 hash；忽略规则仅覆盖 tasks 时被误判为完整覆盖；未跟踪 `.gitignore` 的修改
没有进入工作区指纹；留存清理没有自动入口，引用解析还错误读取不存在的正则分组。

修复及验证映射：

| 项目 | 当前行为 | 回归证据 |
| --- | --- | --- |
| handoff | state 单点绑定；进度回填不失效；任务内容、pending 及含摘要的业务规则修改仍检出 | handoff.test.ts 中英文边界、guard.test.ts 错误绑定拒绝 |
| 文档一致性 | 中英文模板链接上下文包，不要求多处复制原始 hash | english-assets.test.ts；旧指引搜索无命中 |
| 运行目录忽略 | 项目 init 与创建任务接入；补齐部分/反向规则；拒绝符号链接 | init.test.ts、managed-work-reliability.test.ts（真实 git check-ignore） |
| 变更审计 | 自动追加规则后采集基线；后续 gitignore 修改仍可检测 | managed-work-state.test.ts |
| 环境阻塞 | 保存脱敏原始证据；不自动重试；恢复后续跑原任务 | managed-work-runner.test.ts 阻塞及恢复场景 |
| 自动清理 | 交付终态复用既有策略；引用证据保护；失败记录延期 | managed-work-cleanup.test.ts、managed-work-runner.test.ts |
| 安装残留 | init/update 明确覆盖部署，不自动堆积备份；保留历史备份 | skills.test.ts 重复部署用例 |
| 实际接口验收 | 模板要求冻结环境与接口/角色/场景矩阵，复用一次启动，记录响应及数据库集合对账 | 中英文 test-execution-template.md；由任务合同及 Host 判断业务覆盖充分性 |

最后一轮全量回归：79 个测试文件、551 条用例全部通过（2026-09-17 12:35:03 开始，
83.05 秒）；日志 `/tmp/superflow-closeout-tests.log`。审批服务恢复后，最终 Lint、
设计门禁、TypeScript 构建及 npm pack 均通过。本地包已安装至
`~/.local/share/superflow-cli-local/node_modules/@chenmk/superflow`，用户目录的
`superflow` 和 `superflow-mcp` 入口已切换；原入口分别为
`/opt/homebrew/bin/superflow` 和 `/opt/homebrew/bin/superflow-mcp`，未修改原全局包。
通过新 CLI 的 `update --agent codex --scope global --language zh` 完成 Codex 资产
及 MCP 刷新，结果保存在 `/tmp/superflow-local-update.json`。未修改 Claude 安装目录。

已逐文件核对安装包的 Runner、清理实现、更新入口、中英文关键模板，以及部署后的
Codex handoff/guard/实现模板，均与源码哈希一致。通过真实 stdio 客户端启动新 MCP、
完成握手并调用 `superflow_managed_runtime` 成功；版本仍为本地未发布的 0.5.8，指纹为
`e5374b792c2e6393337b8672da15632f0ec05465e68e5e05e4a764149c68a319`，验证进程已关闭。
现有 Host 会话须重启以加载新技能和 MCP 配置；本次没有伪称旧会话已自动切换。

这些是确定性脚本及 Runner 回归，包括测试替身驱动的状态机测试，不是新的真实双模型
托管性能基准。没有据此宣称 Token 或耗时下降。本次未清理 operator-api 历史产物，
没有发布或推送。若进度归一化漏检业务合同，或清理误删被引用证据，必须阻止交付并
恢复对应保护；不得通过删除断言放行。

## 范围与基线

证据来自 `evcharge-operator-api` 的
`task-20260910032808-6b6a97de` 落盘 Run。任务尚处于
`waiting_for_human`，不能称为交付完成。离线评估记录 6 次 Executor 物理/有效调用、3
轮 Host 评审、1,143,741 输入 Token、413,461 输出 Token、37.847471 美元成本、11 个有效
监督点、14 个空闲监督点和 6 次无进展升级；活跃 13,296,987ms、墙钟 19,634,849ms。

## 直接原因

1. 首轮交付没有达到冻结业务合同的源码覆盖与测试合同，Host 后续发现的阻断项分散在
   `acceptance-contract`、`source-audit-coverage`、`test-contract`、运行安全和交付卫生；
   当前阻断项关闭率仅 1/5。
2. 多次 Executor 结果无效或失败，原始事件流和工作区快照被完整保留，形成主要磁盘占用；
   这不是业务交付证据本身。
3. 监督升级是“连续无阶段/权威命令完成”的 Runner 事实，不等同于 Agent 无工作；非活跃
   墙钟时间中 2,424,557ms 可归为 Host 评审等待，3,913,296ms 只能诚实标为未归类等待。

## 机制原因与责任边界

| 问题                               | 责任层           | 改进                                                                                                      |
| ---------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| 通用数据权限被机械拆成大量接口任务 | Host/冻结文档    | 首轮冻结公共能力、接口矩阵、覆盖标准、排除项和测试合同；Executor 不以模板代替逐源码核实。                 |
| 同类 finding 分轮发现              | Host 语义评审    | 首轮完成全量跨模块审查，复用 finding ID；Runner 只聚合和追踪，不宣称模型必然一次发现全部问题。            |
| 文档/评审任务被套入运行验收        | Runner 合同      | `docs-only`/`review-only` 只生成文档或静态检查任务，不生成 startup、HTTP、cleanup 验收。                  |
| 历史上下文与中间流膨胀             | Runner 协议/存储 | Handoff 继续以合同、未关闭 finding、最新有效交接和变化摘要为入口；原始流不重复注入。                      |
| App 重启或断网后监督不可见         | Host 适配与 UI   | 以 run-state、PID、账本为恢复事实源：活 PID 只允许安全接入，死 PID 才恢复；UI 不可用不能推断 CLI 已停止。 |
| 过程文件只会累积                   | Runner 存储      | 新增 `full`/默认 `compact`/`none` 的确定性 retention 与审计式 CLI cleanup。                               |

## 可验证改进与回滚条件

本次根因修复把“首轮合同与源码覆盖”从 Prompt 约定改为启动、评审和最终门禁的同一条
可审计链路：新的 `task_file`/`sdd` 启动必须提供 `acceptanceContract`，其中冻结业务不变量、
精确源码范围、交付物、验证和排除范围；每个源码目标在启动时必须是仓库内已存在路径。Runner
把该对象纳入 `contractHash`，写入 `acceptance-contract.json/md` 并作为 immutable context manifest
条目。首轮 Host review 必须对每项合同写入 `acceptanceCoverage.reviewed`，每个 finding 关联
`acceptanceContractRefs`；提交入口与 `superflow-managed-work-check.mjs` 同时校验，缺失、篡改、
漏项或未知引用都不能进入交付就绪。旧任务仍可按旧事实恢复，但不会被重新标记为已具备该保证。

代表性回归覆盖：缺合同拒绝、缺失/越界源码路径拒绝、合同快照进入 immutable manifest、篡改
检测、完整 Host 覆盖通过与漏项拒绝；还需在后续真实业务 Run 记录首轮 finding 是否从多轮分散
收敛为首轮完整覆盖。回滚条件：若该合同要求业务方案在 `api.md`/`design.md`/`tests.md` 之外
重新决策，或把 Host 的语义评审降格成脚本规则，应撤回该合同条目而非放宽门禁。

`superflow cleanup <task-id> --project <root> --dry-run` 先验证任务 ID、项目/工作区绑定、
Run 状态和符号链接，再输出逐文件计划；非 dry-run 会再次核验计划一致性后仅逐个删除普通
任务文件。`full` 不删除；`compact` 清理已替代且未引用的进度流、invalid/failed events、
重复 stderr、workspace 快照、旧 handoff/repair；`none` 只在此基础上删去已被最终摘要吸收的
有效事件流。当前写入、恢复点、当前交接、交付、评审、run-state、最终报告、最终验证与安全
审计证据均保留。

回滚条件：发现候选被当前证据引用、任务/绑定/状态损坏、出现符号链接、任务活跃或计划在
执行前变化时，命令失败关闭且不删除任何文件。该改动不改变双 Agent 边界，不新增 Agent 调用。
