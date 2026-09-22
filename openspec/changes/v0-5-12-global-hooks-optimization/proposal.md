# Proposal

## Why

superflow 的 10 条门禁 hooks 全部注册在用户级 `~/.claude/settings.json`（绝对路径指向 `~/.claude/scripts/superflow-*`），且多数脚本没有"当前项目是否需要门禁"的前置判据——任何项目的每次 Edit/Write/Bash、每次提问，都要为 10 个进程支付启动、stdin 读取与 python3 解析的成本。同时 init/uninstall/update 各自推导 scope，不一致时会清错 settings 文件留残留（0.5.11 修过同类问题）。

## What Changes

- **hook 前置短路**：所有 superflow 门禁 hook 脚本（9 个 `.sh`/`.py`）在解析 stdin 之前增加防御性短路——当前项目不存在 `openspec/` 目录、`.sdd/` 目录、`.sdd-enforced` 标记时立即 `exit 0`。非 SDD 项目单次 hook 成本降为一次进程启动 + 一次文件系统判断；SDD 项目行为不变（脚本内部原有门控逻辑不动）。
- **scope 一致性修复**：init、uninstall、update 统一经 `getPlatformPaths(agent, scope, projectPath)` 推导目标；uninstall/update 不再默认操作用户级 settingsFile，而是按 init 时记录的安装范围清理，避免清错文件留残留。
- **受管项目清单**：`~/.sdd-state.json` 扩展 `managedProjects` 段（schema 向后兼容，新增字段）。init 以项目 scope 运行时登记项目根；uninstall 遍历清单清理各项目残留；update 遍历清单同步各项目脚本与 hooks。
- **设计说明补注**：`superflow-sql-sync-hook.py` 双 matcher（Edit|Write + Bash）是有意设计，补注释防止被"修复"。
- **用户级 hook 注册保留**：全局注册位置不变（满足"全局安装一次、所有项目可用"）；dependency-update-hook 属用户级服务，原样保留。

## Capabilities

### New Capabilities

- `hook-short-circuit`: superflow hook 脚本的防御性前置短路——非 SDD 项目零开销退出，SDD 项目完整门禁。
- `install-scope`: init/uninstall/update 的安装范围一致性与目标推导——scope 不一致时不得清错文件、不得留残留。
- `managed-projects`: 基于 `~/.sdd-state.json` 的受管项目清单——登记、遍历同步、遍历清理。

### Modified Capabilities

<!-- 无既有 specs（openspec/specs 为空），全部为新增能力。 -->

## Impact

- **脚本**：`assets/scripts/superflow-*.{sh,py}`（9 个门禁脚本头部短路；短路置于 stdin 读取与 python3 调用之前）。
- **CLI 源码**：`src/app/commands/init.ts`（hook 注册段）、`src/app/commands/uninstall.ts`、`src/app/commands/update.ts`、`src/platform/paths.ts`（消费既有 scope 参数）、`src/domains/hook.ts`（不变，写入目标由调用方决定）。
- **状态文件**：`~/.sdd-state.json` 新增 `managedProjects` 字段（向后兼容：缺失字段按空清单处理；旧字段一律不动）。
- **不受影响**：skills/commands/rules 的全局分发路径；`dependency-update-hook.sh`；`claude-auto-backup-hook.sh`/`codex-auto-backup-hook.sh`（非 superflow 门禁，另有用途，按现状评估是否纳入短路）。
- **发版与迁移**：bump 0.5.12；本机迁移顺序 `superflow uninstall` → 手动清理 cc-switch 通用配置中的 superflow hooks 残留（代码清不到的第三方托管副本）→ `superflow install` → 受管项目按需 `superflow init --project`。
