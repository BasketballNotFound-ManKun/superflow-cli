# 需求 × 真实入口评审

0.5.10 起，完整文档交付在已有 `document-review.json` 中添加 `coverage`。
这是现有来源清单、源码审计、入口台账和测试合同的机器索引，不是第二套需求文档。
稳定 ID 复用现有清单；正文继续放原文档。不要从 FIX 任务倒推入口全集。

## 谁负责什么

- Agent：从用户原文和确认记录提取需求；从当前调用方、控制器、写入方发现真实入口。
  独立对照这两份清单，检查新增、遗漏、收窄、反转和排除。源码可解的问题自行查明。
- 脚本：检查每个需求与每个已登记入口的适用性、来源文件指纹、用例引用、逐项评审记录。
  无法证明清单完整、排除合理、断言充分或实现正确；结构 PASS 不是语义 PASS。
- 用户：只确认新的业务歧义、实现方向和需要授权的操作，不接收本应自行排查的源码问题。

## 必须执行的语义审查

1. 明确区分“允许执行某行为”和“该行为允许产生什么归属/状态/资源”。
   不能把“允许，但应归属原主体”改成“拒绝且零副作用”。
2. EXCLUDED 只能对应一个需求维度 × 一个入口，不能因“不适用站点过滤”等理由
   把同一入口在账号归属、权限、资金或其他需求维度整体排除。
3. 评审覆盖 FIX、VERIFY_EXISTING、EXCLUDED 和不改代码的入口。每个排除项必须回到
   原始需求核验；引用源码当前行为不能授权偏离需求。确需改范围回到用户确认。
4. 按角色从真实用户动作走到实际请求、业务写入、查询可见性及下游资源。
   同页面不同角色的分支用不同入口 ID；不得只测试开发者选中的新接口。
5. 验收同时断言返回、最终状态和禁止的副作用。只读/纯函数场景也要给出明确
   无持久化变更的理由，不能留空。browser 入口必须有 browser 验收，API 测试只能补充。
6. 横向页面/字段改造先从前端路由、列表列和可点击动作建立页面入口清单，再从后端
   Controller、Mapper statement、全部写入方反向建立清单。逐项对账后才生成 tasks/tests；
   相似方法名不得作为调用关系证据。每个列表记录实际页面请求、Controller、Service、
   精确 Mapper statement、返回 DTO 与表；每个管理按钮记录实际 mutation API 和写入点。
   未定位或两份清单不一致的入口标记待调查，不得以总数相等替代逐项核验。
7. 数据库字段展示用例必须分别覆盖一个非空记录与允许的历史 NULL 记录。非空记录
   用同一业务 ID 比较 API 字段与数据库真源值，并在浏览器核对展示；仅有字段键、HTTP
   200、空列表或历史 NULL 不能证明字段链路正确。修改入口还要验证写后读及禁止的副作用。

## 先调查源码，再冻结设计

本节是源码调查、关键结论复核和当前合同收敛的唯一规范；沿用现有源码审计与 coverage，
不另建 claim 账本。适用完整存量系统文档任务；纯文案、机械改动和不依赖现有行为的轻量
任务不强加本节。新生成的适用合同在 `.openspec.yaml` 的 applicability 下写
`source_investigation: required`，coverage 同时写 `sourceInvestigation: "required"`。
此保留键使用 block-mapping 标量；引号和行内注释可用，flow/block-scalar 等未支持写法
明确拒绝并要求规范化，不静默关闭核验。标记进入既有 handoff 哈希；不能删除标记或刷新哈希来关闭未解决调查。旧 v1 凭证保留原
边界，未声明时不能声称已通过此核验；重新冻结适用合同须补调查。

### 生成侧：从实际实现得出结论

写 design/tasks/tests 前先完成当前功能的定向 research：

1. 搜索已有模块、公共方法、调用方、测试和依赖；地图只定位，再实际读取实现与调用者。
   从真实注册/挂载或用户动作沿调用链追踪；定义存在、名称相似、注解写在注释中不证明生效。
2. 从写入反查全部写入方、读取/过滤方、Mapper statement、字段类型/容量/默认值/索引。
   记录搜索范围、实际命令及未找到的路径；源码不足时核可用的只读 DB，不能假设 DDL 就是生产。
3. 复用前读方法体：是否重读而丢弃准备实体字段、隐含费用/额度副作用、吞异常、保留外层
   事务、代理/自调用与锁顺序。对零影响行、乱序、重复、分页终止和本轮/下轮边界给具体反例。
