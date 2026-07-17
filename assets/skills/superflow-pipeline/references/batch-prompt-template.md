# 分批 Implementation Prompt 模板

## 模板结构

每份 implementation prompt 必须包含以下全部章节。缺失任何一节都可能导致 agent 偏离设计。

---

## 标准模板

````
使用superpower技能，开启合适的团队，最少包含一名开发和一名测试交叉验证进行需求开发，测试验证闭环交付，更新测试文档和api.md：

# P{batch-id} Prompt：{batch-name}

## 团队要求
- 至少 1 名开发 Worker
- 至少 1 名独立 Tester
- Leader 负责协调、抽查、收口
- Tester 必须与开发交叉验证，不能直接复用开发自测结论

## 必读文档（强制）
- [spec.md](../spec.md)
- [design.md](../design.md)
- [Superpowers 技术详设](../docs/superpowers/specs/YYYY-MM-DD-{change-id}-technical-design.md)
- [tasks.md](../tasks.md)
- [api.md](../api.md)
- [tests.md](../tests.md)
- [prompt/implementation.md](implementation.md)
- **本需求汇总 SQL 文件**：`../sql/{汇总SQL文件名}`（如不存在，说明本需求尚无数据库变更，但开始前仍需核查依赖表结构）

> Markdown 链接要求：本 prompt 中引用的其他 `.md` 交接文档必须使用相对路径
> Markdown 链接，且能从当前 prompt 文件位置点击跳转；不要只写纯文本文件名。

## 数据库前置门禁（强制，在写任何代码前必须完成）

在修改业务代码前，必须先完成数据库结构核查，确保开发环境数据库与设计文档一致：

1. **列出本批次依赖的表/字段/索引/默认值/初始化数据**：对照 design.md / api.md / spec.md / tasks.md 中涉及的数据库变更，列出本批次需要的全部数据库结构。
2. **连接开发环境数据库执行核查**：对每个依赖的表执行 `SHOW CREATE TABLE` / `SHOW COLUMNS` / `SELECT` 确认实际结构。
3. **发现缺失时执行汇总 SQL**：如果数据库结构或数据不满足设计要求，从本需求汇总 SQL 文件中找到对应脚本，连接开发环境数据库执行。
4. **复查确认**：执行成功后再次查询确认结构/数据已生效。
5. **只有数据库满足设计后，才能继续业务代码开发。**
6. **完成前必须收口版本总 SQL**：本批新增/修改的表、字段、索引、默认值、初始化数据必须已合并进需求级汇总 SQL 文件，不能只存在于开发库、临时 SQL 或 agent 回复中。

禁止：
- 禁止为绕过数据库缺字段、缺默认值、缺初始化数据而修改业务逻辑。
- 禁止自行创建独立 SQL 文件（所有 SQL 统一追加到需求级汇总 SQL 文件）。
- 禁止用 mock、单测通过或 BUILD SUCCESS 代替真实数据库结构核查。
- SQL 脚本执行失败时必须停下来报告真实错误，不允许改业务代码绕过。
- 禁止因为开发库已有字段就跳过总 SQL；测试/发布部署以版本总 SQL 为准。

## 版本总 SQL 收口对账（强制，任务完成前必须输出）

涉及数据库的任务必须在完成报告中提供以下表格；未提供视为任务未完成：

| P编号 | 表 | 字段/索引/数据 | 源码引用 | 总SQL位置 | 开发库状态 | 测试库状态 | 处理结论 |
|---|---|---|---|---|---|---|---|
| P{batch-id} | {table} | {column/index/data} | {class/mapper/method} | {sql file + line/comment block} | {已存在/缺失/差异} | {已存在/缺失/差异} | {补总SQL/MODIFY/不采纳说明} |

收口规则：
- 源码/Mapper 会读写的字段，必须能在 `测试库当前结构 + 版本总 SQL 执行后结构` 中找到。
- 开发库已有但总 SQL 缺失时，必须补总 SQL。
- 测试库已有字段不得重复 `ADD COLUMN`；如果字段类型或注释与开发库不一致，生成 `MODIFY` 或写明不采纳理由。
- 临时 SQL、单个 P 任务 SQL、开发库手工变更都不能替代版本总 SQL。

## 强制执行顺序（数据库迁移类任务硬门禁）

