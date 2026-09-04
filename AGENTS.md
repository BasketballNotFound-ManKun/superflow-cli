# Superflow CLI 仓库指引

## 全局设计与评价纲领

修改 Superflow CLI 的任何功能前，必须完整阅读：

- `docs/superflow-cli-design-principles.md`
- `docs/superflow-cli-evaluation-framework.md`

必须先判断问题属于文档合同、确定性门禁、Agent 语义评审、托管状态机、宿主适配还是
安装升级闭环，再在对应层做最小修改。每项优化都要有问题证据、基线、变更假设、代表性
实例、前后结果、结论和回滚条件；同步中英文及 Codex、Claude 支持。

专项章程只能细化全局纲领，不得冲突。不得通过放宽检查或把业务编码/测试策略塞进通用
托管 Prompt 来规避文档合同不完整的问题。

## 托管功能设计宪章

修改托管功能前，必须完整阅读：

- `docs/managed-work-design-principles.md`
- `docs/managed-agent-protocol.md`

适用范围包括 `src/domains/managed-work/`、`src/mcp/`、托管 Prompt、Hook、脚本、
`superflow-pipeline` 托管 Skill、状态机、协议、预算、等待、通知和恢复逻辑。

每次修改必须先判断：

1. 可重复的确定事实是否由 Runner/脚本裁决；
2. 代码正确性、风险、充分性等语义问题是否保留给 Agent；
3. Host、Executor、Runner 是否仍各自只有一个明确 owner；
4. Handoff、Executor Delivery、Host Review JSON 协议是否兼容；
5. 是否保留历史有效证据，避免新增无效 Agent 调用或模型轮询；
6. 中英文文档、Skill、Prompt、帮助和测试是否同步。
7. 是否把本应由 `api.md`、`design.md`、`tests.md` 或技术详设冻结的业务方案误塞进托管 Prompt。

提交交付前必须逐项执行宪章中的“修改托管功能的强制回归清单”。新增或调整长期
设计原则时，必须同步更新中英文宪章和对应测试。不得通过修改检查脚本、删除断言或放宽
协议来绕过冲突；确需改变宪章时，应先修改宪章并说明设计理由，再修改实现。

## 版本升级触发规则

用户只要提到“升级版本”“发布版本”“发版”“推送 npm”或同等含义，就视为授权执行
完整版本发布闭环。除非用户明确限制范围，否则不能只修改版本号、只运行 dry-run、
只创建 tag，或完成一半后等待用户再次确认。

默认执行以下全部动作：

1. 读取上一个版本标签到当前 `HEAD` 的真实差异，整理面向网友的版本价值，不把
   commit 列表直接当版本说明。
2. 用户未指定版本级别时，非破坏性改动默认升级 patch；明确新增兼容功能时可升级
   minor；涉及破坏性变更且用户未指定时必须先确认 major/minor 决策。
3. 同步更新 `package.json` 和 `package-lock.json` 的版本及根包元数据。
4. 执行完整测试、构建、`npm pack --dry-run` 和发布说明门禁；任何失败都必须先修复
   或明确报告真实阻塞，不能把预览当发布成功。
5. 使用中文提交信息提交版本改动。
6. 使用 `git tag --cleanup=verbatim -a` 创建 annotated tag。标签说明必须包含：
   `升级摘要`、`主要更新`、`验证结果`、`升级方式`，并明确上一版本到当前版本。
7. 执行真实 `npm publish --access public --registry https://registry.npmjs.org`。
8. 推送当前发布分支和版本标签到 GitHub。
9. 等待 `.github/workflows/publish-release-notes.yml` 创建 GitHub Release；若自动任务
   未触发或失败，使用 workflow dispatch 补跑并等待成功。
10. 最后回查 npm `version/latest`、GitHub Release 正文、远端标签、分支同步状态和
    本地工作区，向用户报告版本号、升级内容、npm 地址、Release 地址、提交和验证
    结果。

## 不得静默省略

- 不得因为 npm 已发布就省略 Git 提交、分支推送、tag 或 GitHub Release。
- 不得因为 tag 已存在就省略结构化版本说明。
- 不得只写“修复问题”“优化流程”这类无法说明用户价值的摘要。
- 不得在没有回查 registry 和 GitHub Release 的情况下声称发布完成。

只有以下情况可以暂停并询问用户：

- 工作区存在无法安全隔离的无关改动。
- npm 或 GitHub 权限失效，且安全重试后仍无法继续。
- 版本包含明显破坏性变更，但用户没有指定升级 major 还是 minor。
- 发布会覆盖、撤销或重写一个已经公开且不可安全修改的版本。