4. 把“结论 → 实际源码片段 → 推导 → 可推翻条件 → 复用/冲突决定”写回已有
   `source-code-audit.md` 冻结卡；未知为 SOURCE_INVESTIGATION，继续查，不转问用户或写 VERIFIED。
   只有新的业务取舍才走 OWNER_DECISION。哈希、文件列表、“已分析”不能替代推导。
5. 冻结后分配单一正文 owner：业务规则在 spec，接口/字段在 api/database-contract，HOW 在
   design/技术详设，验证在 tests。其他正文引用权威段落和稳定 R/E/C/任务 ID，不重复抄决定。
   改动应替换当前段落；旧推导、撤销范围和旧结论移到明确历史记录，不混在现行合同中。
   更新入口/任务后同步 traceability、Prompt 与 coverage；独立评审逐项核对旧引用与当前范围。

### 评审侧：独立核验关键结论

source-contract reviewer 从原始需求和当前源码建立核对范围，不接收生成侧聊天推导。
按风险选择代表性关键结论，至少一项；所有发现冲突、未挂载、生效范围、复用副作用、
字段约束、事务或循环终止的相关结论必须核验，不能选一项简单结论充数。
复读实际调用者及被调方法/Mapper/DDL，尝试推翻当前结论，记录实际依据、反例条件和理由。
结构 PASS 只证明声明/引用一致；独立核验也不是模型诚实或源码完整性的防伪签名。

在已有 `coverage.entries[].investigation` 写：

```json
{"status":"VERIFIED","canonical":{"sourceRef":"S_AUDIT","lineStart":12,"lineEnd":12,"text":"现行冻结卡的原文"},
 "evidence":[{"sourceRef":"S_CODE","lineStart":20,"lineEnd":21,"text":"这两行源码的精确文本"}],
 "counterexample":"若真实调用方未注册，此生效结论不成立"}
```

canonical 引用 contract 来源，evidence 引用 code 来源，均复用 sources 的 ID/哈希。
锚点行号从 1 起，text 为整段行的原文（只忽略两端空白/换行风格）；只保存必要短片段。
EXCLUDED/VERIFY_EXISTING 入口也须调查，不以排除免核验；多个决定引用同一入口调查，不复制。
FIX decision 添加 `taskIds:["2.1"]`，引用 tasks.md 的实际 checkbox ID；勾选进度不改变 ID。
任务索引复用已分发 Python 报告 linter 的正文解析；任务模式在擦除块之前按列表容器
区分缩进代码与真实嵌套任务，过滤根级/列表内围栏和HTML注释，拒绝重复 ID。普通报告
保留默认解析模式；字段值来源只接受 code|contract，此资格不随 checkCode=false 放宽；
缺少 Python/解析器时给修复提示，不回退到全文件正则。历史任务移出当前 tasks.md。
source-contract round 添加 `sourceChecks:[{entryId,result,evidence,rationale,counterexample}]`；
result 为 CONFIRMED / CONTRADICTED / SOURCE_INVESTIGATION，evidence 同上述源码锚点。
非 CONFIRMED 不准就绪；有冲突须先改 canonical 正文并重新独立核验，禁止只刷哈希。
脚本核非空/来源/片段身份与任务引用，不能判断选取是否充分、推导是否成立、评审者是否独立。

### 明确映射的字段容量

Agent 已核实某字面量直接写入某字段时，在既有 entry 中添加 `valueConstraints`：

```json
[{"kind":"string-capacity","field":"summary",
  "schema":{"sourceRef":"S_DDL","lineStart":8,"lineEnd":8,"text":"`summary` varchar(20) DEFAULT NULL,"},
  "values":[{"sourceRef":"S_CODE_OR_DESIGN","lineStart":30,"lineEnd":30,
             "text":"const state = \"START_PENDING\";","value":"START_PENDING"}]}]
```

这是已明确绑定后的窄检查，不扫描全仓猜业务关系。schema 必须是 code 来源中单个列的
CHAR/VARCHAR 声明；values 可引用 code 或 contract 中带引号/反引号的直接 ASCII 字面量。
脚本从实际映射片段读容量和字面量，拒绝超长；不支持表达式、转义、字符集转换、未明确列
或实际 schema 未知时归 SOURCE_INVESTIGATION，由 Agent 继续调查，不伪装自动验证正确。
字段映射、全部值覆盖、DDL 运行适用性仍由独立评审核实；短值通过不证明实际写入该字段。
实施编辑 Hook 的既有 checkCode=false 保留源码可修改规则；新派发/coding-ready 用当前源码
重核锚点/指纹。旧执行证据不被追溯改名为未测试，也不作为当前新版语义闭合证明。