**自动检测规则**：生成本 prompt 时，如本批次涉及以下任一条件，则**必须**包含本章节，不可跳过：
- 新增表
- 删除字段
- 物理删除旧字段
- 表结构重构
- 旧数据迁移
- 状态字段从持久化改为动态计算
- 分页筛选依赖新表或新状态逻辑
- 总版 SQL 和开发库迁移 SQL 分离
- 需要迁移当前开发库/测试库已有数据

**以上条件任一满足时，必须先完成以下步骤，才允许开始 Java 编码：**

1. **当前数据库结构核对**
   - 连接开发环境数据库，对涉及表执行 `SHOW CREATE TABLE {表名}`
   - 对关键表执行 `DESC {表名}`
   - 确认新表/新字段是否已存在
   - 确认旧字段当前状态（是否存在、是否已废弃、是否有数据）
   - 记录核对结果到 test-report

2. **表结构改造**
   - 新库基线 SQL 按最终结构整理
   - 已有开发库/测试库使用单独迁移 SQL（与总版基线 SQL 分离）
   - 本地迁移 SQL 如要求不提交 Git，必须放入 Git ignored 路径
   - 执行后再次 `SHOW CREATE TABLE` 确认结构生效

3. **旧数据迁移**
   - 明确旧数据如何迁移到新表/新字段
   - 明确迁移数量核对 SQL（迁移前 COUNT、迁移后 COUNT）
   - 明确迁移失败处理策略：迁移失败必须停止，不得写代码绕过
   - 执行迁移脚本后执行核对 SQL 确认数量一致

4. **test-report 证据回填**
   - SQL 文件路径（基线 SQL + 迁移 SQL）
   - 执行数据库连接来源（host/port/database）
   - 执行时间
   - 执行结果（成功/失败）
   - `SHOW CREATE TABLE` 结果摘要
   - 迁移前后数量对比
   - 关键联查结果

5. **编码许可判定**
   - 上述 1~4 全部完成后，才允许进入后续编码工作
   - 如果表结构改造或数据迁移失败，必须停止并报告，禁止继续编码
   - 禁止先写业务代码绕过数据库状态不一致
   - 禁止只靠 `BUILD SUCCESS` 或编译通过宣称完成

**禁止事项：**
- 禁止为绕过数据库缺字段、缺默认值、缺初始化数据、历史数据未迁移而修改业务逻辑
- 禁止自行创建独立 SQL 文件。所有 SQL 脚本必须追加到需求级汇总 SQL 文件
- 禁止把 SQL 写在临时说明里但不追加到需求汇总 SQL 文件
- 禁止用 mock、单测通过或 BUILD SUCCESS 代替真实数据库结构核查和数据迁移验证
- SQL 脚本执行失败时，必须停下来报告真实错误，不允许改业务代码绕过
- 禁止将本地迁移 SQL 提交到 Git（如项目约定不提交）
- 禁止每个独立任务只维护自己的 SQL 片段而不合并版本总 SQL

## 禁止事项（强制）
- 禁止让 Superpowers 技术详设覆盖 OpenSpec/SDD 的需求、API、DB、SQL、字段语义合同、tests 或验收门禁
- 禁止在 prompt 内新增不属于 `design.md`、`api.md`、`tests.md` 或 Superpowers 技术详设的实现方案
- 如 Superpowers 技术详设不清楚，只能列疑点并停下确认，不允许自行脑补一套新方案
- 禁止用"单元测试通过"替代真实启动应用后的 API 集成测试
- 禁止在未执行 `~/.codex/hooks/superflow-verify-integration.sh <test-report.md>` 或脚本失败时交付

## Superpower 技术详设继承（强制）

从 [Superpowers 技术详设](../docs/superpowers/specs/YYYY-MM-DD-{change-id}-technical-design.md) 复制或摘要本批次相关内容。
本章节继承源码级 HOW 和执行策略，不定义新的需求、API、DB、字段语义或验收标准。

| 执行模式 | 团队角色 | 拆分建议 | TDD/RED切入点 | 独立Tester验证点 | 高风险猜测点 | 禁止自由发挥项 | 进入prompt的强制要求 |
|----------|----------|----------|----------------|------------------|--------------|----------------|----------------------|
| ____ | Worker / Tester / Reviewer / Leader | ____ | ____ | ____ | ____ | ____ | ____ |

