# 文档格式模板

生成范围与源码分析先消费[来源控制与交付范围](document-review-coverage.md#source-authority-and-delivery-scope)，在既有冻结卡记录实际读取、控制权和本轮义务。

## Behavior Decision Matrix

生成前由 Agent 依据真实改动、调用链与读写影响判断适用域，在现有 `.sdd/applicability.yaml`
的 `applicability.money` / `applicability.concurrency` 冻结 true/false 及对应文档依据；
此文件是唯一适用性配置，不在 OpenSpec 原生配置重复声明。false 时实际交付文档/Prompt 不复制该领域章节或
反复 N/A 关键词；不通过删正文、改措辞或设 false 掩盖真实金额/并发风险。已确认的
适用风险仍由现有领域检查与 Agent 语义评审核验，未知保留待调查而非 false。

在 design.md 维护唯一行为决策矩阵；proposal/spec/api/技术详设/tasks/tests 仅以 Decision ID
引用归属段落并保留各自必要细节。superflow-clarify 确认目标与范围，superflow-contracts
维护 WHAT/API/数据/验收，superflow-design 维护源码 HOW，superflow-handoff 只生成交接。
这是现有文档 owner 的索引，不新增状态、审批或事实源；需求尚未设计时先在 proposal
记录决策 ID，design 形成后迁入矩阵并回链。

| Decision ID | 已确认行为/排除边界 | Canonical owner（文件#段落） | 需求/入口 ID | Consumer references（proposal/api/HOW/tasks/tests） | 确认来源/状态 |
|---|---|---|---|---|---|
| <D-ID> | <条件→行为→副作用> | <唯一归属> | <R/E-ID> | <段落或任务/用例 ID> | <实际证据或未决> |

### Conflict resolution

生成或刷新交接前，当前文档 owner 逐行核对范围、默认值、拒绝策略、写入时点、事务与
回滚、验收。已确认范围内的陈旧摘要/非目标/任务/示例由该 owner 同步修复；改变用户
确认的行为才回澄清。冲突未消解、源码事实未知或需要新决策时保持未就绪，不能只写
“以某文档为准”后让执行者选一份。修复所有消费引用后，走既有交接刷新和评审门禁。

领域适用性从已确认范围和源码证据判断：并发、金额、数据库、外部集成各自独立激活。
不适用理由只在其 canonical owner 记录一次，其余引用；空表、占位值、示例和模板默认
均不构成决策，不因模板存在而新增该领域义务，既有适用的必测门禁不得降低。


## Proposal 格式

```markdown
# Proposal: <功能名称>

## Motivation
为什么需要这个功能

## Proposed Solution
提议的解决方案

## Alternatives Considered
考虑的替代方案
```

## Spec 格式

```markdown
# Spec: <功能名称>

## ADDED Requirements
### Requirement: <需求描述>
#### Scenario: <场景名称>
- **WHEN** <前置条件>
- **THEN** <预期结果>
- **AND** <附加条件>
```

## Design 格式

```markdown
# Design: <功能名称>

## Overview
设计概述

## Source Code Analysis
源码分析（引用具体文件、类、方法、行号）

## Change Matrix
| Requirement | 修改文件 | 修改方法 | 变更类型 |
|---|---|---|---|

## 复杂度减法评审
| 设计项 | 现有能力/复用证据 | 是否必要 | 最简实现 | 删除/拒绝项 | 证据/阻塞 |
|---|---|---|---|---|---|
| <表/API/Service/组件/同步机制> | <源码、接口、表或依赖锚点> | <保留/删除/阻塞> | <能够闭环的最小方案> | <不新增的抽象、字段、缓存、异步、兼容层> | <证据或待确认项> |

新增项统计：表 0；字段 0；API 0；Service/组件 0；缓存 0；MQ/事件 0；定时任务 0；兼容层 0。按实际设计替换数量，不适用时保留 0。
能够复用、推导或同步完成的能力不得另建平行实现；没有证据证明需要时默认删除。

## Owner 确认记录
行为级决策须在正文独立记录，填写实际日期、owner 和已确认结论：
`owner-decided: YYYY-MM-DD | owner: <姓名/角色> | decision: <已确认结论>`。
指引、引用块、代码示例、未填写占位符不作为凭证；门禁只检查结构和有效日期，
不替代 Agent 对决策来源与充分性的评审。

## Detailed Design
详细设计

## API Design（如有）
接口设计

## Migration Plan
迁移计划（如有）

## Risk Assessment
风险评估（并发、性能、兼容性）
```

## Tasks format

按可独立验证的能力切片，不按文件或技术层分票。必要准备随首次需要它的能力就绪；
Delivers持有结果，Verify/Cases只引用tests的唯一信号，不复制预期或命令。缺依赖先调查。

```markdown
# Tasks: <功能名称>

## 需求级汇总 SQL 文件
- 详设真源：`openspec/changes/{change-id}/release-sql.md`
- front matter 必填：`database_change: true`、精确 `target_sql_path`、
  `copy_policy: verbatim`、`sql_sha256`
- `release-sql.md` 只允许一个 `sql` 代码块，必须在详设阶段包含完整可执行的前置
  检查、DDL/DML、迁移和后置验证，不允许占位符或留给研发 Agent 补写
- 研发任务只把该代码块原样复制到 `target_sql_path` 并核对 SHA-256；禁止自行
  新建、追加、重排或改写 SQL。发现遗漏退回 `$superflow-contracts`
- 不需要 SQL 的任务也需写明"本任务不新增 SQL，但开始前仍需核查依赖表结构是否已满足设计"

## 1. Requirement A 最小可用路径
- [ ] 1.1 打通最小可运行路径及其适用验证
  - 源码锚点：`FilePath.java:line-start-line-end`
  - Delivers: 调用 Y 入口后，Z 状态变为 W
  - Verify: [已冻结必测信号](tests.md)
  - Cases: C1
  - 冻结 SQL：`release-sql.md` → `{target_sql_path}`，仅原样复制并核对 `sql_sha256`（或"本任务不新增 SQL，但开始前仍需核查依赖表结构"）
  - blocked by: 无
- [ ] 1.2 在首条能力成立后扩展下一条使用路径
  - 源码锚点：`FilePath2.java:line-start-line-end`
  - Delivers: 新调用方的可观察结果符合已冻结场景
  - Verify: [已冻结必测信号](tests.md)
  - Cases: C2
  - 冻结 SQL：`release-sql.md` → `{target_sql_path}`，仅原样复制并核对 `sql_sha256`
  - blocked by: 1.1
```

## Tests 格式

```markdown
# Tests: <功能名称>

## 0. 应用运行配置
- **配置文件**: `src/main/resources/application.yml`
- **端口号**: {port}
- **上下文路径**: {context-path}
- **基础 URL**: `http://localhost:{port}{context-path}`
- **启动命令**: `mvn spring-boot:run -Dspring-boot.run.profiles={profile}`

## 0.1 数据库结构核查（每个批次必须执行）
- **核查目标**: 确认开发环境数据库表结构与设计文档一致
- **汇总 SQL 文件**: `openspec/changes/{change-id}/sql/{文件名}`
- **执行步骤**:
  1. 连接开发环境数据库
  2. 对本需求涉及的每张表执行 `SHOW CREATE TABLE {表名}`，对照 design.md / database-contract.md 确认字段、类型、默认值、索引
  3. 对需要初始化数据的表执行 `SELECT COUNT(*) FROM {表名} WHERE {条件}`，确认初始化数据已存在
  4. 如果发现缺失，从汇总 SQL 文件中取对应脚本执行
  5. 执行后再次查询确认
- **断言标准**:
  - 所有设计要求的表、字段、索引、默认值在实际数据库中存在
  - 所有初始化数据已插入
- **自动化**: [自动化]

## N. Requirement N 测试

### Scenario: <场景描述>
- **前置条件**: 数据库状态 / 缓存状态 / 环境配置
- **接口 URL**: `http://localhost:{port}{context-path}{接口路径}`
- **请求参数**: JSON / Query / Path / Form
- **执行步骤**: 1. 启动应用 2. 调用接口 3. 验证结果
- **断言标准**:
  - 接口返回值：`code == 0`，`message == "xxx"`
  - 数据库状态：`SELECT ... FROM ... WHERE ...` 期望值为 N
  - 日志输出：日志中包含 `"xxx"`
  - 缓存状态：`CacheManager.get()` 返回期望值
- **自动化**: [自动化] / [需手工]
- **关联**: spec.md Requirement N → Scenario X
```

## tests.md：验证信号冻结

按 [test-guide.md](test-guide.md)选择项目适用信号，保留项目已有层级（如适用）。
在已有用例说明或表内表达改动/风险、用例 ID、信号、实际环境/后端、命令、断言、
证据位置及不适用依据/阻塞；不为模板另建固定表或层级。
数据库分层只继承 [document-review-coverage.md](document-review-coverage.md) 的
`testLayer` / `mockBoundary`；关键业务主流程和 Bug 复现优先复用项目场景回归资产。

操作链、合法空响应、异常回补与启动脚本按 test-guide.md 冻结；适用版本/快照场景
承接加载、成功后继续保存、辅助刷新/内部重存，以及内容与 token 同源、内容写与 bump
一致性、真实提交/回滚和外呼副作用的项目决策与 Case。tests.md 引用已有单命令入口
及已验证配置，不在模板中选择业务策略。报告逐组声明模拟/真实/浏览器边界。
