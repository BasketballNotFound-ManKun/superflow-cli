# 托管任务执行规则

## 设计宪章门禁

修改 Superflow 托管编排自身时，开始前必须完整读取仓库中的
`docs/managed-work-design-principles.md` 和 `docs/managed-agent-protocol.md`。实现完成后，
必须逐项核对宪章的强制回归清单，并在评审结果中说明是否存在原则变更。

确定事实由 Runner/脚本检查；正确性、合理性、风险和证据充分性由 Agent 判断。脚本不得
通过正则代替语义评审，Agent 也不得接管哈希、Schema、计数或状态迁移等确定性裁决。新增
长期规则时，必须先同步更新中英文宪章、协议和测试。

托管层只负责双 Agent 调度、冻结上下文、状态、等待、证据和评审循环。API、DB、并发、
事务及测试方案属于 `api.md`、`design.md`、`tests.md` 和技术详设；Executor Prompt 只继承，
不得重新设计。修改托管 Prompt 前必须用这一边界逐条审计。

## 入口

托管任务属于 `superflow-pipeline` 内建能力。用户只需说“用 Superflow 托管完成”并给出
implementation prompt、change 目录或简单任务，不需要知道内部 Skill 名和 CLI 参数。
简单任务生成最小合同；SDD 任务冻结 Superflow 已生成的 implementation prompt，不以
`tasks.md` 代替执行 Prompt。

Host 启动前必须按资料成熟度分流：只写文档时停在 Coding Ready，不创建托管任务；用户
评审通过的 change/Prompt 直接冻结；口头小需求进入 minimal/standard。若口头需求存在会
改变实现方向的 API、数据、并发、跨仓或 owner 决策，先返回澄清/文档流程，不让 Runner
正则或 Executor 临场设计替代 Host 判断。

已安装 MCP 时，当前主 Agent 必须优先通过 `superflow_managed_*` 工具提交、等待、补充要求
和提交评审。MCP 是主 Agent 与本地状态机的通道，不是第三个模型；托管只有当前 Host
直接评审这一种模式，避免嵌套 Supervisor CLI 重复消耗上下文、Token 和评审时间。

## 角色

- 当前主 Agent：提交任务、查看结果、向用户汇总并申请 Git 批准。
- 当前 Host Agent：直接只读检查，生成结构化问题和整改要求，不启动嵌套 CLI。
- 执行 Agent：首次调用在一个不限制工具轮数的 CLI 会话中持续工作，完成后主动返回；仅在
  评审整改或异常恢复时创建后续会话。它是唯一写入者，负责实现、验证和进程善后。
- 后台服务：状态、预算、队列、短会话交接和证据的唯一写入者。

## MCP 优先，CLI 兜底

MCP 不可用时，不要由聊天中的 Agent 手工启动另一 CLI。调用：

```bash
superflow pipeline "<implementation-prompt|change-dir|task>" --managed --project "<root>" \
  --supervisor current --executor peer --language <zh|en>
```

`current/peer` 自动识别 Host 与对端；无法识别时必须显式传入 `codex/claude`，不能猜测。
旧合同未保存监督方式或曾使用旧式后台监督时，恢复阶段统一迁移为当前 Host 直接评审；
任何入口都不得启动后台 Supervisor CLI。

用户主动询问状态时可查看一次：

```bash
superflow status <root>
```

正常托管只保留当前 `pipeline`/`resume` 命令的一次阻塞等待，由 CLI 在本地读取状态文件。
不得用主 Agent 的模型回合每隔固定时间重复执行 `status`。

MCP 模式默认使用
`superflow_managed_wait(taskId, afterSequence, timeoutSeconds=240)` 适配常见 Host 的
300 秒工具调用上限；支持更长调用的 Host 可显式提高到 43200 秒。活动请求通过标准 MCP
progress notification 展示阶段和健康监督点，不唤醒 Host 模型。单个健康或空闲监督点不
结束 wait，连续两个无有效里程碑才返回 attention。普通窗口超时只用紧凑快照中的
`latestSequence` 立即续接 wait，不调用 status、不重启 Executor；只有需要处理状态时才调用
`superflow_managed_status` 读取完整证据。

执行者返回后，任务进入 `external_supervisor_review_required`。当前 Agent 读取
`host-review-N.md`，把评审 JSON 写入运行目录外的临时文件，并执行：

