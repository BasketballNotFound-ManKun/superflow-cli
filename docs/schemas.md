# SDD Machine-Readable Artifact Schemas

> 本文是各 `.sdd/` 机器可读产物的字段合同（从校验器源码提取，业务无关）。
> 校验器：`.claude/scripts/superflow-environment-preflight.mjs`、
> `.claude/scripts/superflow-review-coverage.mjs`、
> `.claude/scripts/superflow-document-audit.mjs`。
> 修改本文后同步运行 `superflow update` 分发。

## 1. environment.json — `superflow.environment-readiness.v2`

| 字段 | 类型 | 要求 |
|---|---|---|
| schemaVersion | string | 固定 `superflow.environment-readiness.v2` |
| executionContract.applicationLocation | enum | `local` / `dev` / `test` |
| executionContract.dependencyPolicy | enum | `local-isolated` / `shared-dev` / `shared-test` / `mixed` |
| executionContract.allowLocalProvisioning | boolean | 与 dependencyPolicy 联动：`shared-dev` 时必须 false；`local-isolated` 时禁止远程依赖（allowRemoteDevDependencies=false） |
| executionContract.allowRemoteDevDependencies | boolean | 同上联动 |
| executionContract.allowedOverrides / forbiddenOverrides | string[] | 允许/禁止覆盖项，两者不得重复 |
| executionContract.services[] | object | 每项必须有 `id`、`configSource`（对象：`type` ∈ bundled-profile/external-file/environment/cli-override/generated-fixture + `ref` 字符串）、`startupCommandSource`（字符串） |
| executionContract.dependencies[] | object | 同上，另需 `kind`（字符串）与 `provisioning`（`local-isolated`/`shared-dev`/`shared-test`，且与 dependencyPolicy 一致，mixed 除外） |
| handoffHash | string | 必须等于当前 handoff hash（过期即失败） |
| overall | enum | `READY` / `LOCAL_FIXTURE_READY` |
| checks[] | object | 每项必须有 `id`、`type`；`status` 仅接受 `READY` / `LOCAL_FIXTURE_READY`（probe 阶段；不可探测项移出 checks 由 contract 表达）；`contractRef` 必须指向已声明的 `service:<id>` 或 `dependency:<id>`，且每个 contract target 至少被一个 check 引用 |
| check.type 与 target | — | `file`（存在且为文件）/`directory`（存在且为目录，target 相对 change 目录或绝对路径）/`executable`（纯命令名，正则 `[A-Za-z0-9._-]+`，**不含参数**）/`tcp`（需 `host`/`port` 字段）/`http`（需 **`url`** 字段，合法绝对 URL） |

## 2. document-review.json — `superflow.document-review.v1`

| 字段 | 类型 | 要求 |
|---|---|---|
| schemaVersion | string | 固定 `superflow.document-review.v1` |
| projectRoot | string | 可选执行工作目录，**相对 change 目录**；不改变 coverage 来源、tasks.md 或适用性配置的解析基准 |
| handoffHash | string | 等于当前 handoff hash |
| verdict | enum | `PASS` |
| openOwnerDecisions | array | 必须为空 |
| rounds[] | array | 至少 3 轮；lens 必须覆盖 `source-contract` / `architecture-minimality` / `e2e-environment`；每轮 `inputHash` = 当前 hash、`findings[]` 全部 `status: closed` |
| rounds[source-contract].reviewedPairs | array | 覆盖全部需求×入口组合（含 EXCLUDED） |
| rounds[source-contract].sourceChecks[] | array | 每个真实入口一条：`entryId`（不重复）、`result: CONFIRMED`、`evidence[]`（锚点：`sourceRef`+`lineStart`+`lineEnd`+`text` 逐字匹配当前文件）、`rationale`、`counterexample` |
| rounds[e2e-environment].reviewedPairs | array | 同上全覆盖 |

### coverage（`superflow.review-coverage.v1`，嵌套于 document-review.json）

| 字段 | 要求 |
|---|---|
| sources[] | `id` 唯一、`path`（相对 change 目录，所有校验入口统一）、`role` ∈ `requirement`/`code`/`contract`、`sha256`（当前内容 64 位小写） |
| requirements[] | `id` 唯一、`statement` 非空、`sourceRefs` 含 requirement 角色来源 |
| entries[] | `id` 唯一、`actor`/`route` 非空、`kind` ∈ `browser`/`api`/`job`/`event`/`library`/`cli`、`sourceRefs` 含 code 角色；声明 `persistence` 时必须给 `database`（engine/major/schemaSourceRefs/statements，statement.sourceRef 必须 code 角色） |
| cases[] | `entryId` 指向真实入口、`level` = 该入口 kind、`assertions.response/state/forbiddenEffects` 非空、`sourceRefs` 含 contract 角色；`testLayer` ∈ logic/sql-binding/database/http-entry（database/http-entry + 入口有 database 时要求 evidenceKind=real + mockBoundary + statements + databaseAssertions） |
| decisions[] | (requirementId, entryId) 全组合覆盖且不重复；`disposition` ∈ `FIX`/`VERIFY_EXISTING`/`EXCLUDED`；非 EXCLUDED 必须有 `caseIds`（case.entryId 匹配）+ `taskIds`（存在于 tasks.md task-index）；EXCLUDED 不得有 caseIds；`rationale`/`currentBehavior`/`targetBehavior` 非空 |

## 3. coding-ready.json — `superflow.coding-ready.v1`

由 `superflow-coding-ready.mjs` 生成（勿手写），关键校验：`handoffHash` = state.yaml `handoff_hash` = currentHandoffHash；`reviewHash` = document-review.json 当前 sha256；`codingReady: true`。

## 4. release-sql.md front matter

- 文件必须以 `---` YAML front matter 开头
- `database_change: true`；`target_sql_path` 为精确 `.sql` 路径（禁止 `<>{}testN/version/待定/pending` 字样）；`copy_policy: verbatim`；`sql_sha256` 64 位小写
- 全文**恰好一个** ```` ```sql ```` 块：内容 sha256 必须等于 sql_sha256；必须含一条变更语句（CREATE/ALTER/DROP/INSERT/UPDATE/DELETE/MERGE/TRUNCATE/CALL）**和**一条验证语句（SELECT/SHOW/CALL）
- design.md / tasks.md / sdd-quality-gate.md / prompt 必须引用 `release-sql.md`
