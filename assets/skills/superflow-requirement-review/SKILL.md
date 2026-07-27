---
name: superflow-requirement-review
description: 对已澄清或已形成 OpenSpec/SDD 草案的需求和设计执行源码驱动的反向评审，主动发现闭环缺口、事实冲突、遗漏场景、过度设计、欠设计、API/UI/DB/tests 漂移及不可验证合同，并推动整改和复审闭环。Use when the user asks for 需求评审、反向评审、挑战需求、找遗漏、查错误、检查可测性、评审设计是否走偏、检查过度设计，或要求在 Superflow docs/design/implementation 前做独立审查。
---

# Superflow Requirement Review

对当前 OpenSpec change 进行独立、对抗式但基于证据的反向评审。评审不是旁路建议：
阻塞级问题必须回写并修正文档，复审通过后才能离开 docs 阶段。

## 边界

- 在复杂需求完成逐功能澄清、形成可评审文档草案后使用。
- 不替代 `superflow-clarify` 的 owner 决策确认，也不替代源码、Mapper/SQL、DB 和
  真实调用方核查。
- 不创建平行需求体系；产物必须落在当前 `openspec/changes/<change>/`。
- 不只输出意见清单。发现成立的问题后，必须修正 canonical 文档并复审。
- 不为了“解决遗漏”增加没有真实需求或复用证据的表、接口、服务、缓存和状态。

## 必须读取

按当前任务范围读取：

- 原始需求索引：`source-ingestion.md`、`feature-inventory.md`、`feature-gates.md`
- 合同：`proposal.md`、`api.md`、`specs/**/spec.md`、`design.md`
- 证据：`source-code-audit.md`、`database-contract.md`、`release-sql.md`
- 交付：`tasks.md`、`tests.md`、`traceability-matrix.md`、
  `review-checklist.md`、`sdd-quality-gate.md`、`test-report.md`
- 当前源码、Mapper/XML、真实前端/小程序/H5 调用方、sibling repo，以及必要的
  只读数据库证据

缺少某类文件时记录为评审发现，不得凭聊天记忆补结论。

## 评审流程

### 1. 冻结评审基线

记录 change、当前 phase、需求来源、功能范围、handoff hash 和已确认/待确认决策。
一次只评审一个已冻结功能；不得把下一功能的问题混入当前结论。

### 2. 建立证据资格

先完成平台影响面发现，再回到源码、Mapper/SQL、真实调用方和必要的只读 DB。
understand-anything 只作定位。将证据标记为 `current`、`legacy`、`unmounted`、
`data-model-only`、`owner-confirmed` 或 `blocked`。

仓库和数据库能查明的事实不得转问用户。只有 owner 取舍才进入澄清，并且一次只问
一个决策问题。

所有未决项先按解决责任分类，禁止统一写成“外部待确认”：

- `SOURCE_INVESTIGATION`：源码、依赖、配置、日志或只读数据库可以查明。评审者必须
  继续调查，未查完不得退出评审，也不得转问用户。
- `OWNER_DECISION`：存在两个以上成立方案，需要产品或业务 owner 取舍。返回
  `superflow-clarify`，一次只问一个问题。
- `EXTERNAL_CONTRACT`：第三方请求/响应、签名、幂等、枚举、回调或跨服务责任合同。
  只要会改变 API、SQL、状态机、安全实现或测试断言，就属于实现阻塞项，必须取得
  合同证据后才能 PASS；“已在文档标记 Blocked”不算关闭。
- `EXECUTION_EVIDENCE`：已经冻结实现合同，仅等待部署、真实调用、迁移或运行证据。
  可以留在 tests/test-report 阻塞交付，但不得伪装成合同未知项。

### 3. 六向反查

逐项从结果反推前提，不能只沿设计正向复述：

1. **业务闭环**：输入、触发、前置条件、处理、输出、异常、恢复、取消/重复动作。
2. **源码事实**：真实入口、全部写入方、读取/过滤方、遗留能力、跨仓消费者、DB样本。
3. **合同一致性**：PRD/截图、UI、API、DTO/VO、DB、状态枚举、SQL、tests 和 tasks。
4. **失败与边界**：越权、并发、幂等、超时、不确定结果、乱序回调、部分失败、脏数据。
5. **复杂度减法**：重复字段、平行接口、无必要 Service、缓存/MQ/定时任务、推测性兼容。
6. **可交付性**：每条需求是否有实现任务、RED/GREEN、真实入口、DB/log证据和验收口径。

