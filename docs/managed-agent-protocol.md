# Superflow 托管 Agent 通信协议

## 目标

托管双方只交换稳定的机器消息，不通过自然语言猜测状态。协议遵循一个所有权原则：

- Executor 负责报告做了什么、执行了什么命令、原始结果和真实阻塞；
- Runner 负责 changedFiles、任务基础证据、验证类别、调用计数、Token、成本和状态迁移；
- Host 负责独立评审事实、finding、修复要求和验收条件。

Runner 生成的数据优先于 Agent 自报。源码不复制进协议，只传冻结路径、SHA-256 和证据路径。

控制面同样遵循确定性协议：`superflow_managed_start` 在持久化前完成运行时握手，并对相同非终态请求提供幂等重试；registry 只是 locator，单个陈旧条目不得让全局任务列表失败。

MCP 另提供启动版本、时间和运行时指纹。若本地安装在 MCP 启动后变化，`start` 必须在任何
Task/Run/registry 写入前失败并要求重启 Host。
CLI `pipeline --managed` 同样先握手再持久化；registry 写入失败必须回滚本次 Task/Run 文件。
对健康 `running` 任务执行普通 `pipeline --resume-task` 时，协议语义是安全接入并继续等待：
不得改变状态、活跃计时、Executor PID、预算或会话。仅已记录 PID 被确认死亡时进入陈旧恢复；
PID 未记录时失败关闭为接入等待，带预算、供应商或会话改写参数的接入请求必须拒绝。

## 衔接裁决边界

| 事实类型                                               | 裁决者         | 下一步                                                   |
| ------------------------------------------------------ | -------------- | -------------------------------------------------------- |
| Schema、哈希、预算、状态、明确退出码、文件和端口存在性 | Runner 脚本    | 确定成功则继续；确定失败则按规则修复或停止               |
| 历史命令去重、验证类别合并、显式负向断言               | Runner 脚本    | 自动合并，不消耗 Agent 调用                              |
| 启动、真实调用和证据完整但只缺验证类别                 | Runner + Host  | 标记验证类别歧义，直接转 Host 语义判断；通过后审计式补全 |
| 代码正确性、测试是否覆盖需求、历史证据是否仍适用       | Host Agent     | `pass`、`needs_fix` 或 `blocked`                         |
| 疑似凭据、语义可疑但无法确定的证据                     | Host Agent     | 脚本只报告命中，不自动要求 Executor 改文案               |
| 源码整改、运行应用、真实调用和环境清理                 | Executor Agent | 完成一批工作后提交一次结构化交付                         |

脚本只能裁决可重复、无主观解释的事实。任何包含“疑似”“是否足够”“是否仍适用”的问题
必须交给 Host；Host 不负责替 Executor 操作应用、数据库和进程。

强制规则不能只存在于 Prompt。协议新增规则时必须声明 `hook/preflight/final gate`、
`Host semantic review` 或两者组合；前者必须有正反测试和可执行修复提示，后者不得被
Runner 用关键词匹配替代。

预期失败或失败注入由父级验收命令捕获并断言子命令非零，父命令成功后以 exit 0
进入交付证据。原始非零只留日志，不得伪装成 `assertion: negative`。Runner 的最终门禁
若发现此类协议违规，保留原始结果并直接转 Host 语义核验，不启动 Executor 改写 JSON。
Runner 在入库前确定性清洗空白字符串元数据。只读资源检查 exit 1/2 且结果明确报告无进程、
监听、容器或残留时，属于成功的空结果；这两类情况都不得启动 Executor 修复。

若整次 Executor 调用没有任何可解析的 `executor_delivery` JSON，Runner 先保存脱敏原始日志。
在 Host 无法从既有结果安全形成评审时，可仅一次创建新的压缩交付恢复会话：它必须读取当前
工作区与 handoff，继承有效证据，只完成剩余受影响工作并返回 Schema 合法交付；不能为复制
JSON 或重跑无关环境链路而启动。第二次同类失败进入 `waiting_for_human` 并保留审计证据。

## Executor Handoff

### 文档合同与托管 Prompt 边界

- 纯文档入口只运行 Superflow/OpenSpec 文档与 Coding Ready 评审，不创建托管 Task/Run。
- 用户评审通过后，change/Prompt 入口冻结原始路径、引用文档和哈希，再进入同一托管状态机。
- 口头入口先由 Host 做语义分流：边界清晰的小需求进入 minimal/standard；存在方向性
  API、数据、并发、跨仓或 owner 决策时回到澄清/文档，Runner 不用正则代替该判断。
