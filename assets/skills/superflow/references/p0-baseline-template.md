# P0 基线任务模板

## 执行模式继承

读取 [Flow Owner](flow-owner.md)，继承技术详设和 state 中已选模式。普通新任务
默认 `owner`：当前 Agent 负责开发与测试执行，按风险及冻结合同协调独立核验；
team/subagent 模式继续按原角色与隔离要求执行。下文团队角色是责任清单，只有
合同要求独立 Tester 时才固定独立测试角色；不能把自测写成独立核验。阶段更新后
继续全部任务、验证、整改和交付，不为保存进度自动提交；文档模式不执行代码。


## 为什么需要 P0

复杂跨仓库需求中，实现 agent 经常在以下基线问题上出错：
- 工作树不干净，带着旧改动或脏文件开始开发
- 改了 SQL 但没同步改实体，字段不一致
- 改了实体但没同步改 Mapper/DTO，编译报错
- 不确定自己该改哪个仓库、哪个分支
- 业务和基线清理混在一起，难以回滚

P0 的目标：**在写任何业务代码之前，先把地基打牢**。

---

## Owner 模式 Prompt 生成合同

本文件的模式段用于生成实际 Prompt，不复制整个文件。
当已选 `build_mode: owner` 时，按以下结构生成本批实际 Prompt；不要复制后面的
Team/Subagent 执行剧本。必需合同、适用测试和独立核验义务仍完整继承。

1. **目标与边界**：用户授权、任务 ID、精确文件范围、前置任务、排除项与真实隔离方式。
2. **必读与源码级 HOW**：链接 handoff、api.md、design.md、tasks.md、tests.md、
   quality gate、review checklist、technical_design 及适用 release-sql.md。
3. **状态机执行决策**：记录 `build_mode: owner`、isolation、tdd_mode、review_mode、
   implementation_prompt；记录当前 Agent 实施/测试与必要独立 Reviewer/Tester 的实际职责。
4. **合同继承**：按本技能要求带入所有适用的语义、写入闭环、影响面与真实入口合同，
   以及冻结用例 ID、命令、断言和证据路径；不新增业务方案、不复制原始 handoff hash。
5. **持续执行**：依赖就绪任务→适用 RED/GREEN 与真实验证→必要独立评审→有效问题
   整改重测复审→现有 verify 门禁。进度更新后继续；只在真实停止边界返回。
6. **恢复与交付**：test-report 的 Owner Recovery、资源身份与清理、最终证据及剩余项
   对账；Git/发布/归档继承已确认授权，无授权时不执行。

## Team/Subagent 模式模板

以下执行剧本仅用于已选 team/subagent 模式；普通 owner 使用上面的生成合同。

## P0 Prompt 模板

