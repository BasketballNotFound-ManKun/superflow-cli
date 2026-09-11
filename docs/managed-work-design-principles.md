# Superflow 托管功能设计原则

## 文档地位

本文是 Superflow 托管编排的长期设计宪章。新增功能、修复缺陷、修改 Prompt、Hook、脚本、
MCP 或状态机前，必须逐项核对本文；与实践报告冲突时，以本文和最新协议测试为准。

目标不是让两个 Agent 频繁对话，而是把“研发 Agent 持续交付、主 Agent 独立评审”的人工
协作沉淀为可恢复、可审计、低人工介入、低主 Agent Token 消耗的工作流。

## 核心设计理念

1. 主 Agent 是架构师和独立评审者，不是第二个研发执行者。
2. Executor 是唯一研发写入者，负责编码、测试、启动、真实调用和进程善后。
3. Runner 是确定性状态机，不是第三个 Agent，也不判断业务语义。
4. 能由确定事实裁决的交给脚本；需要上下文、风险或语义判断的交给 Agent。
5. 一次 Executor 调用应完成一批完整工作，不能用固定 turns 把任务切碎。
6. 有效证据跨轮继承；整改只重跑受影响的验证，不重复已经成立的环境链路。
7. 监督采用“本地采样 + 活动等待”模式：Runner 本地高频采样不调用模型；活动 MCP wait
   用标准 MCP progress notification 展示阶段和健康监督点，不结束等待、不唤醒 Host 模型。
   只有评审、异常或连续两个无有效里程碑的监督点才返回 Host；CLI 以同一状态文件阻塞等待兜底。
8. 所有恢复、抵扣、晋升和人工决定必须留下可审计事件。
9. 结构化结果格式错误优先由 Runner 本地规范化或转 Host，不得启动完整 Executor 修 JSON。
   空白 `blockers`、`releasePrerequisites`、`evidence` 由 Runner 确定性清洗；只读检查以
   exit 1/2 和明确“无进程/监听/容器/残留”证明空结果时直接接受，不消耗 Agent 调用。仅当
   整次调用没有任何可解析的交付 JSON、Host 又无法凭现有事实源安全形成评审时，才允许保留
   原始日志并创建**一次**新的压缩交付恢复会话；它继承 handoff 和历史证据，只完成剩余受影响
   工作及结构化交付，第二次同类失败必须转人工，不能无限重试。
10. 阶段事件必须对应真实工作；恢复轮从受影响阶段继续，不得无条件重置为源码检索。
11. 控制面启动从调用者视角必须原子且可安全重试；启动失败不能留下“已创建但返回失败”的幽灵任务。

入口与资产保护同样遵守以下长期原则：

- 托管只接收两种已归一化执行入口：Coding Ready 的冻结 change/Prompt，或经 Host 判断为
  边界清晰的口头任务。纯文档模式不创建托管 Task/Run；口头任务出现方向性选择时先回到
  澄清/文档流程。三种用户入口复用同一输入解析、执行合同和上下文清单，不新增平行状态机。
- 受保护资产由 Runner 从冻结输入生成清单。`immutable` 的需求、设计、Prompt、handoff、
  规则和任务事实只能读取；`retain` 的 tasks/test-report 可回填但不得删除。Hook 在原生支持
  的 Host 上写入前阻断，preflight/最终门禁对所有 Host 复核；不得只在事后发现整份文档消失。
- 清理按 `runtime`、`workspace-temporary`、`delivery-artifacts`、`protected-contracts`
  四类处理。Executor 清理前两类并保留后两类给 Host 评审；终态后的演练产物清理必须使用
  独立、审计式 cleanup，不能夹在研发交付轮中。
- 新建的 `task_file`/`sdd` 托管任务必须由 Host 在启动时冻结结构化验收合同：业务不变量、
  精确源码覆盖（每项给出启动时已存在的仓库内相对路径）、交付物、验证和排除范围。Runner 将它
  纳入任务合同哈希，单独写入不可变 `acceptance-contract.json/md` 并加入 context manifest；
  缺项、路径不存在、快照/哈希漂移或首轮 Host 覆盖记录不完整都失败关闭。旧落盘任务允许恢复，
  但不得声称按此新合同启动。
- 首轮 Host 评审必须覆盖每个冻结合同条目和每个源码范围；`acceptanceCoverage.reviewed` 是
  完整覆盖记录，每个 finding 的 `acceptanceContractRefs` 必须指向相关条目。Runner/最终脚本
  只校验结构、哈希、路径和覆盖记录，不以此替代 Host 的源码语义判断。
- 任务过程产物留存由 Runner 以固定 `full`、`compact`、`none` 策略裁决，默认 `compact`；
  不由 Agent 判断价值。`compact` 仅删除已经替代且未被当前交接、评审、报告、任务证据或
  未关闭 finding 引用的原始流、重复快照和无效交付流；`none` 只在已停止任务上进一步删除
  已被最终摘要吸收的过程流。当前写入文件、最后恢复点、当前有效交接/交付/评审、run-state、
  最终验证证据及安全审计证据永不删除。清理先生成可复核清单，校验任务 ID、工作区绑定、
  状态、真实路径和符号链接后才逐文件执行；active、未知或损坏状态失败关闭，并保留小型
  留存摘要以避免统计失真。

