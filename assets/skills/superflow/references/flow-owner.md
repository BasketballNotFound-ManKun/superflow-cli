# Flow Owner：日常任务持续交付

## 适用与事实源

用户已授权实施、修复或闭环交付且未选择托管时，当前 Codex/Claude 就是 Flow Owner。
Owner 可以亲自编码、测试和管理自己启动的资源；按风险协调宿主原生子代理。
只讨论、只调查、只写文档或只评审时，完成所请求范围即返回，不能据此启动实施。
明确托管请求读取 managed-work.md；不要在普通流程创建托管 Task/Run 或启动 peer CLI。

复用现有 owner：superflow 路由，build 实施，verify 只读评审，handoff 生成指令，
state 脚本推进 SDD，test-guide 定义验证分层，reviewer-checklist 定义独立评审。
调用阶段技能前读取其说明。本文只定义持续责任，不重写业务设计、测试策略或状态机。

## 测试策略责任

当前Owner按[测试决策方法](test-guide.md#owner-led-test-planning)，在编码前调查源码并约定
最小充分方案；实施中按实际diff/新调用者补强，交付前按既有风险、review_mode及独评
要求复核证明范围；低风险保留原内联路径，不能把自评冒称独评。
业务预期与必测底线保持，合理补测试由当前Owner承接，不例行停问；新Case/冻结命令变化
仍按同一合同与证据身份更新路径执行。Quick不修改批准步骤，补强验证记录写同目录报告。
自动化只核事实，不按文件名或固定层级代替Owner裁决；简单任务不新增计划表或测试Agent。
实际影响涉及注册/装配、代理、路由或注解归属时，由 Owner 按同一方法选择必要的真实装配
及 HTTP 冒烟，证明生产绑定可用；纯函数不因此启动应用。验证强度依据调用链与失败后果，
不能按语言、类名或文件名自动套用；具体生命周期、事务与业务断言留在项目合同中。

## Existing document implementation

先执行[现有合同接入](document-readiness.md#existing-contract-intake)，核当前实际消费正文，
再进入下面阶段；不能用旧评审批量刷新hash代替本轮语义复核。

“根据现有文档实现任务并闭环交付”已经授权当前 Flow Owner 先核查并修正文档。
已有 full 任务缺调查、HOW 或当前评审时，先按 `superflow-clarify` 调查可查事实，
由 `superflow-contracts` 修正行为/API/tests 正文，`superflow-design` 补齐逐入口 HOW，
`superflow-handoff` 组织当前三视角独评、整改及 Coding Ready，再进入 `superflow-build`。
沿入口完整读取每个实际阶段；不要求用户先生成文档或确认是否补齐已授权文档。
“原 owner”指 canonical 正文职责，当前 Owner 可以接手，无需寻找旧作者或旧会话。
源码可解问题继续调查；只对原合同未决定的新业务取舍、范围变化或不可得权限请求输入。
只文档请求完成文档交付即停止。保留已声明执行模式、context_compression 与手动边界。
托管仍由 Host 组织合同纠偏及交接，Executor 写业务代码，Runner 裁决确定事实；
沿既有受控重新冻结路径承接，不能让 Executor 绕过冻结合同保护。


## 开工与恢复

1. 读取项目规则、当前工作区、基线及未跟踪文件；区分本任务与他人改动。
2. 已有 SDD 时运行 `superflow-state.sh recover <change-dir>` 与 `next`，读取冻结
   handoff、实现 Prompt、tasks.md、tests.md 和 test-report.md。首次实施必须通过
   Coding Ready；已获准续跑按 build 的 receipt 检查，合同漂移回对应文档 owner。
3. 保留已选 build_mode、隔离方式和用户边界。新普通 SDD 在设计确定后用现有
   `superflow-state.sh set <change-dir> build_mode owner` 记录当前 Agent 负责执行；
   同时记录实际 isolation、tdd_mode、review_mode，不伪称已派发子代理。
   `owner` 保留 TDD、独立评审与交付门禁，不使用 direct_override 绕过设计。
4. Quick 沿 quick-dev 的已批准 spec 实施，只更新允许的 status；步骤勾选、证据和
   恢复点写入同目录 test-report.md，不能修改已批准步骤或追加内容使摘要失效。裸任务先由
   既有路由判定范围，不能因称为 Owner 就跳过 quick 准入或必要 SDD 文档。

完整读取当前阶段 SKILL.md 与其必读 references，再执行；Flow Owner 是持续职责合同，
不能代替 build/verify 或其他阶段全文。实施/评审前完整读取
[Reviewer 清单](reviewer-checklist.md)，实际派发与复评按其可读包执行。

## 连续执行循环

```text
读取当前合同/进度 → 选择依赖已完成的任务 → 实施与适用验证
       ↑                                  ↓
       └──── 有效 finding：整改、重测 ← 独立核验与代码评审
                                          ↓
                                门禁与剩余项对账 → 交付
```

- 循环覆盖用户已授权的全部任务。只有当前任务所需信号成立才勾选；验证失败的任务
  保留未完成。重算真实前置依赖，不跳过依赖或把未做的本地代码改成外部待办。
- 测试失败、配置错误、已定位的代码缺陷和报告格式问题，先在授权范围内诊断修复、
  重跑受影响信号。普通错误不等于用户决策，不每批询问“是否继续”。
- 阶段更新使用过程消息，更新后继续工作；任务勾完时接续 verify，不直接建议归档。
- Owner 可同时承担实施与测试执行。按 reviewer-checklist 的实际风险取得隔离只读视角；
  冻结合同要求独立 Tester 时必须落实。子代理不可用则记录真实缺口，不能自评冒充独立。
- 分派只传必要合同路径、精确 diff、规则、验证证据和验收目标，不传整个聊天历史。
  Reviewer 不写源码、不运行应用或业务库；需要补运行证据时由实施方执行。
  委派开发时明确唯一文件 owner、依赖和验收；互不依赖且无写入冲突才可并行。
- Owner 核实、证伪并合并全部 feedback；合同内有效问题自动整改，重测失效证据并
  复审修复及影响面。自评和独立结论分别记录；不能用多次角色扮演代替独立上下文。
- verify 发现实现缺陷时通过 `verify-fail` 回 build。涉及合同改变则回文档 owner，
  刷新 handoff、评审与 Coding Ready；已确认的业务选择变化仍须用户决定。
- 复用尚有效的成功证据。仅格式整改不重复启动环境；源码、SQL、配置或入口变化时
  按 test-guide 与冻结合同重跑对应链路。原始失败保留，不能改写为成功。

## 持续责任与停止边界

已授权的目标跨阶段与上下文压缩持续有效。上下文紧张时，在现有 test-report 的
`## Owner Recovery`（Quick 使用 spec 同目录 test-report.md）保存以下紧凑恢复点：

| 项目 | 内容 |
|---|---|
| 范围 | 用户目标、已确认授权、排除项、当前 phase/build_mode 与合同路径 |
| 进度 | 当前任务、未完成依赖、下一条具体动作 |
| 证据 | 当前源码/构建版本、有效命令与报告路径、仍失败的命令与原始输出 |
| 评审 | 全部未决 finding ID、证据、修复与验收条件、reviewer 报告路径 |
| 资源 | 自己启动的 PID/启动身份、用途、端口、临时数据及清理义务 |

压缩后重新读取恢复点和原合同，从未完成动作继续，不因上下文压缩结束交付回合。
宿主真正退出或工具不可用时保留现场并如实报告中断；普通会话没有后台自主唤醒能力。

只在以下边界停止依赖工作：用户暂停或缩小范围；明确 auto_transition:false 的阶段
边界；必须由用户决定的方向变化；不可获得权限/必需环境；整改不收敛。缺外部条件时
仍完成不依赖它的已授权工作，但冻结必测项缺证据时保持 Blocked/Partially verified。

沿现有报告记录每轮未决项和实际关闭项。同一阻断连续两次整改转换没有关闭任何旧问题，
或达到既有三轮 verify-fail 上限时，汇总尝试、证据与待决事项再请求指引；不重复改措辞、
换 finding ID 或无限重跑，也不能接受未获批准的偏差。正常修复无需逐条重新授权。

## 完成交付

逐项对账用户目标、任务、diff、必测证据、评审 finding、交付文件和资源清理；SDD 复用
verify 的全部 lint/guard，Quick 对账批准 spec。正文 PASS、JSON 或任务勾选不能替代
实际执行与语义核验。失败门禁须定位修复；本任务不通过放宽门禁或删除断言收口。

最终统一报告：目标与实际改动；命令、退出码、数量与证据路径；独立评审和整改结果；
本地/真实环境/浏览器/发布覆盖与剩余项；资源、分支与归档状态。只有全部必需项成立
才能称完整交付。未授权的 Git 提交、推送、发布与归档仍等待对应授权；已有明确授权
按原范围执行，不重复索取。不得为了“保存进度”自行提交或重写 Git 历史。

所有完整 SDD 交付（统一 observed-delivery.v1）在现有 test-report.md 的 `## Independent Review` 下
用 `| Report |` 表逐行链接实际独立报告。引用当前复评的 DONE 报告；报告以
`## Reviewed Sources` 的 `| Path | SHA-256 |` 表绑定已审源码。保留历史报告，
源码变化后由 Reviewer 真实读取/复评再生成新表，不由 Owner 重绑旧 hash。

### 交付事实矩阵

在现有 test-report 和最终交付中逐项记录下表。任务全勾选、verify_result 或
phase=archive 只说明流程事实，不证明用户目标已达成。沿 reviewer-checklist 的
身份、派发、diff、finding 和复评记录复核独立结论，禁止自评冒充独立评审。

| 事实 | 本轮必须说明 |
|---|---|
| User goal | 用户要完成的结果、授权范围和验收目标 |
| Current implementation | 当前源码真正覆盖的入口/调用链，以及未实现部分 |
| Mock / real | 每组 mock、真实后端/数据库、浏览器、外部设备/服务实际执行范围和数量；未执行明确列出 |
| Open items | 未关闭 finding、缺失证据、未重测/复评变更与影响；阻断时保持 PARTIAL/Blocked |
| External coordination | 另仓/前端/部署/权限等协同责任、现状和完成条件；不得把本地未做工作改名为外部协同 |
| Re-review evidence | 原 finding 的 FIXED/MITIGATED/DEFERRED/NOT_A_DEFECT 处置、剩余风险、重测和实际隔离 Reviewer 复评；未复评明确未完成 |
| Control actions | 休眠/唤醒、暂停/继续和重启控制单列次数与依据；业务指导、权限/预算批准另列，未知不记零 |

替代入口或模拟只支持其真实覆盖范围。外部协同尚未完成时分别说明本地实现状态与
端到端可用状态，不以归档或强 PASS 隐去缺口。显式 native 托管继承宿主原生能力与
项目合同；本文不向它额外强加 SDD 文档、团队或业务测试策略。

## Current run, authorization and recovery

本轮开工在既有test-report恢复点记录已选分支/合同、当前CLI版本与可取得的buildCommit或
运行指纹、实际Skill来源、请求/返回模型名、已有授权和下一动作；缺遥测写未知，不用
版本号相同推定同一构建。记录身份不证明模型商底层模型或读取服从率。

Git提交/推送/发布/归档分别核可定位的已有明确授权；后到的批准不能追认先前未获授权的
操作。“闭环交付”、保存进度、阶段完成或模型说授权内不自动授予这些控制动作。
阶段汇报后仍继续已授权可执行任务；等待真实子代理返回可由宿主通知接续，不冒称退出后后台工作。

若响应不完整或宿主结束后需人工恢复，保留最后完整动作/未决工具、错误/请求引用、证据与
资源，区分正常end_turn、等待子代理、权限/额度与网络错误。没有原始错误时写根因未定，
不凭模型自述定为供应商或Owner故障；原生CLI退出后的自动重试由宿主机制持有。显式托管
的已知暂时连接失败沿既有Runner分类、三次限额和抵扣，不新增监督Agent或模型轮询。

有finding时当前最终报告必须保留Review Identity与Review Chain/Finding Rechecks，原Reviewer
报告和Owner响应分开，处置后实际独立复评。身份字段不能证明真实独立，Owner须核原始工具
返回，不能改报告为DONE/None或重绑hash冒称复评。实际Case/回执/任务/最终状态同口径，
PARTIAL就披露缺口和下一步，不说全部目标已达成。
