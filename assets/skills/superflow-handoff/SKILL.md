---
name: superflow-handoff
description: Superflow 内部能力：将冻结合同与技术详设转成分批研发指令、整改任务和验证交接材料。由 $superflow 选择，用户无需手动分流。
---

# SDD Handoff

## Preconditions

先读[行为决策连续性](../superflow/references/document-templates.md#behavior-decision-matrix)、
[最终HOW输入](../superflow/references/document-readiness.md#final-document-review-inputs)和
[追溯规则](../superflow/references/traceability-matrix.md)。OpenSpec基础产物由superflow-propose生成；
本阶段拥有实现导航，不重做API、数据库、技术设计或验收策略。

完整SDD需要proposal/spec/API/design/tasks/tests、追溯、质量门禁、测试报告、review清单，
且state.technical_design指向实际源码HOW。缺失回对应superflow-contracts/design补齐；
确认的行为或授权发生改变时回superflow-clarify，不让执行者猜。

## Canonical body repair

按[正文纠偏](../superflow/references/document-readiness.md#canonical-body-repair)同时修正文与消费引用。
完整SDD统一observed-delivery.v1，执行用例冻结runner-captured.v1和executionContext；
旧凭证/旧Prompt缺当前项必须重生成与复评，不给旧规范豁免。

## Generate one navigation contract

先读[主模板](../superflow/references/implementation-prompt-template.md#thin-prompt-contract)。
生成prompt/implementation.md，按模板输出目标与授权→Canonical links→Execution navigation→
执行策略/恢复位置→交付对账。主Prompt引用canonical业务决定、源码级HOW、tests、适用SQL及
风险合同；不复制算法、SQL、原始hash或命令。约束仍完整，由主入口统一继承。

只有实际分工需要时才按[批次模板](../superflow/references/batch-prompt-template.md)生成批次；
单主Prompt可以完成交接，不为菜单或P编号制造分批。批次只含主链接、本批Task/Entry/Case ID、
文件/依赖/恢复位置，不再每批重复完整检查表或不适用理由。

两端使用同一表头：`| Prompt | Task IDs | Entry IDs | Case IDs |`。主表链接各实际批次，
批次表回链主入口且ID集合一致；仅主入口时表行链接自身。Task存在性来自tasks索引，
关系来自coverage.decisions.taskIds/caseIds和cases.entryId。VERIFY_EXISTING可没有新增任务，
EXCLUDED不能伪造Case覆盖。已列ID检查不能证明入口全集；source-contract需反查真实调用者。

## Preserve execution ownership

沿[Flow Owner](../superflow/references/flow-owner.md)继承已选build_mode/isolation/tdd/review，
普通新任务由当前Owner持续实施与测试，按风险取得独立视角。已冻结team/subagent及独立Tester
义务保持，不生成强制团队剧本。只文档授权不编码，Git/发布/归档分别核已有明确授权。
已有授权正常推进，不逐阶段停问。上下文压缩后读恢复点及未完成任务继续。

验证只继承[tests指南](../superflow/references/test-guide.md)和当前tests.md中的命令/断言/环境；
敏感配置保存来源，不复制凭据或个人路径。启动、登录、DB、设备/浏览器只有冻结适用时执行，
没有统一强塞的captcha、curl、Maven或端口。复用当前有效证据，只重跑受影响/合同必测路径。

## Freeze and verify current handoff

保持显式context_compression，按manifest的Decision/Entry/Case导航读取必要canonical正文。
使用本技能同级安装目录的../superflow/scripts/superflow-handoff.sh刷新、--check核对生成包，
核当前模式/来源/正文身份。规范hash沿既有算法；状态绑定在.sdd/state.yaml，身份由
sdd-context.sha256和manifest持有。正文和Prompt只链接，不手抄实际hash。

当来源或HOW改变，先完成全部正文和消费者修复，再统一冻结与三视角实际评审/增量复核；
不要边修改合同边把过期hash反复发给Reviewer。源码、运行证据及任务勾选各自沿原owner，
不因进度或test-report更新误认为冻结需求变化。

## Document Delivery Exit

四份汇总文档tasks/traceability-matrix/sdd-quality-gate/test-report链接实际生成的Prompt。
完整HOW后的当前三视角输入按document-readiness.md#final-document-review-inputs复核。
实际运行 `superflow check <change> --level coding-ready`，核退出码与当前就绪凭证；失败是
Blocked for docs，回对应阶段修复，不让实现Agent临场补合同。只有当前准入成立才可交接build。
只文档任务交付后停止；实施已获授权则沿superflow-build继续。

## Review repair handoff

[Reviewer](../superflow/references/reviewer-checklist.md)的原报告按原状态保存。Owner另写逐finding
处置与证据；修复后实际独立复评创建新报告，引用原报告和Owner响应。哈希或无finding投影不能
代替真实返回。当前未决、缺必测或缺复评保持PARTIAL/Blocked，不为通过格式而改原结论。

运行test-report在所有context_compression模式只引用，避免把执行进度投影成第二份冻结合同。