```bash
superflow pipeline --resume-task <task-id> --submit-host-review <review.json>
```

## 硬门槛

- 5/7/12 调用上限由状态机先占用后调用，Prompt 无权上调；默认再以累计 200 万 Token
  单位熔断。不同供应商的美元计价不可比，默认不设美元成本熔断，也不向 Claude 传
  `--max-budget-usd`。
- 语言写入冻结合同；执行 Prompt、账本、报告、通知、错误和恢复轮次始终使用同一语言。
- 每次启动和恢复都重新校验冻结合同哈希、不可覆盖权限及 5/7/12 硬上限；磁盘文件被
  改写时按失败关闭，不能继续调用 Agent。
- 非 Git 工作区由 Runner 文件快照提供变更清单；Executor 不得为 diff、预检或交付执行
  `git init`，不得创建或替换 `.git`。任务中仓库身份变化仍失败关闭。
- 上下文清单把冻结需求、设计、Prompt、handoff、规则和任务事实标为 `immutable`，把
  tasks/test-report 进度证据标为 `retain`。前者只读，后者可更新但不可删除；原生 Hook
  写入前阻断，所有 Host 仍由 preflight/最终门禁复核。
- 清理分为 runtime、workspace-temporary、delivery-artifacts、protected-contracts；Executor
  只清理前两类，源码/SQL/测试/报告和冻结合同保留给 Host 评审。禁止 pkill、killall、裸
  kill、按端口/名称清理和未经 owner helper 校验的 rm -rf。
- change 目录必须通过 `.sdd/state.yaml` 的 `implementation_prompt` 定位执行入口；
  `tasks.md` 仅作清单。Prompt 原文复制为托管快照并冻结 SHA-256，执行和评审使用同一份。
- 第一轮自动把冻结 Prompt 作为研发任务入口，不依赖主 Agent 临时重写任务描述。
- 真实运行环境任务的首轮 Prompt 必须要求仓库内、单命令、可重复、失败安全且可移植的
  验收入口；该入口覆盖 preflight、setup、构建、启动、真实调用、断言和 cleanup，并在
  成功和一个代表性 setup/验证失败时清理资源并证明零残留。Host 首轮一次性审查这些属性。
- start 前调用 MCP runtime 握手；安装内容变化后旧 MCP 必须在任务落盘前失败关闭并要求
  重启 Host。详细构建/框架日志落盘，控制台只输出有界摘要和失败尾部。
- 验证固定分三级：整改轮做受影响验证；engineering/SDD 默认做任务级真实验收；只有冻结
  Prompt 明确要求、修改 owner helper/托管编排或新增自定义清理原语时做框架认证。冻结合同
  可提高等级但不得静默降低，历史有效证据只在当前 diff/finding 真正失效时重跑。
- 普通真实运行任务首轮 Host 评审核对任务 owner PID/启动指纹强绑定、删除门禁、一个代表性
  setup/真实断言失败和最终零残留；多个业务删除路径仍分别验证，多仓任务仍逐仓和跨服务
  验证。不得为每个业务任务重复公共 helper 的 PID 复用、非 owner、
  伪造 state 和全信号灾难套件；通过可配置路径直接复用 helper，禁止复制后另建清理框架。
  每轮记录 Host usage 或不可用原因。
- Claude Executor 不传 `--max-turns` 或 `--max-budget-usd`，不得以固定工具步数或不准确的
  美元估值切断正常研发。默认连续 60 分钟完全无输出或单次执行达到 2 小时才终止；连续
  供应商错误、Token/调用预算、安全边界或用户暂停仍会终止进程。
- Claude Executor 默认用官方 `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000` 和
  `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` 提前压缩长会话，显式用户环境值优先。压缩后
  必须重读冻结 Prompt 和 handoff；最终 `result.usage` 是该调用的权威用量。
- 网络、连接关闭、超时和供应商拥塞共享连续失败计数，第三次失败后必须熔断并等待用户；
  只有完整 Agent 返回才清零。429/529/overloaded 以及确认发生在 Agent 返回前的连接被拒绝、
  重置、关闭和套接字断开等临时传输失败可抵扣业务预算；权限、Token Plan、quota、billing
  等失败不抵扣，但均不得绕过三次熔断。
