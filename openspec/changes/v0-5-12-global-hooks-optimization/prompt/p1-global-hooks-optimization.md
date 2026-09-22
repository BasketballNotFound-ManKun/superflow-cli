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
