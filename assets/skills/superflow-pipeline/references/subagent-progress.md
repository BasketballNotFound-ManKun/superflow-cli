# SDD Subagent Progress Transaction Log

Use this for subagent-driven development, parallel worktrees, or multi-window
implementation.

Create or update `.sdd/subagent-progress.md` in the change/task directory.
This file is a durable recovery checkpoint, not a casual status board.

## Template

```md
# Subagent Progress

- handoff_hash: `<hash>`
- phase: implement|verify
- build_mode: subagent-driven-development
- isolation: worktree|branch
- updated_at: <UTC timestamp>

## Current Transaction

- plan_file: `<path>`
- plan_task_text: `<full unchecked or checked task text>`
- openspec_task_file: `<path or null>`
- openspec_task_text: `<full mapped task text or null>`
- stage: implementing|spec-review|quality-review|checkoff|done|blocked|final-review|final-fix
- implementation_commit: `<hash or null>`
- changed_files: `<comma-separated files or null>`
- red_evidence: `<command/report link or null>`
- green_evidence: `<command/report link or null>`
- spec_review: pending|passed|failed|skipped
- quality_review: pending|passed|failed|skipped
- unresolved_feedback: `<summary or none>`
- review_fix_round: 0|1|2|3
- blocker: none|<specific blocker>

## Agent Ledger

| Agent | Role | Worktree | Port | Scope | Stage | Evidence | Blocker |
|---|---|---|---:|---|---|---|---|
| worker-1 | Worker | <path> | <port> | <single task> | implementing | <command/report link> | none |
| tester-1 | Tester | <path> | <port> | <test scope> | quality-review | <command/report link> | none |
| reviewer-1 | Reviewer | <path> | <port> | <review scope> | spec-review | <checklist link> | none |

## Merge/Closeout Queue

- [ ] Worker delivery docs updated
- [ ] Tester evidence copied into test-report
- [ ] Reviewer checklist resolved
- [ ] Plan task checked with exact task text
- [ ] OpenSpec task checked with exact mapped task text
- [ ] `superflow-state.sh task-checkoff <plan_file> <plan_task_text>` passed
- [ ] `superflow-state.sh task-checkoff <openspec_task_file> <openspec_task_text>` passed when mapped
- [ ] Leader aggregate docs updated
- [ ] `superflow-guard.sh <change-dir> implement` passed
```

## Rules

- Update this board at each handoff, context compression, or worktree switch.
- Each row must link to real evidence: prompt, test-report section, command
  output, screenshot, curl result, or review checklist.
- If `handoff_hash` changes, every active agent must reread the handoff and
  original OpenSpec/SDD docs before continuing.
- The coordinator must not execute implementation tasks directly when
  `build_mode: subagent-driven-development`; it dispatches fresh workers and
  reviewers, then records their commits/evidence here.
- Do not bundle multiple implementation tasks into one transaction. One current
  transaction maps to exactly one unique plan task text.
- The task text must be unique in the plan. If it is not unique, fix the plan
  before dispatching.
- A task can move to `checkoff` only after implementation commit exists,
  RED/GREEN evidence is recorded, spec review passed, and quality review passed.
- Each task gets at most 3 review-fix rounds. When round 3 still fails, mark
  `stage: blocked` and stop for user input with the accumulated feedback.
- A worker cannot mark delivery complete while `blocker` is not `none`.
- After checkoff passes, immediately continue to the next unchecked task unless
  the user explicitly paused or the transaction is blocked.

## Recovery

On context compression or new session:

1. Run `superflow-state.sh recover <change-dir>`.
2. Read `.sdd/handoff/sdd-context.md` and original `api.md`/`design.md`/`tests.md`.
3. Read this file and resume from the exact `stage`.
4. If `implementation_commit` is not visible in the current worktree, recover
   or merge it before continuing.
5. If the transaction does not match the first unchecked task, create a new
   transaction for that task and keep the old one as evidence.
