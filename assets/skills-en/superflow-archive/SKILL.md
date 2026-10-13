---
name: superflow-archive
description: Archive completed changes using SDD lifecycle gates or the pure OpenSpec procedure selected by existing state. Internal capability selected by $superflow.
---

## Archive routing

Resolve the exact change directory from the request or existing state. If it has no `.sdd/state.yaml`, read [pure OpenSpec archive](references/pure-openspec.md) and follow that procedure. If the state file exists, follow the SDD lifecycle below; failed checks must not fall back to the pure flow. The user does not choose between two skills.

# SDD Archive

Use this only after verification has passed. Archive is a user decision point:
do not mark archived until the user confirms final closeout.

## Preconditions

- `.sdd/state.yaml` exists.
- `phase: archive`.
- `verify_result: pass`.
- `verification_report` points to an existing report.
- Every checkbox in `tasks.md` is checked.
- The verification report contains `Verification Result: PASS` and
  `Archive Readiness: PASS`.
- `branch_status: handled` and `verified_at` are recorded.
- `superflow-state.sh recover <change-dir>` gives a coherent archive recovery action.

## Procedure

1. Run:
   ```bash
   ~/.codex/skills/superflow/scripts/superflow-yaml-validate.sh <change-dir>
   ~/.codex/skills/superflow/scripts/superflow-state.sh status <change-dir>
   ~/.codex/skills/superflow/scripts/superflow-archive.sh <change-dir> --dry-run
   ```
2. Show the user a short archive summary:
   - change/task directory
   - verification report
   - branch/worktree state
   - whether `openspec archive <change-name> --yes` will be used
   - any remaining `Blocked` or `Partially verified` boundary
3. Ask for explicit confirmation before archive closeout.
4. After confirmation, run:
   ```bash
   ~/.codex/skills/superflow/scripts/superflow-archive.sh <change-dir> --apply
   ```

## Recovery after archive relocation

If OpenSpec moved the directory but annotation/state closeout failed, preserve
artifacts and raw errors. Identify the exact `openspec/changes/archive/<archive-name>`
from this archive's output or actual operation record. Never guess a historical
same-name directory or repeat archive from the missing old path. Use the helper:

```bash
~/.codex/skills/superflow/scripts/superflow-archive.sh <explicit-archived-dir> --dry-run
# Check summary, original authorization, and remaining work; do not expand permission
~/.codex/skills/superflow/scripts/superflow-archive.sh <explicit-archived-dir> --apply
```

Moved directories resume only remaining annotations and the original state
transition, retaining validate/guard. Correct done + archived state returns
read-only idempotently. Nonstandard tasks keep the existing state-only fallback.
Check actual state.yaml, technical/design/plan annotations, and output; missing
or conflicting facts remain blocked. No automatic commit/push/merge, repeated
OpenSpec merge, or second closeout state machine.

## Rules

- Do not archive if verification failed or is only partially verified unless
  the user explicitly accepts the boundary.
- Do not use archive to hide missing API, DB, hook, SQL, test-report, or real
  integration evidence.
- Never call `openspec archive` directly to bypass the lifecycle gate. The
  installed archive-command hook blocks that path when native hooks are active.
- In a standard `openspec/changes/<name>` layout, archive must use OpenSpec
  archive semantics so delta specs are merged and the change is moved to
  `openspec/changes/archive/`. State-only archive is only a fallback for
  non-standard task directories.
- Archive must annotate the `technical_design`, compatibility `design_doc`, and
  `plan` paths recorded in `.sdd/state.yaml` when those files exist. The
  annotation is `archived-with: <archive-dir-name>`; `technical_design` and
  `design_doc` also record `status: final`. This is a lifecycle checkpoint for
  compressed sessions and later readers, not a replacement for OpenSpec archive.
- After OpenSpec moves the change, verify the archived directory contains
  `.sdd/state.yaml` with `archived: true`. Do not run guards against the old
  active path after a successful move.
- If the user wants adjustments, run:
  ```bash
  ~/.codex/skills/superflow/scripts/superflow-state.sh transition <change-dir> archive-reopen
  ```
  then return to verify or implement as needed.
