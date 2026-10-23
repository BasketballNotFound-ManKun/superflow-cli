---
name: superflow-build
description: Implement tasks from an OpenSpec change. Use when the user wants to start implementing, continue implementation, or work through tasks.
license: MIT
metadata:
  requires: openspec CLI
  author: openspec
  version: "1.0"
  generatedBy: "1.3.1"
---

At startup check batch Task/Entry/Case via [main navigation](../superflow/references/implementation-prompt-template.md#execution-navigation). Decouple delivery identity using the [test guide](../superflow/references/test-guide.md#capture-boundaries-without-test-coupling). Repair under the [original/re-review chain](../superflow/references/reviewer-checklist.md#finding-closure), never by rewriting conclusions for formatting.

Implement tasks from an OpenSpec change.

## Current independent review and delivery record

Read the full [Reviewer checklist](../superflow/references/reviewer-checklist.md).
Dispatch its readable diff.patch/source-manifest bundle; distinguish FIXED,
MITIGATED, DEFERRED and NOT_A_DEFECT. Repairs return to the original Reviewer
or a new isolated Reviewer for actual rereview. Logs do not fix remaining defects.
For all complete SDD delivery under observed-delivery.v1, test-report.md `## Independent Review`
contains a `| Report |` table referencing current independent DONE reports. Reports
bind reviewed source versions through `## Reviewed Sources` and `| Path | SHA-256 |`.
Changed source requires actual rereview, not rebound historical report hashes.
Missing reports/current rereview or open blockers remain PARTIAL/Blocked. Retain old
files only as history or PARTIAL; missing current requirements block until completed.


## Superflow implementation verification entry

Within the Superflow workflow, before the first task read the
[Owner-led planning](../superflow/references/test-guide.md#owner-led-test-planning),
loading baseline tests.md and project tests. Owner adds same-goal boundaries/regressions
from actual diffs/callers/discoveries, executes applicable RED/GREEN and required real
checks, and completes tasks only with proof. New Case IDs/frozen contexts are maintained
by the same Owner through contracts/handoff/readiness before continuing, without routine
approval requests. Never lower expectations/required checks. Missing required environments
stay blocked. Plain OpenSpec retains project rules.

## Continuous delivery ownership

For authorized ordinary implementation, read [Flow Owner](../superflow/references/flow-owner.md).
Follow the selected mode through all tasks, verification, and repair. Progress
updates are intermediate; the Owner may implement/test, obtaining required
independent views through the existing checklist without claiming self-review is independent.

For medium/high risk, record actual dispatch, reviewer identity, reviewed diff,
report, and finding closure under the Reviewer checklist. Rerun affected signals
and obtain isolated rereview after implementation changes. Without that capability,
finish other authorized work, retain PARTIAL, and use the Flow Owner delivery matrix.

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
   - Run the task's mandatory baseline plus source-driven strengthened signals; only after they pass, mark the task `- [ ]` → `- [x]`. Select only tasks whose actual predecessors are complete.
   - Continue to next task

   **Pause if:**
   - Test detail is unclear → inspect source and existing tests, supplement within the confirmed goal; unresolved business meaning → request the required decision
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