涉及数据库时必须使用 `superflow-table-impact-analysis`，或在不可用时按同等规则降级
执行并记录原因。

### 4. 记录发现

创建或更新当前 change 的 `requirement-review.md`：

```markdown
---
change: <change-name>
review_verdict: BLOCKED
implementation_readiness: BLOCKED
open_blockers: <number>
open_external_contracts: <number>
open_source_investigations: <number>
open_owner_decisions: <number>
---

# 需求反向评审

## 评审基线
- change：
- phase：
- 功能范围：
- 来源与证据：
- handoff hash：

## 闭环矩阵
| 功能点 | 输入/触发 | 处理 | 输出 | 异常 | 恢复/重复 | 证据 | 结论 |
|---|---|---|---|---|---|---|---|

## 评审发现
| ID | 等级 | 维度 | 位置 | 问题 | 证据 | 影响 | 最小修正 | 状态 |
|---|---|---|---|---|---|---|---|---|

## 未关闭阻塞项
| ID | 分类 | 影响的实现合同 | 解决责任 | 下一证据/问题 | 状态 |
|---|---|---|---|---|---|

## 过度设计与欠设计
| 设计项 | 现有复用 | 必要性 | 删除/保留结论 | 证据 |
|---|---|---|---|---|

## 复审结论
- BLOCKED / PASS
- 未关闭发现：
- 已修正文档：
- 仍需 owner 决策：
```

等级只能使用：

- `BLOCKER`：需求事实、API/DB/状态、安全、真实入口或验收合同错误，阻塞推进。
- `IMPORTANT`：高概率造成遗漏、返工或不可测，必须在 docs 阶段修正。
- `SUGGESTION`：不影响合同正确性的改进建议，可由 owner 决定。

### 5. 整改

每个成立的 `BLOCKER/IMPORTANT` 必须：

1. 修正原始 canonical 文档，而不是只修改 `requirement-review.md`。
2. 同步 API、design、spec、SQL、tasks、tests、traceability 和 quality gate 中受影响项。
3. 记录“问题 → 修正文件 → 测试/证据”的闭环。
4. 若修正改变 owner 已确认合同，停止并回到 `superflow-clarify`。

### 6. 独立复审

整改后重新从需求来源和源码证据检查，不以“文档已经修改”为通过依据。

通过条件：

- 所有 `BLOCKER/IMPORTANT` 已关闭并有文件与测试证据。
- 没有未解释的 UI/API/DB/SQL/status/tests 漂移。
- 复杂度减法结论成立，没有无证据的新抽象。
- `SOURCE_INVESTIGATION` 已穷尽并回写证据，数量为0。
- owner 决策均已记录，`OWNER_DECISION` 数量为0。
- 会改变实现的 `EXTERNAL_CONTRACT` 已取得证据并冻结，数量为0；仅写成
  `Blocked`、分配 owner 或列入任务不算关闭。
- 剩余项只能是不会改变实现合同的 `EXECUTION_EVIDENCE`，并已进入测试/发布门禁。
- `requirement-review.md` 结论为 `PASS`。
- front matter 精确记录 `review_verdict: PASS`、`implementation_readiness: READY`、
  `open_blockers: 0`、`open_external_contracts: 0`、
  `open_source_investigations: 0` 和 `open_owner_decisions: 0`。

### 7. 刷新门禁

文档修正后刷新 handoff，并运行 docs guard 与 OpenSpec strict validate。将
`requirement-review.md` 路径、复审结论和未关闭项同步到 `sdd-quality-gate.md` 与
`test-report.md`。

## 禁止项

- 禁止只按文档文字评审而不核源码和真实入口。
- 禁止把数据模型可表达能力当成当前产品行为。
- 禁止用“字段非空、接口200、编译通过”替代业务语义正确。
- 禁止为了覆盖边界而虚构默认值、fallback、状态或兼容层。
- 禁止把评审结果落到其他流程目录，导致 OpenSpec change 无法追踪。
- 禁止未关闭阻塞问题却将 docs/design 标为通过。
- 禁止以“文档已记录”“已有 owner”“待联调”关闭会改变实现的外部合同。
- 禁止 `review_verdict: PASS` 与 `implementation_readiness: BLOCKED` 并存。

## Handoff

评审通过后继续当前 Superflow 阶段；若发现 owner 决策缺失，返回
`superflow-clarify`；若发现文档合同缺失，返回 `superflow-docs` 并在修正后再次执行
本 skill。
