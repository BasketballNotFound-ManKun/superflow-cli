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

## 归档搬迁后的恢复

OpenSpec 已移动目录但文档标注或 state 收口失败时，保留现场与原始错误。
根据本次 archive 输出或实际操作记录确认精确 `openspec/changes/archive/<archive-name>`；
不能凭同名选择旧日期目录，也不对失效的原路径重复归档。明确目标后运行原 helper：

```bash
~/.codex/skills/superflow-pipeline/scripts/superflow-archive.sh <explicit-archived-dir> --dry-run
# 核对摘要、原授权与当前未完成步骤后继续；不扩大原归档授权
~/.codex/skills/superflow-pipeline/scripts/superflow-archive.sh <explicit-archived-dir> --apply
```

已移动目录只恢复剩余标注与原 state transition，仍需 validate/guard；done + archived 状态
正确时只读幂等返回。非标准任务目录保留既有 state-only fallback。
检查实际 `.sdd/state.yaml`、技术详设/设计/计划标注和输出；缺失或冲突记录阻塞。
此恢复不自动 commit/push/merge，不重做已完成 OpenSpec 合并，不创建第二套收口状态机。

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
