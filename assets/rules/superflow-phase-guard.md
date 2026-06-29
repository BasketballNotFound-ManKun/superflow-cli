# SDD Phase Guard

This rule is a lightweight anti-drift reminder for Codex and Claude Code.
When an active SDD/OpenSpec change exists, read
`openspec/changes/<name>/.sdd/state.yaml` before editing files or running
phase-changing commands.

## Phase Awareness

| phase | allowed | blocked |
| --- | --- | --- |
| `docs` | clarify requirements, OpenSpec artifacts, SDD contract docs, handoff | runtime code changes |
| `design` | Superpowers technical design, reverse impact analysis, TDD strategy | runtime code changes before design guard |
| `implement` | implementation, TDD, worktree coordination, task checkoff | skipping plan/user decisions |
| `verify` | verification, code review, branch/worktree closeout | hiding failed or partial evidence |
| `archive` | final user confirmation, archive script | source code changes |
| `done` | read-only inspection | lifecycle changes without reopen |

## Required Checkpoints

- Use `.sdd/handoff/brainstorm-summary.md` during changing requirements or
  design discussion; separate confirmed, candidate, pending, and rejected
  content.
- After `brainstorm-summary.md` is finalized and before creating or rewriting
  `design.md`, perform the active context-compression gate or get explicit user
  confirmation to continue.
- Before Superpowers planning or implementation prompts, generate
  `.sdd/handoff/sdd-context.*` and record its hash in SDD quality gates.
- During `phase: design`, create
  `docs/superpowers/specs/*-technical-design.md`, record it as
  `technical_design` in `.sdd/state.yaml`, and keep it limited to source-level
  HOW. OpenSpec/SDD still owns requirements, API, DB, tests, SQL, and gates.
- During `phase: implement`, `prompt/implementation.md` and task prompts under
  `prompt/<task-name>.md` must exist and be cross-linked from tasks,
  traceability, quality gate, and test-report before verification.
- After context compression, agent switch, worktree switch, or parallel terminal
  handoff, run `superflow-state.sh recover <change-dir>` and follow the printed
  recovery action.
- If `build_pause: plan-ready`, do not regenerate the plan unless the plan file
  is missing or the user explicitly asks for a rewrite.
- If `build_mode: subagent-driven-development`, the main session coordinates
  only; read `.sdd/subagent-progress.md` and do not execute worker tasks
  directly.
- Build must complete `requesting-code-review` before transitioning to verify.
- Verify must use `verification-before-completion`; archive requires explicit
  user confirmation and `superflow-archive.sh`.

OpenSpec/SDD documents remain the design source of truth. Handoff and rules are
recovery aids; when they conflict with source documents, read and fix the source
documents first.