- 有 Superflow/OpenSpec 文档时，Executor 读取冻结 implementation prompt，并由其引用
  `api.md`、`design.md`、`tests.md` 和技术详设；托管协议不复制或重写业务设计。
- 只有口头简单需求时，Runner 生成最小执行合同；若 API、DB、并发、事务或测试方案存在
  会改变实现方向的选择，必须转 Host 澄清，不能由通用 Executor Prompt 决定。
- 直述 `engineering/sdd` 需求即使没有用户 Prompt，也生成并冻结标准执行合同及其 SHA-256，
  作为 Executor 首轮入口；合同只规定源码核实、复用、资源 owner、真实验收、清理与证据边界。
  运行环境任务还要约束可移植验收入口、代表性失败清理和禁止用宽泛替身伪造启动；直述并发
  需求只可要求确定性非 5xx 业务冲突和一次持久化状态转换，不编造业务 API/DB/事务/测试方案。
  交接包必须显示该冻结合同，禁止显示“无 Prompt”。
- 托管 Prompt 只保存角色、安全、完成度、真实验证、证据、清理和结构化交付规则。
- Host 原生持续目标可以维持监督，但不属于本协议状态机，也不复制 Task/Run 状态。

每轮同时生成：

- `executor-handoff-N.json`：机器事实源，协议 `superflow.handoff.v2`；
- `executor-handoff-N.md`：同一事实的人类可读视图。

JSON 包含冻结 Prompt、工作区 changedFiles、任务进度、全部 finding、用户补充和剩余预算。
同时包含精确适用规则文件和确定性交付 preflight 命令，避免新会话重复搜索规则。
新旧会话都必须先读 JSON，再按路径读取必要文档和源码。

Handoff 必须携带 `contextManifest.path` 和 `contextManifest.sha256`。清单按作用列出需求、
设计、任务、测试和规则的权威路径及内容哈希，不复制正文。Runner 在调用前校验清单；任一
必读文档漂移时失败关闭，要求重新冻结任务，而不是让 Executor 猜测新旧版本。

清单同时声明保护模式：需求、设计、Prompt、handoff、规则和任务事实为 `immutable`；
tasks/test-report 等执行进度证据为 `retain`。前者只读，后者可回填但不可删除。Executor 的
runtime/workspace-temporary 资源必须清理，源码、SQL、测试和报告作为 delivery-artifacts
保留到 Host 评审；终态后若需零残留，使用独立审计式 cleanup。

任务目录同时包含 `execution-contract.json/md`。有权威 tasks.md 时直接引用；没有时按任务
档位生成非空的最小或标准机器任务，不凭空扩展业务语义。Runner 根据真实 changedFiles 和
成功命令推导这些机器任务的完成度，Executor 不编辑 `.superflow` 文件。
只有涉及应用、API、数据库、浏览器或容器运行环境时，标准合同才增加真实启动、调用和
清理任务；纯函数库等任务不虚构运行时验收。

Runner 会比较连续 Host 评审中的阻断 finding。既有阻断项持续关闭时允许继续整改，但
连续两次评审转换没有关闭任何旧阻断项时提前进入 `repair_pending`；`maxReviewRounds` 仍是
不可突破的硬上限。用户以审计原因提高预算后，Runner 只有确认执行或评审额度确实可用时
才可从 `repair_pending` 恢复，禁止把单纯的用户消息当作恢复授权。Host 应为未解决问题复用
finding ID，Runner 同时按类别和目标范围识别仅改编号的同一问题。

`workspace-binding.json/md` 冻结主仓与关联仓库的仓库身份、worktree、分支和初始 HEAD。
Runner 每次恢复先校验绑定，再校验执行上下文；分支或 worktree 漂移时不启动 Executor。非 Git
工作区由 Runner 文件快照提供变更清单，Executor 禁止因 diff、预检或交付初始化 Git；任务中
出现 `.git` 会被视为仓库身份漂移并失败关闭。
其中 `taskLocator` 使用相对路径，允许从项目内任务目录恢复注册表定位，注册表本身不是权威
任务状态。

