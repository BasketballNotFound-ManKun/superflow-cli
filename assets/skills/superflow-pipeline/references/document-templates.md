# 文档格式模板

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

## Detailed Design
详细设计

## API Design（如有）
接口设计

## Migration Plan
迁移计划（如有）

## Risk Assessment
风险评估（并发、性能、兼容性）
```

## Tasks 格式

```markdown
# Tasks: <功能名称>

## 需求级汇总 SQL 文件
- 路径：`openspec/changes/{change-id}/sql/{汇总SQL文件名}`（如 `sql/{version}.sql`）
- 所有新增表、改表、索引、默认值、初始化数据脚本统一追加到该文件
- 禁止各任务各自新建独立 SQL 文件
- 不需要 SQL 的任务也需写明"本任务不新增 SQL，但开始前仍需核查依赖表结构是否已满足设计"

## 1. Requirement A 实现
- [ ] 1.1 修改 `FilePath.java`，在 `methodName()` 中增加 X 逻辑
  - 源码锚点：`FilePath.java:line-start-line-end`
  - 验收标准：调用 Y 接口后，Z 状态变为 W
  - 依赖的汇总 SQL：`openspec/changes/{change-id}/sql/{文件名}` 第 XX-XX 行（或"本任务不新增 SQL，但开始前仍需核查依赖表结构"）
  - blocked by: 无
- [ ] 1.2 修改 `FilePath2.java`，调整 `methodName2()` 返回值
  - 源码锚点：`FilePath2.java:line-start-line-end`
  - 验收标准：单元测试通过
  - 依赖的汇总 SQL：`openspec/changes/{change-id}/sql/{文件名}` 第 XX-XX 行
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
