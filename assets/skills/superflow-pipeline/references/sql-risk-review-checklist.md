# SQL 风险评审清单

> **目的**：在 SQL 发布或提测前完成风险扫描，减少平台 SQL 解析校验和人工/自动化风险评审的返工。
>
> **使用时机**：每个 P/CR 任务在 `design.md` 冻结后、生成实现 prompt 前，由研发或 Reviewer 走完本清单；任一项未通过必须修复或显式豁免后才进入实现阶段。
>
> **本文与现有规则的关系**：
> - `superflow-pipeline/SKILL.md` 的"数据库 SQL 门禁"章节定义**通用规则**
> - `superflow-sql-sync-hook.py` 实现**阻断级**自动检查（commit / edit 阶段）
> - 本文档定义**风险评审级**完整门禁（评审阶段 + 阻断级检查的语义说明）

---

## 1. 两层评审关系

| 层级 | 触发时机 | 工具 | 责任方 | 失败处理 |
|---|---|---|---|---|
| **L1 平台解析校验** | SQL 提交到发布/提测平台时 | 目标环境 SQL parser 或发布平台校验 | 平台 | 拦截发布/提测 |
| **L2 风险评审** | 发布/提测前后 | 人工评审或自动化扫描 | Reviewer/QA | 打回返工 |

**L1 + L2 之间的关系**：
- L1 只做**语法兼容性 + 平台基线**校验，不做**业务/性能/可维护性**判断
- L2 做**业务风险/性能/可维护性**评审，但依赖 L1 先过
- 我们的目标是 **L2 风险前置到 L1 之前**，避免"提测被拦/打回"的双重返工

**L1 已知技术约束（按目标环境替换）**：
- 目标 SQL parser 可能落后于数据库版本，所有提交 SQL 必须按项目目标数据库和发布平台共同支持的语法编写
- 评审前必须确认目标数据库版本和发布平台 parser 版本

---

## 2. 评审门禁清单（20+ 条）

按"禁用 / 警告 / 允许"三档分级。**禁用项**由 hook 强制阻断；**警告项**提交流程不阻断但评审记录必须写明处理结论；**允许项**是无需评审的标准做法。

### 2.1 禁用项（pre-commit 阻断，评审必须移除或显式豁免）

| # | 规则 | 触发场景 | 理由 | 修复方法 |
|---|---|---|---|---|
| **B1** | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | 增量改字段 | 静默兼容字段冲突，掩盖数据迁移遗漏 | 直接 `ALTER TABLE ... ADD COLUMN`，让冲突在部署时暴露 |
| **B2** | `CREATE [UNIQUE] INDEX IF NOT EXISTS` | 增量建索引 | 静默兼容索引冲突，掩盖迁移遗漏 | 直接 `CREATE INDEX`，让冲突在部署时暴露 |
| **B3** | `INFORMATION_SCHEMA` / `information_schema.columns` / `information_schema.tables` | 判断字段/表是否存在 | 动态 DDL 绕过显式迁移，本质上同 IF NOT EXISTS | 评审时人工核对目标表结构，确认无重复后写显式 DDL |
| **B4** | `PREPARE` / `EXECUTE` / `DEALLOCATE PREPARE` | 动态 DDL | 同 B3，绕过显式迁移 | 评审时人工核对，显式 DDL 替代 |
| **B5** | `SET @变量` | 拼接或控制 DDL | 同 B3，且容易引入 SQL 注入风险 | 评审时人工核对，显式 DDL 替代 |
| **B6** | `ALTER TABLE ... ALGORITHM=...` / `LOCK=...` | 强制指定在线 DDL 参数 | 不同 MySQL 版本/平台参数不同时触发 `ERROR 1221`，应由执行平台按目标库能力选择 | 移除参数，由执行平台决定 |
| **B7** | `FOREIGN KEY (...) REFERENCES ...` 外键约束 | 表结构 | 跨服务/多租户业务通常不依赖数据库外键做强制关联，应由代码层或应用约束控制一致性 | 改由 Service 层 + 唯一键 + 状态机控制 |
| **B8** | 单条 SQL 缺失显式 `DEFAULT` 的 `NOT NULL` 字段 | ALTER TABLE ADD COLUMN | 老数据回填时该字段会以 `NULL` 写入导致失败 | 必须有 `DEFAULT <value>` 或显式 `NULL` 允许 |