Runner 在 Windows 通过 PATH/PATHEXT 解析 Codex、Claude 的可执行 shim，不使用
通用 shell 拼接命令。暂停、超时和运行时更换调用统一进程树停止原语，Windows 终止整个
`taskkill /T /F` 树，Unix 终止独立进程组；停止动作仍只针对 Runner 记录的 Agent owner PID。

Host 调用 `superflow_managed_start` 时，必须把会话中存在但项目文件未落盘的强制工程规则
写入 `mandatoryEngineeringRules`。Runner 将其冻结进任务合同、Executor Prompt 和
deterministic preflight；不得假定 Executor 能看见 Host 的系统提示或会话规则。

真实运行环境任务的首轮 Handoff 和 Prompt 必须要求仓库内单命令验收入口。该入口从干净
状态负责 preflight、setup、构建、启动、真实调用、断言和 cleanup；不得依赖命令外手工
步骤或个人绝对路径，并须覆盖成功链路、一个代表性 setup/验证失败清理和最终零残留。
Host 在首轮一次性审查其可重复性、可移植性和失败安全，避免按轮次逐个发现脚本缺陷。
详细构建和运行日志必须写入任务 owner 的证据文件；控制台只输出有界阶段摘要和失败尾部。
交付引用的日志在正常 cleanup 删除 nonce/运行目录后仍必须存在。进程等待退出后如需升级
信号，必须重新校验 PID、lstart、nonce、签名和实际监听端口，不能复用旧裸 PID。
单次调用硬上限与无输出上限只累计机器实际运行时间，休眠不计入。调用失败、超时或进入
人工处理后，Runner 忽略该调用迟到的 progress、telemetry、session 和 PID 回调。
macOS 本地调用由 Runner 使用 `caffeinate -im` 防止空闲休眠；它不承诺绕过用户主动睡眠
或合盖休眠，唤醒后仍以持久化合同和状态恢复。
Host 重启后若落盘状态仍为 `running`，Runner 必须先检查记录的 Executor PID：PID 已死亡
才允许转为 `waiting_for_human` 并恢复；PID 存活时禁止拉起第二个 Executor。断电到恢复之间
的离线时长不累计为活跃调用时间，并写入 `executor.stale_process_recovered` 审计事件。
原始 Agent 日志按固定大小分片完整保存。后期阶段返回实现/测试时写入
`executor.stage_rework`。`executorStage` 作为已达里程碑保持单调，避免用户误解为任务重启；`executorActiveStage` 同时公开当前实际返工阶段，避免旧里程碑误导进度判断。
Claude Executor 默认通过 `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000` 和
`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` 提前压缩长会话，用户显式环境值优先。持久系统
策略包含 Compact Instructions，要求压缩后保留并重读冻结 Prompt/hash、handoff、未完成任务、
当前资源 owner 和有效验证证据。Claude 最终 `result.usage` 是该物理调用的权威用量。
Runner 在 Handoff 中提供 owner 校验模板路径；Executor 通过可配置路径直接调用，不复制
模板函数。只绑定任务 nonce、签名、端口和资源名的 wrapper 不算自定义清理原语；重新实现
身份判断、kill/delete 或绕过模板时，必须升级为框架认证。

## 验证范围协议

验证固定分三级，但不新增 JSON 字段或状态迁移：

- `受影响验证`：每个整改轮先把 finding/当前 diff 映射到失效的历史有效证据，只重跑受影响
  检查。报告、证据格式、日志格式和隔离测试变化不会自动失效无关运行证据。
- `任务级真实验收`：engineering/SDD 默认执行业务成功链路、冻结合同指定的真实后端、任务
  owner 绑定、主要资源创建后的代表性失败清理、各业务删除条件和最终零残留；多仓任务分别
  验证每个受影响仓库，跨服务需求还要执行跨仓真实链路。
- `框架认证`：仅在冻结 Prompt 明确要求、修改 Superflow owner helper/托管编排或新增自定义
  清理原语时，覆盖非 owner、PID 复用、伪造/残留 state、全部中断与信号升级等灾难路径。

Runner 继续负责合并历史命令，Host 继续语义判断历史证据是否适用于当前 diff。冻结 Prompt
可以提高验证等级，不能静默降低；生产运行逻辑、SQL、配置、鉴权、公开合同、验收入口或
finding 明确要求会使对应链路失效。不得为每个业务任务重复公共 helper 的完整框架认证。

