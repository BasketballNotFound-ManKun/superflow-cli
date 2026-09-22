# Implementation Prompt — v0-5-12 全局安装架构优化

> 交接上下文包：[.sdd/handoff/sdd-context.md](../.sdd/handoff/sdd-context.md)（hash 以 `.sdd/state.yaml` 的
> `handoff_hash` 与 `.sdd/handoff/sdd-context.sha256` 一致为准，漂移即阻塞实现，禁止凭聊天记忆继续）。

## 必读合同（按序，全部为可点击链接）

1. [proposal.md](../proposal.md) — Why 与变更范围
2. [api.md](../api.md) — CLI/状态文件/脚本退出契约
3. [specs/hook-short-circuit/spec.md](../specs/hook-short-circuit/spec.md)、[specs/install-scope/spec.md](../specs/install-scope/spec.md)、[specs/managed-projects/spec.md](../specs/managed-projects/spec.md) — 行为合同
4. [design.md](../design.md) — 源码级 HOW（含 Superpowers Technical Design Handoff 与复杂度减法评审，技术详设继承本文与 design.md 的 technical_design 结论）
5. [tasks.md](../tasks.md) — 任务清单（按组推进、逐项勾选）
6. [tests.md](../tests.md) — TC-01~TC-12 用例与 RED/GREEN 契约（自动化命令见用例表）
7. [traceability-matrix.md](../traceability-matrix.md) — 需求↔设计↔任务↔测试↔源码锚点
8. [source-code-audit.md](../source-code-audit.md) — 源码事实冻结卡

## 强制执行顺序

1. 填写下方"Agent 执行前自检表"并回填 [test-report.md](../test-report.md)。
2. 先写 RED：按 tests.md 为 scope 推导、清单读写各写失败用例（TC-04、TC-06 应先失败）。
3. 组 2（scope 修复）→ 组 3（受管清单）→ 组 1（脚本短路，最小 diff：脚本头部插入，不动原逻辑）。
4. 每组完成跑 `npm test`；全量通过后执行组 4 回归与发版验收。

## 禁止项（继承 traceability-matrix，违反即返工）

1. 禁止迁移全局 hooks 到项目级；2. 禁止引入 launcher 转发层；3. 禁止修改 sql-sync-hook 双 matcher 行为（只补注释）；4. 禁止给 dependency-update-hook / auto-backup hooks 加项目短路；5. 禁止在短路分支读 stdin 或调 python3；6. 禁止让 state.json 损坏阻塞任何命令（空清单回落 + 警告）。

## 边界

- 允许修改：`assets/scripts/superflow-*.{sh,py}`（头部短路）、`src/app/commands/{init,uninstall,update}.ts`、state 读写相关模块、`test/unit/` 新增用例。
- 禁止修改：`src/domains/hook.ts` 函数签名与行为、skills/commands/rules 分发路径、既有测试断言（除非 RED 证明其锚定旧行为且 spec 已改）。
- 不适用声明：数据库/SQL、外部集成配置、并发幂等、金额精度均不涉及（`.openspec.yaml` 已声明）。
- 字段/状态反向影响面继承（读取/过滤点、派生/同步点）：见 [技术详设](../../../../docs/superpowers/specs/2026-09-22-v0-5-12-global-hooks-optimization-technical-design.md) 矩阵——scope 字段读取/过滤点为 uninstall/update 目标推导，managedProjects 派生/同步点为无，损坏/缺失一律回落不阻断。

## Agent 执行前自检表（编码前填写，回填 test-report.md）

```
真实入口已定位：superflow init/uninstall/update CLI + hook runner 触发脚本
字段语义合同已核对：state.json scope/managedProjects 字段语义见 api.md
写入闭环已核对：state 写入→三命令读取→资产清理/同步链路见 design.md D3/D4
禁止兜底边界已确认：损坏 state 按空清单+警告属 spec 要求，非兜底
RED 测试已执行：[待填，附失败输出位置]
允许修改文件：见上文"允许修改"
禁止修改文件：见上文"禁止修改"
阻塞项：无
```
