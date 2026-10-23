---
name: superflow
description: Superflow 用户总入口：日常任务由当前 Agent 持续负责实施、测试、评审整改与交付；也支持需求文档和显式双 Agent 托管。用户无需手动分流。
---

# Superflow 总入口

用户描述目标和约束，当前 Agent 选择既有阶段并负责承接；不要求用户手动选 Skill。
只讨论、调查、文档或评审时按所请范围完成；实施授权才进入编码。Git、发布、部署、
归档与共享资源操作分别遵循已有授权，不从阶段完成推导授权。

## Installed path resolution

将脚本与引用相对本 SKILL.md 所在安装目录解析，再以绝对路径调用；`scripts/...`
不相对当前业务工作目录执行。阶段优先使用宿主 Skill 工具；没有该工具时，读取本技能
安装目录的同级 `<stage>/SKILL.md` 全文（例如 `../superflow-build/SKILL.md`），不扫描个人目录。

## Full phase read

1. 读取项目规则、当前工作区与任务状态；已有 SDD 运行 `scripts/superflow-state.sh recover <change-dir>`
   和 `next`，核对实际合同、未完成项与原执行模式。
2. 按下表选择阶段，**完整读取该阶段 SKILL.md 和其中必读 references 后执行**。
   每次阶段转换或恢复均重做本步。名称、描述、Flow Owner 摘要或调用日志不替代全文。
3. 普通实施读取 [Flow Owner](references/flow-owner.md)，由当前 Agent 持续实施、测试、
   整改和交付；实施/代码评审前完整读取 [Reviewer 清单](references/reviewer-checklist.md)，
   按实际风险派发独立只读评审包并取得返回，整改后重测和实际复评。
4. 有专项合同或具体缺口时，按标题读取 [详细路由合同](references/routing-contract.md) 的适用章节。
   旧入口细则完整保留；不以未加载为由豁免适用约束，也不在开场加载全部细则。

| 当前目标/状态 | 既有阶段或能力 |
|---|---|
| 想法、方案比较、代码调查 | `$superflow-explore` |
| 来源长/混杂、owner/行为待定、API/DB/并发/跨仓不清 | `$superflow-clarify`，先核实可从源码得知的事实 |
| 单一明确低影响改动且已有测试 seam | `$superflow-quick-dev`，先运行其准入；不满足则 clarify |
| 新建 OpenSpec 基础产物 | `$superflow-propose`，用 OpenSpec CLI 给出的依赖/指令生成 |
| 接口、测试、追溯及质量合同 | `$superflow-contracts` |
| 需求评审、挑战遗漏/错误、设计是否偏离 | `$superflow-requirement-review` |
| 源码级 HOW 与技术详设 | `$superflow-design` |
| 实现 Prompt/分批交接与整改指令 | `$superflow-handoff` |
| 已批准任务的实施与续跑 | `$superflow-build` |
| 代码/证据独立评审、整改复核与交付对账 | `$superflow-verify` |
| 窄范围修复或非运行时微调 | `$superflow-hotfix` / `$superflow-tweak`，满足其准入才执行 |
| 数据库行为/共享表/状态反向影响 | `$superflow-table-impact-analysis`，随当前阶段使用 |
| 已验证且获授权收口 | `$superflow-archive` |

## 合同、验证与持续责任

原始需求/用户确认 → 冻结 spec/API/design/tests → 项目规则 → 执行导航 → 运行证据。
各决策仅一个 canonical owner；冲突返回其原阶段改正文和消费引用，再刷新 handoff、
评审与就绪凭证，不让实现者选优先级或手改 hash/凭证。业务方案由文档冻结，Prompt 只导航。
生成测试、实施或验收前实际完整读取 [test-guide.md](references/test-guide.md)。SDD 首次
构建/用例验证从 [Runner-Captured Execution](references/test-guide.md#runner-captured-execution)
进入：按指南准备 plan，调用已安装 `superflow-test-report-lint.py --record-execution`，
由脚本生成 receipt/构建指纹，再把路径回填报告。沿冻结用例和真实入口取证；Mock、计划、
手填 PASS、哈希与任务勾选不证明真实验收。

普通任务沿 Flow Owner 闭环，阶段汇报和可修复失败后继续。独立评审按 Reviewer 清单
记录可读 diff/两端源码、实际派发、身份、处置和复评；修复、缓解、接受延期、不成立分别
有依据。缺必要证据/复评保持 PARTIAL/Blocked。仅真实决策、不可得权限/环境、用户暂停、
显式手动阶段或既有不收敛边界停止依赖工作；保留恢复点，退出会话不承诺后台继续。
交付报告目标/实际实现、验证范围数量、未决项、外部协同与复评证据；控制操作单列。

已有文档的实施请求先执行 [当前 Owner 文档承接](references/flow-owner.md#existing-document-implementation)，
补齐当前合同、独评与 Coding Ready 后继续 build。

## Document Delivery Exit

OpenSpec applyRequires 仅完成基础产物。完整文档请求在同一授权内接续
`$superflow-contracts` → `$superflow-design` → `$superflow-handoff`。
声明 Coding Ready 前真实运行 `superflow check <change> --level coding-ready`，
核对退出码与当前 `.sdd/readiness/coding-ready.json`。失败为 `Blocked for docs`，
回对应阶段修复。只文档请求交付后停止；已有有效准入的实施续跑沿 build 检查，合同漂移
才回文档重新冻结。就绪不等于实施授权。

## 显式托管

先做 Host 语义分流：文档请求仍走文档阶段；明确托管读取 [managed-work.md](references/managed-work.md)
并核验 `superflow_managed_runtime`，原样传用户请求/技能命令/文档路径给
`superflow_managed_start`。新任务省略/auto 默认 native，继承原生能力、配置和审批；
模型/推理仅用户指定时传入，预算默认不填（0 未设限），正数各自生效。
显式档位按现行合同执行，SDD 准入与续跑无旧 READY 豁免；强规则按详细路由合同读取。
Host 只持有目标/语义评审，Executor 负责研发，Runner 持有状态/确定事实；普通 Owner
可以编码，不套用托管 Host 只读规则。不启动嵌套监督，等待沿 MCP wait，未明确通过不交付。

## 维护 Superflow 自身

先完整读 `docs/superflow-cli-design-principles.md` 和
`docs/superflow-cli-evaluation-framework.md`；先判定责任层，再记录基线、假设、实例、
结果和回滚条件。涉及托管再读专项宪章/协议。同步中英文与 Codex/Claude；现有脚本
持有状态/确定性门禁，Agent 持有语义判断，不新增平行 owner。
