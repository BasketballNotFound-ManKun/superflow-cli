# 测试选择与验证闭环

## Owner-led test planning

Flow Owner依据确认目标、当前源码/diff、真实调用者和项目基线制定并演进测试方案。
测试范围、层级、断言及充分性由Owner与独立Reviewer判断；脚本只核执行、引用、身份和状态事实。
文件名、行数、测试数量或关键词只是调查提示，不自动决定全量、数据库、HTTP或浏览器义务。
用户/项目已指定的必测基线仍必须执行，环境不可得不能改称不适用。

编码前在现有tests.md约定“行为变化/影响范围→主要风险→测试选择与理由→关键反例和断言→
复用命令/环境→未覆盖范围”。简单任务几行说明即可，复杂任务复用已有用例表；不强造另一份
计划、固定列数、测试层级编号或审批流程。Quick保持批准spec的验收与步骤，补强验证决策及
证据写同目录test-report；不追加批准步骤或改摘要绕过Quick原确认边界。

实施和整改中由当前Owner主动处理新发现，不为正常补测试反复询问是否继续：
- 原目标、业务预期、入口和executionContext未变时，可在已有Case内扩展参数/边界及回归，
  重跑受影响信号、更新实际分支映射/执行数与本轮证据；旧结果不自动覆盖新增分支。
- 新Case ID、生产入口、冻结命令/上下文或验收合同改变时，同一Owner承接原文档职责，更新
  tests/coverage/追溯，沿既有handoff、文档评审及准入更新受影响证据后继续；不手改hash/凭证。
- 补测试本身不等于新业务决策。只有原语义未定、范围/验收底线改变或不可得权限需用户输入；
  缺环境的必测保留PARTIAL/Blocked，继续其余不依赖它的已授权工作。

选择足以推翻主要错误实现的最小充分集合，保留明确必测。交付前Reviewer从原目标和实际diff
挑战：若漏写、错误分支或失效事务仍能通过，缺哪条断言？把缺口交Owner补强、执行、复核。
API真实请求＋数据库通常证明接口/后端集成；后端完整业务链路需声明起终点与真实/模拟依赖。
涉及用户界面流程时，浏览器操作证据才支持该用户流程的端到端结论；不以HTTP/DB通过冒称。

按既有review_mode、实际风险和独评义务取得复核；低风险保留现有内联路径，不固定增加测试角色或代理数。


