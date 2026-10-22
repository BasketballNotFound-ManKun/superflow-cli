# 测试选择与验证闭环

## Runner-Captured Execution

所有 SDD 执行用例必须捕获实际构建/用例进程，在既有 document-review coverage 用例冻结
`executionEvidence: "runner-captured.v1"` 与
`executionContext: {"argv":["node","case.js"],"cwd":".","environmentKeys":[]}`。
argv 是参数数组，不经 shell；cwd 相对 change 目录，environmentKeys 仅声明受支持
的非秘密环境键。每份 PASS receipt 必须实际 capture；旧凭证仅保留为历史或 PARTIAL，
缺当前要求时阻断补齐。完整字段以
[执行证据合同](document-review-coverage.md)和既有 receipt 校验为准。

在项目根目录准备两个最小 plan（以下文件均放在项目根目录）：

```json
{"kind":"build","argv":["node","build.js"],"cwd":".","sources":["app.js","build.js","case.js"],"artifact":"dist/app.js","output":"evidence/build.json"}
```

```json
{"kind":"case","changeDir":".","review":"review.json","caseId":"C1","build":"evidence/build.json","output":"evidence/C1.json"}
```

使用当前宿主已安装脚本运行；下列 installed-script-path 替换为安装位置：

```sh
python3 <installed-script-path>/superflow-test-report-lint.py --record-execution build-plan.json
python3 <installed-script-path>/superflow-test-report-lint.py --record-execution case-plan.json
```

case plan 必填 changeDir，相对 plan 所在目录；output/review/build 也相对 plan，
build plan 的 cwd 相对 plan；仅 case executionContext.cwd 相对 changeDir。不得猜 review 目录。build 的 sources/artifact 相对
build cwd。build.sources 覆盖实际相关源码、构建和验收脚本，不仅列无关小文件。
build/case 输出必须在同一证据目录；case 命令只从冻结 executionContext 读取。

嵌套示例：plan 在项目根，change 在 openspec/changes/sample，冻结 executionContext.cwd 为
../../..（项目根），其 argv 仍为项目根的 case.js；review 不决定工作目录：

```json
{"kind":"case","changeDir":"openspec/changes/sample","review":"openspec/changes/sample/.sdd/reviews/document-review.json","caseId":"C1","build":"evidence/build.json","output":"evidence/C1.json"}
```

验收命令 stdout 输出且仅输出一个匹配该 caseId 的 JSON 测量事件；其他诊断输出可保留：

```json
{"event":"superflow.measurement.v1","caseId":"C1","executed":1,"assertions":[{"id":"response","expected":true,"actual":true,"result":"PASS"},{"id":"state","expected":true,"actual":true,"result":"PASS"},{"id":"forbiddenEffects","expected":true,"actual":true,"result":"PASS"}],"persistence":[],"target":{"service":"<observed>","route":"<observed>","kind":"<observed>","buildId":"<observed>","buildSha256":"<observed>","sourceFingerprint":"<observed>"}}
```

这只是事件外形，不是可交付的已通过证据。assertions 至少包含 response/state/forbiddenEffects
并覆盖冻结断言 ID；数据库
用例还输出适用 database/testLayer/mockBoundary/persistence 实测字段。actual 来自真实
响应/状态/查询，target 来自实际被调用目标的观测，不能照抄预期目标或填占位值。
Runner 通过规范脱敏器保留 stdout/stderr、退出码、执行前后源码指纹及构建绑定，不按 expected 补 actual；
缺少实测来源、非零退出或源码漂移保留 PARTIAL。脱敏日志不是原始秘密字节；
同目录保留 *.stdout.log / *.stderr.log / *.capture.json / *.events.jsonl。构建标识与指纹由捕获入口生成，Agent 不手填。
本地可写文件只支持可审计一致性，不保证抵抗恶意篡改；Host 仍独立判断真实入口、
覆盖充分性和业务正确性。捕获通过不能代替测试合同，也不把 helper 单测升级成生产验收。


一次类级执行覆盖多个 Case 时，逐项记录实际方法/断言映射，执行次数与独立覆盖数分开；
反复跑整类不能冒充新增 case 覆盖。非零退出不能被旧 XML 或旧结果变绿，核对本轮产物新鲜度。
继承证据须说明当前 diff 与入口/依赖的适用关系，只重跑受影响层级。actual 必须实际观测，
恒 true、expected 复制 actual、COUNT 不变都不能证明未观测字段或旧轮次完整不变。
敏感原始证据可留仓外；交付给授权接手方可访问的位置与 hash，不强制 Git 提交大包，
也不能只给另一人无法读取的个人路径。

## Production Entry State Assertions