直述 `engineering/sdd` 入口没有用户 implementation prompt 时，Runner 必须先落盘并冻结
标准执行合同，明确“先核实源码/复用/资源 owner/验收/清理，方向性选择回 Host”的边界；
不得以空 Prompt 或泛化 E01–E04 清单直接让 Executor 自行设计。运行环境合同还要规定可移植
验收、代表性失败清理和禁止以宽泛替身伪造启动；直述并发只能要求确定性非 5xx 业务冲突和
一次持久化状态转换，不能编造具体 API/DB/实现方案。该合同不携带业务技术方案，不改变
“文档定义 HOW、托管只继承”的职责边界。12. 全局 registry 只是任务定位索引；单个陈旧或缺失工作区不得拖垮任务列表和其他健康任务。13. MCP 进程必须暴露启动时运行时指纹；安装内容变化后，旧 MCP 必须在创建任务前失败关闭，禁止用旧进程验证新版本。14. 详细构建和运行日志写入任务证据文件，Agent 工具通道只输出有界阶段摘要和失败尾部，禁止无界 DEBUG 输出挤占上下文或中断工具调用。15. 原始 Agent 日志必须完整保留但按固定大小分片，避免单文件过大；进入后期阶段后回到实现或测试必须记录 `executor.stage_rework` 原因。`executorStage` 作为已达里程碑保持单调，`executorActiveStage` 记录可回退的当前实际阶段；CLI/MCP 必须同时展示二者，禁止用旧里程碑冒充当前进度。16. 安装器重复部署 Superflow Skills 默认覆盖，不为同一已安装版本持续制造 backup；历史备份只在用户明确清理时删除。17. 交付引用的详细日志在正常 cleanup 删除 nonce/运行目录后仍须可读；等待进程退出后若
升级信号，必须重新核验 owner，禁止复用首次核验的裸 PID。18. 单次调用硬上限和无输出计时只累计机器实际运行时间，系统休眠不消耗执行预算；调用
结束、超时或转人工后，迟到的进度与 telemetry 不得倒写已持久化状态。19. macOS 本地 Agent 调用期间由 Runner 持有 `caffeinate -im`，避免锁屏或空闲触发系统
休眠；用户主动睡眠或合盖仍可能暂停机器，恢复后必须依靠落盘状态继续。20. Host 重启后若状态仍为 `running`，普通 `--resume-task` 只能安全接入并继续等待，不得
重置状态、重复启动或改写预算；只有已记录的 Executor PID 确认死亡时才自动转入安全恢复。
PID 未记录时失败关闭为接入等待，活进程必须拒绝重复启动，中断离线时长不得计入活跃耗时。21. 第三方增强插件不可用或 marketplace 下架时，安装器必须警告并继续部署核心 CLI、
MCP、协议与 Skills；但 Codex Superpowers 的 `verification-before-completion`、`requesting-code-review` 与 `finishing-a-development-branch` 是 Superflow verify 的硬依赖，Codex 或 Claude 的 Superpowers 安装在初始化或带包更新失败时必须失败关闭。`doctor` 必须逐项核验 Codex 三项技能，不得只以缓存或插件目录存在判定健康；安装完成后必须提示重启当前 Host，确保新会话加载技能。OpenSpec 等其他核心依赖失败也必须阻塞安装。22. Run 只能由 `run-*` 目录及其 `run-state.json` 共同识别；错误证据目录、归档目录或其他
子目录不得被计为活动 Run。历史证据只继承符合当前协议的有效命令，非法 negative
命令不得污染下一轮结构化结果。23. 活动不等于进展。heartbeat、重复 Read、相同 diff stat 和 workspace.changed 只属于原始
活动；阶段推进、首次完成的权威命令、真实验收结果和结构化交付才属于有效里程碑。
Runner 每 10 分钟生成紧凑监督点；健康监督点只走 MCP progress notification，连续两个
无有效里程碑的监督点才形成 `attentionRequired` 并返回 Host 判断偏航。24. 冻结合同中的任务分类和真实验收等级不可由 Executor 降级。成功命令若同时声明 HTTP
4xx/5xx、预期失败或替代后端，最终门禁必须失败关闭；文档勾选不能覆盖原始证据。25. 验证固定分为受影响验证、任务级真实验收、框架认证三级。普通业务任务不得为每个业务任务重复
Superflow 公共 owner helper 的完整灾难认证；整改轮先判断历史有效证据是否被当前差异失效。26. 一键源码安装必须同时完成 CLI、Skills/Hooks 和托管 MCP 注册，只操作本机真实存在的
Codex/Claude Host；不得把 MCP 注册隐藏成安装后的额外人工步骤，也不得因只
安装单侧或非默认组合 Agent 而强行使用 `both` 失败。Homebrew Node 必须注册稳定的
`bin/node` 入口，不能把 MCP 绑定到升级后会被清理的 Cellar 版本目录。27. 显式更新和 Hook 自动升级必须复用同一完整部署闭环：包升级后由新版本 CLI 重新部署
Skills、Hooks、规则、脚本和托管 MCP。禁止旧进程只更新 npm 包后宣称成功；任一步失败
或无法确认 registry 最新版本时必须保留重试资格并明确报告，不能写入成功节流戳掩盖
半升级或未知状态。28. Claude Executor 的长会话不能只依赖模型最大上下文窗口。Runner 默认使用 Claude Code
官方自动压缩环境变量提前压缩，并在持久系统策略中冻结 Compact Instructions；用户显式
配置优先。最终 `result.usage` 是本次调用权威用量，不能把大输入量未经核实归因于
Runner 重复求和。Host 等待采用 240 秒兼容传输窗口；支持更长工具调用的 Host 可显式
提高到 12 小时。传输窗口超时只续接 `latestSequence`，不得查询完整状态或重启 Executor。29. 项目规则由 Runner 按仓库技术栈、任务语义和执行档位选择。通用、安全及无法可靠分类的
规则始终保留；明确属于无关技术栈的规则不注入执行会话。Codex、Claude 的
项目规则目录使用同一选择器，选中场景和精确文件写入 Handoff，Agent 不重复全量检索。30. Executor 系统策略采用稳定前缀与任务上下文尾部两层结构。角色、安全、验证和清理规则
组成跨任务字节稳定的前缀并记录 SHA-256；路径、技术栈、工具链、Handoff 和恢复提示只
出现在尾部。缓存命中是可观测收益，不是协议正确性的前提。31. 权威需求、设计、任务、测试和规则通过统一执行上下文清单传递。清单只保存作用、绝对
路径和 SHA-256，不复制正文；Runner 在每次调用前验证哈希并把清单写入 Handoff。文档
漂移必须失败关闭，Executor 不得依靠聊天历史或重复拼接整份文档恢复上下文。32. 进入 Host 评审前，Runner 生成紧凑事实包，汇总变更路径、任务计数、命令退出码、验证
类别和证据哈希。Host 先读事实包再做独立源码语义审查；事实包不得宣称实现正确、测试
充分或方案合理，也不得成为跳过真实 diff 和原始证据的理由。事实包同时提供任务累计
变更和相对上次 Host 评审的增量变更；后者用于缩小整改轮审查范围，前者保留全程可追溯性。33. 托管入口按资料成熟度生成 `minimal`、`standard`、`full` 三级执行合同。已有 Superflow/
OpenSpec Prompt 使用权威任务清单；普通工程需求自动补齐实现和验证任务，涉及应用、API、
数据库、浏览器或容器运行环境时再补齐真实验收和清理任务；
简单需求也至少生成实现与受影响验证任务。最小机器计划不得伪装成业务澄清结论，任何
入口都禁止以空任务清单开始研发。34. 评审整改同时受硬上限和收敛门禁控制。只要旧阻断项持续关闭就允许继续；连续两次评审
转换没有关闭任何旧阻断项时提前进入 `repair_pending`，保留证据等待 Host 或用户调整，
不机械消耗完全部轮次。用户以审计原因提高执行或评审预算后，`repair_pending` 必须能
安全恢复；未产生可用额度时仍失败关闭。新增 finding 不得伪装成已收敛。35. 托管任务在首次执行前冻结每个仓库的稳定身份、worktree 和分支；恢复前必须重新校验，
切错分支、换成另一仓库或接入不同 worktree 时失败关闭。非 Git 工作区以 Runner 文件快照
作为变更事实，Executor 不得为 diff、预检或交付初始化 Git；执行中变为 Git 仓库同样失败关闭。任务目录同时保存相对定位符，
全局注册表只负责加速定位，不能成为唯一恢复事实源。36. `superflow doctor` 必须直接探测 Codex、Claude 可执行版本、Superflow MCP
配置及当前 Server 路径，并把无效配置转成带修复命令的诊断项；诊断不得因损坏的 Agent
配置文件直接崩溃，也不得依赖 Unix 专用的 `which` 才能判断 CLI 可用性。37. Agent CLI 启动在 Windows 上必须解析 PATH/PATHEXT 中的 `.exe/.cmd/.bat` shim，且不得
为兼容 shim 打开通用 shell。中断、超时、暂停或运行时升级必须终止任务对应的完整进程
树：Windows 使用 `taskkill /T /F`，Unix 使用独立进程组；禁止只杀父 PID 留下子进程。38. 托管层保持轻量，只拥有双 Agent 调度、冻结上下文、状态、等待、证据、评审循环和交付
门禁。业务 API、DB、并发、事务和测试方案属于 OpenSpec/SDD 的 `api.md`、`design.md`、
`tests.md` 与源码级技术详设；Executor Prompt 只继承，不重新设计。口头简单需求可以直接
托管，但若出现会改变实现方向的业务或架构决策，必须交回 Host 澄清。
完整 Superflow 任务必须是低自由度交付：`design.md` 和源码级技术详设明确模块复用、
修改点、调用链、数据读写、事务并发、异常处理和实现顺序；`tests.md` 明确环境、数据、
启动命令、操作步骤、自动化命令、响应/DB/日志断言及证据位置。Executor 只执行这些
冻结合同，不自行选择另一套编码或测试方案。39. Host 的持续目标机制可以包住一次 Superflow Task/Run：目标负责让主 Agent 持续监督直到
交付或真实阻塞，Superflow 负责 Executor、评审和证据状态机。目标系统不得复制 Task/Run
状态、启动嵌套 Supervisor CLI、绕过 Git/环境批准或取代事件账本；没有目标能力的 Host
仍可通过 MCP wait 正常完成同一流程。40. 后台 MCP/Runner 启动研发 Agent 时，必须补齐操作系统标准可执行目录，不能假定 GUI、
登录项或非交互进程继承交互终端 PATH。补齐只允许标准系统/包管理目录，不得注入用户主目录、
私人 shim 或个人绝对工具路径；找不到 CLI 必须在真正调用前给出可诊断的失败，而不是消耗
一次研发调用后才报 `command not found`。

