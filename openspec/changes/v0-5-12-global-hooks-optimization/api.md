# API 变更 — v0-5-12 全局安装架构优化

> 本变更不涉及网络 API / DB。契约面为：CLI 命令行为、本地状态文件 schema、hook 脚本退出契约。

## 1. CLI 命令行为

### `superflow init`

| 项 | 契约 |
|---|---|
| scope 参数 | 保留既有 `--scope global\|project` 语义 |
| 新增副作用 | project scope 时向 `~/.sdd-state.json` 登记 `managedProjects[]` 条目（幂等去重） |
| 新增写入 | `state.platforms[agent].scope` 字段（global/project） |
| 不变 | skills/scripts/rules 分发、hooks 注册目标推导（改由 scope 字段支撑）、sql-sync-hook 双 matcher 注册 |

### `superflow uninstall`

| 项 | 契约 |
|---|---|
| 目标推导 | 读取 `state.platforms[agent].scope`（缺省回落 `global` 并输出提示），经 `getPlatformPaths` 解析目标 |
| 遍历清理 | 清理 `managedProjects[]` 各项目资产；目录不存在的条目直接移除 |
| 幂等 | 目标 settingsFile/资产不存在时成功结束 |
| 不变 | 只清除 superflow 写入的 hooks 条目（clearSddHooks 前缀匹配），用户自定义保留 |

### `superflow update`

| 项 | 契约 |
|---|---|
| 遍历同步 | 遍历 `managedProjects[]` 同步各项目脚本与 hooks；单项目失败不阻断，结尾汇总失败项 |
| 目标推导 | 与 init/uninstall 同源（scope 字段） |

## 2. `~/.sdd-state.json` schema 扩展（向后兼容）

```jsonc
{
  "version": "...",            // 既有，不变
  "platforms": { ... },        // 既有；platforms[agent] 新增 "scope": "global" | "project"
  "managedProjects": {         // 新增；缺失/损坏按空清单处理
    "projects": [
      {
        "root": "/abs/project/path",
        "agents": ["claude", "codex"],
        "scope": "project",
        "hooks": ["superflow-enforce-hook.sh", "..."],
        "registeredAt": "2026-09-22T00:00:00.000Z"
      }
    ]
  }
}
```

兼容规则：字段缺失 → 空清单；结构损坏 → 空清单 + stderr 警告；既有字段一律不修改不删除。

## 3. hook 脚本退出契约（新增短路分支）

| 条件（相对项目根，任一满足即放行） | 行为 |
|---|---|
| `openspec/` 目录存在 | 进入原有门禁逻辑（退出码 0=放行 / 2=拦截 / 原有超时） |
| `.sdd/` 目录存在 | 同上 |
| `.sdd-enforced` 文件存在 | 同上 |
| 三者均不存在 | `exit 0`，不读 stdin、不调用 python3、无输出 |

例外（不参与项目短路）：`superflow-dependency-update-hook.sh`（用户级服务）、`claude/codex-auto-backup-hook.sh`（非 superflow 门禁）。

## 4. 不变契约

- `src/domains/hook.ts` 的 `clearSddHooks/registerHook` 函数签名与行为。
- skills/commands/rules 全局分发路径。
- 脚本在 SDD 项目内的全部判定结果。