规则：
- OpenSpec/SDD 的 [design.md](../design.md)、[api.md](../api.md)、[tests.md](../tests.md) 是设计事实源。
- Superpowers 技术详设负责源码级 HOW、开发、测试、Review、worktree、红绿验证和交付闭环。
- 如果技术详设或本表与 design/api/tests 冲突，停止并回到 `$superflow-docs` 修正文档；禁止 Worker 自行改合同。

## 字段/状态反向影响面核实（强制）

如果本批涉及字段值、状态/枚举、在线离线、删除恢复、同步标记、支付退款状态、
第三方状态或任何会被其他代码读取的值，必须先从 Superpowers 技术详设复制
`Field And Status Reverse Impact` 矩阵，并按矩阵完成反向核实。

必须执行并记录：

```bash
rg -n "<field>|<enum>|<status>|<column>" .
rg -n "<setter>|<getter>|<mapper column>|<dto field>" src test
````

同时检查 Mapper XML、实体注解、DTO/VO、SQL 脚本、定时任务、MQ/事件消费、
回调、第三方适配器、共享表/SDK 和兄弟仓消费方。

完成报告必须包含：

| 字段/状态 | 写入点   | 读取/过滤点 | 派生/同步点 | 跨模块消费方 | 已同步调整 | 不调整理由 | 覆盖测试 |
| --------- | -------- | ----------- | ----------- | ------------ | ---------- | ---------- | -------- |
| \_\_\_\_  | \_\_\_\_ | \_\_\_\_    | \_\_\_\_    | \_\_\_\_     | \_\_\_\_   | \_\_\_\_   | \_\_\_\_ |

只证明直接 setter/writer 已修改，不证明读取方、过滤方、派生同步方和消费方，
视为未完成。

## 外部枚举绑定确认（强制）

如果本批涉及第三方、SDK、BEM/停车、支付退款、财务展示、来源字段、状态同步、
外部字典或外部枚举，必须从 api.md / sdd-quality-gate.md /
Superpowers 技术详设复制 `外部枚举绑定确认` / `External Enum Binding`，并在编码前复核。

| 业务字段 | 本系统真源字段/枚举 | 外部系统字段 | 外部枚举/字典值 | 展示文案/业务语义/财务语义 | 取值来源                    | owner/确认时间 | 不确定项/阻塞处理      | 覆盖测试 |
| -------- | ------------------- | ------------ | --------------- | -------------------------- | --------------------------- | -------------- | ---------------------- | -------- |
| \_\_\_\_ | \_\_\_\_            | \_\_\_\_     | \_\_\_\_        | \_\_\_\_                   | 文档/日志/接口样例/用户确认 | \_\_\_\_       | 无 / Blocked: \_\_\_\_ | \_\_\_\_ |

禁止用请求成功、值非空或字段存在替代外部枚举业务语义确认。未确认的外部枚举、
支付来源、财务展示含义或兜底映射，必须停止并报告 `Blocked`。

## 外部集成配置与部署合同（强制）

如果本批涉及第三方平台/工具、SDK、MQ/Kafka、回调、支付渠道或云服务，必须从
api.md / sdd-quality-gate.md / Superpowers 技术详设复制
`外部集成配置与部署合同` / `External Integration Configuration And Deployment Contract`。

| 外部依赖/资源 | 配置项/资源名 | 本地来源/创建方式 | 测试来源/创建方式 | 生产来源/创建方式 | 注入/创建方式 | 运行 owner | 创建 owner/时点 | 就绪证据 | 回滚 | 密钥处理 | 阻塞项 |
| ------------- | ------------- | ----------------- | ----------------- | ----------------- | ------------- | ---------- | --------------- | -------- | ---- | -------- | ------ |
| \_\_\_\_ | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ | 配置/Secret/IaC/控制台 | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ | 仅引用 | 无/Blocked |

环境相关配置和服务端资源不得只硬编码在注解、常量或业务代码中。测试自动创建或
历史资源存在不能证明生产就绪；缺少生产创建与验证证据时必须停止并报告 `Blocked`。

## 并发与幂等归属（强制）

如果本批涉及并发、批量下发/开通/续费、重复提交/回调/消费或重复外部调用，必须从
sdd-quality-gate.md / Superpowers 技术详设复制 `Concurrency And Idempotency Ownership`。

| 场景 | 业务幂等键 | 原子占用 owner | 应用层原子占用 | 短事务边界 | 状态流转 | 重试复用编码 | 外部调用边界 | 不确定结果处理 | 唯一索引角色 | 测试证据 |
| ---- | ---------- | -------------- | ---------------- | ---------- | -------- | ------------ | ------------ | -------------- | ------------ | -------- |
| ____ | ____ | ____ | 锁定 owner 后写 PENDING | 独立提交 | PENDING/SUCCESS/FAILED | 复用原业务单号 | 提交后调用 | 阻止重复并对账 | 非默认/可选兜底 | 并发/重复/重试 |

默认采用应用层原子占用：稳定业务幂等键、短事务占用并落 `PENDING`、提交并释放锁后
再调用外部系统。禁止“先查再插”、单进程锁、随机单号和外部调用期间持有长事务。
唯一索引不是默认方案，只有自然唯一、历史清理、NULL/软删除和冲突合同明确后才可
作为数据库兜底。结果不确定时必须阻止重复调用并进入可追踪对账。

## 金额精度边界继承（强制）

如果本批涉及金额、费用、优惠、抵扣、退款、分账、支付、发票、余额、电费、
服务费、套餐结算、比例分摊、明细分配、对账或财务展示，必须从 Superpowers
技术详设复制 `Money Precision Boundary`。

| 恒等式/权威总额 | 精确类型/构造 | 币种/渠道最小单位 | 舍入层级/mode/来源 | 分配策略/tie-breaker | 差额反推 | 审计证据 | 正负边界测试 |
| ---------------- | ------------- | ----------------- | -------------------- | --------------------- | -------- | -------- | ------------ |
| 原始=优惠+实付/原始金额 | BigDecimal/字符串 | CNY/最小单位 | 整单/HALF_UP/合同 | 最大余数/业务主键 | 实付=原始-优惠 | 舍入前后/尾差接收方 | 半分/尾差/退款 |

中间计算不得提前舍入后继续切片、分摊、汇总或抵扣；多明细必须确定性处理尾差，
并在 test-report.md 证明原始金额、优惠金额、实付金额和分配合计满足合同恒等式。
存在权威总额时，只独立计算 N-1 个组成项，最后一个组成项按权威总额减去其余
组成项合计差额反推；禁止所有组成项分别计算、分别舍入后重建总额。必须继承
`money-precision-algorithms.md` 的币种单位、舍入来源、稳定排序、负数对称和条件性
汇率合同。

## SDD 门禁激活（第一步，在所有编码工作之前执行）

本机已配置 Codex Hooks，会在 Edit/Write 时自动拦截。你必须按以下顺序激活：

```bash
# 1. 在主仓库根目录创建门禁标记
cd {project-path}
touch .sdd-enforced
echo ".sdd-enforced" >> .gitignore
echo ".db-verified" >> .gitignore

