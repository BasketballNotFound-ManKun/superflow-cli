# Flow Owner: Continuous Ordinary Delivery

## Scope and Sources of Truth

When implementation, repair, or complete delivery is authorized without managed
mode, the current Codex/Claude is the Flow Owner. It can implement, test, and
manage resources it starts, using native subagents in proportion to actual risk.
Discussion, investigation, documentation-only, and review-only requests end at
their requested scope and do not authorize implementation. Explicit managed
requests use managed-work.md; ordinary work creates no managed Task/Run or peer CLI.

Reuse existing owners: superflow routes, build implements, verify reviews
read-only, handoff produces prompts, state scripts advance SDD, test-guide owns
verification levels, and reviewer-checklist owns independent review. Read each
phase skill before invoking it. This contract owns continuity, not business
design, test strategy, or a parallel state machine.

## Start and Recovery

1. Read project rules, current workspace, baseline, and untracked files; separate
   task changes from other people's work.
2. For SDD, run `superflow-state.sh recover <change-dir>` and `next`; reload the
   frozen handoff, implementation prompt, tasks.md, tests.md, and test-report.md.
   First implementation requires Coding Ready; admitted continuation uses build's
   receipt check. Contract drift returns to its document owner.
3. Preserve selected build_mode, isolation, and user boundaries. After design is
   settled, record a new ordinary SDD task with the existing
   `superflow-state.sh set <change-dir> build_mode owner`, plus actual isolation,
   tdd_mode, and review_mode. Never pretend subagents were dispatched. `owner`
   retains TDD, independent review, and delivery gates; it does not use
   direct_override to bypass design.
4. Quick executes its approved spec, changing only its allowed status. Keep step
   checkoff, evidence, and recovery in test-report.md beside the spec; never edit
   approved steps or append content that invalidates approval. Route a
   bare task through existing admission; being an Owner does not bypass Quick
   gates or required SDD documents.

Read the entire current phase SKILL.md and its required references before acting.
Flow Owner defines continuity and cannot replace build/verify or another full phase
contract. Before implementation/review read the full [Reviewer checklist](reviewer-checklist.md)
and use its readable bundle for actual dispatch and rereview.

## Continuous Execution Loop

```text
Read contract/progress -> select dependency-ready work -> implement and verify
       ^                                                     |
       +---- valid findings: repair and retest <- independent review
                                                             |
                                    gates and remaining-item reconciliation -> delivery
```

- Cover the entire authorized scope. Check off a task only after its required
  signals pass; failed validation remains incomplete. Recompute actual
  dependencies. Never skip blockers or relabel unfinished local code as external.
- Diagnose and repair test failures, configuration errors, understood defects,
  and report-format problems within authorization, then rerun affected signals.
  Ordinary errors are not user decisions; do not ask whether to continue each batch.
- Send progress as intermediate updates and keep working. Completed checkboxes
  lead to verify, not directly to an archive suggestion.
- The Owner may implement and execute tests. Obtain isolated read-only views
  according to reviewer-checklist and honor a frozen independent-Tester
  requirement. If subagents are unavailable, record the actual gap; self-review
  cannot count as independent review.
- Dispatch only necessary contract paths, exact diff, rules, evidence, and
  acceptance goals, without the entire chat history. Reviewers do not edit,
  start applications, or operate business databases; the implementer supplies
  missing runtime evidence. Delegated development has explicit file ownership,
  dependencies, and acceptance; parallelize only independent, nonconflicting work.
- Verify, falsify, and merge all feedback. Automatically repair valid issues
  within contract, rerun invalidated evidence, and review fixes and their impact.
  Record self-review separately; changing role names is not context isolation.
- For implementation defects, transition `verify-fail` and return to build.
  Contract changes return to documents, refreshed handoff, review, and Coding
  Ready. Changed confirmed business choices still require a user decision.
- Retain valid successful evidence. Formatting repairs do not restart unrelated
  environments; source, SQL, configuration, or entry changes rerun affected paths
  under test-guide and the frozen contract. Preserve original failures.

