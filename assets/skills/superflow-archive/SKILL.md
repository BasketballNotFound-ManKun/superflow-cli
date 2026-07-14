---
name: superflow-archive
description: Use when an SDD/OpenSpec change has passed verification and needs final archive confirmation, lifecycle closeout, archived state recording, or recovery from phase archive.
---

# SDD Archive

Use this only after verification has passed. Archive is a user decision point:
do not mark archived until the user confirms final closeout.

## Preconditions

- `.sdd/state.yaml` exists.
- `phase: archive`.
- `verify_result: pass`.
- `verification_report` points to an existing report.
- Every checkbox in `tasks.md` is checked.
- The verification report contains `验证结果: PASS` and `归档就绪: PASS`.
- `branch_status: handled` and `verified_at` are recorded.
- `superflow-state.sh recover <change-dir>` gives a coherent archive recovery action.

## Procedure

1. Run:
   ```bash
   ~/.codex/skills/superflow-pipeline/scripts/superflow-yaml-validate.sh <change-dir>
   ~/.codex/skills/superflow-pipeline/scripts/superflow-state.sh status <change-dir>
   ~/.codex/skills/superflow-pipeline/scripts/superflow-archive.sh <change-dir> --dry-run
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
   ~/.codex/skills/superflow-pipeline/scripts/superflow-archive.sh <change-dir> --apply
   ```

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
  ~/.codex/skills/superflow-pipeline/scripts/superflow-state.sh transition <change-dir> archive-reopen
  ```
  then return to verify or implement as needed.