# 2. 创建 worktree 并进入（见下文"并行开发要求"）

# 3. 进入 worktree 后也创建门禁标记
touch .sdd-enforced

# 4. 完成数据库前置门禁后创建核查通过标记
touch .db-verified

# 任务完成后清理
rm -f .sdd-enforced .db-verified
cd {project-path} && rm -f .sdd-enforced
```

**跳过以上步骤直接编辑代码会被 Hook 拦截。**

## 本批目标

{一句话描述本批要完成的业务闭环}

示例：

- 完成主数据的 CRUD 接口，包括数据库表、实体、Mapper、Service、Controller，支持后台列表查询和批量导入模板下载。
- 完成外部事件接入，包括消息解析、准入校验、事件格式化、向 MQ 发布 BusinessEvent。

## 并行开发要求（Worktree 隔离）

本任务必须使用独立 git worktree 开分支开发，避免多个 agent 在同一工作树并行修改互相覆盖。

在项目根目录执行：

```bash
git status --short
git worktree add -b feature/{change-id}-{batch-id}-{short-name} ../{project}-{batch-id}-worktree HEAD
cd ../{project}-{batch-id}-worktree
```

如果分支已存在，改用：

```bash
git worktree add ../{project}-{batch-id}-worktree feature/{change-id}-{batch-id}-{short-name}
cd ../{project}-{batch-id}-worktree
```

所有编码、测试、文档更新、代码评审和 git 提交都必须在该 worktree 内完成。不要在主工作树直接开发，不要回滚或删除其他 agent 的改动。完成后在报告中写明 worktree 路径、分支名和提交号。

### Worktree 进入后强制验证（必须执行）

```bash
pwd
git branch --show-current
git status --short
```

- 确认当前目录包含本批次 worktree 名称
- 确认当前分支是本批次分支
- 如有异常，停止工作，不得开始任何代码编辑

### 端口管理（强制）

本任务预设端口 = {base-port} + {batch-id} = {port}（如 9250 + 15 = 9265）。

启动应用前检查端口占用：

```bash
PORT={port}
lsof -i :$PORT 2>/dev/null || netstat -tlnp 2>/dev/null | grep ":$PORT "
```

- 若预设端口被其他 agent 占用 → 向后递增查找可用端口（到 9350），禁止关闭其他进程
- 若更换端口，所有接口测试 URL 同步更新

### 编译依赖问题处理（强制）

编译失败时禁止直接终止：

- 分析错误类型 → 对照 design.md 检查 → 尝试修复 → 重新 clean compile
- 其他 agent 能正常编译说明环境是对的，问题出在自己的代码
- 15 分钟无法解决才上报 Leader

### Token 获取（强制）

接口测试必须先获取真实 token：

```bash
# 1. 获取验证码（带 Cookie）
curl -s -c /tmp/cookies.txt -b /tmp/cookies.txt \
  "http://localhost:{port}{context-path}/captcha/image" -o /dev/null

