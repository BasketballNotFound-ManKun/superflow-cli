---
name: superflow-quick-dev
description: Superflow 内部能力：处理目标清晰且影响范围小的代码任务，风险或边界不明时转需求澄清。由 $superflow 选择，用户无需手动分流。
license: MIT
metadata:
  author: superflow
  version: '1.0'
---

# Superflow Quick Dev

只接单一、低爆炸半径、沿已有 seam 的代码工作。

## 窄门

先查真实源码、调用方和测试，再运行
`superflow quick "<request>" --json --path <changed-files...> --seam <existing-file>`。
只有确认**同一行为**由在途 SDD 变更拥有时才追加 `--active-sdd`；仅复用其代码或依赖
其产出，不等于同一变更。只有返回
`QUICK` 才能继续。公共 API、数据库/迁移、事务、并发、锁、权限、安全、支付、跨模块、
在途 SDD 变更或非独占工作树必须返回 `STOP`，转 `superflow-clarify`。若项目还安装了其他工作流，不得因为技能可见就自动改派；只有用户明确选择时才切换。

## Quick Spec

在 `.sdd/tasks/<YYYY-MM-DD>-<slug>/spec.md` 写入并展示当前磁盘版本，内容必须包含：

- Intent / Non-goals；
- Current behavior / Target behavior；
- 已确认的测试 seam，以及按[测试指南](../superflow/references/test-guide.md)选择的适用信号、命令、断言和证据位置；
- 按依赖排序的实施步骤；
- Given / When / Then 验收条件；
- 风险、升级条件和 deferred；
- baseline commit 与精确文件范围。

用户批准前不得修改运行时代码；收到当前磁盘版本的明确批准后，才运行
`superflow quick "<request>" --path <files...> --seam <existing-file> --spec <spec> --approve`。
CLI 将当前内容摘要绑定到批准状态。Intent、Non-goals 或 Acceptance Criteria 变化时回到
`draft`，重新批准后才实施。先读取[测试指南](../superflow/references/test-guide.md)，核对当前批准的 Quick Spec 已冻结适用信号、命令、
断言和证据位置；缺项先补齐并重新批准；按 TDD 逐项跑 RED/GREEN，完成后复用 `superflow review-coverage` 和 `superflow eval` 的证据格式收口。

Quick 路径不创建 OpenSpec checkpoint，也不自动提交、推送或发布；一旦范围扩大，保留
spec 作为线索并转正式 SDD。