## 角色与所有权

| 角色                | 必须负责                                                                        | 明确禁止                                                                       |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Host 主 Agent       | 冻结目标、监督进度、独立审查、一次性 finding、最终质量判断                      | 修改需求源码；替 Executor 管理应用、测试、数据库或进程；为格式问题要求重跑环境 |
| Executor 研发 Agent | 搜索复用、编码、测试、构建、启动、HTTP/浏览器 E2E、临时数据与进程清理、测试报告 | 修改 `.superflow` 状态；commit/push/部署；越权读取；把进程善后交给 Host        |
| Runner 脚本         | 合同、预算、状态、哈希、事件、证据合并、确定性门禁、等待与恢复                  | 判断代码是否正确、测试是否充分、疑似凭据是否真实、方案是否合理                 |
| 用户                | 授权外部模型读取范围、高风险环境操作、Git/发布与产品决策                        | 无需参与普通编码、测试、机械恢复和无风险状态推进                               |

任何功能都只能有一个 owner。Host 和 Executor 不能同时修改源码；Runner 和 Agent 不能同时
拥有同一状态字段的最终解释权。

## 脚本与 Agent 裁决矩阵

| 问题                                               | 裁决者            | 原因与衔接                                                                                              |
| -------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| JSON Schema、哈希、文件存在、预算、状态、调用计数  | Runner            | 可重复的确定事实，脚本直接继续或失败关闭                                                                |
| Git changedFiles、任务勾选、行宽、空白、明确退出码 | Runner            | Executor 返回前运行 preflight；Runner 在 `ready_for_review` 前复跑同一门禁，失败留在同一会话修复        |
| 显式 negative 断言的 exit 1/2                      | Runner            | 仅限检查型命令；构建/测试失败不得伪装为 negative                                                        |
| 历史命令去重、验证类别、证据跨轮合并               | Runner            | 自动处理，不消耗 Executor 或 Host 调用                                                                  |
| 仅缺验证类别但启动、真实调用和原始证据完整         | Runner + Host     | Runner 标记验证类别歧义并直接转 Host；Host 语义确认后审计式补全，不重启 Executor                        |
| 代码正确性、复用、事务、并发、安全与性能           | Host              | 需要理解源码和业务风险                                                                                  |
| 测试是否覆盖需求、历史证据是否仍适用于当前 diff    | Host              | 需要语义判断，脚本只能提供事实                                                                          |
| “疑似”凭据或可疑证据                               | Host              | 脚本报告位置后立即转 Host，不得反复让 Executor 改文案                                                   |
| 编码、启动、HTTP、浏览器、数据库和清理             | Executor          | 属于研发执行，Host 只读核验                                                                             |
| 可恢复的 JSON 转义、尾逗号或字段派生               | Runner            | 保留原始结果并确定性规范化；失败后转 Host，不启动研发轮次                                               |
| 整次调用没有任何可解析交付 JSON                    | Runner + Executor | 保留原始日志；仅一次短交付恢复会话读取 handoff/当前工作区，第二次失败转人工，禁止无限重试或重跑无关 E2E |
| 预期失败/失败注入产生的原始非零命令                | Runner + Host     | Runner 禁止其作为成功证据并直接转 Host；不得为改 JSON 重启 Executor                                     |

