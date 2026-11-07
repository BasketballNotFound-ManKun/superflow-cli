---
name: superflow-build
description: Superflow 内部能力：执行已批准变更的任务清单，继承冻结的设计和测试合同并记录进度。由 $superflow 选择，用户无需手动分流。
license: MIT
metadata:
  requires: openspec CLI
  author: openspec
  version: "1.0"
  generatedBy: "1.3.1"
---

# 每次交付一块可验证的业务能力

当前Flow Owner负责已授权实施和信号执行。[Flow Owner](../superflow/references/flow-owner.md)持有持续责任与恢复，[test-guide](../superflow/references/test-guide.md#owner-led-test-planning)持有验证选择与证据，[Reviewer清单](../superflow/references/reviewer-checklist.md)持有独立评审。按阶段读取需要的分支，首条能力尚未跑通时不预先准备全部终验文书。

## 1. 读取当前工作

使用明确的change；歧义先解决。Superflow变更运行：

```sh
superflow implement <change> --instructions --json
```

只读快照返回任务frontier、原文行号、已声明的Delivers/Verify/Case引用、canonical路径与准入/续跑命令；它不授予实施权限，也不证明业务已完成。先读取返回的contextFiles（沿现有manifest动态列出规格、需求来源与已声明详设），再核当前任务、主Prompt的canonical links、tests与恢复证据。沿原路径消费，不猜原生OpenSpec工作区，也不替换成其他change。

首次编辑或实施派发前执行 `superflow check <change> --level coding-ready`。已有准入的实施续跑使用返回的 `superflow-review-coverage.mjs <change-dir>`，不加 `--check-sources`；源码正常变化不重复严格文档准入。合同缺失或漂移保持 `Blocked for docs`，沿[Document Delivery Exit](../superflow/SKILL.md#document-delivery-exit)回原文档owner；快照和OpenSpec就绪不覆盖门禁。已有合同接入沿[document-readiness](../superflow/references/document-readiness.md#existing-contract-intake)。

## 2. 跑通一条能力

按可观察交付结果与冻结验证选择依赖就绪任务，不按技术层逐层铺开。缺依赖或信号引用时核canonical合同，不猜顺序、不删必测。已批准批次较宽时，先闭合其中最小可运行路径及必测信号，再扩大实现；未闭环任务保持未勾选。

按已选tdd_mode与适用信号执行项目原生验证；需要RED/GREEN时先核真实失败，再实现并重跑受影响信号。纯文档和tdd_mode: off不因此强制RED，原必测仍须成立。业务断言留在原生测试；来源wrapper给真实观测附身份，不另实现一套业务预期。[首批验证链](../superflow/references/test-guide.md#first-verification-action)随首条适用能力准备。普通失败在授权内修复后继续，不把真实运行验证全部推迟到横向代码铺完。

采集复用现有顺序计划入口：

```sh
superflow verify <change> --execution-plan build-plan.json case-plan.json --run --reuse-valid --sync-report
```

计划和命令来自项目冻结合同。先整体预检，显式run后顺序执行，首个失败即停。复用须核当前原始证据、sources、产物、命令与环境；输入变化重跑受影响范围，未知输出所有权仍报错，原attempt不可变。缺失/skip/失败分支保持PARTIAL，方法数不冒Case数。接线或诊断采集时才读[capture细则](../superflow/references/test-guide.md#capture-boundaries-without-test-coupling)，不把它当作每个任务都要重新实现的测试框架。

必测信号成立才勾选任务；整合后重读工作快照。阶段进度用过程消息，随后继续下一条已授权任务，不以汇报结束索要继续。

## 3. 评审与交付

可读diff和命名风险具备时，实际读取[Reviewer清单](../superflow/references/reviewer-checklist.md)，按原报告形状、派发身份、source manifest与finding closure执行；其他验证准备期间即可取得独立视角。实施委派不替代独评，核真实返回与Concerns。原finding保留，合同内修复、受影响重测并实际复评，不改报告结论或重绑旧hash。

完成必需整合/回归，对账任务、Case分支、当前证据和清理。保持 `workflowPolicy: observed-delivery.v1`、实际 `runner-captured.v1` 回执及当前Independent Review / Reviewed Sources绑定。任务全勾不等于交付：运行既有implement guard，实际读取next返回的verify技能并执行CHECK，按[阶段承接与最终交付包](../superflow/references/flow-owner.md#phase-handoff-and-final-package)收尾。摘要、交付副本或结构检查不能代替语义验收。

## 连续执行与停止

真正分工时按[Owner自主委派](../superflow/references/flow-owner.md#owner-led-delegation)权衡；共享文件、测试输出与fixture须隔离或串行。等待子代理不重复轮询、不另备一份相同上下文。恢复点留在原报告，复用尚有效证据。

持续修复普通错误并完成依赖就绪的授权工作；只有用户中断、真实业务取舍、权限/环境/额度不可得、显式手动边界或既有不收敛限制才停止依赖工作。保留已选build_mode/isolation/tdd_mode/review_mode，Superflow门禁失败不回退原生OpenSpec。Git、归档与发布沿各自已有授权。
