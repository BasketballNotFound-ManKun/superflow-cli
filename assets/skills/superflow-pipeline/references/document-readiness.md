# 文档交付就绪合同

## 适用性声明

在 change 的 `.openspec.yaml` 中显式声明适用范围。关键词扫描只能提示风险，不能覆盖
明确的适用性结论。

```yaml
schema: superflow/v1
applicability:
  cross_repo: true
  complex_logic: true
  mermaid: required
  environment: required
  database: false
  external_config: false
  concurrency: false
  money: false
```

`money: false` 只表示本次不修改金额计算、舍入、分摊或财务展示，不允许借此绕过真实的
金额改动。若源码影响面证明涉及金额，必须改为 `true` 并补齐金额合同。

## 三轮评审凭证

文件：`.sdd/reviews/document-review.json`

```json
{
  "schemaVersion": "superflow.document-review.v1",
  "handoffHash": "<当前 64 位 handoff hash>",
  "verdict": "PASS",
  "openOwnerDecisions": [],
  "rounds": [
    {
      "round": 1,
      "lens": "source-contract",
      "inputHash": "<同一当前 handoff hash>",
      "findings": []
    },
    {
      "round": 2,
      "lens": "architecture-minimality",
      "inputHash": "<同一当前 handoff hash>",
      "findings": []
    },
    {
      "round": 3,
      "lens": "e2e-environment",
      "inputHash": "<同一当前 handoff hash>",
      "findings": []
    }
  ]
}
```

发现项不能直接删除。修复后保留记录并写 `"status": "closed"`、证据和关闭位置。所有轮次
必须重新基于当前 hash 复核；旧 hash 的 PASS 无效。

## 环境预检合同

文件：`.sdd/readiness/environment.json`

```json
{
  "schemaVersion": "superflow.environment-readiness.v1",
  "handoffHash": "<当前 handoff hash>",
  "scope": "local-dev",
  "overall": "READY",
  "ownerHelpRequired": [],
  "checks": [
    {
      "id": "service-config",
      "type": "file",
      "target": "../../../service-a/src/main/resources/application-dev.yml",
      "status": "READY"
    },
    {
      "id": "redis",
      "type": "tcp",
      "host": "127.0.0.1",
      "port": 6379,
      "timeoutMs": 1500,
      "status": "READY"
    },
    {
      "id": "service-health",
      "type": "http",
      "url": "http://127.0.0.1:8080/actuator/health",
      "expectedStatus": [200],
      "status": "READY"
    }
  ]
}
```

可用检查类型：`file`、`directory`、`executable`、`tcp`、`http`。禁止在 URL 中嵌入
用户名、密码或 Token。数据库、Redis、MQ 的写操作和生产调用不属于预检；需要真实数据
时在测试合同中单独声明安全边界。

## 复杂逻辑图

当 `cross_repo` 或 `complex_logic` 为 `true`，至少提供：

- `sequenceDiagram`：真实入口、模块顺序、成功和失败返回；
- `flowchart` 或 `stateDiagram`：状态/分支、补偿 owner、禁止 fallback。

## Coding Ready

```bash
superflow check <change> --level docs
superflow check <change> --level coding-ready
```

第二条命令成功后生成 `.sdd/readiness/coding-ready.json`。任何 SDD 文档或 handoff hash
变化都会让旧凭证失效。开发 Agent 只能接收当前凭证已通过的 change。

## 跨系统失败归属

详设必须填写：

`失败信号 | 解释方 | 补偿方 | 是否允许重试 | 幂等依据 | 可接受的小窗口 |
极端兜底 | owner确认`

默认采用快速失败、失败关闭、至多一次和调用方补偿。只有 owner 明确要求并证明幂等时，
才允许透明重试、改投、补发或新的分布式补偿。
