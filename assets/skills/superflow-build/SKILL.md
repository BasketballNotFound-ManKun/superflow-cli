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

开工按[主导航](../superflow/references/implementation-prompt-template.md#execution-navigation)核本批Task/Entry/Case，测试按[test-guide](../superflow/references/test-guide.md#capture-boundaries-without-test-coupling)解耦交付身份。已有独评问题沿[原报告和复评链](../superflow/references/reviewer-checklist.md#finding-closure)整改，不改原结论过格式。

Implement tasks from an OpenSpec change.

## 当前独立评审与交付记录

完整读取 [Reviewer 清单](../superflow/references/reviewer-checklist.md)，按其中可读
diff.patch/source-manifest 派发，区分 FIXED/MITIGATED/DEFERRED/NOT_A_DEFECT；
整改后由原 Reviewer 或新隔离 Reviewer 实际复评。补日志不关闭仍存在的错误行为。
所有完整 SDD 交付（统一 observed-delivery.v1）在 test-report.md `## Independent Review` 下
用 `| Report |` 表引用当前独立 DONE 报告，报告在 `## Reviewed Sources` 的
`| Path | SHA-256 |` 表绑定已审源码。源码变更后真实复评，不重绑历史报告的 hash；
缺报告/当前复评或未决阻断项保持 PARTIAL/Blocked。旧文件仅保留为历史或 PARTIAL，
缺当前要求时阻断补齐。


## Superflow 实施验证入口

在 Superflow 工作流中，实施首个任务前读取
[测试指南](../superflow/references/test-guide.md)，加载已冻结的 tests.md 与项目测试。
逐任务按既有用例执行 RED/GREEN 与必要真实验证，证据成立才勾选完成；缺合同回
superflow-contracts，缺环境记录阻塞。普通 OpenSpec 使用项目自己的验证规则。

## 持续交付责任

普通已授权实施必须先读取 [Flow Owner](../superflow/references/flow-owner.md)。
按所选执行模式持续覆盖全部任务、验证和整改；阶段进度用过程消息汇报后继续。
当前 Owner 可编码和测试，独立评审按现有清单执行，不能用自评冒充。

中高风险按 Reviewer 清单记录实际派发、身份、评审 diff、报告及 finding 闭环。
评审后的实现变更按影响重测并交隔离 Reviewer 复评；无此能力时完成其余授权工作，
保留 PARTIAL，交付沿 Flow Owner 事实矩阵对账。

**Input**: Optionally specify a change name. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` to get available changes and use the **AskUserQuestion tool** to let the user select

   Always announce: "Using change: <name>" and how to override (e.g., `$superflow <other>`) .

**Superflow pre-coding gate (before reading apply readiness as permission)**

   Before the first source edit or initial implementation dispatch for a Superflow
   change, including one with missing `.sdd/state.yaml`, run
   `superflow check <change> --level coding-ready`. A failure means `Blocked for docs`;
   return to the existing document owner using
   [Document Delivery Exit](../superflow/SKILL.md#document-delivery-exit).
   Do not fall back to native OpenSpec apply readiness or treat missing Superflow
   documents as coding tasks. A passing OpenSpec status alone is insufficient.
   When resuming implementation already admitted by a valid receipt, use the
   existing `superflow-review-coverage.mjs <change-dir>` receipt check without
   `--check-sources`, as source-edit hooks do. It checks frozen contracts while
   allowing intended implementation code changes; do not rerun strict document
   readiness solely because source code changed. Contract drift returns to its
   document owner for review and a new receipt before the affected work continues.

2. **Check status to understand the schema**
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse the JSON to understand:
   - `schemaName`: The workflow being used (e.g., "spec-driven")
   - Which artifact contains the tasks (typically "tasks" for spec-driven, check status for others)

3. **Get apply instructions**

   ```bash
   openspec instructions apply --change "<name>" --json
   ```

   This returns:
   - `contextFiles`: artifact ID -> array of concrete file paths (varies by schema - could be proposal/specs/design/tasks or spec/tests/implementation/docs)
   - Progress (total, complete, remaining)
   - Task list with status
   - Dynamic instruction based on current state

   **Handle states:**
   - If `state: "blocked"` (missing artifacts): show message, suggest using openspec-continue-change
   - If `state: "all_done"`: in Superflow continue to verification and delivery reconciliation; plain OpenSpec follows project closeout.
   - Otherwise: proceed to implementation

4. **Read context files**

   Read every file path listed under `contextFiles` from the apply instructions output.
   The files depend on the schema being used:
   - **spec-driven**: proposal, specs, design, tasks
   - Other schemas: follow the contextFiles from CLI output

5. **Show current progress**

   Display:
   - Schema being used
   - Progress: "N/M tasks complete"
   - Remaining tasks overview
   - Dynamic instruction from CLI

6. **Implement tasks (loop until done or blocked)**

   For each pending task:
   - Show which task is being worked on
   - Make the code changes required
   - Keep changes minimal and focused
   - Run the task's frozen signals; only after they pass, mark the task `- [ ]` → `- [x]`. Select only tasks whose actual predecessors are complete.
   - Continue to next task

   **Pause if:**
   - Task is unclear → ask for clarification
   - Implementation reveals a design issue → suggest updating artifacts
   - Repairable error within authorization → diagnose, repair, and rerun affected signals; actual decision/permission/environment blocker → persist evidence and stop dependent work.
   - User interrupts

7. **On completion or pause, show status**

   Display:
   - Tasks completed this session
   - Overall progress: "N/M tasks complete"
   - If all implementation tasks are done: run required signals and continue `$superflow-verify`; do not end authorized delivery at checkbox completion.
   - If paused: explain why and wait for guidance

**Output During Implementation**

```
## Implementing: <change-name> (schema: <schema-name>)

Working on task 3/7: <task description>
[...implementation happening...]
✓ Task complete

Working on task 4/7: <task description>
[...implementation happening...]
✓ Task complete
```

**Output On Completion**

```
## Implementation Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Progress:** 7/7 tasks complete ✓

### Completed This Session
- [x] Task 1
- [x] Task 2
...

Implementation signals complete. Continuing verification, review, repair, and delivery reconciliation.
```

**Output On Pause (Issue Encountered)**

```
## Implementation Paused

**Change:** <change-name>
**Schema:** <schema-name>
**Progress:** 4/7 tasks complete

### Issue Encountered
<description of the issue>

**Options:**
1. <option 1>
2. <option 2>
3. Other approach

What would you like to do?
```

**Guardrails**
- Keep going through tasks until done or blocked
- Always read context files before starting (from the apply instructions output)
- If task is ambiguous, pause and ask before implementing
- If implementation reveals a confirmed design/contract gap, return to its document owner; repair ordinary defects within authorization.
- Keep code changes minimal and scoped to each task
- Update task checkbox immediately after completing each task
- Diagnose ordinary errors within authorization; pause only for actual decisions, unavailable prerequisites, user pause, or the existing convergence limit.
- Use contextFiles from CLI output, don't assume specific file names

**Fluid Workflow Integration**

This skill supports the "actions on a change" model:

- **Can be invoked anytime**: Before all artifacts are done (if tasks exist), after partial implementation, interleaved with other actions
- **Allows artifact updates**: If implementation reveals design issues, suggest updating artifacts - not phase-locked, work fluidly