判断口诀：能回答“相同输入是否永远得到相同裁决”的交给脚本；包含“是否合理、是否足够、
是否仍适用、是否可疑”的交给 Agent。

## 双 Agent 通信协议

Agent 之间不直接依赖聊天历史，而通过 Runner 管理的稳定 JSON 消息通信。JSON 是机器事实源，
Markdown 只是人类可读投影。协议升级必须向后兼容或提供显式迁移。

### Executor Handoff

协议：`superflow.handoff.v2`。

必须包含：

- Task/Run/调用编号和语言；
- 冻结 Prompt 路径与 SHA-256；
- 当前 changedFiles、diff stat；
- local/external 任务进度；
- 本轮全部 finding，不能只传最后一条；
- 用户最新补充；
- 物理调用、有效调用、抵扣和 Token；
- 精确适用的规则文件；
- 确定性交付 preflight 命令。

新会话必须先读 handoff，再按路径读取源码。不得使用 `--last`、`--continue` 或模型记忆猜测。

### Executor Delivery

协议：`superflow.executor.v2`，消息类型：`executor_delivery`。

```json
{
  "protocolVersion": "superflow.executor.v2",
  "messageType": "executor_delivery",
  "status": "ready_for_review",
  "summary": "本轮实现与验证摘要",
  "commands": [
    {
      "command": "mvn test",
      "exitCode": 0,
      "result": "12/12 passed",
      "categories": ["test"],
      "assertion": "positive"
    },
    {
      "command": "lsof -iTCP:20062 -sTCP:LISTEN",
      "exitCode": 1,
      "result": "无监听，清理成立",
      "categories": ["runtime"],
      "assertion": "negative"
    }
  ],
  "evidence": ["openspec/changes/demo/test-report.md"],
  "releasePrerequisites": [],
  "blockers": []
}
```

规则：

- `commands` 只放成功门禁和明确的 negative 断言，不放被拒绝或失败尝试；原始失败留日志。
- `assertion: negative` 只允许 grep/rg/pgrep/ps/lsof/find 等检查型命令 exit 1/2。
- 预期失败和失败注入必须由父级验收命令断言子命令确实非零，父命令成功后以 exit 0
  进入 `commands`；原始非零子命令只留日志。Runner 若收到违规负向证据，应直接转 Host
  核对原始日志，禁止为删除或改写 JSON 启动完整 Executor。
- Runner 只能把 exit 1/2、受限检查命令（如 `ls ... | grep`）和明确“无匹配/无残留”结果
  归一为缺失证据；不得用正则判断业务正确性、输入是否真实到达，或资源删除是否安全。
  前两类属于文档合同与 Host 语义评审，后者由 owner 身份合同与 Host 审查共同保证。
- changedFiles、验证类别和基础 taskEvidence 由 Runner 派生，Executor 不为重复 JSON 开新轮次。
- Runner 自动继承历史有效命令；整改结果不复制、不重跑旧证据。

### Host Review

协议：`superflow.review.v2`，消息类型：`host_review`。

```json
{
  "protocolVersion": "superflow.review.v2",
  "messageType": "host_review",
  "result": "needs_fix",
  "summary": "一轮完整评审摘要",
  "findings": [
    {
      "id": "R1-001",
      "severity": "high",
      "blocking": true,
      "category": "correctness",
      "target": "具体文件或合同",
      "evidence": "可复核事实",
      "risk": "真实风险",
      "requiredFix": "明确整改要求",
      "acceptanceChecks": ["可执行验收命令"]
    }
  ],
  "verificationCommands": []
}
```

