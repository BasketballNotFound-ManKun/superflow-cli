# P1 任务 Prompt — v0-5-12 全局安装架构优化

> 总入口与完整合同：[implementation.md](implementation.md)。
> 本文件是该变更唯一实现任务（单任务变更）的执行清单，继承同一 handoff hash 与禁止项。

## 执行清单（对应 [tasks.md](../tasks.md) 分组）

| 组 | 内容 | 关键验证 |
|---|---|---|
| 2 | scope 一致性修复（types/state/uninstall/update） | TC-04/05/10 + `npx vitest run test/unit/install-scope.test.ts` |
| 3 | 受管项目清单（登记/遍历清理/遍历同步） | TC-06~09 |
| 1 | 8 个 hook 脚本前置短路（bash 首可执行行前 / py import 块后） | TC-01~03 空目录 exit 0 无输出 |
| 4 | 全量回归 + 发版迁移 + 装版二次验证 | 594 用例、残留 0、拦截 exit 2 |

## 完成定义

全部任务勾选 + [test-report.md](../test-report.md) 终态 PASS + 发版 tag 合规（release:check 通过）。

## 继承声明（防上下文漂移）

- 上下文漂移防护：以 [.sdd/handoff/sdd-context.md](../.sdd/handoff/sdd-context.md) 为唯一交接包，hash 以 `.sdd/state.yaml` 的 `handoff_hash` 为准；会话压缩/换手后必须先 recover，禁止凭聊天记忆继续。
- Superpower 技术详设继承（technical_design，源码级 HOW）：见 [技术详设](../../../../docs/superpowers/specs/2026-09-22-v0-5-12-global-hooks-optimization-technical-design.md) 的精确修改点与 TDD 顺序；WHAT/API/tests 合同仍由 OpenSpec 文档约束，本文不得覆盖。
- 字段/状态反向影响面继承（读取/过滤点、派生/同步点）：scope 字段读取/过滤点为 uninstall/update 目标推导；managedProjects 派生/同步点为无；损坏/缺失一律回落不阻断。