## 凭证扩展

下面是 `coverage` 最小结构，添加到现有三轮凭证，不替换其它字段。
`sources.path` 相对 change 目录，可引用授权范围内的跨仓文件；在线来源保存带 URL、
原文和确认上下文的本地快照。SHA-256 是文件字节哈希，不是 handoff 的规范化哈希。
不要复制源码正文；只登记定位与指纹。`sourceRefs` 均引用 sources 中的 ID。

```json
{
  "schemaVersion": "superflow.review-coverage.v1",
  "sources": [
    {"id":"S1","role":"requirement","path":"source-ingestion.md","sha256":"<64 hex>"},
    {"id":"S2","role":"code","path":"../../../src/caller.ts","sha256":"<64 hex>"},
    {"id":"S3","role":"contract","path":"tests.md","sha256":"<64 hex>"}
  ],
  "requirements": [
    {"id":"R1","statement":"用户确认的完整约束，保留允许行为和结果边界","sourceRefs":["S1"]}
  ],
  "entries": [
    {"id":"E1","kind":"browser","actor":"指定角色","route":"页面动作 -> 实际请求路径","sourceRefs":["S2"]}
  ],
  "decisions": [
    {"requirementId":"R1","entryId":"E1","disposition":"FIX","rationale":"该入口适用此需求，详见设计","currentBehavior":"当前实际行为","targetBehavior":"保留允许动作并约束归属","sourceRefs":["S1","S2"],"caseIds":["C1"]}
  ],
  "cases": [
    {"id":"C1","entryId":"E1","level":"browser","action":"角色从实际页面执行动作","sourceRefs":["S3"],
     "assertions":{"response":"约定成功结果","state":"归属及查询结果正确","forbiddenEffects":"不会创建独立资源"}}
  ]
}
```

- 每个 requirements × entries 组合必须有唯一 decision。按已界定 change 范围登记，
  不扫描无关全平台。EXCLUDED 必须有 requirement 来源和具体理由、空 caseIds；
  FIX/VERIFY_EXISTING 必须有对应入口的用例，不接受拿另一条接口用例顶替。
- `kind`/`level` 为 `browser|api|job|event|library|cli`，用例等级必须匹配入口。
- `source-contract` 和 `e2e-environment` 轮都添加
  `"reviewedPairs": [["R1", "E1"]]`，覆盖全部组合（包括排除项），不得填完即视为审查完成。
- 先完善权威文档与清单，再刷新 handoff，再由 Agent 三轮核验当前内容、填写 coverage
  文件指纹及评审记录，最后执行 coding-ready。未关闭发现保留，禁止刷 hash 冒充复审。

## 验证与失效

`superflow-document-audit.mjs` 校验内容和清单；coding-ready 绑定评审文件指纹。
CLI/托管启动重算 handoff 和所有来源指纹；编辑 Hook 同步核验文档与评审，但允许实现阶段
源码变化。复用 handoff 既有规范化：任务勾选、test-report 回填不使合同失效。
新 Prompt 派发前若前一批已改变入口源码，主 Agent 检查影响并刷新相应评审，不能盲目更新指纹。
coding-ready 复检失败会写 BLOCKED 撤销旧 READY。

升级后已有评审文件仍可读取；缺 coverage/reviewHash 的旧文档交付不能用于新的启动，
需按上述步骤补齐复审，不能填空对象绕过。已启动托管 Run 的恢复协议不变。
直接编辑 Hook 遇旧凭证也需补齐；这属于修复旧门禁误放行，不自动重写项目资料。

验收阶段沿同一 R/E/C ID 在 `test-report.md` 回填实际角色、动作、请求路由、状态/
副作用断言、原始日志路径及结果。主 Agent 对照原始来源和实际证据，不只看测试汇总。
计划用例不是执行证据；API-only 不能报页面 E2E 成功。脚本未验证业务语义的部分不得宣称自动保证。
完整 SDD 报告使用唯一的逐用例执行证据表，供现有 report lint 核对冻结索引：

| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |
|---|---|---|---|---|
| C1 | E1 | browser | PASS | logs/C1-receipt.json |

结果只用 `PASS/FAIL/BLOCKED/PARTIAL`；证据路径指向实际命令输出、浏览器 trace、
响应或数据库对账记录。PASS 的本地证据文件必须保留到验收并可读取；远端资料须保存为本地可核验证据。阻塞项在报告正文写明原因。表格仅证明用例逐项回填，不能证明
证据内容正确。任何非 PASS 用例存在时，不得声明整体验证 PASS。

