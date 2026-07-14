---
name: superflow-verify
description: Use when an OpenSpec/SDD change is ready for verification, real evidence collection, test-report closure, code review, branch handling, or retry decisions after implementation.
---

# SDD Verify

Verification is a phase, not a final sentence. Use this skill after
implementation work claims completion and before archive or delivery.

## Entry Check

Run:

```bash
~/.codex/skills/superflow-pipeline/scripts/superflow-yaml-validate.sh <change-dir>
~/.codex/skills/superflow-pipeline/scripts/superflow-state.sh recover <change-dir>
~/.codex/skills/superflow-pipeline/scripts/superflow-state.sh scale <change-dir>
```

If the change is still in `implement`, run:

```bash
~/.codex/skills/superflow-pipeline/scripts/superflow-guard.sh <change-dir> implement --apply
```

Do not verify from conversation memory. Reload `.sdd/handoff/sdd-context.md`,
`api.md`, `design.md`, `tasks.md`, `tests.md`, `sdd-quality-gate.md`, and
existing `test-report.md`.

## Verification Modes

Use `.sdd/state.yaml` `verify_mode` after `scale`.

`light` is allowed only when all are true:

- no API, DB, SQL, Mapper/XML, SDK, cross-repo, status/enum, payment, refund,
  device, MQ, scheduler, or third-party contract change;
- task count and changed-file count stay within the scale threshold;
- no L3/L4 integration evidence is required by `tests.md` or quality gate.

`full` is required when any SDD hard gate is touched. Full verification must
prove the complete evidence chain: source/Mapper/XML, DB when needed, real
entry point, interface automation, logs, SQL sync, and consumer behavior.

Money-related changes always require full verification of
`Money Precision Boundary`: original calculation inputs and intermediate precision, the actual
rounding boundary and mode, half-cent/residual/multi-detail cases, deterministic
allocation, and reconciliation identities. A final two-decimal display value
or unit-test-only evidence is not sufficient.
For additive identities, verification must prove which total was authoritative,
which N-1 components were calculated independently, and which final complement
was derived as `authoritative total - sum(other components)`. Evidence that all
components were independently calculated and rounded is a failure.

## Required Superpowers

Immediately load and apply these Superpowers when available:

- `verification-before-completion` before claiming the work passes.
- `requesting-code-review` after local verification has evidence.
- `finishing-a-development-branch` before branch/worktree closeout.

If a required Superpower is unavailable, mark the verification `Blocked` and
ask the user to install or enable it. Do not replace it with ordinary prose.

## Failure Decision

When verification fails, stop at a decision point. Present:

- failed check and evidence path;
- whether failure is CRITICAL, IMPORTANT, WARNING, or SUGGESTION;
- recommended fix path;
- risk if the user accepts deviation.

CRITICAL or IMPORTANT failures cannot be accepted silently. If the user chooses
to fix, run:

```bash
~/.codex/skills/superflow-pipeline/scripts/superflow-state.sh transition <change-dir> verify-fail
```

Then return to `$superflow-implement` or `$superflow-docs` depending on whether the failure
is implementation drift or design/spec drift.

After three consecutive verify-fail cycles, do not auto-continue fixing. Ask
the user whether to continue fixing or accept the remaining deviations with
explicit recorded risk.

## Pass Closure

Before pass:

1. `test-report.md` records commands, RED/GREEN expectations, actual output,
   DB/log/API evidence, handoff hash, and phase state.
2. `~/.codex/hooks/superflow-verify-integration.sh <test-report.md>` passes when the
   report involves integration evidence.
3. `~/.codex/hooks/superflow-test-report-lint.py --tests <tests.md> <test-report.md>`
   passes. If `tests.md` declares L3/L4, real-entry, third-party, device,
   database, log, or dev-tool evidence, mock-only/unit-only reports are hard
   failures unless the report is explicitly `Blocked` or `Partially verified`
   with the missing environment named.
4. `~/.codex/hooks/superflow-delivery-check.sh <test-report.md>` passes before
   delivery or branch closeout.
5. Code review findings are either fixed or explicitly recorded with accepted
   risk.
6. For money-related changes, `test-report.md` records the `Money Precision
   Boundary` cases and proves original, discount, actual/refund, and allocated
   totals reconcile without early rounding. For additive identities it also
   records the authoritative total and the subtraction used to derive the final
   complement.
7. Branch/worktree status is handled and `.sdd/state.yaml` has:
   `branch_status: handled`.
8. Every checkbox in `tasks.md` is checked. A completed implementation with
   stale task documentation is a verification failure, not an archive-time
   cleanup item.
9. `test-report.md` ends with the machine-checkable closeout markers
   `Verification Result: PASS` and `Archive Readiness: PASS`. For
   `verify_mode: full`, it also records the test environment,
   branch/commit/build or image fingerprint, Base URL, and verification
   timestamp.

Only then run:

```bash
~/.codex/skills/superflow-pipeline/scripts/superflow-guard.sh <change-dir> verify --apply
```

This advances to `phase: archive`, sets `verify_result: pass`, and records
`verified_at`.

## Archive Boundary

Passing verification does not authorize automatic archive. Enter `$superflow-archive`
and wait for explicit user confirmation.
