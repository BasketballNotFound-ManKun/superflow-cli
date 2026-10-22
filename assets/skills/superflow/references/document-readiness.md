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

## Canonical body repair

按 Behavior Decision Matrix 的 Canonical owner 修正正文：spec/API 回 contracts，
HOW 回 design，验证回 tests 的 contracts 职责，导航回 handoff。当前 Flow Owner 承接这些职责，
核原需求与实际源码后替换错误段落，更新全部消费者引用；过时决定隔离为历史。
逐处搜索旧值、算法与用例，不能靠优先级声明保留相反当前正文。再刷新 handoff 和实际独评，
最后重发 Coding Ready；重绑 hash 或手改凭证不证明修复/复评。
统一当前 observed-delivery.v1；所有执行用例冻结 runner-captured.v1 与 executionContext，
缺项先补正文与实际评审，保持 BLOCKED。历史文件保留 PARTIAL；每份 PASS receipt 须实际 capture。
仅实现源码演进继续沿 build 的 checkCode:false 核合同，不冻结实现代码不准变化。

## Final document review inputs

full 必须先完成调查、正文与完整 HOW，设置 state.technical_design，并将其实际路径以
role: contract 登记到 coverage.sources。运行 `superflow-handoff.sh <change-dir> --refresh`；
只读 `--manifest` 可核同源来源集合与规范化指纹，不能代替正文阅读。
声明 HOW 可以位于 change 外，但必须在可核验 Git 项目根内；仅支持 .md/.yaml/.yml，
拒绝 .sdd/.git、test-report.md、项目外路径和不支持后缀。必须是真实 handoff 成员，
只加 contract 字段不够。来源路径相对 change，复用当前 handoff 算法，不另算 HOW hash。

HOW 纳入当前 handoff 后，现有 source-contract 读源码事实/契约与 HOW，
architecture-minimality 读职责、边界与复杂度，e2e-environment 读测试/环境可执行性。
Reviewer 从原需求独立列范围及反例，再与作者台账比较；实际读取相关正文、方法体、
未改调用者、批量旁路和共享状态消费者。早期评审可供探索，不能只重绑 inputHash 算最终通过。
修正文与引用后实际复核受影响结论；三个视角的当前记录均绑定当前规范化 handoff inputHash。
保留历史 finding 和复评证据；字段/哈希仅证明输入身份，不能证明真实阅读、独立性或充分性。
由 handoff 完成最终文档评审与交接，再运行 Coding Ready；不增加第四轮或固定 Agent 人数。


## 三轮评审凭证

下方为基础字段示例，不是完整凭证。0.5.10 起必须同时按
[需求×真实入口评审](document-review-coverage.md) 添加 `coverage`，以及 source-contract/
e2e-environment 轮的 `reviewedPairs`。旧凭证需要补齐并重新评审。

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
  "schemaVersion": "superflow.environment-readiness.v2",
  "handoffHash": "<当前 handoff hash>",
  "scope": "local-dev",
  "overall": "READY",
  "ownerHelpRequired": [],
  "executionContract": {
    "applicationLocation": "local",
    "dependencyPolicy": "shared-dev",
    "allowLocalProvisioning": false,
    "allowRemoteDevDependencies": true,
    "allowedOverrides": ["server.port"],
    "forbiddenOverrides": ["spring.datasource.url"],
    "services": [
      {
        "id": "service-a",
        "configSource": {
          "type": "bundled-profile",
          "ref": "application-prod.yml"
        },
        "startupCommandSource": "tests.md#启动命令"
      }
    ],
    "dependencies": [
      {
        "id": "redis",
        "kind": "redis",
        "provisioning": "shared-dev",
        "configSource": {
          "type": "bundled-profile",
          "ref": "application-prod.yml#spring.redis"
        }
      }
    ]
  },
  "checks": [
    {
      "id": "service-config",
      "type": "file",
      "target": "../../../service-a/src/main/resources/application-prod.yml",
      "contractRef": "service:service-a",
      "status": "READY"
    },
    {
      "id": "redis",
      "type": "tcp",
      "host": "redis.dev.internal",
      "port": 6379,
      "timeoutMs": 1500,
      "contractRef": "dependency:redis",
      "status": "READY"
    }
  ]
}
```

可用检查类型：`file`、`directory`、`executable`、`tcp`、`http`。禁止在 URL 中嵌入
用户名、密码或 Token。数据库、Redis、MQ 的写操作和生产调用不属于预检；需要真实数据
时在测试合同中单独声明安全边界。

`executionContract` 是唯一环境事实源，必须在交付开发前冻结：应用运行位置、依赖策略、
能否自建本地依赖、能否连接共享开发依赖、允许/禁止覆盖的配置，以及每个服务和依赖的
配置来源。`configSource.type` 只能为 `bundled-profile`、`external-file`、`environment`、
`cli-override` 或 `generated-fixture`。`local-isolated`、`shared-dev`、`shared-test` 不能互相
混用；确需混用时显式使用 `mixed`，并逐项声明 `provisioning`。每个服务和依赖必须至少由
一项 `contractRef` 检查覆盖。旧版 v1 只证明目标可访问，不能作为 Coding Ready 凭证。

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

## 当前交付策略

所有 SDD Coding Ready 准入与续跑统一要求 `workflowPolicy: "observed-delivery.v1"`；
每个声明的执行用例必须冻结 `executionEvidence: "runner-captured.v1"` 与
`executionContext`。既有命令不代改业务正文或 coverage；缺项保持 BLOCKED，
由文档 owner 补齐并重新评审。旧 READY 和旧文件仅作历史或 PARTIAL，不能放行续跑。

完整验证与当前独评报告引用见 [test-guide.md](test-guide.md#当前交付策略)，报告形状仍由 [Reviewer清单](reviewer-checklist.md) 单一维护。
