# SDD Dirty Worktree Policy

Use this before implementation, verification, archive, or any worktree split.

## Check

```bash
git status --short
git diff --stat
```

## Rules

- Treat uncommitted files as owned by the user unless the current task created
  them in this session.
- Do not revert, overwrite, or clean unrelated files.
- If SDD docs are dirty, regenerate `.sdd/handoff/sdd-context.*` before
  creating implementation prompts or coding.
- If runtime files are dirty before docs are complete, stop and run the docs
  guard. Runtime edits during `phase: docs` are blocked unless the user
  explicitly switches to hotfix/tweak and the hard gates allow it.
- For parallel worktrees, each worker may update only its task-local docs and
  allowed runtime files. Root aggregate SDD docs are reserved for Leader
  closeout.

## Handoff Note

When continuing from another session, record:

```md
- dirty_worktree_checked: yes
- unrelated_changes_left_untouched: yes|none
- sdd_docs_changed_since_handoff: yes|no
- regenerated_handoff: yes|no
```