### 2.2 警告项（不阻断，但 test-report.md 必须记录处理结论）

| # | 规则 | 触发场景 | 风险 | 评审动作 |
|---|---|---|---|---|
| **W1** | 回填类 UPDATE 使用相关子查询 | 数据回填 | O(k·N) 性能，k=子查询数 | **必须改写为 JOIN**，O(N) 单表扫描；评审人在 checklist 勾选 |
| **W2** | `JSON_EXTRACT` / `JSON_UNQUOTE` 后无 `COALESCE` / `IFNULL` / `CASE WHEN` 兜底 | JSON 字段提取 | NULL 传播导致业务字段为 NULL，破坏"不限额=-1"等业务语义 | **必须加显式 NULL/类型兜底**（`COALESCE`、`IFNULL` 或更精确的 `CASE WHEN ... REGEXP` 数字校验）；评审人在 checklist 勾选 |
| **W3** | 唯一键包含 DATETIME 列且未指定精度 | 唯一约束 | DATETIME 默认秒级精度，业务毫秒级切片时产生意外冲突 | **必须确认业务唯一性**（如改 `DATETIME(3)` 或加 `segment_seq INT`）；**改精度时也要核对所有源表和消费表字段**；评审人在 checklist 勾选 |
| **W4** | `INSERT IGNORE INTO ... SELECT` 用在数据迁移 | 数据迁移 | 静默吞错，重复执行不报错但数据可能不一致 | **改用显式预检查**（如 `WHERE NOT EXISTS`，让错误显式抛出）或**先清空目标表**再迁移；评审人在 checklist 勾选 |
| **W5** | 单条 `CREATE INDEX` 包含 > 3 列 | 索引设计 | 宽索引，写入性能差，占用 buffer pool | **必须说明业务查询场景**（WHERE 条件/ORDER BY/覆盖索引），不合理论证必须拆分；评审人在 checklist 勾选 |
| **W6** | 业务实体表缺少 `update_time DATETIME ON UPDATE CURRENT_TIMESTAMP` 或 `deleted TINYINT NOT NULL DEFAULT 0` | 新建表 | 与项目约定的业务表审计/软删除模式不一致 | 先判断表类型（业务实体表/快照表/关系同步表/流水表），**业务实体表必须遵循项目约定的审计和删除字段**；评审人在 checklist 勾选 |
| **W7** | SQL 文件没有 header 注释（目标 MySQL 版本、关联批次、风险等级） | 文件头 | 评审人/测试人无法快速定位责任 | **必须按 §4 模板写文件头**；评审人在 checklist 勾选 |
| **W8** | `JSON_LENGTH` / `JSON_EXTRACT` 解析的 JSON 字段无 `JSON_TYPE` CHECK 约束 | 新建表 JSON 字段 | 业务写入脏数据导致解析失败 | **新建表 JSON 字段必须有 CHECK 约束**（参考 `chk_*_json` 模式）；评审人在 checklist 勾选 |
| **W9** | 单条 `INSERT ... SELECT` 涉及 > 10000 行迁移 | 数据迁移 | 大事务、锁等待、从库延迟 | **必须分批**（如 `LIMIT 5000` 循环），或确认评估为小表；评审人在 checklist 勾选 |
| **W10** | 没有 SQL 收口对账表（`P编号 \| 表 \| 字段/索引/数据 \| 源码引用 \| 总SQL位置 \| 开发库状态 \| 测试库状态 \| 处理结论`） | 任务完成 | 无法证明 SQL 收口 | **test-report.md 必须包含**；评审人在 checklist 勾选 |
| **W11** | 关系同步表被误判为业务实体表 | 新建/整改表 | 按"业务实体表"模式加审计/软删除字段，但业务代码可能是物理 delete + 物理 insert，加字段可能没有业务价值 | **必须看业务 Service 实现**，确认是物理删除还是软删除；物理删除时按项目表类型规则判断是否需要审计/软删除字段。**评审动作：源码审查**（参考 §6 流程） |
| **W12** | JSON 提取 NULL 兜底不充分 | JSON 字段业务校验 | `COALESCE(..., <default>)` 只兜底 NULL，不处理"非数字字符串"（如 `JSON_EXTRACT` 返回 `"abc"`） | **优先用 `CASE WHEN <text> REGEXP '^-?[0-9]+(\.[0-9]+)?$' THEN CAST(... AS DECIMAL) ELSE <default> END` 模式**；COALESCE 仅作为"业务允许 NULL"的兜底 |
| **W13** | 宽索引无查询支撑 | 索引设计 | 宽索引可能没有真实查询支撑，或数据量较小时收益小于写入与维护成本 | **必须审查 Mapper XML/Repository 查询条件和真实数据量**，没有查询支撑或收益不足时拆分、删除或改为更合适的索引。**评审动作：源码审查**（参考 §6 流程） |

