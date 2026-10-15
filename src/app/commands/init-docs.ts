import fs from "node:fs";
import path from "node:path";
import type { Language } from "../../types.js";
import { resolveRuntimeLanguage } from "../../domains/config/cli-help.js";
import { resolveChangesRoot } from "../../domains/config/planning-home.js";

/**
 * 为 SDD change 生成全部必备文档骨架（业务无关模板）。
 *
 * 模板内嵌 guard 文案门禁的标准声明段（金额精度/并发幂等/外部集成/
 * 字段状态反向影响等），按"不适用"口径书写并标注改写指引——
 * 文档作者从"填空"开始，而不是对着 guard 的关键词清单多轮试错。
 * 适用场景必须把"不适用"改写为真实论证；生成器只提供结构，不提供内容。
 */

const PLACEHOLDER = "<待填写：>";

type FileSpec = { file: string; content: string };

function header(title: string): string {
  return `# ${title}\n`;
}

function changeFooter(): string {
  return `
> 实现入口：[prompt/implementation.md](prompt/implementation.md)
`;
}

function proposalTemplate(): string {
  return `${header("Proposal")}

## Why

${PLACEHOLDER} 问题与动机（为什么现在做）。

## What Changes

- ${PLACEHOLDER} 变更清单；破坏性变更标注 **BREAKING**。

## Capabilities

### New Capabilities

- \`<capability-path>\`: ${PLACEHOLDER} 能力边界一句话。

### Modified Capabilities

（无则留空；有则列出需求级变化）

## Impact

- **数据库**：${PLACEHOLDER}（涉及表/字段时必须在 release-sql.md 冻结）
- **后端**：${PLACEHOLDER}
- **前端/跨仓**：${PLACEHOLDER}
- **兼容性**：${PLACEHOLDER}
`;
}

function designTemplate(): string {
  return `${header("Design")}

## Context

${PLACEHOLDER} 现状与约束（源码锚点见 source-code-audit.md）。

## Goals / Non-Goals

**Goals:**

- ${PLACEHOLDER}

**Non-Goals:**

- ${PLACEHOLDER}（明确不做的事，含被否决方案及理由）

## Decisions

### D1: ${PLACEHOLDER}

**选择**：${PLACEHOLDER}

**替代方案**：${PLACEHOLDER}（否决原因）

> 行为级决策（错误码语义/兼容策略/API 请求响应行为变化/拒绝或放行策略）
> 在正文独立记录：owner-decided: YYYY-MM-DD | owner: <姓名/角色> | decision: <已确认结论>。
> 指引、引用、代码示例和未填占位符不构成确认；结论是否充分由 Agent 评审。

## Minimal Design Review 附注（复杂度减法评审）

新增项统计：表 0；字段 0；API 0；Service/组件 0；缓存 0；MQ/事件 0；定时任务 0；兼容层 0。按实际设计替换数量，不适用时保留 0。

- 复杂度减法评审（Complexity Reduction Review）：PASS（复用既有模块、最简实现、拒绝项见上）。

## Superpowers Technical Design Handoff

源码级 HOW 见 \`technical_design\`（登记于 .sdd/state.yaml）；OpenSpec/SDD 文档是 WHAT/API/DB/tests 的 canonical 事实源，本文不得覆盖。
`;
}

function tasksTemplate(): string {
  return `${header("Tasks")}

## 1. ${PLACEHOLDER}

- [ ] 1.1 ${PLACEHOLDER}（验收：${PLACEHOLDER}）

## SQL 风险评审 checklist

**评审人**：${PLACEHOLDER}    **评审时间**：${PLACEHOLDER}

### 禁用项检查
- [ ] B1-B8 无违规（或已显式豁免，豁免理由：${PLACEHOLDER}）

### 警告项检查（test-report.md 必须记录处理结论）
- [ ] W1-W13 逐项勾选处理结论（已修复 / 评审豁免 / 不适用及理由）

### 评审结论
- [ ] **通过**：进入实现阶段
`;
}

function apiTemplate(): string {
  return `${header("API Contract")}

> 统一返回结构、基础路径、鉴权方式在此说明。

## 1. ${PLACEHOLDER} 接口

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| ${PLACEHOLDER} | | | |

### 响应

- 成功：${PLACEHOLDER}
- 失败：${PLACEHOLDER}（错误码语义可区分）
`;
}