## 可重放执行凭证（0.5.17）

PASS 的证据路径现在必须指向本地 `superflow.execution-receipt.v1` JSON；不得以空文件、任意文本、远端 URL 或测试总数代替。旧报告保留 PARTIAL，补齐受影响证据后再整体 PASS。

凭证字段：`caseId/entryId/level/status=PASS/executed>=1/evidenceKind`；`command{argv,exitCode=0,output,sha256}`；`sources[{path,sha256}]`；`build{id,artifact,sha256,sourceFingerprint}`；`target{service,route,kind,buildId,buildSha256,sourceFingerprint}`；`assertions[{id,expected,actual,result=PASS}]`。路径相对凭证文件，可使用授权跨仓源码；输出需保留可读取的原始日志。源码指纹为 sources 按 `path:sha256` 排序后以换行连接的 SHA-256（末尾无换行）。构建与运行目标必须关联同一指纹和产物；Agent 仍核对构建命令与实际进程/镜像。

命令输出中每个用例包含一个 JSON 行执行事件，携带 `caseId/entryId/level/status/executed/assertions/persistence`，与凭证相同。普通日志可混排；未知 ID、零执行、SKIP、占位或缺少断言事件不可 PASS。一个日志可包含多个用例，各凭证分别定位自己的事件。

冻结入口可增加 `service`（默认 entryId）、`persistence:[{table,field}]`；用例默认 `evidenceKind=real`，只有冻结合同明确允许时才填 `controlled-simulation` 或 `unit`。两个服务写同表也必须分别登记入口和源码链，不得交换证据。

持久化写入用例在 `assertions.persistence` 冻结 `[{id,table,field,expected,allowNull?}]`，凭证/原始事件同名数组追加 `before{businessId,value}`、`after{businessId,value}`、`result`。业务 ID 一致且 after.value 等于冻结预期；新增/改字段用非空预期，历史 NULL 明确 allowNull。字段索引存在、mock 参数赋值、全 NULL 数据不能证明写入。

独立评审必须检查实际 Service 调用的精确 Mapper statement 和所有写入链、运行目标、原始断言及旧通知/新申请隔离；报告的“实现已补齐”必须与源码和运行证据一致。哈希和结构不保证日志真实或断言充分，不能当作防伪签名。该扩展不增加托管协议或状态 owner；纯文档/非行为轻量任务不强加 DB 验收。

原始用例事件还必须携带 evidenceKind/sources/build/target 和 command{argv,exitCode}，与凭证完全一致。build.command{argv,exitCode,output,sha256} 引用构建原始日志，其中包含 JSON 行 {event:"build",buildId,sourceFingerprint,artifactSha256,argv,exitCode:0}；日志与实际构建/运行仍由独立评审核验。最终汇总仅取最后一个中英文一致的“验证结果/Verification Result”，历史记录与代码块示例不用于晋升。

## 数据库分层合同

本节扩展已有 coverage/receipt v1，不增加 Skill、Hook 或状态 owner。
语义评审发现持久化、字段展示、CAS、事务或查询语义影响时，必须在相应入口声明
`database`；纯逻辑任务明确无持久化影响的理由后可免数据库验证。不能靠 SQL 关键词猜风险。

- `case.testLayer` 为 `logic|sql-binding|database|http-entry`，与真实入口 `level` 分开。
  logic 可 Mock 隔离逻辑；sql-binding 只证明 SQL 生成/绑定。必要 case 集合必须至少包含
  一个 `database` 或 `http-entry` 且 `evidenceKind=real` 的用例；辅助层不强迫连接数据库。
- `entry.database={engine,major,schemaSourceRefs,statements:[{sourceRef,id}]}` 冻结实际引擎、
  主版本、schema 来源和精确生产 statement。MySQL 不得被 H2/SQLite 替代。
  schema 与 Mapper XML 引用既有 sources，纳入 receipt 源码指纹；匿名 SQLite 仅验证 harness。
- 数据库用例冻结 `statements:[{sourceRef,id}]`、
  `mockBoundary={allowed:[外部客户端],forbidden:[必测Service/Mapper]}` 及
  `databaseAssertions:[{id,kind,expected}]`。`kind` 是合同定义的观测类别：
  写入包括 `affectedRows` 和 `unchangedRows`，后者必须冻结非目标记录和旧轮次实际快照；
  其他风险由 Agent 按需求冻结断言，不由脚本推测业务规则。
