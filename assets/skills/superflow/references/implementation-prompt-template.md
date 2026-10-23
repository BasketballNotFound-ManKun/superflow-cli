# 实施主 Prompt 模板

## Thin Prompt Contract

产物是 `prompt/implementation.md`：一份执行导航，不是第二份业务设计。
所有执行模式使用以下同一形状；保留已声明 build_mode/isolation/tdd_mode/review_mode。
完整 HOW、算法、SQL 和命令分别只在 design/technical_design、release-sql、tests 持有。
读取 [Flow Owner](flow-owner.md) 与 [测试指南](test-guide.md)；独评由
[Reviewer 清单](reviewer-checklist.md) 持有，不在每批重复这些过程。

## 输出顺序

1. 目标、已确认授权、排除项和当前工作区。
2. **Canonical links**：唯一公共引用表，链接spec/API/design/technical_design/tasks/tests、质量门禁及按实际风险适用的专项/SQL合同；需要说明时，适用性结论只在这里记录一次。
3. **Execution navigation**：下表；**Acceptance IDs** 来自同一 coverage。
4. 执行策略和恢复位置：已有模式、依赖、当前未完成任务、test-report。
5. 交付对账：实际用例/入口/版本、未决 finding、独立复评及资源；Git控制单独核授权。

## Execution navigation

| Prompt | Task IDs | Entry IDs | Case IDs |
|---|---|---|---|
| [本执行](implementation.md) | 1.1, 1.2 | E1, E2 | C1, C2 |

单主Prompt时本行指自身。需要分批时，主表各行链接实际批次，例如
`[批次一](batch-a.md)`，由各批回链主Prompt并声明完全相同的ID集合。
Task存在性用当前tasks索引；Task/Entry/Case关系用现有
`coverage.decisions.taskIds/caseIds`、`coverage.cases.entryId` 核验。
VERIFY_EXISTING可无新增实现任务；EXCLUDED不伪造验收用例。
所有适用用例和任务都必须可导航，批次先满足真实前置依赖。

## 正文示例

```markdown
# 实施导航
## 目标与授权
完成已批准范围；Git、发布和归档按已确认授权分别执行。
## Canonical links
- [行为](../api.md)、[实现 HOW](../design.md)、[任务](../tasks.md)
- [验收与执行上下文](../tests.md)、[追溯](../traceability-matrix.md)
- [当前 handoff](../.sdd/handoff/sdd-context.json)
## Execution navigation
| Prompt | Task IDs | Entry IDs | Case IDs |
|---|---|---|---|
| [本执行](implementation.md) | 1.1, 1.2 | E1, E2 | C1, C2 |
## 执行策略
继承state中的模式，依任务依赖连续实施、验证、独评整改与实际复评。
当前恢复点和本轮运行证据写入../test-report.md；旧恢复点/结果归入其History或链接历史文件。
```

## 规范继承

保持 `context_compression`；核对state绑定与当前manifest，再按Decision/Entry/Case
索引读取风险所需canonical正文，不完整投影后又无条件重读同一原件。
`technical_design` 是源码级 HOW；字段/状态反向影响面及外部枚举、配置、并发/幂等、
金额精度等按实际风险链接已有canonical合同段落。无金额影响可在主入口用一句源码依据
说明；批次继承该结论。主导航继承约束，不重写业务方案。
数据库变更引用release-sql.md，只按其target_sql_path原样复制（verbatim）并核对sql_sha256；
实际值只在规范来源持有，Prompt不复制SQL、哈希或另一份执行命令。

## Owner 模式 Prompt 生成合同

当前Agent负责已授权实施与测试，协调必要独立Reviewer；保持原有team/subagent角色边界。
阶段汇报后继续依赖就绪任务。只在真实决策、权限/环境不可得、用户暂停及既有不收敛边界停止。
真实调用者或新入口改变设计时回当前文档owner修正文/消费者并重冻，再继续。
交付时引用当前实际独评及其历史/处置/复评链；未补必测或未决项保持PARTIAL/Blocked。
当前会话退出后不承诺后台唤醒；恢复点保留原任务、证据、资源和下一条动作。

运行test-report属于证据，在所有context_compression模式中只引用，不投影正文。