function testsTemplate(): string {
  return `${header("Tests")}

> 层级：L1=单测；L2=集成单测；L3=真实接口自动化（含 curl/token 流程）；L4=跨系统链路。

| 用例ID | 层级 | 对应 Scenario | 前置 | 操作 | 自动化命令/断言 | RED 预期 | GREEN 预期 | DB 核查 | 证据位置 |
|---|---|---|---|---|---|---|---|---|---|
| T-01 | L1 | ${PLACEHOLDER} | | | | | | | test-report §L1 |

## 阻塞与替代证据边界

${PLACEHOLDER}（环境不可用时标 Partially verified，不得写 Passed）
`;
}

function releaseSqlTemplate(): string {
  // sha256 生成后填写；SQL 块必须含一条变更语句与一条验证语句（SELECT/SHOW）
  return `---
database_change: true
target_sql_path: ${PLACEHOLDER}
copy_policy: verbatim
sql_sha256: <待填写：64 位小写 SHA-256，对下方唯一 sql 块计算>
---

# Release SQL

> 实现 Agent 只有复制权：原样复制唯一 SQL 块到 target_sql_path 并核对 sha256，不得改写。

\`\`\`sql
-- ${PLACEHOLDER} 变更说明
ALTER TABLE ${PLACEHOLDER};

-- 执行后验证
SELECT 1;
\`\`\`
`;
}

function reviewChecklistTemplate(): string {
  return `${header("Review Checklist")}

## 安全（最高优先）

- [ ] ${PLACEHOLDER}

## 正确性

- [ ] ${PLACEHOLDER}

## 性能

- [ ] ${PLACEHOLDER}

## 可维护性

- [ ] ${PLACEHOLDER}

## 测试证据

- [ ] tests.md 全部用例在 test-report.md 有对应证据或阻塞说明
`;
}

function traceabilityTemplate(): string {
  return `${header("Traceability Matrix")}

| Requirement（spec） | 场景 | 设计决策 | 任务 | 测试用例 | 禁止项 |
|---|---|---|---|---|---|
| ${PLACEHOLDER} | ${PLACEHOLDER} | ${PLACEHOLDER} | ${PLACEHOLDER} | ${PLACEHOLDER} | ${PLACEHOLDER} |
`;
}

function sourceCodeAuditTemplate(): string {
  return `${header("Source Code Audit")}

> 影响面发现方式：${PLACEHOLDER}（understand 索引 / rg 反查 / 前端产物检索 / Mapper XML 核查）。
> 事实断言必须携带**验证命令**（可复核），无命令的结论标注 unverified 并禁止作为设计依据。

## 审计结论表

| 业务结论 | 数据模型 | 所有写入方 | 真实用户入口 | 遗留冲突 | DB是否必查 | 结论等级 | owner决策 | **验证命令（可复核）** |
|---|---|---|---|---|---|---|---|---|
| ${PLACEHOLDER} | ${PLACEHOLDER} | ${PLACEHOLDER}（文件:行号） | ${PLACEHOLDER} | ${PLACEHOLDER} | ${PLACEHOLDER} | 确定 | ${PLACEHOLDER} | \`${PLACEHOLDER}\` |

## 证据分类（Evidence classifications）

current / legacy / unmounted / data-model-only / owner-confirmed / blocked 各类证据的判定与数量：${PLACEHOLDER}

## 提问资格门禁（Question Eligibility Gate）

仓库可查事实已全部自查；仅行为级决策进入 owner 提问清单：${PLACEHOLDER}
`;
}