- receipt 和原始用例事件回填同一 `testLayer`、`mockBoundary`、
  `database={engine,major,statements,assertions:[{id,kind,expected,actual,result}]}`。
  保留原始命令、构建、入口与源码版本绑定；数据库 assertions 实际值必须等于冻结预期。
  字段写入继续使用 `assertions.persistence` 与同业务 ID 的 before/after/expected，
  不能用 Mock 参数、NULL、字段键或影响行数独自证明写入。
- `http-entry` 若承担 DB 义务，必须走真实 HTTP → 生产 Service/Mapper → 同类型 DB，
  同时执行返回、持久化和隔离断言；直接 Mapper 回放不能冒充 HTTP 或 browser 验收。
- 旧非持久化合同保持兼容；旧持久化 PASS 缺新合同保留 PARTIAL。必要 DB 环境不可用时
  记录 PARTIAL/BLOCKED 和原因，不把辅助 Mock/sql-binding 绿灯晋升为完整 PASS。
  历史证据绑定固定入口、源码/构建版本和 DB 引擎时仍有效；当前源码改动需要新证据，
  不得把历史版实际测试误说成没测试，也不能把旧结果用于当前新版本。

正例：逻辑与 SQL 绑定辅助用例 + 真实生产 XML/MySQL 数据断言；纯逻辑有明确无持久化影响理由。
反例：必要集合只有 Mock、HTTP 绕过生产 Mapper、引擎/statement/边界/来源错配、
漏字段实际 NULL 却填 PASS。文档生成后在 source-contract 与 e2e-environment 两轮独立审查
这些正反例；结构检查只确认冻结与观测一致，充分性和真实生产链留给独立 Agent。

`unchangedRows.expected` 必须是按稳定业务 ID/轮次键索引的非空行快照对象；
`actual={before:{业务键:行快照},after:{业务键:行快照}}` 保留两次真实查询值，
before 与 after 均须匹配冻结 expected。布尔成功标志不能替代快照。
所有 JSON 观测递归保留类型：boolean 不等于 number（如 true 不能证明影响行数 1），
数组/对象中的字段同样适用；具体业务键与快照字段由文档与独立评审决定。

Git 交付路径还会对 tracked 报告依赖（receipt、原始事件、构建、源码、schema/合同）核对标准化 index 对象；仅在工作树修正不能证明待提交快照。未受版本控制的私有证据不强制提交；当前源码/构建适用性仍由独立评审判断。

## 声明式执行上下文与证据复用

沿用 coverage/receipt v1；需要跨轮复用对命令、工作目录或调用环境敏感的检查时，
由文档 owner 在 tests.md 与对应 case 中冻结
`executionContext={argv:[命令参数],cwd:相对change目录的工作目录,environmentKeys:[变量名]}`。
argv 必须非空且逐项明确；cwd 使用相对路径，不使用盘符或绝对路径。作用范围仍由任务授权
和源码/合同决定，cwd 声明不授予额外读取权限。执行者不能临场改变此合同。

当前支持的环境项仅为 PATH、PATHEXT、NODE_ENV、NODE_OPTIONS、LANG、LC_ALL、TZ、JAVA_HOME；
只选择影响本条验证命令的项。密码、token、账号凭据和完整环境不进入合同或凭证。
命令需使用项目验证入口并从运行时读取认证，不能为填写 argv 把秘密写进命令/文档。
变量缺失与空值不同：每项摘要为 UTF-8 SHA-256(JSON.stringify(字符串值或 null))；
receipt 和原始事件记录
`executionContext={cwd:实际规范绝对目录,environmentSha256:{已选变量名:摘要}}`。
这些观测必须由实际执行入口生成，不由 Agent 根据预期手填。

既有 lint 检查：实际 command.argv 与冻结 argv 相同；receipt/原始事件上下文相同；
cwd 对应当前 change 的冻结相对目录；已选环境摘要与运行 lint 的当前调用环境一致。
因此复核应在 tests.md 的同一调用环境中执行。无关环境项变化不使证据失效；已选项、
命令、目录、源码、构建或实际入口变化不能用旧结果关闭当前完整 PASS。
此绑定不证明远端服务的启动环境；服务/数据库引擎、生产链与证据充分性仍须独立评审。

未声明新字段的历史合同继续按已有源码/构建/入口规则核验，保留其原结论，不能声称
已按此新增上下文要求核验。声明后缺观测、形状错误或错配必须补证据，不能把旧记录改成
预期值。若需要修订冻结合同，返回文档 owner 重新评审，而非执行者放宽检查。