## Executor Delivery

协议：`superflow.executor.v2`，消息类型：`executor_delivery`。

```json
{
  "protocolVersion": "superflow.executor.v2",
  "messageType": "executor_delivery",
  "status": "ready_for_review",
  "summary": "实现和验证摘要",
  "commands": [
    {
      "command": "npm test",
      "exitCode": 0,
      "result": "16/16 passed",
      "categories": ["test", "startup", "invocation"],
      "assertion": "positive"
    }
  ],
  "evidence": ["openspec/changes/demo/test-report.md"],
  "releasePrerequisites": [],
  "blockers": []
}
```

`changedFiles` 和 `taskEvidence` 为兼容字段，不是 Executor 必填项。Runner 根据冻结基线、
Git 工作区、tasks.md、test-report 和成功命令生成权威值。只有某个任务需要不同证据时，
Executor 才提供 taskEvidence 覆盖。

`assertion` 可取 `positive` 或 `negative`。检查“无敏感信息、无残留进程、无端口监听”时，
命令的预期结果本来就是 exit 1/2，应明确写 `negative`，Runner 不再通过命令名称和自然
语言猜测成功语义。Runner 会把历次结果中通过验证的命令自动合并到当前交付，后续整改
不得重跑或手工复制已经成立的启动、HTTP、测试和构建证据。
历史 `-invalid` 结果只可提取通过当前协议校验的命令；违规 negative 和普通失败命令必须
在合并到后续调用结果前过滤。

Executor 在 StructuredOutput 前必须运行 handoff 指定的 deterministic preflight，并在同一
会话修正 changedFiles 行宽、空白、任务勾选、报告缺失和疑似凭据等确定性问题。Runner 在
接收 `ready_for_review` 前必须复跑同一门禁，不能把 Executor 的文字声明当作通过事实。
`evidence` 应填写 canonical 文件或目录路径；兼容历史输出时允许在路径后以空格加
`(说明)` 附注，Runner 只取前面的路径做存在性、哈希和目录判断，原始字符串仍保存在交付 JSON。
Write/Edit 流式遥测只是观测证据，不是源码变更的唯一事实源。若遥测缺失但冻结工作区基线
已证明交付声明中至少一个文件真实变化，Runner 记录 `executor.write_telemetry_inferred`
并直接转 Host 语义评审；只有基线无法证明任何对应变化时才拒绝结果。

流式遥测与交付 JSON 同属不可信 Agent 输入：命令、结果、摘要、账本事件、事实包和 MCP
状态在首次持久化前必须调用同一脱敏器，尤其要覆盖 `NAME_PASSWORD=value`、token、Header、
URL 凭据和命令行密码。不得因为结构化交付已经脱敏，就让 progress callback 原样进入
`executor-progress-*.jsonl` 或 `progress.jsonl`。历史泄露使用安全迁移重建整个哈希链并审计，
不保留可由 MCP 回读的旧值。

## Host Review

协议：`superflow.review.v2`，消息类型：`host_review`。

```json
{
  "protocolVersion": "superflow.review.v2",
  "messageType": "host_review",
  "result": "needs_fix",
  "summary": "评审摘要",
  "findings": [
    {
      "id": "R1-001",
      "severity": "high",
      "blocking": true,
      "category": "correctness",
      "target": "src/server.js",
      "evidence": "事实证据",
      "risk": "实际风险",
      "requiredFix": "明确修复要求",
      "acceptanceChecks": ["可执行验收命令"]
    }
  ],
  "verificationCommands": []
}
```

Host 一轮必须汇总全部实质 finding。格式、changedFiles 或可推导证据问题不得伪装成业务
代码 finding；Runner 自动整改达到熔断条件后，Host 直接判断当前产物。
Host 首先读取 Runner 生成的 `review-facts-N.json`，复用其中的路径、哈希、退出码、任务计数
和验证类别；随后仍须独立读取真实 diff 与必要原始证据。事实包没有代码正确性或测试充分性
结论，Host 不得把它当作语义评审结果。
整改轮先读取 `workspace.roundChangedFiles` 缩小本轮审查，再按风险回读累计 `changedFiles` 和
原始证据；没有增量不等于可以跳过未关闭 finding。
若历史原始证据已经足以证明交付，仅当前 JSON 元数据或证据重复方式不合规，Host 应返回
`pass`，由 Runner 过滤无效命令、合并历史证据并留下晋升事件，禁止再调用 Executor 整理
JSON 或重跑环境。
当 Spring Boot 成功命令已经同时证明 startup、真实 HTTP/runtime 和证据路径，唯一缺失项是
`invocation` 验证类别时，Runner 必须记录 `executor.verification_metadata_escalated_to_host`
并直接进入 Host Review。Host 确认证据适用后，Runner 补全类别并记录
`executor.verification_metadata_host_promoted`；不得为验证类别歧义启动完整 Executor。

