---
name: superflow-tweak
description: Superflow 内部能力：处理文案、文档与流程文字的小改动，运行行为变更交给正式开发流程。由 $superflow 选择，用户无需手动分流。
---

# SDD Tweak

Tweak is a preset workflow for small non-runtime changes. It must not weaken
SDD evidence for code, API, database, or integration behavior.

## Allowed Scope

Use tweak only for:

- Prompt wording
- SDD documentation wording
- Review checklist wording
- Non-runtime comments
- Local process text

Do not use tweak for Java/runtime code, API behavior, SQL, Mapper/XML, DB,
status/enum, SDK, cross-repo, frontend contract, or real integration changes.

## Procedure

1. Initialize state:
   ```bash
   ~/.codex/skills/superflow/scripts/superflow-state.sh init <change-dir> tweak docs
   ```
2. Generate/update handoff so future sessions can recover exact context.
3. Set:
   ```bash
   ~/.codex/skills/superflow/scripts/superflow-state.sh set <change-dir> build_mode direct
   ~/.codex/skills/superflow/scripts/superflow-state.sh set <change-dir> isolation branch
   ~/.codex/skills/superflow/scripts/superflow-state.sh set <change-dir> tdd_mode direct
   ~/.codex/skills/superflow/scripts/superflow-state.sh set <change-dir> review_mode off
   ```
4. Run `superflow-state.sh scale <change-dir>`. If it returns `full`, stop tweak and
   upgrade to full SDD.
5. Verify with the relevant doc/template/script checks and run archive only
   after user confirmation.

## Upgrade Conditions

Any runtime behavior, API, DB, SQL, hook, integration evidence, worktree
parallel coding, or user-facing behavior change upgrades this to full SDD.