Host 每轮必须完成全量审查并一次性提交所有实质 finding。若只有 JSON 元数据或历史证据重复
问题，而原始证据足以证明交付，Host 直接 `pass`，Runner 审计式晋升；禁止调用 Executor
整理 JSON。

普通真实运行任务的首轮评审一次性核对任务自己的 owner 绑定、删除门禁、一个代表性
setup/断言失败清理和最终零残留。PID 复用、非 owner、伪造 state、全部信号升级等通用
灾难路径只在框架认证中检查。Runner 只提供可复核事实，不用正则宣称安全。

Runner 应向 Executor 提供可直接复用的 owner 确定事实模板，减少重复实现
PID/lstart/进程签名/监听端口、Docker task/nonce/name 与 runtime marker 校验。
涉及本地进程或 Docker 的验收入口通过可配置路径调用模板，禁止复制函数后另建
平行销毁入口；任务 wrapper 只绑定 nonce、签名、端口和资源名，不算自定义清理原语。
重新实现身份判断、kill/delete 或绕过模板才属于自定义清理原语，必须升级为框架认证。
容器匿名卷必须用 `rm -v` 并按实际 volume ID 复查。模板不裁决业务删除安全，Executor
仍须验证任务特定的删除条件，Host 仍做语义评审。

每次 Host Review 必须同时记录真实 `hostUsage`，或记录宿主无法提供用量的明确原因。`null` 表示未知，禁止在报告中按零消耗统计。

## 状态机与主动通知

- Runner 是唯一状态写入者，事件账本为追加式哈希链。
- Executor 完成后主动返回结构化结果；Runner 进入 `waiting_for_host_review` 唤醒 Host。
- Host 提交结果后 Runner 主动恢复 Executor 或进入交付门禁。
- 普通心跳不唤醒 Host；活动 MCP 请求通过标准 progress notification 展示阶段和健康监督点，
  但通知只在该请求存续期间有效，不是 Host 回合结束后的自主回调。
- 连续两个监督点没有阶段推进或权威命令完成时，Runner 写入 attention 事件并结束 wait，
  由 Host 做语义判断；单个健康或空闲监督点都不得消耗新的 Host 模型回合。
- 阶段必须由真实工具活动或交付证据推进；恢复整改时继承最近有效阶段，只回退到 finding
  实际影响的阶段。不得把所有新会话默认展示为 `source_discovery`。
- 最终门禁通过后只能生成一条有效 `run.delivery_ready`；重开交付必须有配对审计事件。
- `release_ready` 不等于授权 commit、push、部署或生产写入。

## 控制面原子性与注册表容错

- `superflow_managed_start` 必须先完成后台运行时握手，再持久化 Task/Run/registry；握手失败时三者均不得创建。
- CLI `pipeline --managed` 与 MCP 使用同一原子语义：先完成运行时握手；Task/Run/registry 任一步写入失败时回滚本次项目任务目录，不留下幽灵任务。
- 相同项目、冻结请求、Agent、profile、关联仓库和强制规则的非终态启动重试，必须返回已有 Task，不得产生第二份任务。进入交付终态后的同请求允许显式开启新任务。
- 对健康 `running` 任务执行普通 `pipeline --resume-task` 是只读安全接入：保持状态、活跃计时、
  Executor PID 和预算不变并继续阻塞等待。恢复时附带预算、会话或供应商改写参数必须拒绝；
  只有确定死亡的已记录 PID 才能进入陈旧进程恢复。
- MCP 元数据必须把托管启动声明为幂等操作，使 Host 可以在超时或响应丢失后安全重试。
- registry 条目是 locator，不是任务事实源。列表读取每个条目时必须隔离缺失、损坏或已删除的工作区；健康任务继续返回，陈旧条目留待独立审计或修复。
- Runner 不得让 Host 猜测“启动报错前任务到底有没有创建”。确定性生命周期错误必须保持调用结果与持久化状态一致。

标准研发阶段：

```text
source_discovery → implementation → unit_test → package
→ application_startup → http_e2e → cleanup → delivery_self_check
```

阶段事件只在变化时写入，避免每分钟心跳淹没有效进度。

## 证据模型

1. 所有可被 Host、MCP 或任务报告读取的持久化内容（原始日志、流式 progress、交付 JSON、
   事件账本、事实包和状态快照）必须在**首次写盘前**复用同一脱敏器；禁止以“仅展示时脱敏”
   代替落盘边界脱敏。
2. 发现历史账本含敏感值时，必须统一脱敏后重建哈希链，并留下不含敏感值的迁移审计；
   不得修改单条事件后保留失真的完整性哈希。
3. Runner 派生 changedFiles、验证类别、任务基础证据和有效调用。
4. 项目文件、仓库 `AGENTS.md`、冻结 Prompt 和 Host 会话提供的强制工程规则必须在调用前
   合并为任务策略。可机械检查的规则进入 preflight；仅能语义判断的规则明确留给 Host。
   preflight 不得对自己未加载的规则宣称已覆盖。
5. 每轮有效命令进入历史证据池；确定失败命令不得进入。
6. Host 判断历史证据对当前 diff 是否仍适用。
7. 只改注释、格式或局部逻辑时，只重跑受影响测试；启动/HTTP/数据库证据可继承。
8. 影响运行入口、配置、鉴权、SQL 或环境行为时，Host 必须要求对应真实链路重跑。
9. 测试报告必须与真实命令、退出码和测试数量一致，不得假绿。
10. 合同哈希的不可变字段投影必须只有一个事实源；跨运行时无法直接复用时，必须用包含
    全部可选字段的对等测试锁定。新增合同字段不得只修改 Runner 而遗漏脚本门禁。
