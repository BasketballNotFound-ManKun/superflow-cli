# Superflow CLI 仓库指引

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
