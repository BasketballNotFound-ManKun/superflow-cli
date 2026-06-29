# SDD 全链路文档质量标准

## 文档生成强制顺序

```
spec.md 定稿
    ↓
design.md（OpenSpec/SDD 合同骨架：需求/API/DB/字段语义/真实入口/验收边界）
    ↓
docs/superpowers/specs/*-technical-design.md（Superpowers 源码级 HOW：代码锚点、实现路径、TDD/RED、团队分工）
    ↓
tasks.md（按 design 切割，原子任务，标注依赖）
    ↓
tests.md（按 spec Scenario 生成测试用例和验收标准）
    ↓
review.md（设计评审，检查 spec → design → tasks → tests 一致性）
```

**生成每个文档前必须确认：**
- [ ] 是否阅读了所有涉及的源码文件？
- [ ] 是否引用了具体的类名、方法名、行号？
- [ ] 每个 Requirement 是否都有对应的设计方案？
- [ ] 每个 Scenario 是否都有对应的测试用例？
- [ ] 任务之间是否有未声明的隐式依赖？
- [ ] 是否有数据库 schema 变更（DDL）需要同步？

---

## 嵌入式变更（embedded change）文档完整性强制清单

每个子变更（embedded change）必须包含以下文件，**缺一不可，禁止以任何理由省略**：

| # | 文件 | 作用 | 禁止省略的理由 |
|---|---|---|---|
| 1 | `.openspec.yaml` | OpenSpec 元数据 | 否则 change 无法被识别和归档 |
| 2 | `api.md` | 接口契约 | 研发 agent 不知道接口定义 |
| 3 | `spec.md` | 需求规格 | 没有需求基线，无法验收 |
| 4 | `design.md` | OpenSpec/SDD 设计合同（需求映射、API/DB/字段语义、真实入口、验收边界） | 研发 agent 不知道合同边界 |
| 4.1 | `docs/superpowers/specs/*-technical-design.md` | Superpowers 源码级 HOW（代码锚点、实现路径、TDD/RED、团队分工） | 研发 agent 不知道怎么安全开发 |
| 5 | `tasks.md` | 研发任务（IVTC 原则、原子任务、blocked by） | 任务粒度失控，无法追溯 |
| 6 | `tests.md` | 测试用例（L1-L4、curl 示例、**失败修复指南**） | 测试失败时无修复指引 |
| 7 | `review-checklist.md` | 代码评审清单 | 评审无标准，质量不可控 |
| 8 | `sdd-quality-gate.md` | 质量门检查项 | 无法判断交付是否合格 |

**绝对禁止的理由**：
- ❌ "这个改动小，不需要 design.md"
- ❌ "tests.md 简单写几行就够了，不需要失败修复指南"
- ❌ "review-checklist 太麻烦，跳过"
- ❌ "sdd-quality-gate 后面再补"

**正确做法**：无论改动大小，上表 8 个文件全部生成，且相互引用一致后，才能标记该子变更为"文档完成"。

---

## 1. Proposal 质量要求

**输出路径**：`doc/openspec/changes/<change-id>/proposal.md`

**必须包含**：
```markdown
# Proposal: <功能名称>

## Why
- 列出当前问题（引用源码位置）
- 描述影响范围

## What Changes
- 列出具体变更点
- 引用涉及的源码文件

## Impact
- Affected Specs
- Affected Code（文件路径）
```

---

## 2. Spec 质量要求

**输出路径**：`doc/openspec/changes/<change-id>/specs/<feature>/spec.md`

| 检查项 | 要求 |
|---|---|
| Requirement 数量 | 每个功能至少 1 个 Requirement |
| Scenario 覆盖 | 每个 Requirement 至少 1 个 Scenario |
| 边界场景 | 涉及边界条件的必须单独写 Scenario |
| 可验收性 | 每个 Scenario 有明确的断言标准 |

---

## 3. Design 质量要求

**输出路径**：`doc/openspec/changes/<change-id>/design.md`

**必须基于事实编写**，禁止脱离 API、DB、真实入口、源码证据进行空洞设计。
源码级 HOW 的展开交给 Superpowers 技术详设，但 `design.md` 仍必须记录
影响面、合同边界和关键事实锚点。

