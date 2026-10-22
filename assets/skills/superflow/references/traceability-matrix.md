# 需求—入口—实现—测试追溯

## 唯一关系源

既有 `.sdd/reviews/document-review.json` 的coverage拥有来源、原需求、真实入口、用例和
`decisions.taskIds/caseIds`关系。traceability-matrix.md是其可读导航，不另建一套状态或编号。
Task存在性沿tasks索引，任务状态由原checkbox持有；实现位置由HOW与当前源码/独评清单持有，
用例结果与证据由test-report/真实回执持有。矩阵引用它们，不复制业务决定、SQL、命令或PASS。

## 可读矩阵

| Requirement ID | Entry ID | Decision | Task IDs | Case IDs | HOW / implementation | Current evidence |
|---|---|---|---|---|---|---|
| R1 | E1 | FIX | 1.1 | C1 | design/HOW的具体章节及当前源码引用 | test-report的当前用例行 |
| R1 | E2 | VERIFY_EXISTING | 无新增任务 | C2 | 当前调用链来源 | 真实执行或缺口 |
| R1 | E3 | EXCLUDED | 无 | 无 | 原需求排除依据 | 不冒称验收 |

## 双向核对

1. 原需求→真实入口：逐原需求核行为，不只穷举已列矩阵。
2. 写方法/SQL/字段→所有调用者：搜索单条、批量、内部/异步重存、任务/事件及旁路；
   将新发现的入口补入同一entries/decisions/cases，刷新受影响任务与评审。
3. 实际请求→归属/快照→写点：读取UI/SDK/调用者真实payload；必需字段的来源由谁补齐，
   不能由测试补造一个真实调用者没有的值。内容快照与版本/标识来自同一观察时点。
4. 写点→事务/代理/副作用：标出自动提交、同事务、提交后、异步及异常吞掉的边界；
   用“业务写成功但关联守卫/版本未提交”的交错反例检查，不能只验证串行过期。
5. 用例→实现与原需求：测试入口、条件和断言真正触发该分支；相同响应或手工改数据库不
   自动证明另一个业务入口。禁止副作用用非空、可区分的数据验证。
6. 主/批Prompt→同一Task/Entry/Case：使用[导航表](implementation-prompt-template.md#execution-navigation)，
   批次只持增量。公共合同在canonical owner核对，不把Prompt当设计完整性证明。

## 职责与收口

脚本核已登记ID、链接、来源身份与关系闭合，不能证明入口全集、实际读取或断言充分性。
source-contract Reviewer按上述反查证伪；代码Reviewer另核当前diff与未改调用者。
新入口或消费者改变合同先修唯一正文owner及引用，再冻结/复评。当前用例PARTIAL则
矩阵链接当前PARTIAL，不以历史PASS或完整coverage矩阵替代验收。授权延期、缓解与修复分别记录。