```
使用 Superpowers 技能，按冻结执行模式持续完成开发、测试、必要独立评审与整改，闭环交付并更新测试文档和 api.md：

# P0 Prompt：基线核查与开发准备

你是 P0 基线 Agent，负责为后续业务开发建立干净、一致、可编译的基线。

## 团队要求
- owner 模式：当前 Agent 负责开发与测试，按风险及合同取得独立视角
- team/subagent 模式：按冻结角色分配 Worker 与独立 Tester
- P0 完成后由 Tester 独立复核基线和编译结果

## 本批目标
建立可编译、字段一致的代码基线，确认开发环境就绪。

## 并行开发要求（Worktree 隔离）

按冻结 isolation 执行；单写入者可使用专用 branch，多个写入者并行时必须隔离工作区。以下为已选 worktree 模式的示例：

```bash
git status --short
git worktree add -b feature/{change-id}-p0-baseline ../{project}-p0-worktree HEAD
cd ../{project}-p0-worktree
```

如果分支已存在，改用：

```bash
git worktree add ../{project}-p0-worktree feature/{change-id}-p0-baseline
cd ../{project}-p0-worktree
```

选择 worktree 时，所有基线核查、文档更新及已授权提交均在该 worktree 内完成。不要在主工作树直接开发，不要回滚或删除其他 agent 的改动。完成后在报告中写明 worktree 路径、分支名和提交号。

## 允许修改的仓库
{repository-name}

## 允许修改的目录/文件范围
- SQL 文件：{sql-file-path}
- 实体类：{entity-package}/*.java
- Mapper 接口：{mapper-package}/*.java
- Mapper XML：{mapper-xml-path}/*.xml
- DTO：{dto-package}/*.java

## 禁止修改的范围
- 禁止修改任何 Service/Controller/Listener 业务逻辑
- 禁止修改任何配置文件（application.yml 除外，如需调整数据库连接需上报）
- 禁止引入新的外部依赖
- 禁止提交 .DS_Store、target/、build/、.idea/ 等脏文件

## 依赖的前置批次
无（P0 是第一批次）

## 执行步骤

### 步骤 1：清理工作树
1. 执行 `git status`，确认当前分支是 {branch-name}
2. 如有未提交改动，先提交或暂存（stash）
3. 检查并删除以下脏文件（如存在）：
   - .DS_Store
   - target/
   - build/
   - *.iml
   - .idea/（已跟踪的除外）
4. 再次执行 `git status`，确认工作树干净

### 步骤 2：确认仓库和分支
- 当前仓库：{repository-name}
- 目标分支：{branch-name}
- 允许改动范围：{allowed-paths}
- 远程跟踪：确认 `git branch -vv` 显示正确 upstream

### 步骤 3：校验字段一致性
对照 design.md 或 database-contract.md 中的表结构定义，逐一校验：

| 检查项 | 方法 | 通过标准 |
|--------|------|---------|
| SQL 表结构与实体类字段一致 | 对比 CREATE TABLE 与 @Column | 字段名、类型、长度、nullable 一致 |
| 实体类与 Mapper XML 一致 | 对比 resultMap / 列名 | 无遗漏字段、无拼写错误 |
| 实体类与 DTO 一致 | 对比字段列表 | DTO 字段是实体字段的子集或超集（设计意图明确） |
| 枚举值与数据库约束一致 | 对比 enum 定义与 CHECK 约束 | 枚举值在数据库约束范围内 |
| 主键/索引定义一致 | 对比 @Id/@Index 与 SQL | 主键、索引定义一致 |
| 版本总 SQL 收口一致 | 对比源码/Mapper、开发库、测试库现状+总 SQL | 源码依赖字段均在最终结构中存在；总 SQL 无漏项、无重复 ADD |

**校验方法**：
1. 读取 SQL 文件，提取所有表结构和字段定义
2. 读取对应的实体类，提取所有字段和注解
3. 读取对应的 Mapper XML，提取所有 resultMap 和 SQL 列
4. 读取对应的 DTO，提取所有字段
5. 逐字段对比，列出不一致项
6. 对涉及数据库的需求，额外对比三方：源码/Mapper 读写字段、开发库结构、测试库现状 + 版本总 SQL 执行后结构

### 步骤 4：修复不一致
对步骤 3 发现的不一致项：
- 如果 SQL 是正确的（以设计文档为准），修正实体/Mapper/DTO
- 如果源码/Mapper 和开发库一致但冻结 SQL 缺失，停止实现并退回
  `$superflow-contracts` 更新 `release-sql.md`、哈希和 handoff，不要由研发 Agent 补 SQL
- 如果测试库已有字段，版本总 SQL 不得重复 ADD；字段类型或注释与开发库不一致时生成 MODIFY 或上报不采纳理由
- 如果设计文档有模糊之处，停止并报告，不允许自行猜测

### 步骤 5：最小编译验证
1. 执行 `git diff --name-only`，确认只修改了允许范围内的文件
2. 执行编译命令：{compile-cmd}
3. 确认 BUILD SUCCESS，无 ERROR

## 数据库字段要求
- 所有新增/修改字段必须在 SQL、实体、Mapper、DTO 中同步存在
- 字段命名使用下划线（数据库）和驼峰（Java），转换由 MyBatis 负责
- 禁止使用数据库保留字作为字段名
- 时间字段统一使用 datetime，由框架填充

## 验收命令
```bash
# 1. 确认工作树干净
git status

# 2. 确认修改范围正确
git diff --name-only

# 3. 编译验证
{compile-cmd}

# 4. 检查无脏文件提交
git diff --cached --name-only | grep -v '\.java$\|\.xml$\|\.sql$' || echo "无异常文件"
```

## 完成后必须输出的报告

```
P0 基线报告：
- 仓库：{repository-name}
- 分支：{branch-name}
- 工作树状态：干净 / 不干净（说明）
- 删除的脏文件：{list}
- 字段一致性校验结果：
  - 检查表：{table-name}
  - 一致字段：X 个
  - 不一致字段：X 个（已修复 X 个，上报 X 个）
  - 不一致详情：
    - {field}: SQL={type}, Entity={type}, 修复方式={fix}
- 版本总 SQL 收口对账：
  - 源码/Mapper vs 开发库：一致 / 不一致
  - 测试库现状 + 总 SQL：一致 / 不一致
  - 需退回详设补入冻结 SQL 的字段/索引/数据：{list}
  - 不采纳项及原因：{list}
- 编译状态：BUILD SUCCESS / 失败（说明）
- 修改文件清单：{files}
- 对应 OpenSpec 章节：design.md ## 数据模型
- 需要人工确认的问题：{list}
- 后续批次依赖事项：P1 可开始
```

## 偏离设计时必须停止并报告

- 如果发现 SQL 字段与设计文档定义不一致，**停止**，列出差异，上报 Leader
- 如果发现实体类使用了设计文档未定义的字段，**停止**，不允许自行添加
- 如果编译失败且无法通过修改允许范围内的文件解决，**停止**，上报 Leader
```