普通真实运行任务首轮评审必须一次性覆盖任务 owner PID/启动指纹强绑定、删除门禁、一个
代表性 setup/断言失败清理和最终零残留。PID 复用、非 owner、伪造 state 和全部信号路径
只在框架认证场景检查。提交评审时必须携带 `hostUsage`，或由 MCP 记录明确的
`hostUsageUnavailableReason`；未知用量不得解释为零。

CLI 方式提交评审时，评审 JSON 必须位于所有目标项目目录之外（建议系统临时目录），避免
它被 Git/changedFiles 当成需求产物。评审结果、Task、Run 和全局 registry 使用失败回滚；
任一步持久化失败都不得留下“局部已接收”的状态。

## 止损语义

- 同类机械 rejection 只允许一次自动整改；累计最多两次自动整改；
- 单轮权限拒绝达到 3 次，禁止自动启动下一轮；
- 默认累计 200 万 Executor 输出 Token 后停止下一次调用；重复输入上下文和 cache read
  不计入该熔断。`maxExecutorTokenUnits` 即输出 Token 上限；output/cost 未报告保持
  `null`/未知，不能当作 0 或未超限证明。成本熔断仅在供应商提供已知、可信成本时使用；
- 正在 resume 的 Executor 会话若被确定分类为不存在、无效或恢复上下文超限，Runner 记录
  退役 ID、原因和时间，保留 handoff/有效证据，并仅排队一次不带旧 ID 的 fresh session。
  第二次同类失败写入熔断事件并转 Host；普通整改仍创建 fresh 短会话，退役 ID 永不再 resume；
- 网络错误、连接关闭、超时和供应商拥塞共享同一个连续失败计数，最多物理尝试 3 次；
  429/529/overloaded 以及连接被拒绝、重置、关闭、套接字断开等确认发生在 Agent 返回前的
  临时供应商传输失败均抵扣有效研发预算；业务失败、权限失败、Token Plan、quota 或 billing
  不抵扣；
  状态码必须按独立 token 边界匹配，UUID、路径或普通文本中的数字不得触发网络重试；
  只有完整 Agent 返回才清零，等待或切换会话不得绕过三次熔断；
- 任何终态都不自动授权 Git、部署或数据库写入。

供应商切换后使用 `--provider-switched <reason>` 原地恢复：保留物理调用和抵扣审计，清零
连续供应商失败并创建新 Executor 会话。状态展示必须同时给出物理调用、抵扣和有效研发调用。

Runner 只在研发阶段变化时写入 `executor.stage_changed`：source_discovery、implementation、
unit_test、package、application_startup、http_e2e、cleanup、delivery_self_check。普通心跳
不单独唤醒 Host。Runner 每 10 分钟追加监督点，只汇总阶段变化、首次权威命令完成、真实
diff 变化和重复失败。活动 `superflow_managed_wait` 使用标准 MCP progress notification
传递阶段和健康监督点；该通知只属于当前请求，接收端可以忽略，不能被误解为 Host 回合结束
后的自主回调。单个健康或空闲监督点不结束 wait；连续两个监督点没有有效里程碑时写入
`executor.supervision_attention_required` 并返回 Host。CLI 使用相同账本阻塞等待，不进行
高频模型轮询。MCP 默认用 240 秒兼容传输窗口，显式参数仍可提高到 12 小时；窗口超时只返回
紧凑快照，Host 立即用其中的 `latestSequence` 再次 wait，不调用完整 status，也不改变
Task/Run 或 Executor。当前不依赖实验性 MCP Tasks；Superflow Task/Run 仍是可恢复事实源。

旧消息缺少协议字段时，Runner 在读取边界补全版本后按 v2 规范化，保留向后兼容，不要求
Executor 再开一轮修复格式。