function qualityGateTemplate(): string {
  return `${header("SDD Quality Gate")}

## 文档完整性清单（docs 阶段出口）

| 文件 | 状态 |
|---|---|
| proposal.md / specs / design.md / tasks.md | 存在 |
| api.md / tests.md / release-sql.md | 存在 |
| review-checklist.md / traceability-matrix.md / test-report.md | 存在 |
| prompt/implementation.md | 存在 |
| .sdd/state.yaml 与 handoff | 存在 |

## Handoff

- hash 绑定以 .sdd/state.yaml 的 handoff_hash 为单点，本文不重复回填。

## 并发与幂等归属（Concurrency And Idempotency Ownership）

| 并发点 | 防护机制 | 幂等性 | 失败归属 |
|---|---|---|---|
| ${PLACEHOLDER} | ${PLACEHOLDER} | ${PLACEHOLDER} | ${PLACEHOLDER} |

- 业务幂等键（business idempotency key）：${PLACEHOLDER}
- 应用层原子占用（application-layer atomic claim）：${PLACEHOLDER}
- 短事务边界（short transaction boundary）：${PLACEHOLDER}
- 状态机（state machine）：${PLACEHOLDER}（成功/失败终态，无待处理中间态）
- 重试合同（retry contract）：${PLACEHOLDER}
- 外部调用边界（external call boundary）：${PLACEHOLDER}
- 唯一索引（unique index）不是默认并发防护：${PLACEHOLDER}

## Money Precision Boundary（金额精度边界）——不适用声明模板

- 规则来源/合同依据：按"涉及金额字段"触发；本 change ${PLACEHOLDER}（无金额字段则判定不触发）。
- exact representation / binary floating-point prohibition：无 BigDecimal 需求，禁止 float/double 存储金额。
- currency contract / minor-unit boundary：无币种与最小单位语义。
- rounding level / rounding audit / forbidden early rounding：无舍入层级、无舍入前/舍入后状态、无提前舍入风险。
- deterministic residual tie-breaker / authoritative total / complement derivation / reconciliation：无尾差分摊、无权威总额、无差额反推、无金额对账。
- settlement/display boundary / calculation state / scale and rounding mode / independent calculation prohibition：无结算展示态、无计算态精度迁移、无 scale 与舍入模式、无分别计算。
- persistence precision contract：持久化不适用小数精度（无 DECIMAL/NUMERIC 金额列）。
- **若任一条实际适用，必须删除"不适用"并写真实论证与 owner 确认。**

## 复杂度减法评审（Complexity Reduction Review）：${PLACEHOLDER}

## 外部集成配置与部署合同（External Integration Configuration And Deployment Contract）

- **环境矩阵（本地/测试/生产 environment matrix）**：${PLACEHOLDER}
- **注入/供给方式（provisioning）**：${PLACEHOLDER}
- **运行 owner 与时点（owner and timing）**：${PLACEHOLDER}
- **就绪证据（readiness evidence）**：${PLACEHOLDER}
- **回滚（rollback）**：${PLACEHOLDER}
- **密钥/凭据（secret handling）**：${PLACEHOLDER}
- **不得硬编码外部配置（no hard-coded external config）**：${PLACEHOLDER}
- **测试/生产区分（test-production distinction）**：${PLACEHOLDER}
`;
}

function testReportTemplate(): string {
  return `${header("Test Report")}

> 占位骨架；实现阶段按 tests.md 回填，禁止把 mock-only/跳过写成 Passed。

## L1 单测证据

| 用例 | 结果 | 失败输出/说明 |
|---|---|---|
| （回填） | 待执行 | |

## L3 接口自动化证据

| 用例 | curl 命令 | 响应摘要 | DB 核查 | 日志 grep | 结果 |
|---|---|---|---|---|---|
| （回填） | | | | | |

## SQL 收口对账表

| 编号 | 表 | 字段 | 源码引用 | 总SQL位置 | 开发库状态 | 测试库状态 | 处理结论 |
|---|---|---|---|---|---|---|---|
| （回填） | | | | | | | |
` + changeFooter();
}

function implementationPromptTemplate(): string {
  return `${header("Implementation Prompt")}

## 必读文档

1. [sdd-context.md](../.sdd/handoff/sdd-context.md)（hash 见 .sdd/state.yaml 的 handoff_hash）
2. [proposal.md](../proposal.md) / [design.md](../design.md) / [api.md](../api.md) / [tests.md](../tests.md) / [release-sql.md](../release-sql.md) / [source-code-audit.md](../source-code-audit.md)

## 强制执行顺序（数据库迁移类硬门禁）

1. 核对当前数据库结构 → 2. 原样复制 release-sql.md 唯一 SQL 块并核对 sha256 → 3. 执行并回填证据 → 4. 才允许开始编码；失败立即停止，禁止写代码绕过。

## 执行前自检表

- [ ] 真实入口已定位
- [ ] 字段语义合同已核对
- [ ] 写入闭环已核对
- [ ] 禁止兜底边界已确认
- [ ] RED 测试已执行
- [ ] 允许修改文件 / 禁止修改文件
- [ ] 阻塞项

## 任务完成定义

应用已启动、接口已真实调用、数据库已验证、日志无 ERROR、test-report 已回填、验收脚本通过。

## Money Precision 继承 / 并发幂等继承 / 外部配置继承

见 [sdd-quality-gate.md](../sdd-quality-gate.md) 对应章节，按"适用/不适用"如实继承，禁止删改既有断言。
`;
}

