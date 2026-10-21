---
name: superflow-verify
description: Use when reviewing code changes or verifying an SDD/OpenSpec implementation, test evidence, branch/worktree handling, or retry decisions.
---

# SDD Verify

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


## Verification signal review

Read the [test guide](../superflow/references/test-guide.md). Compare current
changes, frozen cases, and actual execution counts; distinguish logic, database,
and real-entry conclusions. Judge historical applicability before requesting
affected reruns. Report formatting alone does not force full-chain reruns. Reviewers
inspect raw output and source read-only.

Before semantic code review, run `superflow review-coverage --json` (or pass
`--base <ref>` for a branch review). Use its included/excluded inventory and
path-specific rules to account for every changed file. Review related Java
and Mapper XML files together when they share a bundle. Do not treat this
mechanical inventory as a correctness verdict: findings still need source
anchors, a fresh reading of the affected call path, and independent judgment.

SDD evidence reuse requires executionContext: independently check current command, cwd,
selected environment, source, build, and entry. Changed invocation context cannot
reuse PASS. Missing current requirements remain PARTIAL; JSON presence/hash
identity does not prove actual execution or business sufficiency.


## Five-axis and independent review entry

Read the [canonical Reviewer checklist](../superflow/references/reviewer-checklist.md)
for code-quality review. Follow its actual-impact depth selection, isolated bundle,
axis coverage, finding falsification, and merging. `review-coverage` risk.tier is a
path hint, not the actual depth: print both tiers with evidence. Ordinary code
review enters here without creating SDD state; existing frozen contracts still
require conformity checks. The main Agent owns the verdict, reviewers contribute
read-only independent views, and Runner does not judge semantic risk.

Use the existing four-state report with `superflow review-coverage --report <file> --json`
for markers/anchors. It does not prove axis sufficiency: inspect raw proof yourself.
BLOCKED/NEEDS_CONTEXT needs evidence; investigate every DONE_WITH_CONCERNS concern
before deciding. Use isolated native subagents for medium+ when supported, adding
focused views by independent high-risk clusters without fixed counts or models.
Report unavailable independent review honestly.

Independent review requires actual dispatch, Reviewer identity, exact diff, and
report under the checklist. Reuse review_mode/state/test-report without new state.
After review changes, actually rerun affected signals and have an isolated Reviewer
recheck fixes and regressions. Old PASS cannot cover new diffs. Use the Flow Owner
facts matrix for delivery; phase=archive cannot replace goal acceptance or hide
external coordination and open items.

## Review response discipline

When receiving a finding, read all feedback before responding, restate the
request, then verify it against the current source, project rules, callers, and
tests. Do not agree or patch from the reviewer's wording alone. If the finding
is valid, state the anchored defect and fix direction; if it is wrong, explain
the concrete source or contract evidence and the rejected alternative. Apply
one finding at a time and run the affected signal before claiming it is fixed.
For broad “make it generic” advice, check actual call sites first; keep the
smallest implementation when no second caller or contract requires expansion.
Only propose a recurring project rule after the user confirms it; review
feedback remains advisory and does not silently change repository policy.

For full workflow acceptance, read [requirement × real-entry review](../superflow/references/document-review-coverage.md).
Reuse R/E/C IDs in the existing test-report with actual actors, page actions, request routes,
final state and forbidden-effect evidence. Independently compare originals and actual callers;
API-only is not browser E2E, and planned cases are not execution evidence.
For cross-page field changes, recheck the exact Mapper statement reached by each
page request and inspect same-ID API/DB comparisons on non-null records plus
browser rendering. Historical NULL, field keys and static column configuration
support narrower claims only.

Verification is a phase, not a final sentence. Use this skill after
implementation work claims completion and before archive or delivery.

## Behavior-preserving simplification

After the implementation signals are green, inspect only the files changed by
this change for missed reuse, duplicated logic, redundant defensive branches,
and needless abstraction. Before removing a helper or guard, identify its
callers, error behavior, side effects, and reason for existing. If that reason
is unclear, leave it in place. Simplification is optional; clean code needs no
ceremonial edit.