后端、前端与上线义务先按[来源控制与交付范围](document-review-coverage.md#source-authority-and-delivery-scope)
确认。只有本轮已批准范围内的缺失证据才阻断相应交付；前端/外仓对接提示不自动成为
后端任务门槛。不能把本地可控的接口验证缺口改名为外部协同。

## First verification action

将首次验证做成一条最小交付链，而不是“先把业务测试跑完，最后接证据”。Owner 先读本节、
Runner-Captured Execution 与 tests.md，复用项目测试/验收 wrapper 和已安装的 capture。
按源码风险选择一个已就绪的代表 Case 或同上下文批组，不要求所有生产功能先完成。

1. 在 tasks 中核它的测试、观测输出与 adapter 前置依赖。它们须在首批旁一并实现或复用；
   只有全量回归与最终独评依赖全部功能完成。若任务要求早期真实验证，却把唯一采集能力
   阻塞到所有功能之后，这是合同顺序冲突，由原文档 owner 修依赖/导航并重新评审，不另写执行方案绕过。
2. 从同一批真实断言处保留响应、状态与禁止副作用的实际观测；原生测试继续做业务断言，
   不依赖交付 build.json。adapter 解析这些原始观测及精确执行结果，附身份后输出测量。
   JUnit XML 通过数只证明方法结果，不能还原未输出的字段值或复制成三项 actual。
3. 沿现有 `superflow verify` 预检并显式执行原计划（命令见下），将实测 receipt
   同步到当前 Case 表并运行报告 lint；未执行项保持 PARTIAL。沿既有 RED/失败分支核
   错误观测会使测量/退出码失败，不能被方法绿数洗白。
   首批接线可用后再扩展同一 adapter，保留每个 Case 的断言，不为每个 Case 重跑整类。

```sh
superflow verify <change-dir> --execution-plan build-plan.json
superflow verify <change-dir> --execution-plan build-plan.json --run
superflow verify <change-dir> --execution-plan case-plan.json
superflow verify <change-dir> --execution-plan case-plan.json --run --sync-report
superflow verify <change-dir> --execution-status
```

计划路径相对调用目录；Case 计划必须绑定所选 change。预检不运行命令，只有 `--run`
实际执行。`--sync-report` 仅投影当前 Case 表并将整体结果保留为 PARTIAL/NOT_READY，
保留原历史与解释；不改计划、合同或评审原件。`--execution-status` 只读核实际回执及
当前源码/构建身份；命令成功退出不等于用例或交付通过，应读取 counts、逐项结果和诊断。
Owner 选择计划、必测与执行顺序，不手工维护多份通过数；完整交付仍走原独评和最终门禁。

本节不增加独评轮次或另建测试框架。首次接线失败按原输出修同一管线，不能拖到最终
独评后或以“下个会话独立工程块”结束可继续的授权工作。命令字段不是观测，回执格式通过
也不替代 Reviewer 对断言充分性与真实数据流的检查。

脚本与本指南同属一次 Superflow 安装。以本 SKILL 安装目录为基准：从
`<scope>/.codex/skills/superflow/` 向上到 `.codex` 后取 `hooks/superflow-test-report-lint.py`；
Claude 同理取 `.claude/scripts/`，scope 为已选项目或用户目录。不得混用另一安装或扫描
个人目录；缺脚本按安装问题诊断，不重新编写捕获器。业务测试不依赖某次报告文件。

## Source-driven regression choices

- 改动装配/声明时连同相邻注解、字段/构造器归属和实际创建路径一起核查。反射赋值或
  mock注入绕过了容器；Owner按实际风险选择项目已有真实装配或受影响HTTP冒烟，不能把
  “注解重复”仅按风格修掉却留下失注入字段。纯函数且无装配影响不强制启动。
- 改公共写方法时反查未改调用者、单条/批量、内部/异步、内容/状态和混合字段。测试应能
  区分该推进的业务变化与不该推进的状态写；补反查父ID不等于已证明全部消费者语义正确。
- 并发令牌/快照测试核绑定来源及生命周期：加载、修改、首次成功后继续保存、辅助刷新、
  失败后重试与内部重存；不能给旧内容单独换新令牌。真实提交点和内容写/令牌推进窗口由
  项目api/design冻结，测试选择受控交错和失败反例，不由通用指南指定事务方案。

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
{"kind":"build","argv":["node","build.js"],"cwd":".","sources":["app.js","build.js"],"artifact":"dist/app.js","output":"evidence/build.json"}
```

```json
{"kind":"case","changeDir":".","review":"review.json","caseId":"C1","sources":["case.js"],"build":"evidence/build.json","output":"evidence/C1.json"}
```

现有 verify 入口调用当前安装的同一捕获器：

```sh
superflow verify <change-dir> --execution-plan build-plan.json
superflow verify <change-dir> --execution-plan build-plan.json --run
superflow verify <change-dir> --execution-plan case-plan.json --run --sync-report
```

case plan 必填 changeDir，相对 plan 所在目录；output/review/build 也相对 plan，
build plan 的 cwd 相对 plan；case executionContext.cwd 相对 changeDir。不得猜 review 目录。
build 的 sources/artifact 相对 build cwd，覆盖真实生产构建输入和冻结入口的源码链。
case 也必须显式声明非空 sources，相对该冻结 Case cwd，覆盖测试、adapter、数据及配置等
实际执行输入；可与构建来源共享同一路径，不创建虚构文件。缺清单直接补齐，不回退继承。
Case capture 与 receipt.sources 核构建/执行来源并集；build.sources 和其 sourceFingerprint
只核构建输入。仅某个 Case 的输入变化时重采受影响 Case，共同生产来源改变仍使原构建
及受影响 Case 失效。不能仅因 jar 相同复用旧证据。build/case 输出保持同一证据目录，
case 命令只从冻结 executionContext 读取。

### 先准备计划，再采集实测

`--check-execution-plan PLAN [PLAN ...]`只读解析全部给定计划，汇总可确定错误；不运行
构建/用例、不创建证据目录、不改写报告或现有捕获。`--record-execution`在创建输出目录及
启动命令之前复用同一预检。修复plan中的路径/argv或coverage/tests中的冻结合同，再重查
本批计划；不要靠重跑昂贵测试定位JSON字段形状。

输出`PLAN_VALID`只表示可检查的计划字段成立。尚无build回执时，Case显示
`dependency: "BUILD_NOT_RUN"`，可提前准备合同；运行Case前仍须真实build成功，再检查
产物/源码/捕获身份。预检不生成receipt、actual或target，不证明命令成功、业务正确、部署
身份或断言充分性。已存在build时会核验其真实capture及当前源码/产物指纹；不能拿旧build
绕过漂移。批量同时给build plan时，还核对其sources覆盖当前Case入口冻结的代码引用。

| 字段/输入 | 规范形状与修复入口 |
|---|---|
| `kind` | plan仅`build`或`case`；build包含argv/cwd/sources/artifact/output，case包含changeDir/review/caseId/sources/build/output |
| `argv` / `executionContext` | 非空字符串参数数组，不经隐式Shell；Case只读取coverage冻结的`{argv,cwd,environmentKeys}`，不能在case plan另填命令覆盖 |
| `cwd` / 路径 | build cwd相对plan；Case cwd相对changeDir；output/review/build/changeDir相对plan；artifact相对build cwd；每种plan的sources相对其实际cwd。按声明值/解析基准/实际路径诊断修正，不猜目录 |
| `sources` | 两类plan均为显式非空文件数组，目录/通配符由Owner先展开；文件应存在且非空，别名不能重复。build覆盖生产构建及冻结入口代码链，Case覆盖实际执行输入；不能把缺少的生产来源挪入Case绕过构建核验 |
| `output` | 文件路径；stdout/stderr/capture/events派生文件一起检查，不得覆盖plan、review、来源、产物、依赖build及其原始输出，也不得与同批另一输出冲突。build回执作为Case的build依赖是允许的；build/Case共享证据目录 |
| Case / Entry | coverage.cases/entries均为非空、唯一ID的对象数组；caseId找到唯一Case，entryId找到唯一Entry，Case.level与Entry.kind一致 |
| `service` / `route` / `kind` | Entry.service若声明须非空字符串，未声明按既有合同使用Entry.id；route非空字符串；Entry.kind和Case.level为`browser/api/job/event/library/cli`。修复原coverage，不能为实际调用另一入口改receipt目标 |
| `assertions` | 冻结合同为对象，response/state/forbiddenEffects为非空断言描述字符串；可选persistence为逐字段预期数组。实测事件另用断言对象数组`{id,expected,actual,result}`，不可把合同描述数组或实际值写回冻结合同 |
| `testLayer` / `mockBoundary` | 已声明testLayer为`logic/sql-binding/database/http-entry`；mockBoundary为`{allowed:[字符串],forbidden:[字符串]}`且不相交，真实数据库层的forbidden非空；完整数据库义务仍按执行证据合同核验 |
| `environmentKeys` | 不重复、仅选`PATH/PATHEXT/NODE_ENV/NODE_OPTIONS/LANG/LC_ALL/TZ/JAVA_HOME`；不放秘密。捕获绑定这些键的值hash，不把值写进凭证 |

每次`--record-execution`保留唯一attempt的脱敏原始输出、capture和事件；重捕前的当前
receipt另存只读历史快照。当前receipt记录本次实际结果，失败保持PARTIAL；历史PASS不因
被保留就适用于当前源码。计划预检只读，不创建attempt或历史。批量消费见下节。

嵌套示例：plan 在项目根，change 在 openspec/changes/sample，冻结 executionContext.cwd 为
../../..（项目根），其 argv 仍为项目根的 case.js；review 不决定工作目录：

```json
{"kind":"case","changeDir":"openspec/changes/sample","review":"openspec/changes/sample/.sdd/reviews/document-review.json","caseId":"C1","sources":["case.js"],"build":"evidence/build.json","output":"evidence/C1.json"}
```

验收命令 stdout 输出且仅输出一个匹配该 caseId 的 JSON 测量事件；其他诊断输出可保留：

```json
{"event":"superflow.measurement.v1","caseId":"C1","executed":1,"assertions":[{"id":"response","expected":"<冻结值>","actual":"<真实观测值>","result":"<比较结果>"},{"id":"state","expected":"<冻结值>","actual":"<真实观测值>","result":"<比较结果>"},{"id":"forbiddenEffects","expected":"<冻结值>","actual":"<真实观测值>","result":"<比较结果>"}],"persistence":[],"target":{"service":"<observed>","route":"<observed>","kind":"<observed>","buildId":"<observed>","buildSha256":"<observed>","sourceFingerprint":"<observed>"}}
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

## Observed batch and measurement diagnostics

同一真实suite可证明多个Case时，先维护tests/coverage的Case、selector、断言与分支映射，
再沿同一capture准备批计划。冻结的argv/cwd/environmentKeys必须完全一致；不同命令或
共享资源未隔离的工作不能硬合并。Case数量不是构建进程数量，不强制逐Case全量重编译。

```json
{"kind":"case","changeDir":"openspec/changes/sample","review":"openspec/changes/sample/.sdd/reviews/document-review.json","sources":["case.js"],"build":"evidence/build.json","cases":[{"caseId":"C1","output":"evidence/C1.json"},{"caseId":"C2","output":"evidence/C2.json"}]}
```

该计划与单Case的顶层caseId/output互斥；使用同一`--check-execution-plan`与
`--record-execution`。一次实际进程为每个选中Case输出恰好一个原格式measurement；
原退出码、运行前后源码、构建、目标和环境绑定由同次capture承接，逐Case按原规则校验。
缺失/重复事件、真实失败、未执行或漂移不能用其他Case成功/旧XML补齐；同次进程非零
不能产生PASS。命令成功仍不证明每条业务断言充分。

先打通一个最小真实Case；已有真实stdout后可只读集中诊断其测量结构：

```sh
python3 <installed-script-path>/superflow-test-report-lint.py --check-measurement case-plan.json --measurement evidence/<actual-attempt>.stdout.log
```

`MEASUREMENT_DIAGNOSTIC_ONLY`只标识离线诊断模式；逐项FAIL及退出码决定诊断结果，非零表示失败。
它不运行命令、不生成或晋升receipt，
也不证明文件确实来自当前测试。输入必须引用实际观测，不能以expected补actual。结构问题
先集中修适配器，再实际capture；不为调一个JSON字段重跑整套业务。适配器用项目JSON库
序列化真实结果，不手拼JSON，不把冻结statement全集补成已执行。

Previous attempts：读取receipt实际引用的attempt日志与capture路径，不猜固定文件名。
测试fixture/观测使用本次运行自有目录，避开构建工具会清空的test-results；建立同次执行
ID、用例、退出码和来源对应。已有XML的mtime、文件存在或全类历史绿不能让适配器跳过
实际测试、假填内部exitCode=0后绑定新build；同次执行的复用仍须可核验原执行身份。

捕获stderr显示开始/PID/结束等生命周期，秘密argv/输出不因此直接打印。卡住先检查本任务
进程、线程/数据库等待与原始错误，证据成立才归因代理、网络、事务或测试夹具；不把
“环境怪癖”当结论，也不默认加硬超时或宽泛结束进程。正常诊断由工具承接，Agent不反复
轮询。报告当前Case表、计数与独评状态以真实原件对账，旧恢复点进入History。

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
源码差异、项目测试与冻结合同；输出写入现有tests.md及test-report；Quick按上节的批准spec边界记录。
纯文档修改只核验文档合同；纯函数只核验对应 seam，不虚构应用或数据库。

当前Flow Owner在superflow-contracts职责下形成编码前方案，并按上节维护测试演进；
实施方执行留证，superflow-verify / Host独立挑战充分性和历史证据适用性。
既有coverage/receipt/lint核确定事实，状态仍由原状态机持有。
数据库机器合同只引用 [document-review-coverage.md](document-review-coverage.md#数据库分层合同)，
沿用 testLayer、mockBoundary 和 execution-receipt.v1，不引入另一套级别或证据格式。
本指南由 Superflow 分发；无需安装 ake 的验证技能或创建 .ake 记忆。

## 开工前选择信号

先按[Owner决策方法](#owner-led-test-planning)检索源码、现有测试、构建、环境和项目规则，
复用seam/命令/工具。下表是按实际风险选择适用信号的参考，不是自动分类器或逐项全跑清单。
编码前记录基线用例/命令/断言/证据位置；不适用给源码依据，必测缺环境保留BLOCKED/PARTIAL。
实施方不得删减既有必测；遗漏由当前Owner按同目标补强或更新原合同后继续。

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


实际值与预期值相等可合法通过，不能用“相等即伪造”的规则；Reviewer核的是数据流：
原响应/查询/测试报告→解析/比较→measurement→退出码。逐项找实测读取与失败分支，
不接受从冻结assertions复制actual或无条件打印PASS。HTTP 200但业务失败、缺写、旧输出、
状态已变却目标字段错，都应使相应用例失败；负向用例按冻结预期判断，不把success=false
机械视为失败。手工观察可以保留其证明范围，不能给弱自动化脚本倒填通过。


当前报告的所有验证/归档摘要必须一致；同语言后文PASS不能覆盖未标历史的FAIL。
当前逐用例表唯一，修后更新同一张表；不能在尾部追加第二张PASS表。历史明确放在
`## History`、`## Historical Evidence`、`## 历史记录`或`## 历史证据`下，或链接已有
历史文件；同级/更高标题回到当前。历史保留原文/身份，但不提供当前Case、摘要或独评。
代码块或注释里的标题不改变作用域；原始HTML/XML结构不参与报告解析，须改用Markdown/代码围栏。旧恢复点与步骤完成事实也按此分区，不留两个当前终态。

## Capture boundaries without test coupling

业务测试只断言真实行为，普通执行无需读取某次交付目录里的build.json。复用项目已有验收
wrapper：它调用冻结真实测试、从原始输出/测试报告提取实际执行数与断言，读取已捕获build
身份后输出measurement，再交现有--record-execution捕获。wrapper只能附加来源身份，不能补造
actual/执行数/成功断言，测试失败必须退出非零；`test ... && echo成功 || echo失败`不保证非零。

冻结选择器必须真正传到原生测试命令；单Case入口先在同类含失败兄弟用例时核实际选择范围。
只拆plan或只筛输出事件不改变已执行的测试集合。需要隔离失败时选择真实独立调用或修正
同次批组，不吞共享进程退出码。缺测试方法、夹具或本轮须实现的运行归档属于未完成工作，
不能只因暂未接通就改称不可得外部环境；真实权限/业务边界仍据原合同判断。

现有artifact绑定一个真实文件；需证明完整产物集时让真实构建生成JAR/归档作为artifact，不能
拿一个class或未逐文件验证的manifest冒称全部产物。来源hash、产物hash和运行目标实际身份
分别核验；自读build回执只能给出来源/产物身份，不能证明运行进程实际加载了该产物。
部署/远端调用按项目既有版本端点、加载产物指纹或启动身份等真实可读观测绑定target；
未取得时保留PARTIAL，不从本地build.json照填部署身份。不新增测试框架或平行捕获协议。

重跑范围由“当前差异→受影响来源/产物/运行目标→失效Case”决定：构建输入变化须重建并
重捕相关Case；执行输入变化重捕受影响Case，不重建输入未变的生产产物；部署身份变化
重验实际入口；仅计划路径/报告排版修正不自动要求
重跑未受影响业务。旧证据仍须匹配当前冻结上下文和源码/构建身份，不能只刷新hash。

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
