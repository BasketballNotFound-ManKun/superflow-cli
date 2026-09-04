# 托管交付闭环

Superflow 托管交付是一个由一个 Host Agent 和一个对端 Executor Agent 组成、且有调用上限的工程闭环。它既能接受简单开发任务，也能接受冻结的 Superflow / SDD 合同。

## 闭环如何运转

```text
任务输入 → 对端实现并验证 → Host 评审
                            ├─ 未通过 → 对端整改 ↺
                            └─ 通过 → 交付就绪状态
```

对端不能自行决定“可以发布”；Host 也不会暗中改写对端的实现。Superflow 会在每一步落盘保存任务合同、证据、finding 和状态。

## 什么会驱动下一轮

Host 按冻结合同、工作区变更、确定性门禁和任务要求的证据做评审。结构化的 `needs_fix` 会把明确的 finding 与仍有效的历史证据一并交给对端。对端在当前工作区继续整改指定问题。

Host 给出 `pass`、预算达到上限、出现需要人工处理的安全阻断，或用户暂停任务时，闭环停止。

## 职责归属

| 职责 | Owner |
| --- | --- |
| 冻结任务并记录确定性状态 | Superflow Runner |
| 修改源码、启动服务、执行验证 | 对端 Executor |
| 判断正确性、充分性和交付证据 | 当前 Host |
| 决定 Git、部署或生产写入 | 用户 |

## 必须知道的边界

- 默认最多 5 轮 Host 评审、7 次对端调用、12 次总调用，避免无限消耗 token。
- 已完成工作会根据结构化任务分类和签收证据进入 `local_delivery_ready`、`environment_validation_blocked` 或 `release_ready`。
- `release_ready` 是交付结论，不是 Git 提交、推送、发布、部署、执行 SQL 或写生产数据的授权。
- Runner 保存快照、哈希、账本、finding 和可继承证据，因此整改或恢复不会从一份空上下文开始。

协议字段与状态机细节见[托管 Agent 协议](./managed-agent-protocol.md)和[托管功能设计宪章](./managed-work-design-principles.md)。