The implementation owner applies one small simplification at a time; the reviewer stays read-only. Run the same tests and build signals
without changing their assertions; if behavior, errors, or side effects change,
revert that simplification. Keep simplification separately reviewable from the
feature; commit only when authorized, and stop if it reaches files outside the original change. This is a
readability pass, not a second code review or a license for unrelated cleanup.

## Entry Check (SDD only)

Ordinary code review returns its reviewed findings after the five-axis workflow.
The phase state, test-delivery, branch, and archive steps below apply only to an
associated SDD/OpenSpec delivery; do not create state for a bare diff review.

Run:

```bash
~/.codex/skills/superflow/scripts/superflow-yaml-validate.sh <change-dir>
~/.codex/skills/superflow/scripts/superflow-state.sh recover <change-dir>
~/.codex/skills/superflow/scripts/superflow-state.sh scale <change-dir>
```

If the change is still in `implement`, run:

```bash
~/.codex/skills/superflow/scripts/superflow-guard.sh <change-dir> implement --apply
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

If a required Superpower or independent Reviewer capability is unavailable,
record the missing capability and keep verification PARTIAL/Blocked. Complete
all authorized work independent of that capability; self-review cannot substitute
for independent review.

## Failure Decision

When verification finds a defect, first verify the finding against current
source, contracts, and raw evidence. Read [Flow Owner](../superflow/references/flow-owner.md).
For an ordinary task with implementation/repair authorization, return all valid
findings to its implementation owner and continue repair automatically within the
frozen contract. The review step itself remains read-only; do not restart an
unrelated environment or ask whether to continue for an ordinary code defect.
A review-only request returns findings without authorizing edits.

For implementation drift, run:

```bash
~/.codex/skills/superflow/scripts/superflow-state.sh transition <change-dir> verify-fail
```

Then return to `$superflow-build` for repair, affected verification, and review
again. Design/spec drift returns to `$superflow-contracts` and refreshed handoff,
review, and Coding Ready; changed confirmed intent requires a user decision.
Managed tasks retain their Host/Executor/Runner protocol. Real decision,
permission, environment, or non-convergence blockers record evidence, attempted
repairs, severity, and the concrete assistance needed. Never accept CRITICAL or
IMPORTANT deviations without authorization.

After three consecutive verify-fail cycles, do not auto-continue fixing. Ask
the user whether to continue fixing or accept the remaining deviations with
explicit recorded risk.

## Pass Closure

Before pass:

1. `test-report.md` records commands, RED/GREEN expectations, actual output,
   DB/log/API evidence, handoff hash, and phase state.
2. `~/.codex/hooks/superflow-verify-integration.sh <test-report.md>` passes when the
   report involves integration evidence.
3. `~/.codex/hooks/superflow-test-report-lint.py --tests <tests.md> --review
   <.sdd/reviews/document-review.json> <test-report.md>`
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
~/.codex/skills/superflow/scripts/superflow-guard.sh <change-dir> verify --apply
```

This advances to `phase: archive`, sets `verify_result: pass`, and records
`verified_at`.

## Archive Boundary

Passing verification does not itself authorize archive. If archive was already
explicitly authorized, continue `$superflow-archive` under that authorization;
otherwise report validated delivery and pending archive without blocking delivery
or repeatedly asking for continuation. Git and release retain their own authorization.


Per-case PASS requires retained local execution receipts. Freeze service/entry, source write chains and before/after persistence assertions using pipeline/references/document-review-coverage.md and execution-receipt.v1. Keep legacy evidence PARTIAL. Independent review checks the exact Mapper statement and raw output; full delivery runs the current installation's lint --require-complete. Hashes do not prove authenticity or business sufficiency.

### Database layer evidence

Freeze and inherit `testLayer`, entry.database, production statements, mockBoundary,
and data assertions from the [database contract](../superflow/references/document-review-coverage.md#database-layer-contract).
Compare original events/receipts and source/build/entry/engine versions; preserve fixed-version historical evidence, require new evidence for changed sources.
