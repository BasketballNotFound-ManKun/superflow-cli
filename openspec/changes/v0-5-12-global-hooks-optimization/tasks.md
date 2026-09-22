# Tasks

> 实现入口：[prompt/implementation.md](prompt/implementation.md)；任务级 prompt：[prompt/p1-global-hooks-optimization.md](prompt/p1-global-hooks-optimization.md)。

## 1. hook 前置短路

- [x] 1.1 为 6 个有 `.sdd-enforced` 门控的脚本加前置短路（enforce-hook、hook-guard、contract-hooks、sql-sync-hook、integration-evidence、delivery-check）：在 stdin 读取之前插入 `[ -d openspec ] || [ -d .sdd ] || [ -f .sdd-enforced ] || exit 0`（py 脚本用 `os.path` 等价判断）；验证：在无标记目录执行脚本并喂入 hook JSON，进程立即退出 0 且无输出
- [x] 1.2 为 3 个无短路脚本加同样的前置短路（managed-work-guard、verify-integration、test-report-lint）；验证：同 1.1 方式
- [x] 1.3 调整 archive-command-hook：把 `[ -d "$CHANGE_DIR" ]` 短路提前到 stdin/python3 解析之前；验证：无标记目录下执行不产生 python3 进程（`ps` 或耗时对比）
- [x] 1.4 确认 dependency-update-hook 与 auto-backup hooks 不加短路（spec 要求）；验证：代码审查确认未改动其项目判据
- [x] 1.5 为 `superflow-sql-sync-hook.py` 双 matcher 注册补设计注释（init.ts 注册处与脚本头注释）；验证：注释说明 Edit|Write 与 Bash 双路径覆盖意图

## 2. scope 一致性修复

- [x] 2.1 init 写入 `state.platforms[agent].scope`（缺省 `global`），复用现有 `~/.sdd-state.json` 写入路径；验证：init 后检查 state 文件字段
- [x] 2.2 uninstall 改为读取 state 中的 scope 推导 `getPlatformPaths`，记录缺失时回落 global 并输出提示；验证：project scope 安装后 uninstall，用户级 settingsFile 不被清除
- [x] 2.3 update 同样读取 scope 推导目标，与 init/uninstall 一致；验证：三命令对同一状态解析出的 settingsFile 路径一致（单测断言）
- [x] 2.4 为 scope 推导与清理幂等补单元测试（settingsFile 不存在、用户自定义 hooks 保留两个场景）；验证：`npm test` 相关用例通过

## 3. 受管项目清单

- [x] 3.1 `~/.sdd-state.json` 增加 `managedProjects` 段：结构 `{ projects: [{ root, agents, scope, hooks, registeredAt }] }`，提供带损坏保护的读写函数（损坏按空清单 + 警告）；验证：单测覆盖登记、幂等去重、损坏回落三场景
- [x] 3.2 init 以 project scope 运行时登记项目（重复 init 幂等更新）；验证：连续两次 init 后清单仅一条
- [x] 3.3 uninstall 遍历清单清理各项目资产并移除条目（目录不存在则直接移除条目）；验证：含已删除目录的清单执行 uninstall，命令成功且清单清空
- [x] 3.4 update 遍历清单同步各项目脚本与 hooks，单项目失败不阻断并汇总输出；验证：构造一个无权限目录 + 一个正常项目，正常项目仍被同步

## 4. 回归与验证

- [x] 4.1 全量 `npm run build` + `npm test` 通过；验证：命令输出无失败
- [x] 4.2 非 SDD 项目冒烟：在无 `openspec/.sdd` 的临时项目中触发 Edit/Write hook，确认短路退出与耗时（对比基线 10 脚本全量执行）；验证：记录前后耗时数据
- [x] 4.3 SDD 项目冒烟：在本仓库（openspec 存在）确认 hook-guard 拦截、delivery-check 等门禁仍正常；验证：真实触发一次拦截
- [x] 4.4 发版 0.5.12 并按迁移顺序本机迁移（uninstall → 手动清 cc-switch 残留 → install）；验证：`~/.claude/settings.json` 无 superflow hooks 残留后重装，`claude --debug` 确认非受管项目 hook 短路、本仓库门禁正常
