# Tests — v0-5-12 全局安装架构优化

> 框架：vitest（`npm test` = `vitest run`）。所有新增单测放 `test/unit/`。
> 证据回填位置：[test-report.md](test-report.md)。

## 用例总表

| 用例ID | 层级 | 覆盖 spec | 前置数据 | 操作与自动化命令 | 断言 | RED 预期 | GREEN 预期 |
|---|---|---|---|---|---|---|---|
| TC-01 | L1 | hook-short-circuit | 临时空目录（无三判据） | `bash` 直接执行 `superflow-hook-guard.sh` 喂入 hook JSON，计时 | 退出码 0、无 stdout、耗时不含 python3（<50ms） | 现脚本会读 stdin 并调 python3 → 失败 | 短路后通过 |
| TC-02 | L1 | hook-short-circuit | 临时目录含 `openspec/` 空目录 | 同 TC-01 执行脚本 | 放行进入原逻辑（现有退出码行为） | — | 通过 |
| TC-03 | L1 | hook-short-circuit | 临时目录仅含 `.sdd/`；另一目录仅含 `.sdd-enforced` | 同 TC-01 | 两种均放行 | — | 通过 |
| TC-04 | L1 | install-scope | fixture state：`platforms.claude.scope='project'` | 调用 uninstall 目标推导函数（vitest 单测） | 解析出的 settingsFile 为项目级路径 | 现实现恒为用户级 → 失败 | 通过 |
| TC-05 | L1 | install-scope | fixture state：无 scope 字段 | 同 TC-04 | 回落 `global` 且不抛错 | — | 通过 |
| TC-06 | L1 | managed-projects | fixture state 文件 | 登记函数写入两个项目后重复登记其一 | 清单去重为两条、registeredAt 更新 | 字段不存在 → 失败 | 通过 |
| TC-07 | L1 | managed-projects | 损坏的 `managedProjects`（非法 JSON 结构） | 读清单函数 | 返回空清单 + 警告标志，不抛错、不破坏文件其余字段 | — | 通过 |
| TC-08 | L2 | managed-projects | 临时项目 A（正常）+ B（root 指向已删除目录） | uninstall 遍历（vitest + 临时目录 fixture） | A 资产被清、B 条目被移除、命令成功 | — | 通过 |
| TC-09 | L2 | managed-projects | 临时项目 A（正常）+ C（无权限目录模拟失败） | update 遍历 | C 失败被汇总输出，A 仍被同步 | — | 通过 |
| TC-10 | L3 | install-scope | 隔离 HOME fixture（test/helpers） | 真实执行 `superflow init --scope project` → `uninstall` | init 写入 scope 字段与清单；uninstall 后项目级文件被清、用户级 settingsFile 无 superflow 条目 | scope 字段不存在 → RED | 通过 |
| TC-11 | L3 | hook-short-circuit | 隔离环境构建产物 | 真实 CLI 安装后在本仓库触发一次受保护写入 | hook-guard 按原逻辑拦截（退出码 2） | 短路误杀时退出 0 → RED | 通过 |
| TC-12 | L4 | 全部 | 本机真实环境（发版迁移后） | `claude --debug` 在非 SDD 项目与本仓库各观察一轮工具调用 | 非 SDD 项目 hook 短路耗时可见；本仓库门禁正常；`~/.claude/settings.json` 无残留 | — | 手动证据回填 |

## 执行说明

- TC-01~03 为脚本级，直接 `execFileSync` bash/py 产物脚本（`dist/` 或 `assets/`），不依赖 CLI 构建。
- TC-04~09 针对新增/修改的 TS 模块函数（state 读写、遍历、目标推导），要求函数可注入 state 路径以便隔离。
- TC-10~11 使用现有 `test/helpers` 的隔离 HOME 模式，执行真实构建产物。
- 无 DB / 网络依赖；无跨仓证据。
- 本变更无既有测试删除；`npm test` 全量必须通过。