# 2. 登录（表单提交）
curl -s -c /tmp/cookies.txt -b /tmp/cookies.txt \
  -X POST "http://localhost:{port}{context-path}/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "userName=admin&password=...&captchaCode=9999"

# 3. 从响应 data.token 提取，后续请求 Header 带 token: $TOKEN
```

- 禁止 mock-only、禁止假设固定 token
- 登录失败时必须输出完整响应分析原因

## 三层验收门禁（强制）

本批次涉及接口、CRUD、Mapper/XML、数据库字段或配置驱动行为时，必须同时满足：

1. **Prompt 完成定义**：编译、单测、应用新进程启动、真实 curl/API 调用、
   数据库查询、日志检查、test-report 回填全部完成。
2. **Hook 过程拦截**：`.sdd-enforced` 和 `.db-verified` 保持激活，直到
   集成验收脚本通过；运行时代码提交必须同步提交 test-report 证据。
3. **验收脚本判定**：完成前执行：

```bash
~/.codex/hooks/superflow-verify-integration.sh \
  doc/openspec/changes/{change-id}/embedded-changes/pXX-xxx/test-report.md
```

脚本失败时不得提交、不得交付、不得写"建议后续测试"；只能补齐真实证据后重跑，
或把任务标记为 `Blocked` / `Partially verified` 并说明阻塞原因。

## 允许修改的仓库

{repository-name}

## 允许修改的目录/文件范围

{具体列出允许修改的文件路径，精确到类名}

示例：

- src/main/java/com/example/domain/entity/BusinessRecord.java
- src/main/java/com/example/domain/mapper/BusinessRecordMapper.java
- src/main/resources/mapper/BusinessRecordMapper.xml
- src/main/java/com/example/domain/service/BusinessRecordService.java
- src/main/java/com/example/domain/controller/BusinessRecordController.java
- src/main/resources/db/migration/V{version}\_\_add_business_record.sql

## 禁止修改的范围

{明确列出禁止触碰的边界}

示例：

- 禁止修改 OtherDomainService.java 及其相关接口（由其他批次负责）
- 禁止修改 PublicApiController.java（对外接口由其他批次负责）
- 禁止修改消息协议相关配置和类（由其他批次负责）
- 禁止引入项目未确认的新中间件依赖
- 禁止修改既有枚举值（如需新增枚举值，在报告中声明）

## 依赖的前置批次

{列出本批依赖哪些批次已完成}

示例：

- P0 基线：已完成，数据库表结构和实体已对齐
- P1 核心主数据：已完成，基础 CRUD 可用

## 业务背景

{简述本批在整体业务中的位置和上下游关系}

示例：
本批是某业务流程的 P2 核心链路。用户或外部系统提交业务请求后，系统需要：

1. 校验主数据有效性（依赖 P1 的主数据能力）
2. 创建业务记录并初始化状态机
3. 根据用户、租户或配置计算业务规则命中
4. 生成业务快照（记录当时有效的关键字段）
5. 调用下游依赖完成资源锁定、通知或后续处理

## 精确实现步骤

{按顺序列出具体要做什么，引用 design.md 章节}

步骤 1：{具体动作}（参考 design.md #{章节}）
步骤 2：{具体动作}（参考 design.md #{章节}）
...

## 数据库字段要求

{明确字段名、类型、约束，引用 database-contract.md 或 design.md}

**汇总 SQL 文件**：`openspec/changes/{change-id}/sql/{汇总SQL文件名}`

- 本批次所有数据库变更脚本必须从该文件获取
- 如果需要新增数据库变更，必须追加到该汇总 SQL 文件（按任务编号注释，如 `-- P16 业务字段补齐`）
- SQL 脚本采用简单直接格式（ALTER TABLE / INSERT），不使用 INFORMATION_SCHEMA 判断、PREPARE/EXECUTE 等过度兼容脚本
- 如果本批次不需要新增 SQL，写明"本批次不新增 SQL，但开始前仍需核查依赖表结构是否已满足设计"

示例：

- business_record 表：
  - id: BIGINT PK AUTO_INCREMENT
  - name: VARCHAR(64) NOT NULL
  - type: TINYINT NOT NULL COMMENT '按项目枚举定义'
  - amount: DECIMAL(10,2) NOT NULL
  - valid_days: INT NOT NULL DEFAULT 30
  - status: TINYINT NOT NULL DEFAULT 1 COMMENT '0-禁用 1-启用'
  - created_at / updated_at: datetime

## API/消息契约要求

{明确接口路径、方法、请求/响应字段，或 MQ topic、消息格式}

示例：
HTTP 接口：

- POST /api/business-records
  - Request: BusinessRecordCreateDTO
  - Response: Result<Long>（返回创建后的 id）

MQ 消息：

- Topic: domain.business.event
- Body: BusinessEvent
  - recordId: String
  - tenantId: String
  - status: Integer（按项目枚举定义）
  - timestamp: Long

## 幂等、事务、失败处理要求

{明确每个关键操作的幂等策略、事务边界、失败处理}

示例：

- 创建业务记录：
  - 幂等：基于 userId + businessId + 日期做幂等，重复请求返回已有记录号
  - 事务：@Transactional(rollbackFor = Exception.class)
  - 失败：下游依赖失败时状态回滚为 INIT，不产生不可逆副作用

- 消费 MQ：
  - 幂等：基于 messageId 做幂等，已消费的消息直接 ACK
  - 事务：消息消费与业务状态更新在同一个事务内
  - 失败：业务异常时抛异常让 MQ 重试，达到最大重试次数后进死信队列

## 测试要求

{明确本批需要验证的用例，引用 tests.md}

- 用例 1：{描述}（tests.md #{章节}）
- 用例 2：{描述}（tests.md #{章节}）

每个用例必须执行：接口调用 → 数据库验证 → 日志检查

## 验收命令

{列出本批验收时需要执行的命令}

```bash
# 编译
{compile-cmd}