11. 真实环境任务应在首轮 Prompt 冻结仓库内、单命令、可重复、失败安全、可移植的
    验收入口要求。setup、验证和 cleanup 不得依赖未记录的 Agent 手工步骤。
12. 强制规则不得只依赖 Prompt 上下文。新增或强化长期规则时，必须记录执行层级：
    可确定判断的事实下沉到 Hook、preflight 或最终门禁；需要语义判断的规则进入 Host
    checklist；同时需要事实与语义判断时两者组合。脚本门禁必须给出明确修复提示，并
    用正反测试证明不会被绕过；禁止用关键词正则冒充业务语义判断。
13. Hook 或最终门禁发现“证据表达违规但工作区可能已完成”时，应保留原始证据并交 Host
    语义裁决。确定性门禁负责阻止错误晋升，不得把修正 JSON、删除辅助失败记录等纯协议
    工作升级为完整研发调用。
14. 托管离线评价必须从落盘事件、用量、评审 finding、终态及 Runner 已确认的项目内验收报告派生
    “结论、为什么、下一步”，同时保留原始数值。项目报告仅可来自 `review-facts-*.json` 的
    权威 changedFiles，且必须是项目根目录内的 `*report.md`；不得扫描源码、越界读取或采信
    无效 Agent 交付元数据。评价器只能诊断调用碎片、首轮通过率、整改收敛、按状态区间归因的
    Host/连接/用户控制等待、未归类等待、人工介入、供应商抵扣和证据终态等流程事实；不得用关键词替代 Host 对代码、并发、事务和业务正确性的
    语义评审。评价规则必须可解释、可离线重放，并提供中英文输出。

## 三级验证模型

| 层级           | 适用场景                                                                       | 最小验证范围                                                                                               | 明确不做                                                            |
| -------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 受影响验证     | 所有整改轮；quick/monitor 的非运行时变更                                       | 将每个 finding 和当前 diff 映射到失效证据，只重跑受影响构建、测试或合同检查                                | 不因报告、证据格式或隔离测试变化重跑无关启动、HTTP、数据库          |
| 任务级真实验收 | engineering/SDD 默认；涉及应用、API、数据库、浏览器或跨仓合同                  | 业务成功链路、真实指定后端、任务 owner 绑定、主要资源创建后的代表性失败清理、各业务删除条件、最终零残留    | 不重复公共 helper 的非 owner、PID 复用、伪造 state 和全信号灾难套件 |
| 框架认证       | 冻结 Prompt 明确要求；修改 Superflow owner helper/托管编排；新增自定义清理原语 | 完整覆盖非 owner、PID 复用、伪造/残留 state、部分 setup、断言失败、SIGINT/SIGTERM、信号升级和 cleanup 假绿 | 不下放到每个普通业务任务重复执行                                    |

冻结 Prompt 可以提高验证等级，不能静默降低。任务级真实验收仍必须执行需求明确指定的
Spring Boot 启动、真实 HTTP、MySQL/Testcontainers、浏览器 E2E 或跨仓合同验证；分级优化
只删除重复的框架自证，不删除业务验收。

整改轮先建立“变更 → 失效证据”映射：生产运行逻辑、SQL、配置、鉴权、公开合同或验收
入口变化会使对应真实链路失效；只改文档、证据结构、日志格式或隔离测试，不自动使历史
有效证据失效。若 finding 的 `acceptanceChecks` 明确要求某条链路，则按冻结要求重跑。
多仓任务必须分别验证每个受影响仓库的构建/运行合同；需求跨服务时还必须执行跨仓真实
链路，不能用一个仓库的证据替代另一个。

公共 owner helper 的认证与其内容和已安装运行时指纹绑定。helper 或托管编排发生变化时，
必须在 Superflow 自身执行框架认证；安装内容变化后由 MCP 指纹门禁拒绝旧进程。普通业务
任务只核对实际调用的是当前 helper、任务参数正确、代表性失败安全以及零残留，不建立新的
证书状态机，也不把 helper 认证等同于业务表、Key 或容器可安全删除。

## 调用经济与等待原则

- 同时展示物理调用、基础设施抵扣、有效研发调用和 Host 轮次。
- 所有网络或模型连接失败共享同一个连续计数，最多连续三次物理尝试；429/529/overloaded
  以及连接被拒绝、重置、关闭、套接字断开等确认发生在 Agent 返回前的临时供应商传输失败
  均抵扣有效预算；业务、权限、Token Plan、quota、billing 等失败不抵扣，但同样在第三次后
  停止并通知用户。HTTP/供应商状态码必须按独立 token 边界匹配，禁止把 UUID、路径或普通
  文本中的 `503` 误判成网络故障。只有一次完整 Agent 返回才重置连续计数，进入等待或重新
  拉起会话不得重置。
- 切换供应商使用 `--provider-switched <reason>`，保留抵扣和审计，创建全新 Executor 会话。
- 不使用 `--max-turns` 或按美元估值截断普通研发；单次会话由无输出和硬时间上限保护。
- Token 熔断只累计 Executor 输出 Token；重复输入上下文和 cache read 不代表新增研发工作，
  不得因此阻止下一轮真实整改。物理调用数、硬上限和权限/供应商熔断继续承担止损。
- `maxExecutorTokenUnits` 的合同含义就是累计输出 Token；输出或供应商成本未报告时必须保持
  `null`/未知，不能按真实 0 展示、比较或证明“未超限”。成本熔断只可比较已知且可信的成本。
