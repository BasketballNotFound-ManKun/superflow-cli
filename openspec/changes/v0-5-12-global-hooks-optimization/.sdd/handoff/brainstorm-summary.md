# Brainstorm Summary — v0-5-12 全局安装架构优化

> 压缩恢复检查点：需求澄清与方案决策记录。争议时回读对话确认结论与源码取证。

## confirmed（已确认）

- **核心目标**：全局安装一次，用户所有项目都能正常使用 superflow-cli 全部能力；不能要求每个项目先 init 才有门禁。
- **架构方向（方案一）**：全局 hooks 保留在 `~/.claude/settings.json` / `~/.codex/hooks.json`，不迁移到项目级；通过给每个 hook 脚本加**防御性前置短路**消灭非 SDD 项目的开销。
- **短路判据（修正后 D4）**：项目性质判据——`openspec/` 目录、`.sdd/` 目录、`.sdd-enforced` 文件任一存在即放行执行；否则 `exit 0`。放行安全：脚本内部原有门控逻辑不变，只可能多放行、不会误杀。
- **D3=A**：扩展 `~/.sdd-state.json` 为受管项目清单（`managedProjects`），用于跟踪跑过项目级 init 的项目，update/uninstall 遍历同步。
- **scope 一致性修复**：init/uninstall/update 的 scope 不一致会清错 settings 文件（init.ts:433-447、uninstall.ts:121、update.ts:150-156），统一处理。
- **保留设计**：`superflow-sql-sync-hook.py` 双 matcher 是有意设计（保留，补注释）；dependency-update-hook 属用户级服务，留在全局。
- **发版**：bump 0.5.12；本机迁移：superflow uninstall → 清 cc-switch 通用配置残留（代码清不到）→ superflow install。

## candidate（候选，随设计细化）

- 项目级 init 可选增强（脚本进项目 `.claude/scripts/` + 项目级 settings 注册 + `"$CLAUDE_PROJECT_DIR"` 相对引用）：v1 作为独立低优先任务，核心变更（短路+scope 修复）不依赖它。
- 短路实现形式：bash 一行 `[ -d openspec ] || [ -d .sdd ] || [ -f .sdd-enforced ] || exit 0` 置于 stdin 解析之前；python 脚本用等价 os.path 检查。

## rejected（已放弃）

- **hooks 全迁项目级 + 全局零 hooks**（交接原案）：不满足"所有项目都能用"，未 init 的 SDD 项目失去门禁。
- **ake-harness 式全局 launcher 让路机制**：全局仅剩一条有意义的用户级 hook 时，整套转发机制属过度设计。
- **同版本 SNAPSHOT 式覆盖**：不适用本场景。

## pending（待确认）

- 无——四个决策点均已在对话中确认（2026-09-22）。

## 关键源码事实（详见 source-code-audit.md）

- 本机 `~/.claude/settings.json` 实测 10 条 superflow hooks（9 PreToolUse + 1 UserPromptSubmit，绝对路径）。
- 9 个门禁脚本不调用 superflow 二进制；dependency-update-hook.sh 依赖 npm（check）/全局 CLI（apply）。
- 脚本短路现状：6 个有 `.sdd-enforced` 门控但无前置文件守护；3 个完全无短路；archive-command-hook 部分短路（在 python3 解析之后）。
- ake-harness 吸收点：幂等合并"独占领地"判据（已有 clearSddHooks 同源思路）、manifest/registry 思路（简化为 ~/.sdd-state.json 扩展）、原子同步与回滚（超本变更范围，不做）。