在 tests.md 冻结以下用例合同，技术详设逐入口边界以 Case ID 回链；执行报告记录原始
结果，不在报告临时改变预期。只为适用的生产路径填写，不为纯函数虚构 HTTP/数据库。

| Case ID / Decision ID | 真实生产入口/调用链 | Before state | 输入快照/版本 | 动作/故障注入点 | After state | Concurrency/rollback | 响应/外部副作用断言 | 证据位置 |
|---|---|---|---|---|---|---|---|---|
| <C/D-ID> | <E-ID + 生产绑定> | <同业务 ID 的完整相关值> | <加载时绑定> | <真实步骤> | <期望变化或严格不变> | <适用风险/依据> | <精确结果与次数> | <已有回执/日志> |

内容变更、状态变更和混合入口分别证明；幂等重复请求没有新增行不证明正确的状态变化。
并发风险冻结受控交错、胜负结果、最终内容与版本/状态；回滚风险在首个写入之后注入
失败，核对所有受影响记录/字段及外部副作用，而非仅看数量。代理、异常捕获或异步
可能改变事务结果时从真实生产入口运行；直接调用 helper 或 mock 单测仅证明其隔离层。
跨仓/前端用例缺环境保持 BLOCKED/PARTIAL，不以服务端模拟替代整体交付。


## 适用范围与唯一 owner

在生成 tests.md、实现任务开始、整改和交付核验时读取本指南。输入是已确认需求、
源码差异、项目测试与冻结合同；输出写入现有 tests.md / Quick Spec 和 test-report.md。
纯文档修改只核验文档合同；纯函数只核验对应 seam，不虚构应用或数据库。