- 仅当正在 resume 的 Executor 原生会话被适配器确定分类为不存在、无效或恢复上下文超限时，
  Runner 才退役该 ID、保留原因/时间与 handoff/有效证据，并排队**一次** fresh session。
  第二次同类失败转 Host；普通整改仍是 fresh 短会话，max-turn 是唯一常规同会话续接路径。
- Claude Executor 默认把自动压缩有效窗口设为 200K、触发比例设为 70%，避免 1M 模型在
  数百个工具轮次中一直累积上下文。显式 `CLAUDE_CODE_AUTO_COMPACT_WINDOW` 和
  `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` 必须优先；压缩后重读冻结 Prompt 和 handoff。
- Runner 每 10–30 秒本地采样进程与状态，不调用模型，每 10 分钟生成紧凑监督点；
  活动 MCP wait 把健康监督点作为标准 progress notification 展示，不返回 Host；连续两个
  无有效里程碑的监督点才返回 attention。禁止每 30 秒模型轮询，也禁止监督点读取完整日志
  或重新概括全部 Prompt。
- MCP 默认等待 240 秒以兼容存在 300 秒工具调用上限的 Host。窗口超时是传输层续接，不是
  attention、任务超时或模型失败；Host 使用返回的 `latestSequence` 立即再次 wait，
  不调用 status、不读取完整事件。支持长调用的 Host 仍可显式请求最长 12 小时。
- 评审、供应商异常、权限阻断和硬截止立即唤醒 Host，不等待下一个监督周期。
- 一次调用应完成全部本地可执行工作；只有真实 finding、异常恢复或供应商故障才开启下一次。

## 安全、授权与环境边界

- 把本地私有源码交给外部研发模型前必须有任务级明确授权和作用域。
- 授权不跨任务自动继承；Git、部署、生产写入和高风险数据库操作始终单独授权。
- 凭据只允许运行时读取，不能进入源码、文档、结构化结果和日志摘要。
- Executor 只操作任务唯一命名的临时资源，并负责完整清理和不存在证据。
- Host 不读取未授权凭据、不替 Executor 执行环境写操作。
- 临时表、Token、应用和辅助进程的 owner 都是启动它们的 Executor。

## 不可接受的反模式

- 嵌套启动 Host Codex/Claude CLI 形成左右手博弈。
- Host 下场修改源码或替 Executor 收拾进程。
- Runner 用正则表达式判断业务方案、代码正确性或测试充分性。
- Executor 每做一小段就提前返回评审。
- 为 changedFiles、taskEvidence 或可由 Runner 修复的 JSON 格式单独消耗一次 Executor。
- 将 JSON 解析失败直接视为业务整改，或让 Executor 重复复制已有 commands/evidence；唯一例外是
  整次调用没有可解析交付 JSON 时的一次短交付恢复，且不得重复已有真实验收。
- 整改格式问题时重启应用、重写数据库或重复完整 E2E。
- 不得为每个业务任务重复公共 owner helper 的完整框架认证，或复制 helper 后重新研发清理框架。
- 把物理调用直接展示成有效研发调用。
- 用高频模型轮询代替本地事件等待。
- 每个健康监督点都结束 wait 并唤醒 Host 模型。
- 对仍在运行的健康任务执行 resume 时重置状态、预算或重复启动 Executor。
- 脚本、Skill、Hook、Prompt 对同一状态给出互相冲突的所有权规则。

## 修改托管功能的强制回归清单

每次改动必须回答并验证：

1. 这项裁决属于确定事实还是语义判断？owner 是否正确？
2. 是否让 Host 或 Executor 承担了对方的进程、源码或评审责任？
3. 是否改变三个 JSON 协议？旧结果能否恢复？中英文是否同步？
4. 是否保留历史有效证据，避免重复启动和重复 E2E？
5. 是否可能让失败构建伪装成 negative 断言？
6. 是否会增加无实质工作的 Agent 调用或主 Agent 轮询 Token？
7. 物理调用、抵扣、有效调用和 Host 轮次是否口径一致？
8. 429/529、长会话、重启、暂停和供应商切换能否原地恢复？
9. 最终事件、Git、部署和数据库权限是否仍然失败关闭？
10. 中英文 Skill、帮助、协议、README 和测试是否全部同步？
11. 无效 JSON 是否由 Runner 本地处理或一次转 Host？若整次调用无可解析交付，是否仅使用一次
    继承 handoff 的短交付恢复且不重跑无关验收？
12. 恢复轮阶段是否从 finding 影响点继续，且任务策略是否包含 Host 提供的强制工程规则？
13. 合同新增字段是否同步唯一哈希投影或跨运行时对等测试？
14. 真实环境验收入口能否从干净状态一条命令完成 setup、验证和失败清理？
15. 新增强制规则是否明确选择了 Hook/门禁、Host 语义评审或两者组合，而不是只写进
    Prompt？脚本判断是否有正反用例且没有越权裁决业务语义？
16. 启动失败、响应丢失和安全重试是否保持 Task/Run/registry 原子且不重复？
17. 单个陈旧 registry locator 是否会被隔离，而不会让全局 list/status 服务失效？
18. MCP 安装内容变化后，旧进程能否在任务持久化前失败关闭并给出重启指引？
19. 详细日志是否落盘且控制台输出有界，避免工具输出上限造成假中断和残留资源？
20. 每轮 Host usage 是否记录真实值或不可用原因，未知值是否避免按零统计？
21. 原始日志是否完整分片保存，阶段返工是否有明确事件且公共阶段保持单调？
22. 安装器是否避免无意义生成新 Skill backup，并保持中英文/跨平台行为一致？
23. 原始日志在运行目录 cleanup 后是否仍存在？升级进程信号前是否重新核验 PID、lstart、
    nonce、签名和实际监听端口？