### 2.3 允许项（无需评审的标准做法）

| # | 场景 | 写法 | 理由 |
|---|---|---|---|
| **A1** | 创建新业务表 | `CREATE TABLE IF NOT EXISTS ...` | 业界标准，幂等建表 |
| **A2** | 创建备份表 | `CREATE TABLE IF NOT EXISTS <bak_table> LIKE <source_table>` | 同上，备份场景重跑不破坏原始备份 |
| **A3** | 新库基线建表 | `CREATE TABLE ...`（无 IF NOT EXISTS） | 新库一次性执行，无需幂等 |
| **A4** | 普通增量改字段 | `ALTER TABLE ... ADD COLUMN ...` | 无 IF NOT EXISTS，让冲突显式抛出 |
| **A5** | 普通增量建索引 | `CREATE INDEX ...` | 无 IF NOT EXISTS |
| **A6** | DML 段事务保护 | `START TRANSACTION; ... COMMIT;` | 保护 DML 段原子性，**不能保护 DDL**（MySQL DDL 隐式提交） |
| **A7** | 显式预检查幂等 | `INSERT INTO ... SELECT ... WHERE NOT EXISTS (...)` | 阻断式预检查，错误显式抛出，不静默吞错 |
| **A8** | 单库基线 DDL 与增量 DDL 分离 | `sql/{version}.sql`（基线）+ `sql/{version}.migrate.sql`（增量） | 避免重跑全量脚本 |

---

## 3. 评审 checklist 模板

每个 P/CR 任务的 `tasks.md` 中应包含以下 checklist，所有 W 项必须勾选处理结论：

```markdown
## SQL 风险评审 checklist（P{xx}）

**评审人**：{name}    **评审时间**：{yyyy-MM-dd}

### 禁用项检查
- [ ] B1-B8 无违规（或已显式豁免，豁免理由：{理由}）

### 警告项检查（test-report.md 必须记录处理结论）
- [ ] W1 回填 UPDATE 已改 JOIN（或确认非回填场景）
- [ ] W2 JSON 提取已有 NULL 兜底（或确认无 NULL 业务风险）
- [ ] W3 唯一键 DATETIME 已确认业务唯一性（或已加精度/序号）
- [ ] W4 INSERT IGNORE 已改显式预检查（或已先清空目标表）
- [ ] W5 宽索引已说明业务场景（或已拆分）
- [ ] W6 业务实体表已有 update_time + deleted（或已说明表类型不需）
- [ ] W7 SQL 文件头已按 §4 模板写
- [ ] W8 JSON 字段已有 CHECK 约束（或已说明无脏数据风险）
- [ ] W9 大批量迁移已分批（或已说明是小表）
- [ ] W10 test-report.md 已含 SQL 收口对账表
- [ ] W11 关系同步表已确认无需 update_time + deleted（**源码审查** Service 是物理 delete 还是软删除）
- [ ] W12 JSON 提取已用 COALESCE 或 CASE WHEN REGEXP 数字校验（NULL + 非数字字符串双重兜底）
- [ ] W13 宽索引已审查 Mapper XML/Repository 真实查询（**源码审查** + 数据量评估）

### 跨仓影响（如涉及）
- [ ] 跨仓数据合同对账已完成（参考 superflow-pipeline 的"跨仓数据合同门禁"）

### 评审结论
- [ ] **通过**：进入实现阶段
- [ ] **不通过**：修复后重新评审（列出未通过项）

### 豁免记录
| 规则 | 豁免位置 | 豁免理由 | 豁免人 |
|---|---|---|---|
| （无） | | | |
```

