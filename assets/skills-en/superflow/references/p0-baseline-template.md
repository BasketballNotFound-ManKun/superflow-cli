# P0 Baseline Template

## Execution mode inheritance

Read [Flow Owner](flow-owner.md) and inherit the selected technical-design/state
mode. New ordinary work defaults to `owner`: the current Agent implements and
tests, coordinating independent views according to risk and frozen obligations.
Preserve team/subagent roles and isolation when selected. Team checklists below
define responsibilities; a separate Tester is fixed only when required by the
contract. Self-tests are not independent verification. Continue all work,
verification, review, repair, and delivery after updates; do not commit to save
progress. Document-only work does not execute code.


Use P0 to make later work verifiable.

## Owner-mode prompt generation contract

When `build_mode: owner` is selected, generate the actual batch prompt using
this structure instead of copying the Team/Subagent playbook below. Retain all
required contracts, applicable tests, and independent-verification obligations.

1. **Goal and scope**: authorization, task IDs, exact files, dependencies,
   exclusions, and actual isolation.
2. **Required reading and source-level HOW**: link handoff, api.md, design.md,
   tasks.md, tests.md, quality gate, review checklist, technical_design, and
   applicable release-sql.md.
3. **Execution decisions**: record `build_mode: owner`, isolation, tdd_mode,
   review_mode, implementation_prompt, current implementation/test responsibility,
   and actual required independent Reviewer/Tester responsibilities.
4. **Contract inheritance**: carry every applicable semantic, write-loop, impact,
   and real-entry contract required by the phase skill, plus frozen case IDs,
   commands, assertions, and evidence paths. Add no business design or raw hash copy.
5. **Continuous execution**: dependency-ready work, applicable RED/GREEN and real
   verification, required independent review, repair/retest/review, existing verify
   gates. Continue after updates; return only at an actual stop boundary.
6. **Recovery and delivery**: Owner Recovery in test-report, resource identity
   and cleanup, evidence/remaining-item reconciliation, and existing operation
   authorization for Git, release, and archive.

## Team/Subagent mode template

The following playbook is for selected team/subagent execution; ordinary owner
mode uses the generation contract above.

## Scope

- Confirm branch, worktree, build command, app start command, ports, and logs.
- Confirm database connection and schema state when DB is involved.
- Confirm API auth/token flow when endpoints are involved.
- Confirm external dependency keys, callbacks, sandbox tools, or blockers.
- Run compile or baseline tests before behavior changes.

## Output

Record baseline evidence in test-report.md before implementation begins.