| 检查项 | 要求 |
|---|---|
| 源码事实锚点 | 每个设计点必须引用已核实的源码、Mapper/XML、表结构或真实入口证据 |
| 变更矩阵 | 列出每个 Requirement 对应的合同影响点；源码级修改路径在 Superpowers 技术详设中展开 |
| 事务边界 | 涉及数据库变更的，必须明确事务边界（`@Transactional` / `transactionTemplate`） |
| 事件流 | 涉及事件发布的，必须画出事件流图（发布者 → 事件 → 监听器 → 处理逻辑） |
| 并发安全 | 涉及并发场景的，必须分析竞态条件和锁策略 |

**必须包含的章节**：
```markdown
# Design: <功能名称>

## Overview
设计概述

## Source/Contract Analysis
- 当前行为和合同分析（引用具体源码、Mapper/XML、DB、API 或真实入口证据）
- 差距分析

## Change Matrix
| Requirement | 合同影响 | 事实锚点 | 技术详设章节 |
|---|---|---|---|

## Superpowers Technical Design Handoff
- 技术详设：`docs/superpowers/specs/YYYY-MM-DD-<change-id>-technical-design.md`
- handoff_hash: `<sha256>`
- 边界：OpenSpec/SDD 管 WHAT/API/DB/tests，Superpowers 管源码级 HOW/执行编排

## API Design（如有）
接口设计

## Migration Plan
迁移计划（如有）

## Risk Assessment
- 并发风险
- 性能影响
- 兼容性分析
```

**接口契约附加要求**：
- 若设计涉及新增接口或修改接口出入参，必须先核对目标仓库现有 Controller、DTO、分页基类和历史 API 文档中的参数命名。
- 分页参数不得机械套用 `page/pageSize`、`pageNum/pageSize` 等模板名；必须与仓库现有主流口径一致，例如已有 `pageNo/pageSize` 时继续沿用。
- 设计文档、`api.md`、`tests.md`、实现 prompt 四处的参数名必须一致，禁止文档和实现出现两套命名。

---

## 4. Tasks 质量要求

**输出路径**：`doc/openspec/changes/<change-id>/tasks.md`

| 检查项 | 要求 |
|---|---|
| 原子性 | 每个任务必须是单一职责，一个任务只改一个文件或一个方法 |
| 可验证 | 每个任务必须有明确的验收标准（可以是代码审查标准或自测步骤） |
| 可追溯 | 每个任务必须关联到 spec.md 中的 Requirement 编号 |
| 依赖声明 | 任务之间有依赖关系的，必须明确标注 `blocked by: Task X.Y` |
| 源码锚点 | 每个任务必须指明修改的具体文件路径和方法签名 |
| SQL 依赖标注 | 每个涉及数据库的任务必须标注依赖的汇总 SQL 文件路径和行号范围 |
| 汇总 SQL 文件声明 | tasks.md 开头必须声明本需求汇总 SQL 文件路径，禁止各任务各自新建独立 SQL 文件 |

**必须包含**：
```markdown
# Tasks: <功能名称>

## 需求级汇总 SQL 文件
- 路径：`openspec/changes/{change-id}/sql/{汇总SQL文件名}`
- 所有新增表、改表、索引、默认值、初始化数据脚本统一追加到该文件

## N. Requirement N 实现
- [ ] N.1 修改 `FilePath.java`，在 `methodName()` 中增加 X 逻辑
  - 源码锚点：`FilePath.java:line-start-line-end`
  - 验收标准：调用 Y 接口后，Z 状态变为 W
  - 依赖的汇总 SQL：`{路径}` 第 XX-XX 行（或"本任务不新增 SQL，但开始前仍需核查依赖表结构"）
  - blocked by: 无
```

---

## 5. Tests 质量要求

**输出路径**：`doc/openspec/changes/<change-id>/tests.md`

| 检查项 | 要求 |
|---|---|
| Scenario 覆盖 | 每个 `#### Scenario` 至少对应 1 个测试用例 |
| 边界覆盖 | 必须包含边界条件测试（null、空集合、最大值、并发等） |
| 自动化标识 | 每个测试用例必须标注自动化可行性（`[自动化]` / `[需手工]`） |
| 前置条件 | 每个测试用例必须明确前置数据和环境状态 |
| 断言标准 | 每个测试用例必须有明确的断言标准（数据库状态、接口返回值、日志输出等） |
| 数据库结构核查 | 必须包含 SHOW CREATE TABLE / SHOW COLUMNS 等数据库结构核查用例 |
| 汇总 SQL 引用 | 必须引用本需求汇总 SQL 文件路径 |