---

## 4. SQL 文件头模板

每个 `sql/**/*.sql` 文件**必须**以以下 header 开头（位于文件第一行 `-- ===...` 之后）：

```sql
-- ============================================================================
-- 目标 MySQL 版本：{5.7 | 8.0}
-- 平台 SQL 解析校验：{parser/version，已确认语法兼容}
-- 关联批次：P{xx}、CR{y} 或 v{x.y.z}
-- 风险等级：{高 | 中 | 低}
-- 评审人：{name}
-- 评审 checklist：参考 sql-risk-review-checklist.md
-- 涉及表：{table1, table2, ...}
-- 字段/索引/数据变更：{新增字段: ... | 新增索引: ... | 数据迁移: ...}
-- ============================================================================
```

**示例**：

```sql
-- ============================================================================
-- 目标 MySQL 版本：5.7
-- 平台 SQL 解析校验：{parser/version，已确认语法兼容}
-- 关联批次：P{xx} 或 v{x.y.z}
-- 风险等级：中
-- 评审人：{name}
-- 评审 checklist：参考 ~/.codex/skills/superflow-pipeline/references/sql-risk-review-checklist.md
-- 涉及表：{table_a}, {table_b}, {relation_table}
-- 字段/索引/数据变更：新增字段、索引、表或数据迁移摘要
-- ============================================================================
```

---

## 5. 豁免机制

评审人或开发者可对**禁用项**申请豁免。机制：

### 5.1 单行豁免（推荐）

在违规行尾或上方加注释：

```sql
-- allow-dynamic-ddl: 历史库兼容期，target_version={version} 移除
SET @exist := (SELECT COUNT(*) FROM information_schema.columns WHERE ...);
```

**机制说明**：
- 关键词 `-- allow-dynamic-ddl: <原因>` 已被 `superflow-sql-sync-hook.py` 识别为整文件豁免
- 本清单**新增** `-- allow-sql-risk-rule: <B1-B8>` 用于**单行 / 单规则**豁免，规则更精细

### 5.2 文件级豁免

在文件 header 中加 `-- allow-dynamic-ddl: <原因>`，整文件豁免（**慎用**，需 Leader 审批）。

### 5.3 评审豁免

评审人在 checklist 中**显式记录**豁免，并写明：
- 豁免规则编号
- 豁免位置（文件 + 行号）
- 豁免理由
- 移除/解除条件（如"target_version=2.0.0"）

---

## 6. 与 superflow-sql-sync-hook.py 的联动

本清单的 **B1-B8 禁用项** 已由 hook 强制阻断；**W1-W13 警告项** 新增为**警告级**，不阻断但提交流程记录到 test-report.md。

hook 升级清单（与本 reference 同步落地）：

| 改动 | 描述 |
|---|---|
| **拆分场景** | `CREATE TABLE IF NOT EXISTS`（建新表/备份表）从禁用移除，保留 `ALTER TABLE ADD COLUMN IF NOT EXISTS` 禁用 |
| **新增警告级规则** | W1-W13 的正则模式 + 警告输出，不返回 2（不阻断） |
| **W2 精确度提升** | 识别 `CASE WHEN ... REGEXP` 数字校验已覆盖 JSON NULL 风险，避免误报 |
| **新增 header 检查** | SQL 文件必须按 §4 模板写 header；缺 header 警告 |
| **新增豁免语法** | `-- allow-sql-risk-rule: <B#>` 单行豁免 |
| **新增子命令** | `--risk-review` 输出风险清单到 stdout（不阻断），便于 CI/手动扫描 |

### 6.1 需要人工源码审查的规则

评审中常见 **3 条规则需要源码审查才能正确判断**（hook 自动化不够，需人工）：

