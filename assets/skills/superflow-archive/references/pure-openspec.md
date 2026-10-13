# 纯 OpenSpec 归档

仅在精确目标目录没有 `.sdd/state.yaml` 时执行。状态文件存在时回到主技能的 SDD 门禁，不得用本流程绕过。

1. 从用户请求或当前上下文确定变更名称。无法确定时运行 `openspec list --json`，让用户选择；不要自行归档其他变更。
2. 运行 `openspec status --change <name> --json` 并核对 `tasks.md`。存在未完成产物或任务时，集中说明缺口，只有用户明确接受边界才继续。
3. 比较 `openspec/changes/<name>/specs/` 与 `openspec/specs/`，展示将合并的新增、修改、删除和重命名。若要跳过合并，必须获得用户明确选择，不能默认跳过。
4. 复用原归档授权；还没有明确授权时展示变更、完成情况、合并范围和目标目录后请求确认。
5. 执行 `openspec archive <name> --yes`。仅在用户明确选择跳过规格合并时使用 `openspec archive <name> --yes --skip-specs`。不得加 `--no-validate`，也不得在 CLI 失败后改用 `mv` 绕过校验。
6. 根据 CLI 输出确认精确归档目录，核对 `.openspec.yaml`、任务和已合并规格。CLI 成功后不得再次移动目录，也不创建 SDD 状态文件。
7. 汇报变更名称、归档位置、规格合并情况和用户接受的未完成边界；不自动提交、推送或发布。
