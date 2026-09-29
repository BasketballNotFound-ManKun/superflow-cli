# 完整 SDD 验证阶段入口凭证检查评价

## 问题、基线与责任层

operator-api 的 15 页审计字段回放显示：0.5.14 的逐用例 lint 在传入
`document-review.json` 时会拒绝 13/15 回填；完整 workflow 缺该文件时，
verify guard 却只传 `tests.md`，使同一份 C 类用例报告绕过逐入口核对。
这是确定性门禁的失败安全缺口，不是业务断言或 Agent 语义判断问题。

变更前的定向回归先失败：完整 workflow 缺入口凭证时，没有出现对应阻断信息。
假设：在现有 verify guard 中要求完整 workflow 的入口凭证存在，并继续调用现有
lint 的 `--review`，即可让缺凭证与 13/15 缺回填均失败；Quick/Hotfix/Tweak
不增加完整 SDD 文档负担。

## 实例与结果

| 实例 | 预期与实测 |
|---|---|
| 完整 SDD 缺 `document-review.json` | verify 阻断并指出返回 docs 入口评审 |
| 冻结 15 项、只回填 13 项 | 现有 lint 收到 `--review`，指出缺失 C14/C15 |
| 冻结 15 项、完整回填 15 项 | 中英文 guard 均可通过 verify |
| Tweak 没有完整入口凭证 | verify 保持通过，不引入错误阻断 |

只调整中英文两个既有 guard 镜像与定向测试；未增加 Skill、Hook、Prompt、状态、
Agent 调用或模型轮询。入口全集、精确 Mapper 和非空同 ID 断言仍由
`source-contract` 评审与真实验收负责，脚本只判断凭证存在及逐项回填。

全量回归为 **95 个文件、652 个用例通过**；构建、ESLint、设计宪章门禁与
`skill-audit --strict` 通过。对比 0.5.14 发布时的 650 个用例，本轮新增
两个定向用例；单次运行耗时不能推断总体性能。未重跑 operator-api 的浏览器
或测试集群，本轮结论只针对 Superflow 的确定性门禁行为。
`npm pack --dry-run` 成功，402 个包内文件含中英文 guard 与现有报告 lint。
定向回归分别执行两个 guard 镜像，结果一致。

结论：所观察到的凭证缺失绕行已堵住；来源清单的语义完整性与真实证据质量
仍须 Agent 审查。额外成本为一次本地文件存在性检查，没有新增调用或长期状态。

回滚条件：完整 workflow 的合法验收被误阻断、Quick 路径被错误要求完整凭证，
或 Codex/Claude 安装后的两个 guard 行为不一致。保留故障注入证据后回滚此门禁，
不得通过放宽逐项 lint 取得假通过。