superflow-contracts 冻结验证方案；实施方执行并留存证据；superflow-verify / Host 判断
充分性和历史证据适用性；既有 coverage/receipt/lint 核对确定事实，状态仍由原状态机持有。
数据库机器合同只引用 [document-review-coverage.md](document-review-coverage.md#数据库分层合同)，
沿用 testLayer、mockBoundary 和 execution-receipt.v1，不引入另一套级别或证据格式。
本指南由 Superflow 分发；无需安装 ake 的验证技能或创建 .ake 记忆。

## 开工前选择信号

先检索现有测试、构建接线、环境配置和项目规则，复用相同 seam、命令与工具。
在生产代码修改前，把每个受影响行为映射到下面的信号，并冻结用例 ID、命令、断言和证据位置。
不适用项写明源码依据；环境缺失的必测项是 BLOCKED/PARTIAL，不能写“不适用”。
已冻结的必测项不得由实施方删减；发现遗漏返回文档 owner 修复合同。

| 改动/风险 | 需要冻结的信号 |
|---|---|
| 纯函数或局部算法 | 窄化单测、边界/失败断言、项目适用的构建与静态检查 |
| 组件注册、装配、配置 | 上述检查 + 真实应用/上下文启动、就绪条件 |
| SQL、Mapper、持久化、事务、CAS、数据驱动行为 | 窄化逻辑检查 + 生产 statement 的同类型数据库验证；完整 SDD 还覆盖真实消费入口 |
| API、公开字段或鉴权 | 项目已有契约测试/快照 + 真实受影响入口；新增契约建立基线 |
| 新增贯穿接口、业务与存储的能力 | 构建、单测、装配、真实数据库、接口契约和至少一条真实主流程 |
| Bug 修复 | 同一症状的 RED → GREEN + 受影响回归；环境错误不算业务 RED |
| MQ、设备、回调、缓存或第三方语义 | 冻结真实协议/后端/入口验证与可隔离边界，缺环境保留阻塞 |
| 仅报告格式或测试隔离变更 | 核验受影响合同/证据，不自动重跑无关业务链路 |

保留现有项目用例的层级编号，不把 ake 的 L1/L3/L5/L7/L8/L10 编号移植进 Superflow。
数据库 testLayer 与入口验收 level 是不同维度，不能用同一编号掩盖真实后端缺失。

## Mock 与环境

[Mock 指南](mock-strategy-guide.md)只说明隔离边界。逻辑单测可 mock 数据访问依赖，
但该结果不能证明 SQL、事务或落库。必测数据库 case 禁止 mock 生产 Service/Mapper；
允许隔离的外部客户端由 mockBoundary 冻结。MySQL 不可用 H2/SQLite 的通过结果替代。
真实同引擎容器数据库不是 Mock；必须冻结引擎/主版本、schema 来源、生产 statement 和清理。
有共享环境要求就使用该环境；没有该要求且合同认可容器方案时，复用项目已有容器基建。
没有可执行环境时保留局部逻辑证据，真实数据库用例 BLOCKED/PARTIAL，不降低验收等级。

## 可留存的业务场景测试

优先把关键业务主流程和 Bug 复现写成项目内已有框架的可重复回归测试，复用现有目录、
夹具、登录、查库和运行脚本。已有等价测试时扩展它；不新建平行场景框架或公共 helper。
低层测试已能证明的纯逻辑留在低层。Java 可沿已有 JUnit/RestAssured/JdbcTemplate；
其他技术栈使用项目原生工具，不为执行本指南强制引入 Java 依赖。

业务场景分别断言：响应中的具体业务值；同业务 ID 的数据库状态；合同要求的消息、
日志或其他副作用。数据库前后值、影响行数、非目标记录保持不变按规范合同冻结。
HTTP 200、非空、调用次数或 affectedRows=1 都不能单独证明正确落库。

主体数据按每轮/用例唯一化，稳定基础数据按业务键或逻辑名解析，缺失在 setup 阶段报错。
复用项目环境配置与登录获取命令；只记录凭据来源，不把密码/token 固化进文档或源码。
共享基础数据不自动 seed 或删除；造数权限、owner、清理范围与失败清理由合同明确。
依赖环境的场景测试用项目已有 tag/profile/脚本单独执行，避免污染纯单测；分组不等于跳过
交付必测项，完整验收必须显式运行所需分组并核对执行数。轮次互不依赖、不共享可变主体。

## 执行、复核与证据继承

先执行窄化测试，再执行合同要求的构建、启动和真实调用；读退出码、执行数、原始输出，
按 [执行模板](test-execution-template.md)回填用例证据。断言冻结后不为迎合错误输出而修改。
通过结论只能覆盖实际执行的层级；零用例、skipped 和未执行项不能晋升 PASS。

整改先建立“当前差异 → 失效证据 → 重跑命令”映射。生产代码、SQL、配置、鉴权、公开
契约、运行入口或环境变化使相关证据失效；仅报告格式修改不自动失效旧源码的运行结果。
历史证据必须匹配源码/构建、后端/入口与合同，由独立评审确认适用；不能放行另一源码版本。
健康实例与待测构建一致时复用，代码/配置或身份不匹配时重启并重验；停止仅使用合同的
owner 校验与清理入口，不能用宽泛 pkill/killall。纯函数不要求进程；必测真实入口不能豁免。
评审方只读核验源码和原始证据，实施方负责运行与清理；独立评审不等于机械重跑全部环境。

## 失败修复

按用例前置条件复现，读取实际 SQL/绑定参数、事务边界、响应和日志定位根因。
数据库失败先查生产 statement、写入字段、schema 与同 ID 前后值，不凭症状直接加事务
注解或换 Mapper 方法。修复后跑同一路径和受影响回归；方案变化先修复规范合同。
不跳过失败项、不改断言迎合实现、不隐瞒阻塞。

所有 SDD 执行用例按 [声明式上下文](document-review-coverage.md#声明式执行上下文与证据复用)冻结 executionContext；保留历史证据，但不得把未绑定旧记录标为新上下文完整通过。

## 用户操作链与真实异常回归

存在缓存、重试、输入编辑、强制刷新或状态切换时，tests.md 按用户完整操作链冻结
前置状态、每步动作、响应/副作用和后续可继续操作的断言；不能只列互不相干的接口。
例如“正常调用 → 不接受结果 → 调整输入并强制重试 → 恢复普通调用”，核对每步命中的
真实入口、状态写入和缓存读写。删除旧入口时反查其独有副作用及剩余消费者，保留原有
业务状态流转；是否保留旧缓存由业务合同决定，通用指南不替业务选择。纯函数无此义务。

外部返回结构合法或 HTTP 200 不等于可消费：按字段合同检查空列表、空白文本、占位
记录、部分有效值及消费方后续行为。是否缓存、重试或失败由已确认业务语义决定；不得自行发明非空占位字符串黑名单或
编号域，判为无效须有字段/供应商合同依据。真实
验证发现新异常时，保留脱敏原始返回和关联日志，定位根因，把同一症状补入现有回归
资产并记录修复前失败、修复后及受影响回归；合同有遗漏先交文档 owner 修复并重新冻结。
模拟空响应不能冒称真实供应商验证，真实调用也不能替代可重复回归。

## 已验证启动配置的复现

复用已有任务启动/验收脚本，将验证过的 argv、相对 cwd、依赖、非秘密环境覆盖、就绪
条件与停止入口固化到该脚本并由 tests.md 引用；用既有 executionContext 绑定敏感于环境
的证据。重启仍调用同一入口，检查实际生效配置，避免手工拼接命令丢失覆盖参数或原生库
设置。只保存凭据来源，绝不固化秘密或个人路径；不为本规则另建启动器或清理框架。
场景要求清态时，仅重置任务自有状态并证明隔离；不得从历史聊天继承共享进程/数据清理授权。

## 交付结论的边界

报告分别列实现、隔离/模拟、真实后端/设备、浏览器、提交与发布的事实和未执行项。
每组数量标明用例集合、执行层级、源码/配置版本、通过/失败/跳过/阻塞，不能复用同一个
“全通过”数字表示不同集合。接口模拟用户操作不等于浏览器联调；未取得用量或调用数写
不可观测，不写零。最终汇报的数字和范围须与最终有效报告一致。

## 当前交付策略

所有 SDD 统一采用 `workflowPolicy: "observed-delivery.v1"`；准入与续跑由 [document-readiness.md](document-readiness.md#当前交付策略) 维护。

所有完整 SDD 验证在test-report.md引用当前实际独评/复评报告，使用纯相对路径表：

```markdown
## Independent Review
| Report |
|---|
| .sdd/reviews/current-code-review.md |
```

生成的评审报告放既有 `.sdd/reviews/` 证据区，该目录不进入文档交接指纹；更新执行/复评证据不能改变冻结需求身份。


实际报告沿Reviewer规范四状态形状，以 `## Reviewed Sources` 的
`| Path | SHA-256 |` 表记录输入身份。当前唯一 `## Findings` 正文须明确为
`None` 或 `无`，前提是真实核验后已无当前未决项；历史报告、处置依据和授权延期
保留在历史/Notes，不删除未决finding换通过。清单覆盖登记代码及用例/构建来源，
不能缩减完整构建来源过门；它不声称每个依赖全文已读，真实diff/读取范围写Impact，
充分性由独立判断。修后源码变化需受影响重测和实际复评，不只刷新hash。

## Actual assertions and one current verdict

每条Case冻结实际业务入口及前置数据，输出的response/state/forbiddenEffects每项都要有真实
断言/读取支撑。测试null不代表同时测了空串/非法值；只verify调用不能声称真实事务回滚；
0行不变不能证明原有内容保全。并发风险至少有两个受控竞争者或明确交错点；回滚反例先证明
进入预期写分支，再核业务与关联状态同回滚及外部效果。静态PASS文本不能扩大证明范围。

替代入口/模拟只保留其真实覆盖，实际调另一接口或手工SQL时不得保留原入口target和端到端
PASS。原Case未完成保持PARTIAL，报告行、回执、任务及当前最终结论一起对账；已有linter会
拒绝PARTIAL回执冒充PASS、PARTIAL行却宣称最终PASS。--require-complete通过才支持完整
交付，delivery-check只核交付资产，不替代验收。历史记录放既有.sdd证据区并链接，不把旧
全PASS摘要混在本轮当前结论中。运行数量区分合同Case、参数分支、JUnit方法和重复聚合。

## Capture boundaries without test coupling

业务测试只断言真实行为，普通执行无需读取某次交付目录里的build.json。复用项目已有验收
wrapper：它调用冻结真实测试、从原始输出/测试报告提取实际执行数与断言，读取已捕获build
身份后输出measurement，再交现有--record-execution捕获。wrapper只能附加来源身份，不能补造
actual/执行数/成功断言，测试失败必须退出非零；`test ... && echo成功 || echo失败`不保证非零。

现有artifact绑定一个真实文件；需证明完整产物集时让真实构建生成JAR/归档作为artifact，不能
拿一个class或未逐文件验证的manifest冒称全部产物。来源hash、产物hash和运行目标实际身份
分别核验；自读build回执不是部署身份实证。不新增测试框架或平行捕获协议。

路径按现有合同区分：plan引用相对plan文件，case的changeDir相对plan，executionContext.cwd
相对change，回执文件引用相对回执目录。缺失时按错误展示的声明/基准/解析路径修复，不猜
另一目录或增加旧路径回退。JSON stdout、退出码和完整原始日志在既有证据区留可回读引用。

## Linked independent review

当前独评按[Reviewer形状](reviewer-checklist.md#reviewer-报告形状)输出Review Identity，
Role=independent-reviewer、Dispatch/Return为实际可定位引用。test-report的Independent Review
仍引用最终报告。曾有finding时，Review Chain链接原报告与Owner响应的路径/文件hash，
Finding Rechecks逐ID记录实际复评的resolved/dismissed；不能由Owner生成None投影替代。
历史源码可变化但历史报告文件身份保留；当前结论绑定当前源码。缓解/延期不冒称修复，
未补必测或缺复评保留PARTIAL。清单、hash与身份字段不能代替真实独立性判断。
