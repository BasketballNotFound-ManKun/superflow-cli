---
name: superflow-verify
description: Superflow 内部能力：只读评审代码、测试证据和交付状态，确认冻结合同是否已被完整实现。由 $superflow 选择，用户无需手动分流。
---

使用[当前独评格式与链](../superflow/references/reviewer-checklist.md#finding-closure)核原报告、Owner响应和实际复评；用[当前实测对账](../superflow/references/test-guide.md#actual-assertions-and-one-current-verdict)防替代入口冒名和旧PASS混入。

# SDD Verify

## 当前独立评审与交付记录

完整读取 [Reviewer 清单](../superflow/references/reviewer-checklist.md)，按其中可读
diff.patch/source-manifest 派发，区分 FIXED/MITIGATED/DEFERRED/NOT_A_DEFECT；
整改后由原 Reviewer 或新隔离 Reviewer 实际复评。补日志不关闭仍存在的错误行为。
所有完整 SDD 交付（统一 observed-delivery.v1）在 test-report.md `## Independent Review` 下
用 `| Report |` 表引用当前独立 DONE 报告，报告在 `## Reviewed Sources` 的
`| Path | SHA-256 |` 表绑定已审源码。源码变更后真实复评，不重绑历史报告的 hash；
缺报告/当前复评或未决阻断项保持 PARTIAL/Blocked。旧文件仅保留为历史或 PARTIAL，
缺当前要求时阻断补齐。


## 验证信号复核

首次验证前实际完整读取 [test-guide.md](../superflow/references/test-guide.md)。SDD 核对已按
[Runner-Captured Execution](../superflow/references/test-guide.md#runner-captured-execution)
通过已安装 `superflow-test-report-lint.py --record-execution` 取得构建/用例证据。
按[Owner测试策略](../superflow/references/test-guide.md#owner-led-test-planning)先核原目标、实际diff和调用者，
再挑战所选层级/断言是否能推翻主要错误实现，是否遗漏新增、批量、异常或状态分支。不能只核
旧用例完成数。缺口交当前Owner补强、执行和更新原计划证据；真实业务取舍才问用户。
区分单元、接口/后端集成、后端业务链路和浏览器E2E的实际范围。复核历史证据适用性，只重跑
受影响/合同必测，报告格式变更不自动重跑全链路；Reviewer仍只读核源码与原始证据。

Before semantic code review, run `superflow review-coverage --json` (or pass
`--base <ref>` for a branch review). Use its included/excluded inventory and
path-specific rules to account for every changed file. Review related Java
and Mapper XML files together when they share a bundle. Do not treat this
mechanical inventory as a correctness verdict: findings still need source
anchors, a fresh reading of the affected call path, and independent judgment.

SDD 复用检查必须有 executionContext，独立核对当前命令、cwd、已选环境、源码、
构建和入口；调用环境与冻结要求不同时不能沿用 PASS。缺当前要求保留 PARTIAL，
不以 JSON 存在或哈希一致代替执行真实性/业务充分性。


## 五维与独立评审入口

代码质量评审必须读取[统一 Reviewer 清单](../superflow/references/reviewer-checklist.md)，
按其中的实际影响分档、隔离包、五维覆盖、finding 证伪与合并步骤执行。
`review-coverage` 的 risk.tier 是路径提示，不能直接决定实际深度；打印提示与实际档位及依据。
普通代码评审可以直接进入此入口，不要求先创建 SDD 状态；有冻结合同则同时核验符合度。
主 Agent 持有最终判断，Reviewer 只提供只读独立视角，Runner 不裁决语义风险。

沿现有四状态报告执行 `superflow review-coverage --report <file> --json`，检查标记与锚点。
它不证明五维充分性；主 Agent 仍须逐项核验原始证据。BLOCKED/NEEDS_CONTEXT 先补证据，
DONE_WITH_CONCERNS 先调查全部 concern，再决定。原生子代理支持时，中档以上以隔离上下文
派发；高档按独立风险簇追加专项视角，不固定代理数或模型。无法独立评审时如实记录缺口。

独立评审须沿清单留下真实派发、Reviewer 身份、准确 diff 和报告；复用现有
review_mode/state/test-report，不新增状态。评审后修改先按影响真实重测，再由隔离
Reviewer 复核修复及原功能回归；旧 PASS 不能覆盖新 diff。交付用 Flow Owner 的
事实矩阵对账，phase=archive 不能替代目标验收或抹去外部协同和未关闭项。

## 评审回应纪律

收到 finding 后先通读全部反馈，复述要求，再对照当前源码、项目规则、调用方和测试验证。
不得只依据评审者措辞附和或直接改。确认有效时说明代码锚点和修复方向；认为有误时给出
具体源码或合同证据及被拒绝方案。一次处理一个 finding，跑受影响信号后才能声称已修复。
遇到“做成通用版本”等宽泛建议，先检查真实调用点；没有第二个调用方或合同要求时保持最小实现。
项目规则只有用户确认后才回写，评审反馈不会静默改变仓库政策。

完整 workflow 验收必须读取[需求×真实入口评审](../superflow/references/document-review-coverage.md)。
沿 R/E/C ID 在现有 test-report 回填实际角色、页面动作、请求路由、最终状态与禁止副作用
的原始证据。独立对照原始来源及实际调用方；API-only 不得冒充 browser E2E，计划不等于执行。
横向字段改造还要复核页面请求命中的精确 Mapper statement，并查看非空记录的同 ID
API/DB 值对照与浏览器显示。历史 NULL、字段键存在和静态列配置各自只能支持较弱结论。

Verification is a phase, not a final sentence. Use this skill after
implementation work claims completion and before archive or delivery.

## Behavior-preserving simplification

复用与规约检查仍只看本次修改及真实调用者，按Reviewer规范判断必要性；不制造清理任务。
已知无功能整理应在首次绑定构建/采集前由实施Owner完成。取得运行证据后，新的纯风格建议
通常记为非阻断后续项，不能为勾选而改源码触发全量重录。有效功能/安全问题仍立即修复。

确需简化时先核调用者、错误、副作用和原保护原因，一次做最小修改，原断言不降低。
已改源码不得仅因“语义相同”复用旧构建/receipt；恢复源码须逐字节核验，当前身份仍按原门禁。
仅报告/路径修复不使无关运行证据失效。Reviewer只读，实施Owner负责重测；Git仍需已有授权。

## Entry Check (SDD only)

普通代码评审完成上述五维/独立核验后直接返回评审结论；以下阶段状态、
测试交付、分支和归档步骤仅适用于关联的 SDD/OpenSpec 交付，不为裸 diff 新建状态。

Run:

```bash
~/.codex/skills/superflow/scripts/superflow-yaml-validate.sh <change-dir>
~/.codex/skills/superflow/scripts/superflow-state.sh recover <change-dir>
~/.codex/skills/superflow/scripts/superflow-state.sh scale <change-dir>
```

If the change is still in `implement`, run:

```bash
~/.codex/skills/superflow/scripts/superflow-guard.sh <change-dir> implement --apply
```

Do not verify from conversation memory. Use the current handoff index to locate canonical
`api.md`, `design.md`, `tasks.md`, `tests.md`, `sdd-quality-gate.md` and `test-report.md`.
Read the relevant bodies and evidence; preserve context_compression without rereading a full
projection of the same originals.

## Verification Modes

Use `.sdd/state.yaml` `verify_mode` after `scale`.

`light` is allowed only when all are true:

- no API, DB, SQL, Mapper/XML, SDK, cross-repo, status/enum, payment, refund,
  device, MQ, scheduler, or third-party contract change;
- task count and changed-file count stay within the scale threshold;
- no L3/L4 integration evidence is required by `tests.md` or quality gate.

`full` is required when any SDD hard gate is touched. Full verification must
prove the complete evidence chain: source/Mapper/XML, DB when needed, real
entry point, interface automation, logs, SQL sync, and consumer behavior.

Money-related changes always require full verification of
`Money Precision Boundary`: original calculation inputs and intermediate precision, the actual
rounding boundary and mode, half-cent/residual/multi-detail cases, deterministic
allocation, and reconciliation identities. A final two-decimal display value
or unit-test-only evidence is not sufficient.
For additive identities, verification must prove which total was authoritative,
which N-1 components were calculated independently, and which final complement
was derived as `authoritative total - sum(other components)`. Evidence that all
components were independently calculated and rounded is a failure.

## Required Superpowers

Immediately load and apply these Superpowers when available:

- `verification-before-completion` before claiming the work passes.
- `requesting-code-review` after local verification has evidence.
- `finishing-a-development-branch` before branch/worktree closeout.

If a required Superpower or independent Reviewer capability is unavailable,
record the missing capability and keep verification PARTIAL/Blocked. Complete
all authorized work independent of that capability; self-review cannot substitute
for independent review.

## Failure Decision

When verification finds a defect, first verify the finding against current
source, contracts, and raw evidence. Read [Flow Owner](../superflow/references/flow-owner.md).
For an ordinary task with implementation/repair authorization, return all valid
findings to its implementation owner and continue repair automatically within the
frozen contract. The review step itself remains read-only; do not restart an
unrelated environment or ask whether to continue for an ordinary code defect.
A review-only request returns findings without authorizing edits.

For implementation drift, run:

```bash
~/.codex/skills/superflow/scripts/superflow-state.sh transition <change-dir> verify-fail
```

Then return to `$superflow-build` for repair, affected verification, and review
again. Design/spec drift returns to `$superflow-contracts` and refreshed handoff,
review, and Coding Ready; changed confirmed intent requires a user decision.
Managed tasks retain their Host/Executor/Runner protocol. Real decision,
permission, environment, or non-convergence blockers record evidence, attempted
repairs, severity, and the concrete assistance needed. Never accept CRITICAL or
IMPORTANT deviations without authorization.

After three consecutive verify-fail cycles, do not auto-continue fixing. Ask
the user whether to continue fixing or accept the remaining deviations with
explicit recorded risk.

## Pass Closure

Before pass:

1. `test-report.md` 按[报告模板](../superflow/references/test-execution-template.md)保留
   一份当前终态、一张当前 Case 表及当前独评/复评引用，记录命令、适用 RED/GREEN、
   实际输出及 DB/日志/API 证据，链接规范 handoff 身份和阶段状态。旧恢复点/结果放明确
   `## 历史记录` / `## History` 或链接历史文件；Owner 处置和实际复评追加，原 Reviewer
   报告、文件 hash 与结论保留。
2. `~/.codex/hooks/superflow-verify-integration.sh <test-report.md>` passes when the
   report involves integration evidence.
3. `~/.codex/hooks/superflow-test-report-lint.py --require-complete --tests <tests.md> --review
   <.sdd/reviews/document-review.json> <test-report.md>`
   passes. If `tests.md` declares L3/L4, real-entry, third-party, device,
   database, log, or dev-tool evidence, mock-only/unit-only reports are hard
   failures unless the report is explicitly `Blocked` or `Partially verified`
   with the missing environment named.
4. `~/.codex/hooks/superflow-delivery-check.sh <test-report.md>` passes before
   delivery or branch closeout.
5. Code review findings are either fixed or explicitly recorded with accepted
   risk.
6. For money-related changes, `test-report.md` records the `Money Precision
   Boundary` cases and proves original, discount, actual/refund, and allocated
   totals reconcile without early rounding. For additive identities it also
   records the authoritative total and the subtraction used to derive the final
   complement.
7. Branch/worktree status is handled and `.sdd/state.yaml` has:
   `branch_status: handled`.
8. Every checkbox in `tasks.md` is checked. A completed implementation with
   stale task documentation is a verification failure, not an archive-time
   cleanup item.
9. `test-report.md` ends with the machine-checkable closeout markers
   `验证结果: PASS` and `归档就绪: PASS`. For `verify_mode: full`, it also
   records the test environment, branch/commit/build or image fingerprint,
   Base URL, and verification timestamp.

Only then run:

```bash
~/.codex/skills/superflow/scripts/superflow-guard.sh <change-dir> verify --apply
```

This advances to `phase: archive`, sets `verify_result: pass`, and records
`verified_at`.

## Archive Boundary

Passing verification does not itself authorize archive. If archive was already
explicitly authorized, continue `$superflow-archive` under that authorization;
otherwise report validated delivery and pending archive without blocking delivery
or repeatedly asking for continuation. Git and release retain their own authorization.


逐用例 PASS 必须提供可重放本地执行凭证；冻结服务/入口、源码写入链与持久化前后值断言。沿用 pipeline/references/document-review-coverage.md 的 execution-receipt.v1 合同，旧证据保留 PARTIAL；独立评审核对精确 Mapper statement 与原始输出，完整交付运行当前安装的 lint --require-complete。哈希不等同防伪或业务充分性。

### 数据库分层证据

按 [数据库合同](../superflow/references/document-review-coverage.md#数据库分层合同)
冻结并继承 `testLayer`、entry.database、生产 statement、mockBoundary 和数据断言。
核对原始事件与receipt、源码/构建/入口/引擎版本；旧固定版本证据保留，当前源码变化需新证据。