- 首次调用使用一个连续 session；评审整改或异常恢复创建新 session，旧 ID 进入审计历史。
  禁止使用 `--last` 或 `--continue` 猜测。后续调用生成 `executor-handoff-N.md`，压缩传递
  Prompt 哈希、任务完成度、本地剩余、外部前置、全部 finding、diff stat 与最近报告。
  新会话先读交接包，再以当前工作区核实，不能只靠聊天历史。
- 首次执行策略写入 preflight 可安全发现的 Java、Maven、Node 和 npm 可执行路径，研发
  Agent 应直接使用，不得重复花费大量工具调用寻找基础工具链。
- Handoff 同时写入精确适用规则文件和确定性交付 preflight 命令；Executor 返回前必须运行，
  行宽、空白、任务勾选、报告缺失等问题在同一会话修正。
- `.superflow/tasks/<task-id>/runs/<run-id>/progress.jsonl` 是追加式事实账本。
- 执行角色禁止修改托管目录、Git 提交/推送、发布、生产写入、跳过沙箱。
- 监督角色禁止修改目标文件。
- 非法 JSON、缺 session ID、工作区在检查期间变化都不能判通过；无匹配、无残留和无监听
  检查使用 `assertion: negative` 明确表达预期 exit 1/2，不再靠命令名称或文案猜测。
- 预期失败和失败注入必须由父级命令断言子命令非零且自身 exit 0；原始非零只留日志。
  Runner 收到违规负向证据时直接转 Host 核验，不得启动完整 Executor 整理 JSON。
- 工程和 SDD 任务至少提供构建、测试、启动/真实调用中的两类成功命令证据；只编译或
  只跑单元测试不能进入正式检查。
- 最终通过前运行 `superflow-managed-work-check.mjs <root> <task-id>`。
- `tasks.md` 只认 `local_required/environment_required/release_required`；未标注一律按本地。
  Runner 根据清单、真实差异、测试报告和成功命令推导基础证据；Executor 只为需要独立
  证据的任务补充 taskEvidence，不再为每个勾选项重复拼装 JSON。
- Runner 自动合并冻结基线后的完整 changedFiles，并为命令写入结构化验证类别；同类机械
  退回最多自动整改一次，累计最多两次，之后直接转当前 Host 评审。单轮出现 3 次及以上
  权限拒绝时不再启动下一轮 Executor。
- Runner 自动继承历次通过验证的启动、HTTP、测试与构建命令。Host 确认历史证据完整且
  仅当前结构化元数据有误时直接通过并审计式晋升，禁止让 Executor 重跑环境或整理 JSON。
- Spring Boot 成功证据已经覆盖启动、真实 HTTP/runtime 和证据路径，仅缺 `invocation`
  验证类别时属于验证类别歧义：Runner 直接转 Host，Host 通过后审计式补全，不启动完整
  Executor 修元数据。
- Runner 确定性删除结构化数组中的空白项；只读检查 exit 1/2 且明确报告无进程、监听、
  容器或残留时按成功空结果处理，不得为这两类元数据问题启动 Executor。
- 状态同时展示物理调用、基础设施抵扣和有效研发调用。供应商切换通过
  `--provider-switched <reason>` 原地恢复；研发阶段仅在变化时通知 Host 会话。
- 页面/权限变更机械要求前端启动和 Playwright/Cypress 真实浏览器 E2E；跨端 API 变更要求
  后端 Controller 与前端请求合同测试和 API export snapshot。
- 完整性脚本必须先通过，后台才允许写入唯一的 `run.delivery_ready` 事件；脚本失败时
  转入等待人工处理，不得留下“已可交付”的假证据。
- 通过后按源码/环境/发布进度进入三段交付状态，仍不能自动提交。

## 恢复

后台异常后读取任务合同、事件账本、运行状态和最近检查结果，从当前工作区创建新短会话
继续。旧 session 仅用于审计，不作为恢复依赖。
健康 `running` 任务执行普通 `--resume-task` 时只允许安全接入并继续等待，不得重置状态、
预算或重复启动 Executor；只有已记录 PID 被确认死亡时才进入陈旧恢复，PID 未记录时失败
关闭为接入等待。活动 MCP wait 的 progress notification 只在该请求内有效，不是 Host 回合
结束后的自主回调。