| 规则 | hook 能抓什么 | hook 抓不到需要源码审查的 |
|---|---|---|
| **W11 关系表误判** | ❌ 抓不到 | 业务 Service 是 `mapper.delete()`（物理）还是 `deleted=1`（软删除） |
| **W12 JSON 兜底精确度** | ⚠️ 部分（识别 COALESCE 即可放过） | 区分"用 COALESCE 兜底 NULL" vs "用 CASE WHEN REGEXP 校验非数字" |
| **W13 宽索引无用** | ❌ 抓不到 | Mapper XML/Repository 真实查询 + 数据量评估 |

**评审 SOP**（hook 自动化 + 人工源码审查）：
1. hook `--check-all` 跑一遍（B 类阻断、W 类警告）
2. **人工源码审查**（必做，hook 抓不到的 3 条）
3. 解决所有 B 类 + 评估 W11/W12/W13
4. checklist 全部勾选后才能进入实现阶段

---

## 7. 演进历史

| 版本 | 日期 | 来源 | 主要变更 |
|---|---|---|---|
| v1.0 | 2026-06-10 | SQL 风险评审规则整理 | 初版 |

**未来演进方向**：
- 根据后续项目发布评审结果新增/合并规则
- 接入 `superflow-verify-integration.sh` 自动跑 `--risk-review`
- 警告项 W1-W13 中命中 ≥3 项的 SQL 自动升级为禁用

---

## 8. 自动修复能力矩阵

`~/.codex/hooks/superflow-sql-sync-hook.py` 提供两个自动修复子命令：

- `python3 ~/.codex/hooks/superflow-sql-sync-hook.py --auto-fix`：dry-run，输出每个文件的修复报告
- `python3 ~/.codex/hooks/superflow-sql-sync-hook.py --auto-fix-write`：实际写文件（带 `.bak` 备份）

### 8.1 自动修复矩阵

| 规则 | 类别 | auto-fix 行为 | 原因 |
|---|---|---|---|
| **B1** ADD COLUMN IF NOT EXISTS | 禁用 | ✅ 自动删 `IF NOT EXISTS` | 删后字段已存在会显式报错，正是"早期暴露问题"的目标行为 |
| **B2** CREATE INDEX IF NOT EXISTS | 禁用 | ✅ 自动删 `IF NOT EXISTS` | 同 B1 |
| **B6** ALGORITHM= / LOCK= | 禁用 | ✅ 自动删子句 | 删除后由执行平台按目标库能力选择 DDL 策略，行为不变 |
| **W7** SQL 文件头缺失 | 警告 | ✅ 自动加文件头 | 头模板基于路径推断（`v1.2.3.feature.sql` → 版本 v1.2.3、批次 feature），评审人/涉及表/变更摘要字段留 `(待填)` 让人补 |
| B3 INFORMATION_SCHEMA | 禁用 | ⚠️ 输出修复模板 | 移除判断后，DDL 怎么写取决于具体业务场景，**必须人确认** |
| B4 PREPARE/EXECUTE | 禁用 | ⚠️ 输出修复模板 | 同 B3 |
| B5 SET @变量 | 禁用 | ⚠️ 输出修复模板 | 同 B3 |
| B7 FOREIGN KEY | 禁用 | ⚠️ 输出修复模板 | 移除外键会破坏数据库引用完整性约束，**需确认代码层有等效控制** |
| B8 ADD COLUMN NOT NULL 缺 DEFAULT | 禁用 | ⚠️ 输出修复模板 | 需人选默认值（0/''/CURRENT_TIMESTAMP/-1/NULL），**业务决策** |
| W1 UPDATE 相关子查询 | 警告 | ⚠️ 输出修复模板 | 改 JOIN 要懂 SQL 语义，**高风险自动改** |
| W2 JSON 提取缺 COALESCE | 警告 | ⚠️ 输出修复模板 | 兜底值（-1/NULL/业务默认值）需要人选 |
| W3 唯一键含 DATETIME | 警告 | ⚠️ 输出修复模板 | 改精度/加 segment_seq 是 schema 变更 |
| W4 INSERT IGNORE 迁移 | 警告 | ⚠️ 输出修复模板 | WHERE NOT EXISTS 的子查询条件依赖业务 |
| W5 宽索引 > 3 列 | 警告 | ⚠️ 输出修复模板 | 性能优化决策 |
| W6 业务实体表缺字段 | 警告 | ⚠️ 输出修复模板 | schema 决策 |
| W8 JSON 字段无 CHECK | 警告 | ⚠️ 输出修复模板 | 需人选 JSON_TYPE（OBJECT/ARRAY） |
| W9 大批量迁移未分批 | 警告 | ⚠️ 输出修复模板 | 分批策略是性能决策 |
| W10 test-report 缺对账表 | 警告 | ⚠️ 输出修复模板 | 文档类，需人填内容 |