# 启动
{run-cmd}

# 接口测试
curl -X POST http://localhost:{port}{context-path}/api/business-records \
  -H "Content-Type: application/json" \
  -d '{json}'

# 数据库验证
mysql -u{user} -p{pass} -e "SELECT * FROM business_record WHERE id = {id};"

# 日志检查
grep ERROR {log-path} || echo "无 ERROR"
```

## 完成后必须输出的报告格式

```
批次完成报告：
- 批次：P{n} - {名称}
- 完成范围：{简述}
- Worktree 路径：{实际 worktree 绝对路径}
- 分支名：{实际分支名}
- 实际使用端口：{如 9250 或更换后的端口}
- 修改文件清单：
  - {file-path}（新增/修改/删除）
- 对应 OpenSpec 章节：
  - design.md #{章节}
  - api.md #{章节}
  - tests.md #{章节}
- 编译状态：
  - 命令：{compile-cmd}
  - 结果：BUILD SUCCESS / 失败原因
- 数据库前置门禁：
  - 检查的表/字段/索引/初始化数据：{列出具体检查项}
  - 汇总 SQL 文件路径：{如 openspec/changes/xxx/sql/{version}.sql}
  - 执行的脚本：{具体 ALTER TABLE / INSERT 语句或脚本行号范围}
  - 执行结果：{成功/失败，如失败写明错误信息}
  - 复查确认：{再次 SHOW CREATE TABLE / SELECT 确认结果}
  - 如本批次不需要 SQL：{写明"本批次不新增 SQL，依赖表结构已核查满足设计"}