24. 系统休眠是否从调用/无输出计时中排除？超时后的缓冲进度是否可能把
    `waiting_for_human` 倒写成 `running`？
25. macOS 空闲运行是否由 Runner 自动防休眠？主动合盖后是否从落盘状态诚实恢复？
26. Write/Edit 遥测缺失但冻结基线证明真实文件变化时，是否直接留下推导事件并转 Host，
    避免机械重启 Executor？Token 熔断是否排除了重复输入上下文？
27. Run 发现是否只认 `run-*` 与 `run-state.json`，错误证据目录是否会被隔离？历史 invalid
    结果中的违规命令是否会在进入下一轮前被过滤？
28. 本轮属于受影响验证、任务级真实验收还是框架认证？是否保留历史有效证据，并避免普通
    业务任务重复公共 helper 的灾难套件？修改 helper、托管编排或自定义清理原语时是否反向
    升级为框架认证？
29. 正在运行的任务只允许安全接入吗？活进程、未知 PID 和确定死亡 PID 是否分别走接入、
    失败关闭接入和陈旧恢复，且不会静默改写预算或会话？
30. 健康监督点是否只走 MCP progress notification，连续两个无有效里程碑才返回 Host，
    且 CLI 兜底没有引入高频模型轮询？
31. 验证类别歧义是否直接转 Host 语义判断，并在通过后留下审计晋升事件，而不启动完整
    Executor 整理元数据或重复真实环境？
32. 网络和供应商错误码是否按 token 边界精确匹配，确保 UUID、文件路径和普通文本里的
    数字不会错误消耗连接重试或 Executor 调用？
33. Unix/Windows 一键安装是否检测本机实际 Host、自动注册对应托管 MCP，并在重启前输出
    可核对状态，而不是留下“CLI 已安装但 Host 无法托管”的半完成状态？
34. MCP 注册的 Node 绝对路径是否在 Homebrew 环境使用稳定入口，避免 Node 升级清理 Cellar
    旧版本后所有 Host 同时无法启动托管服务？
35. `superflow update --with-package` 和 Hook `apply` 是否都由升级后的新 CLI 完成全量资产与
    MCP 刷新？部分失败是否删除节流戳、保留日志并允许下次会话重试？
36. Claude 长会话是否使用可覆盖的提前压缩阈值，并在压缩后保留冻结 Prompt/hash、剩余任务、
    运行资源和验证证据？最终 usage 是否来自权威 result 而非猜测？
37. MCP 默认等待是否低于已知 Host 工具上限，窗口超时是否只按 `latestSequence` 紧凑续接，
    不调用完整 status、不重启 Executor？

最低测试集合包括：协议 Schema、历史证据继承、negative 断言防绕过、Host 晋升、供应商
切换、有效调用展示、阶段事件、preflight 同会话修复、MCP wait/notify 和唯一交付事件。

## 实践基线

- R5：6 次 Claude、4 轮 Host，暴露历史证据丢失、negative 语义和机械 JSON 整改问题。
- R6：2 次有效 Claude、2 轮 Host，无机械整改；验证历史证据继承和 negative 断言。
- R8：电脑休眠导致连接中断后由用户终止，仅验证暂停落盘和调用抵扣。
- R9：业务交付通过，但 3 次 Claude 结果均为无效 JSON，产生 1 次机械 Executor 浪费；
  阶段漏报 startup/HTTP/cleanup，preflight 漏掉 Host 全局 Java 规则。编排成绩不合格。
- R17：业务交付通过，但 4 次 Claude、2 轮 Host；休眠、迟到回调、Write/Edit 遥测误判和
  重复输入 Token 熔断造成浪费。对应修复由 R18 验证。
- R18：业务交付通过，2 次 Claude、2 轮 Host；R17 修复有效，但重复两遍 E2E、跨轮
  invalid 命令污染和错误证据目录误计为 Run 仍造成额外人工裁决。对应修复由 R19 验证。
- R20：业务交付通过，5 次 Claude、4 轮 Host；事件等待与 invalid 负向证据转 Host 有效，
  但前两轮评审才发现正式 classpath 替身、全仓测试污染、cleanup 假绿、prod/Nacos 与
  Lettuce 生命周期问题，说明首轮 Prompt/preflight 仍需加强。断电恢复与安装降级在本轮修复。
- R25：业务交付通过，3 次 Claude、3 轮 Host，但每个业务任务重复完整 owner 灾难认证，
  使验收基础设施复杂度超过业务实现。由三级验证模型修复，后续同等任务重点统计完整验收
  运行次数、框架认证是否被正确跳过、调用轮次、有效耗时和 Token。
- R29：业务交付质量通过，真实 MySQL 8、Spring Boot、HTTP 200/400/404/409、并发、事务、
  失败注入和零残留均有证据；但用了 6 次 Claude、4 轮 Host，有效运行约 2 小时 59 分，墙钟
  约 3 小时 50 分，成本约 44.72 美元。主要浪费来自运行中 resume 重置状态、健康监督点通信
  不明确，以及只缺 `invocation` 验证类别时又拉起完整 Executor。上述三项必须由本轮修复防回归。
- R30：1 次 Claude、1 轮 Host，约 35 分 44 秒有效执行、37 分 44 秒墙钟，真实运行质量通过。
  但 Claude CLI 权威结果显示 180 turns、输入 16,033,460 Token；根因是 1M 窗口下长会话
  上下文持续增长，不是 Runner 重复求和。Codex Host 另有约 300 秒 MCP 工具调用上限，因此
  后续使用提前自动压缩和 240 秒紧凑等待窗口验证成本下降。
- 后续目标：修复 JSON 本地容错、阶段继承和规则注入后，同等 CRUD 稳定达到
  1 次有效 Claude + 1 轮 Host。