export function initDocsCommand(
  changeName: string,
  options: { projectPath?: string; force?: boolean; language?: Language } = {},
): void {
  const language = resolveRuntimeLanguage(options.language);
  const projectPath = path.resolve(options.projectPath ?? process.cwd());
  const changeDir = path.join(resolveChangesRoot(projectPath), changeName);

  if (!fs.existsSync(changeDir)) {
    console.error(language === "en"
      ? `Error: change directory does not exist: ${changeDir} (create it with openspec new change first)`
      : `错误：change 目录不存在: ${changeDir}（先用 openspec new change 创建）`);
    process.exit(1);
  }

  const specs: FileSpec[] = [
    { file: "proposal.md", content: proposalTemplate() },
    { file: "design.md", content: designTemplate() },
    { file: "tasks.md", content: tasksTemplate() },
    { file: "api.md", content: apiTemplate() },
    { file: "tests.md", content: testsTemplate() },
    { file: "release-sql.md", content: releaseSqlTemplate() },
    { file: "source-code-audit.md", content: sourceCodeAuditTemplate() },
    { file: "review-checklist.md", content: reviewChecklistTemplate() },
    { file: "traceability-matrix.md", content: traceabilityTemplate() },
    { file: "sdd-quality-gate.md", content: qualityGateTemplate() },
    { file: "test-report.md", content: testReportTemplate() },
    { file: "prompt/implementation.md", content: implementationPromptTemplate() },
  ];

  const created: string[] = [];
  const skipped: string[] = [];
  for (const spec of specs) {
    const target = path.join(changeDir, spec.file);
    if (fs.existsSync(target) && !options.force) {
      skipped.push(spec.file);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, language === "en" ? englishTemplates[spec.file] : spec.content, "utf-8");
    created.push(spec.file);
  }

  const messages = language === "en" ? {
    summary: `init-docs complete: created ${created.length}, skipped ${skipped.length}.`,
    created: "Created", skipped: "Skipped", existing: "exists; --force overwrites",
    next: "Next steps:",
    fill: 'Fill all <fill:> placeholders; replace applicable "not applicable" statements with actual reasoning.',
    state: "Initialize .sdd/state.yaml and handoff: superflow-state.sh init / superflow-handoff.sh --refresh",
    check: "Validate: superflow check <change> --level coding-ready",
  } : {
    summary: `init-docs 完成：创建 ${created.length} 份，跳过已存在 ${skipped.length} 份。`,
    created: "创建", skipped: "跳过", existing: "已存在，--force 覆盖",
    next: "下一步：",
    fill: '填写各文档 <待填写：> 占位；适用场景把质量门"不适用"声明改写为真实论证。',
    state: ".sdd/state.yaml 初始化与 handoff：superflow-state.sh init / superflow-handoff.sh --refresh",
    check: "校验：superflow check <change> --level coding-ready",
  };
  console.log(messages.summary);
  for (const file of created) console.log(`  ${messages.created} ${file}`);
  for (const file of skipped) console.log(`  ${messages.skipped} ${file} (${messages.existing})`);
  console.log(`\n${messages.next}`);
  console.log(`  1. ${messages.fill}`);
  console.log(`  2. ${messages.state}`);
  console.log(`  3. ${messages.check}`);
}