- 进程验证：
  - PID：{pid}
  - 启动时间：{timestamp}
  - 端口：{实际端口}
  - 健康检查：UP ✓
- 执行过的测试/命令：
  - {命令} → {结果}
- 未执行测试及原因：
  - {用例}：原因（如依赖 P{n+1}）
- 与设计不一致的地方：
  - {描述} → 处理方式（已修复/已上报/待确认）
- 需要人工确认的问题：
  - {问题}
- 后续批次依赖事项：
  - P{n+1} 需要本批提供的 {接口/数据/契约}
- 交付前核对：
  - [ ] 已逐条核对 prompt 的"必须完成"
  - [ ] 已逐条核对 prompt 的"验收标准"
  - [ ] 每条都有真实测试证据（curl + DB + 日志）
  - [ ] 无 mock-only 或占位参数
```

## 偏离设计时必须停止并报告

- 如果发现 design.md 中某个方案无法实现，**停止**，列出原因，上报 Leader，不允许自行改用其他方案
- 如果发现需要修改"禁止修改的范围"内的文件才能完成本批目标，**停止**，上报 Leader，不允许越界修改
- 如果发现 tests.md 中的断言在实际环境中不成立，**停止**，列出差异，上报 Leader
- 如果编译或启动失败且 15 分钟内无法解决，**停止**，上报 Leader

```

---

## 跨仓库 Prompt 的特殊要求

当 prompt 涉及跨仓库交互时，必须在"业务背景"或"API/消息契约要求"中增加：

```

## 跨仓库交互契约

### 本仓库角色

{生产者/消费者/契约层/业务归口}

### 上游依赖（本仓库消费）

| 来源仓库 | 接口/消息    | 契约详情   | 状态           |
| -------- | ------------ | ---------- | -------------- |
| {repo}   | {path/topic} | {字段定义} | 已由 P{n} 提供 |

### 下游契约（本仓库提供）

| 目标仓库 | 接口/消息    | 契约详情   | 状态     |
| -------- | ------------ | ---------- | -------- |
| {repo}   | {path/topic} | {字段定义} | 本批交付 |

### 禁止越界

- 本仓库不处理 {其他仓库的职责}
- 本仓库不直接操作 {其他仓库的数据库}

````

---

## 生成多份 Prompt 时的总览文件

当需求拆分为多批时，必须生成 `prompt/implementation.md` 作为总览：

```markdown
# Implementation Prompt 总览

## 批次计划

| 批次 | 名称 | 目标 | 依赖 | 状态 |
|------|------|------|------|------|
| P0 | 基线 | 清理、字段校验、编译 | 无 | 待执行 |
| P1 | 核心主数据 | SQL + 实体 + 基础 CRUD | P0 | 待执行 |
| P2 | 核心业务链路 | 创建/提交 + 状态机 + 业务规则 | P1 | 待执行 |
| P3 | 异步/外部 | 外部事件 + MQ + 外部集成 | P2 | 待执行 |
| P4 | 联调验收 | 全链路回归 + 边界场景 | P3 | 待执行 |

## 执行顺序
1. P0 → 验收通过 → P1 → 验收通过 → P2 → ...
2. 每批验收通过后才能开始下一批
3. 如某批失败，修复后重新验收，不影响已完成批次

## 各批次 Prompt 文件
- [p0-baseline.md](p0-baseline.md)
- [p1-business-record.md](p1-business-record.md)
- [p2-business-flow.md](p2-business-flow.md)
- [p3-external-integration.md](p3-external-integration.md)
- [p4-integration-test.md](p4-integration-test.md)

## 评审清单
- [reviewer-checklist.md](reviewer-checklist.md)
````
