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
| C1 | E1 | browser | PASS | logs/C1-trace.zip |

结果只用 `PASS/FAIL/BLOCKED/PARTIAL`；证据路径指向实际命令输出、浏览器 trace、
响应或数据库对账记录。PASS 的本地证据文件必须保留到验收并可读取；远端证据可用
HTTP(S) 链接。阻塞项在报告正文写明原因。表格仅证明用例逐项回填，不能证明
证据内容正确。任何非 PASS 用例存在时，不得声明整体验证 PASS。
