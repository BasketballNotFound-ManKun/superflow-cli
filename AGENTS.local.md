# 项目补充规范（避坑记忆）

> 此文件由项目团队维护，harness 更新不会覆盖。项目特有规范、上下文和方法论写在这里，
> 不要写入 CLAUDE.md / AGENTS.md（会被 ake-harness 同步覆盖）。

## 安装面改动强制验收（v0.5.12 教训，2026-09-23 确立）

背景：v0.5.12 之前，全局 init 把项目门禁 hooks 注册进 `~/.claude/settings.json`，
非 SDD 项目每次 hook 都全量跑门禁；且 init 的 `saveState` 藏在 project 分支内，
global 装机后 state 无 scope 记录，uninstall/update 的目标推导断链。

核心教训：**局部代码全对、组合才出错**。参照对象 ake-harness 的"终态正确"
也是迭代修出来的（其历史含"完善全局安装流程并避免污染项目目录"等重复修复提交），
要吸收其机制（幂等合并、清单一处维护），不要迷信其结果。

凡修改 install / uninstall / update / hooks 注册 / state schema，强制遵守：

1. **生命周期矩阵**：install / uninstall / update × global / project 六格，
   每格必须有自动化测试或实测证据，缺格不得宣布 verify 通过。
2. **组合链检查**：不只看单个函数，必须核对跨函数状态链
   （写入点 → state 落盘 → 下一条命令的读取点），杜绝"写在分支内、读时不存在"。
3. **装版复验**：发版 tag 后本机装版，在非 SDD 项目验证 hooks 短路生效（看耗时），
   在 SDD 项目验证门禁正常触发；横切面（多项目）与纵切面（卸载残留）都要实测。
4. **单一事实源**：scope 记录、受管项目清单一处维护多处消费
   （`managedProjects` 模式），禁止各命令自行推导。
5. **向后兼容**：state 新字段缺失或损坏时按空值 + 警告处理，不抛错、不阻断主流程。
