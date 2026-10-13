---
name: superflow-hotfix
description: Superflow 内部能力：处理行为明确的小型缺陷，涉及复杂接口或数据合同时升级完整流程。由 $superflow 选择，用户无需手动分流。
---

# SDD Hotfix

Hotfix is a preset workflow, not a bypass. It keeps SDD state and verification,
but skips heavy design expansion only when the repair is genuinely small.

## Allowed Scope

Use hotfix only when all are true:

- Existing behavior is broken and the intended behavior is already clear.
- No new capability design is needed.
- No API contract change.
- No SQL/schema/table/status/enum/cross-repo/SDK change.
- No third-party or real-entry contract ambiguity.

If any condition fails, set `workflow: full` and return to full SDD docs.

## Procedure

1. Initialize or update state:
   ```bash
   ~/.codex/skills/superflow/scripts/superflow-state.sh init <change-dir> hotfix docs
   ```
2. Create the minimum SDD docs needed to freeze the fix:
   `proposal.md`, `api.md` when an interface is touched, `design.md`,
   `tasks.md`, `tests.md`, `sdd-quality-gate.md`, `test-report.md`, and
   prompt.
3. Generate handoff and run docs guard.
4. Set implementation decisions:
   ```bash
   ~/.codex/skills/superflow/scripts/superflow-state.sh set <change-dir> build_mode team-prompt
   ~/.codex/skills/superflow/scripts/superflow-state.sh set <change-dir> isolation worktree
   ~/.codex/skills/superflow/scripts/superflow-state.sh set <change-dir> tdd_mode direct
   ~/.codex/skills/superflow/scripts/superflow-state.sh set <change-dir> review_mode off
   ```
5. Run implement and verify guards. If `scale` reports `full`, upgrade to full.

## Upgrade Conditions

Upgrade to full SDD when the fix touches API, DB, SQL, Mapper/XML,
cross-repo consumers, status/enum semantics, SDK versions, real entry points,
third-party integration, payment/refund/device/MQ/scheduler flows, or when the
root cause is not yet proven.