### 8.2 auto-fix 典型工作流

```bash
# 1. 改完 SQL 后先 dry-run 扫一遍
python3 ~/.codex/hooks/superflow-sql-sync-hook.py --auto-fix

# 输出示例（节选）：
# === sql/{version}/{version}.{batch}.sql ===
#   ✅ [自动修] [B1] 移除 1 处 'IF NOT EXISTS' (ADD COLUMN)
#   ✅ [自动修] [W7] 添加 SQL 文件头（...）
#   ⚠️  [需开发者确认] sql/{version}/{version}.{batch}.sql:55 [W1] 回填类 UPDATE ...
#       修复模板：相关子查询改 JOIN：
#             原: UPDATE t SET x = (SELECT s.x FROM s WHERE s.id = t.id)
#             新: UPDATE t JOIN s ON s.id = t.id SET t.x = s.x
#   ⚠️  [需开发者确认] sql/{version}/{version}.{batch}.sql:60 [W2] JSON 提取 ...
#       修复模板：JSON 提取后必须 COALESCE 兜底：...

# 2. 确认 auto-fix 范围合理后实际写文件（带 .bak 备份）
python3 ~/.codex/hooks/superflow-sql-sync-hook.py --auto-fix-write

# 3. 处理"需开发者确认"项（按模板手工改或与产品/评审人对齐）

# 4. 再跑一次 --check-all 确认所有 B 类都已消除
python3 ~/.codex/hooks/superflow-sql-sync-hook.py --check-all
```

### 8.3 auto-fix 安全边界

**绝不自动改的项**：

- 任何涉及**业务默认值**的修改（`DEFAULT 0` 还是 `DEFAULT NULL`？是 `-1` 还是 `0`？）
- 任何涉及**业务查询模式**的修改（索引列怎么排、JSON_TYPE 选什么）
- 任何涉及**代码层引用完整性**的修改（移除外键前必须确认代码层有等效控制）
- 任何涉及**测试库/开发库状态**的修改（必须先看 `SHOW CREATE TABLE`）

**auto-fix 的安全前提**：

- 删除 `IF NOT EXISTS` 后的"字段已存在则报错"行为 = 目标行为（早期暴露）
- 删除 `ALGORITHM=/LOCK=` 后的"由执行平台选择"行为 = 目标行为（不强制参数）
- 添加文件头不会改变任何 DDL 语义，只影响注释

### 8.4 开发者确认 SOP

auto-fix 报告中的"⚠️ 需开发者确认"项，开发者必须：

1. **读懂修复模板**（不是无脑 apply）
2. **看上下文**：打开原 SQL 文件对应行号，确认是模板里描述的场景
3. **改完后**重新跑 `--check-all` 确认已消除
4. **复杂项**（B3/B4/B5/B7/B8）建议和 Reviewer/产品二次对齐再改

---

## 9. 演进历史（更新）

| 版本 | 日期 | 来源 | 主要变更 |
|---|---|---|---|
| v1.0 | 2026-06-10 | SQL 风险评审规则整理 | 初版 |
| v1.1 | 2026-06-10 | hook 升级 + auto-fix | §8 自动修复能力矩阵，auto-fixable: B1/B2/B6/W7；manual-review: 其他 |
| v1.2 | 2026-06-10 | 通用 SQL 风险评审补充 | §2.2 新增 W11/W12/W13（源码审查型规则）；§6.1 人工审查 SOP；W2 升级 `CASE WHEN REGEXP` 精确兜底 |