const englishTemplates: Record<string, string> = {
  "proposal.md": `# Proposal

## Why

<fill:> Problem and motivation: why now.

## What Changes

- <fill:> List changes; mark breaking changes **BREAKING**.

## Capabilities

### New Capabilities

- \`<capability-path>\`: <fill:> Capability boundary.

### Modified Capabilities

Leave empty when none; otherwise list requirement-level changes.

## Impact

- **Database**: <fill:> Freeze table/field changes in release-sql.md.
- **Backend**: <fill:>
- **Frontend/cross-repository**: <fill:>
- **Compatibility**: <fill:>
`,
  "design.md": `# Design

## Context

<fill:> Current behavior and constraints; source anchors in source-code-audit.md.

## Goals / Non-Goals

**Goals:**

- <fill:>

**Non-Goals:**

- <fill:> Include rejected alternatives and reasons.

## Decisions

### D1: <fill:>

**Choice**: <fill:>

**Alternatives**: <fill:> Rejection reason.

> Behavior decisions (error codes, compatibility, request/response behavior, rejection or acceptance) need a confirmed owner record in the body.
> Format: \`owner-decided: YYYY-MM-DD | owner: <name/role> | decision: <confirmed conclusion>\`.
> Instructions, quoted examples, code blocks and unfilled placeholders are not confirmation. Semantic adequacy remains Agent-owned.

## Minimal Design Review

New-item counts: tables 0; fields 0; APIs 0; services/components 0; caches 0; MQ/events 0; scheduled jobs 0; compatibility layers 0.

Complexity Reduction Review: PASS (reuse existing modules, simplest implementation, rejected items above).

## Superpowers Technical Design Handoff

Source-level HOW is in \`technical_design\` registered in .sdd/state.yaml; OpenSpec/SDD documents are canonical for WHAT/API/DB/tests and must not be overridden.
`,
  "tasks.md": `# Tasks

## 1. <fill:>

- [ ] 1.1 <fill:> (acceptance: <fill:>)

## SQL Risk Review Checklist

**Reviewer**: <fill:> **Review date**: <fill:>

### Prohibited items
- [ ] B1-B8 have no violations, or explicit waivers with reasons: <fill:>

### Warnings (record conclusions in test-report.md)
- [ ] W1-W13 individually resolved: fixed / waived / not applicable with reason.

### Verdict
- [ ] **PASS**: proceed to implementation.
`,
  "api.md": `# API Contract

> Describe the common response format, base path and authentication.

## 1. <fill:> API

| Field | Type | Required | Description |
|---|---|---|---|
| <fill:> | | | |

### Response

- Success: <fill:>
- Failure: <fill:> Distinguishable error-code semantics.
`,
  "tests.md": `# Tests

> Layers: L1=unit; L2=integration unit; L3=real API automation including curl/token; L4=cross-system chain.

| Case ID | Layer | Scenario | Setup | Action | Automation command/assertion | RED expected | GREEN expected | DB checks | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| T-01 | L1 | <fill:> | | | | | | | test-report L1 |

## Blockers and Alternative Evidence

<fill:> An unavailable environment is Partially verified, never Passed.
`,
  "release-sql.md": `---
database_change: true
target_sql_path: <fill:>
copy_policy: verbatim
sql_sha256: <fill: 64 lowercase SHA-256 characters computed from the unique sql block>
---

# Release SQL

> The implementation Agent may only copy the unique SQL block verbatim to target_sql_path and verify sha256; do not rewrite it.

\`\`\`sql
-- <fill:> Change description
ALTER TABLE <fill:>;

-- Post-execution verification
SELECT 1;
\`\`\`
`,
  "review-checklist.md": `# Review Checklist

## Security (highest priority)

- [ ] <fill:>

## Correctness

- [ ] <fill:>

## Performance

- [ ] <fill:>

## Maintainability

- [ ] <fill:>

## Test Evidence

- [ ] Every tests.md case has evidence or a blocker in test-report.md.
`,
  "traceability-matrix.md": `# Traceability Matrix

| Requirement (spec) | Scenario | Design decision | Task | Test case | Forbidden effects |
|---|---|---|---|---|---|
| <fill:> | <fill:> | <fill:> | <fill:> | <fill:> | <fill:> |
`,
  "source-code-audit.md": `# Source Code Audit

> Impact discovery: <fill:> (understand index / rg / frontend artifacts / Mapper XML).
> Every fact assertion needs a reproducible verification command; unverified conclusions cannot drive design.

## Audit Conclusions

| Business conclusion | Data model | All writers | Real user entry | Legacy conflict | DB check required | Conclusion level | owner decision | Verification command |
|---|---|---|---|---|---|---|---|---|
| <fill:> | <fill:> | <fill:> (file:line) | <fill:> | <fill:> | <fill:> | confirmed | <fill:> | \`<fill:>\` |

## Evidence classifications

Classification criteria and counts for current / legacy / unmounted / data-model-only / owner-confirmed / blocked: <fill:>

## Question Eligibility Gate

Repository facts have been investigated; only behavior decisions go to the owner: <fill:>
`,
  "sdd-quality-gate.md": `# SDD Quality Gate

## Document Completeness (docs exit)

| Files | Status |
|---|---|
| proposal.md / specs / design.md / tasks.md | exists |
| api.md / tests.md / release-sql.md | exists |
| review-checklist.md / traceability-matrix.md / test-report.md | exists |
| prompt/implementation.md | exists |
| .sdd/state.yaml and handoff | exists |

## Handoff

- .sdd/state.yaml handoff_hash is the single hash record; do not duplicate it here.

## Concurrency And Idempotency Ownership

| Concurrency point | Protection | Idempotency | Failure owner |
|---|---|---|---|
| <fill:> | <fill:> | <fill:> | <fill:> |

- business idempotency key: <fill:>
- application-layer atomic claim: <fill:>
- short transaction boundary: <fill:>
- state machine: <fill:> (success/failure terminal states, no pending intermediate state)
- retry contract: <fill:>
- external call boundary: <fill:>
- unique index is not the default concurrency protection: <fill:>

## Money Precision Boundary - Not Applicable Template

- Rule/contract source: triggered by money fields; this change <fill:> (no money fields means not triggered).
- exact representation / binary floating-point prohibition: no BigDecimal requirement; do not store money as float/double.
- currency contract / minor-unit boundary: no currency or minor-unit semantics.
- rounding level / rounding audit / forbidden early rounding: no rounding levels, before/after state, or early rounding risk.
- deterministic residual tie-breaker / authoritative total / complement derivation / reconciliation: no residual allocation, authoritative total, complement derivation, or monetary reconciliation.
- settlement/display boundary / calculation state / scale and rounding mode / independent calculation prohibition: no settlement/display state, calculation precision migration, scale/rounding mode, or independent calculations.
- persistence precision contract: no DECIMAL/NUMERIC money columns.
- **For every applicable item replace the non-applicability statement with actual reasoning and owner confirmation.**

## Complexity Reduction Review: <fill:>

## External Integration Configuration And Deployment Contract

- **Environment matrix (local/test/production)**: <fill:>
- **Injection/provisioning**: <fill:>
- **Owner and timing**: <fill:>
- **Readiness evidence**: <fill:>
- **Rollback**: <fill:>
- **Secret handling**: <fill:>
- **No hard-coded external config**: <fill:>
- **Test-production distinction**: <fill:>
`,
  "test-report.md": `# Test Report

> Skeleton only; populate from tests.md during implementation. Never report mock-only or skipped tests as Passed.

## L1 Unit Evidence

| Case | Result | Failure output/notes |
|---|---|---|
| (fill) | Not run | |

## L3 API Automation Evidence

| Case | curl command | Response summary | DB check | Log grep | Result |
|---|---|---|---|---|---|
| (fill) | | | | | |

## SQL Reconciliation

| ID | Table | Field | Source reference | Aggregate SQL location | Dev DB state | Test DB state | Resolution |
|---|---|---|---|---|---|---|---|
| (fill) | | | | | | | |

> Implementation: [prompt/implementation.md](prompt/implementation.md)
`,
  "prompt/implementation.md": `# Implementation Prompt

## Required Reading

1. [sdd-context.md](../.sdd/handoff/sdd-context.md) (hash: .sdd/state.yaml handoff_hash)
2. [proposal.md](../proposal.md) / [design.md](../design.md) / [api.md](../api.md) / [tests.md](../tests.md) / [release-sql.md](../release-sql.md) / [source-code-audit.md](../source-code-audit.md)

## Mandatory Order (database migration gate)

1. Check current schema. 2. Copy the unique release-sql.md SQL block verbatim and verify sha256. 3. Execute and record evidence. 4. Only then implement. Stop on failure; never bypass through code.

## Pre-execution Checklist

- [ ] Locate the real entry.
- [ ] Check field semantics.
- [ ] Check write closure.
- [ ] Confirm forbidden fallbacks.
- [ ] Execute RED tests.
- [ ] Allowed / forbidden files.
- [ ] Blockers.

## Definition of Done

Application started, real APIs invoked, database verified, no ERROR logs, test-report populated, acceptance scripts passed.

## Inherited Money Precision / Concurrency / External Configuration

Inherit the applicable or non-applicable sections of [sdd-quality-gate.md](../sdd-quality-gate.md); do not remove or change existing assertions.
`,
};