## Continuity and Stop Boundaries

Authorization persists across phases and context compaction. Before context gets
tight, save a compact `## Owner Recovery` section in the existing test-report
(Quick uses test-report.md beside its spec):

| Item | Content |
|---|---|
| Scope | Objective, confirmed authorization, exclusions, phase/build_mode, contract paths |
| Progress | Current task, unfinished dependencies, next concrete action |
| Evidence | Source/build version, valid commands/report paths, failing commands/raw output |
| Review | All open finding IDs, evidence, repair/acceptance checks, reviewer report paths |
| Resources | Owned PID/start identity, purpose, ports, temporary data, cleanup obligations |

After compaction, reload the checkpoint and original contracts and continue the
unfinished action. Compaction does not end the delivery turn. If the host truly
exits or tools become unavailable, preserve recovery and report interruption;
ordinary sessions cannot autonomously wake or continue in the background.

Stop dependent work only for user pause/scope reduction, an explicit
auto_transition:false phase boundary, a required direction decision, unavailable
permissions/required environment, or stalled repair. Finish independent
authorized work while external conditions are blocked; missing frozen mandatory
evidence remains Blocked/Partially verified.

Record each round's open and closed issues in the existing report. If two
consecutive repair transitions close no old blocker, or the existing three
verify-fail limit is reached, summarize attempts, evidence, and the needed
decision. Do not loop indefinitely, rename finding IDs, or accept unauthorized
deviations. Ordinary valid fixes need no new permission per finding.

## Delivery

Reconcile objective, tasks, diff, required evidence, findings, deliverables, and
cleanup. SDD runs all existing verify lint/guards; Quick checks its approved
spec. PASS prose, JSON, and checkboxes cannot replace execution and semantic
review. Diagnose failed gates; do not weaken gates or remove assertions to close.

Final delivery includes objective/changes; commands, exit codes, counts, and
evidence paths; independent review and repair; local/real-environment/browser/
release coverage and remaining items; resource, branch, and archive status.
Claim full delivery only when all mandatory items hold. Git commit, push,
release, and archive still require their own authorization. Honor authorization
already given without asking again. Never commit or rewrite Git history merely
to save progress.

For observed-delivery.v1 complete delivery, use a `| Report |` table under
`## Independent Review` in existing test-report.md to link actual independent
reports. Reference current DONE rereviews with reviewed source versions bound by
`## Reviewed Sources` and `| Path | SHA-256 |`. Preserve historical reports; after
source changes the Reviewer actually reads/rereviews and emits a new table.
The Owner cannot rebind an old report's hashes to current code.

### Delivery facts matrix

Record this matrix in the existing test-report and final delivery. Checked tasks,
verify_result, and phase=archive describe process facts, not achievement of the
user goal. Check independent conclusions against reviewer-checklist identity,
dispatch, diff, finding, and rereview records; never relabel self-review independent.

| Fact | Required account |
|---|---|
| User goal | Desired outcome, authorized scope, acceptance goal |
| Current implementation | Entries/call paths actually covered by current source and missing implementation |
| Mock / real | Actual counts and scope for mocks, real backend/database, browser, external devices/services; explicitly list unrun coverage |
| Open items | Open findings, missing proof, changes without rerun/rereview and impact; blockers remain PARTIAL/Blocked |
| External coordination | Other repository/frontend/deployment/permission owner, status, completion criteria; do not relabel unfinished local work external |
| Re-review evidence | Original findings with FIXED/MITIGATED/DEFERRED/NOT_A_DEFECT dispositions, residual risk, retests and actual isolated Reviewer rechecks; explicitly state missing rereview |
| Control actions | Separately count sleep/wake, pause/continue and restart controls with evidence; list business guidance and permission/budget approvals separately; unknown is not zero |

Substitute entries and simulations support only their actual scope. Distinguish
local implementation from end-to-end usability when external coordination is
pending; archive or strong PASS cannot hide gaps. Explicit native managed work
inherits native Host capabilities and project contracts; this document adds no
SDD documents, mandatory team, or business test strategy to that profile.
