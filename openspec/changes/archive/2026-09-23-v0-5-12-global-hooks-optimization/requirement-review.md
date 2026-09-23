# Requirement Review — v0-5-12 全局安装架构优化

review_verdict: PASS
implementation_readiness: READY
open_blockers: 0
open_external_contracts: 0
open_source_investigations: 0
open_owner_decisions: 0

## 闭环矩阵（Closure Matrix）

| 需求点 | 输入 | 处理 | 输出 | 异常 | 闭环结论 |
|---|---|---|---|---|---|
| 非 SDD 项目 hook 零开销 | hook 触发事件 | 脚本头部三判据短路 | exit 0 | 判据误判→宽松放行落回原门控 | 闭环（TC-01~03） |
| SDD 项目门禁不回退 | openspec/.sdd/.sdd-enforced 存在 | 放行进入原逻辑 | 原有拦截/放行/超时 | 无新异常路径 | 闭环（TC-11） |
| scope 一致 | state.platforms[agent].scope | 三命令同源推导 | 同一目标集合 | 记录缺失→回落 global+提示 | 闭环（TC-04/05/10） |
| 受管清单登记 | project scope init | 幂等登记 managedProjects | state.json 更新 | 旧文件缺字段→空清单回落 | 闭环（TC-06/07/10） |
| 遍历清理 | uninstall | 遍历清单清理+移除条目 | 资产清除 | 目录不存在→移除条目继续 | 闭环（TC-08） |
| 遍历同步 | update | 遍历清单同步脚本/hooks | 资产同步 | 单项目失败→汇总不阻断 | 闭环（TC-09） |

## 评审发现（Review Findings）

- F1（BLOCKER→已关闭）：交接原案"hooks 全迁项目级"与用户核心目标（全局安装一次、所有项目可用）冲突。处理：用户 2026-09-22 确认修正为方案一（全局保留+短路），brainstorm-summary 已记录 rejected 项。canonical 文档（proposal/design/specs）已按修正方向编写，无残留旧案表述。
- F2（IMPORTANT→已关闭）：短路判据若用 init 产物会让未 init 的 SDD 项目失去门禁。处理：spec 明确判据为项目性质三项并集，与 init 解耦；禁止项已入 traceability-matrix。
- F3（IMPORTANT→已关闭）：scope 记录缺失的旧安装可能在 uninstall 时清不到项目级残留。处理：spec 要求回落 global 并显式提示；design 迁移计划给出重建登记路径；tests TC-10 覆盖。
- F4（MINOR→已关闭）：dependency-update-hook 依赖 npm 与全局 CLI，曾被一并视为"门禁 hooks"。处理：api.md 明确其为用户级服务、不参与项目短路；spec 有独立 Requirement。
- F5（MINOR→已关闭）：cc-switch 第三方托管副本残留代码不可达。处理：proposal/design 迁移计划写明手动清理步骤，非本变更代码范围。

## 未关闭阻塞项（Open Blockers）

- 无——F1~F5 均已在 canonical 文档中关闭，无 open blockers、无 open external contracts、无 open source investigations、无 open owner decisions。

## 可测性确认

- 12 个用例（TC-01~TC-12）覆盖全部 spec scenarios；含 RED/GREEN 契约；无 Blocked 用例。
- 实现就绪度：READY（文档集完整、handoff 已冻结、无未决问题）。
