# Reviewer Checklist

## Five-axis review and isolated context (canonical entry)

Use for ordinary code review, Quick verification, full SDD, and managed Host
review. Inputs are current changes, confirmed contracts, applicable path rules,
and raw evidence. Outputs reuse reviewer reports or existing Host review JSON.
This checklist owns axes, depth, isolation, and finding verification;
superflow-verify routes execution. Check requirement/design conformity against
existing contracts without creating another requirements-review entry. Scripts
check paths, state markers, and anchors, not review sufficiency. The main Agent /
Host owns actual risk and the final verdict.


### Goal, contract and evidence

Reviewers first read original requirements and the exact diff, then independently trace real callers,
SQL/projection and write consumers to derive affected scope and falsifying counterexamples. Only then
compare the author's inventory. Reverse-check unchanged callers, direct batch writes,
shared methods and state consumers by risk; an entry inventory cannot prove completeness.
Answer separately:
1. Does implementation meet the current frozen contract? Route code defects to build.
2. Do contract and implementation meet the original goal? Route omissions/opposite prose to
   the current Flow Owner's canonical responsibility, then rereview repairs.
3. Do observations prove behavior and counterexamples? Return evidence gaps for real validation.

For major risks, propose a falsifying wrong implementation, trace its real trigger and business
consequence, and identify the failing Case, assertion and measurement source. Missing assertions
are gaps. FIXED requires changed wrong behavior, retesting and actual rereview. Logging alone
closes observability findings; functional errors remain open. Contract wording, extra logs and
constant assertions cannot close risks to the original goal. Findings require verifiable triggers
and actual consequences, never quotas for axes or counts. Wording, format and advice cannot
obscure material bad writes, ineffective controls or unavailability.

### Test-plan sufficiency

Follow [Owner-led planning](test-guide.md#owner-led-test-planning): independently derive major
failure modes from original goals, actual diffs and real callers, then challenge whether selected
cases would fail them. Inspect registration/wiring and annotation ownership, single/batch/internal
async paths, and content versus status writes in source, beyond changed methods or the author's
entry inventory. Check necessary real wiring/HTTP smoke and business assertions against actual
risk; pure functions retain lightweight seam checks. Trace every response/state/forbiddenEffects
actual to its real response, query or observation and confirm the current production binding.
Successful capture, CHECKED and green tests do not establish sufficient assertions. Inspect
selection/omission reasons, discoveries and strengthened evidence rather than only old-case
counts. Owner supplements/executes within the same goal without routine approval stalls;
business choices or required environment/permission remain separate. Preserve existing risk-tier
independence duties without another mandatory Test Agent.

### Axis coverage

| Axis | Focus | Minimum evidence |
|---|---|---|
| security | Authentication/authorization, injection, sensitive information, external input | Actual entry, parameter binding, permission call path |
| performance | Query scope/N+1, scale, CPU/memory/I/O, resource limits | Execution path and scale; benchmarks only when risk warrants |
| correctness | Boundaries, recovery, state, transactions, concurrency, idempotence | Real call/write path, assertions, failure paths |
| maintainability | Duplication, naming, complexity, exception handling, test seams | Existing reuse points, source, test boundaries |
| architecture | Module ownership, call direction, contract compatibility, abstraction | Callers/consumers and ownership evidence |

Record CHECKED / NOT_APPLICABLE / BLOCKED and source/evidence per axis. CHECKED
means examined, not defect-free. One reviewer may cover all axes; do not require
five agents. Specialists cover assigned axes; the main Agent merges coverage and
fills gaps. Unassigned/unread is not inapplicable. Full SDD real acceptance remains.

### Select depth from actual impact

`superflow review-coverage` emits `risk.basis=path-hint` and
`risk.requiresSemanticAssessment=true`. The main Agent reads changes, actual
callers, and write/consumer paths, recording hint tier, actual tier, source
anchors, and adjustment reasons. Names, line counts, and implementer claims do
not determine risk. Unknown risk gets at least medium investigation; inability
to judge means NEEDS_CONTEXT.

| Actual impact | Depth |
|---|---|
| Small scope with verified absence of contract/write/concurrency/security/cross-module effects | Low, inline allowed; still cover applicable axes |
| Other changes with known scope | Medium, one isolated independent reviewer |
| Evidenced public-contract break, migration/data consistency, locks/shared state, security boundary, or cross-module impact | High, independent review plus focused views for named risks; fan out only for independent risk clusters when the Host supports it |

Example: a parameterized SELECT filter with unchanged contract/schema/write path
and checked consumers can move from Mapper path hint high to actual medium. An
ordinary file adding atomic claims/shared-state writes moves from path hint low to
actual high. Confirm against current source rather than applying example labels.
High does not prescribe agent counts, model names, or providers; use native Host
configuration. Record user depth overrides without removing required scope,
contract obligations, or known risks.

### Isolated bundle and dispatch

The main Agent prepares this bundle in a temporary directory and uses native
subagents without implementation chat history (`fork_turns=none` when supported).
If unavailable, prepare the same bundle for an independent reviewer and report
that independent review has not run. Self-review cannot be relabeled independent
or counted as complete independent coverage.

1. Confirmed goal, scope, exclusions, actual contract paths, review questions;
   label implementer claims unverified.
2. Baseline/head or worktree state, exact diff, file inventory, related bundles;
   diff statistics alone are insufficient.
3. Applicable path rules, relevant source/caller/consumer paths, necessary
   environment and raw test evidence paths.
4. Actual risk assessment, assigned axes/files, this checklist, four-state and
   anchored report requirements.

Include only necessary text/paths, not entire repositories, personal rule
folders, credentials, or chat history. Respect task read permissions. Start from
the original goal and exact diff, trace real callers and SQL/projection consumers for named risks, and record why. Bundle /
source / contract drift yields NEEDS_CONTEXT rather than reviewing old context
against current code. Reviewers are read-only: no source edits, application
management, business DB operations, or nested supervision. New runtime evidence
returns to the implementer.

Keep orchestration neutral: do not preselect verdicts, cap severity, or ask reviewers to ignore a class of issues. Report spec-mandated defects with their source and assess them against the original goal; “the design requires it” is not an automatic exemption. State missing evidence for the Owner to investigate. Prepared inputs or axis counts do not prove discovery depth.

### Review preparation

Reuse the existing CLI rather than committing the workspace or hand-building diff/hashes:

```bash
superflow review-coverage --prepare <new-package-directory> --json
# Add --base <ref> for a branch baseline; --path <project-relative-files...> selects context.
```

Capture baseline-to-working-tree committed/staged/unstaged changes and all untracked files,
including tests. The result contains a diff, both snapshots, source-manifest and a NEEDS_CONTEXT
report template. Use a new directory each round; never overwrite old returns. This is input only.
The Owner checks the original goal, contracts and risk-related unchanged callers before dispatch.
Have the reviewer independently enumerate failure paths before the author's coverage matrix.
An omitted inventory entry is not out of scope; old writes do not excuse new side effects.
The template is not reviewed-source evidence. The reviewer actually reads inputs, records actual
scope and dispatch/return identity, then decides; missing input remains NEEDS_CONTEXT. Without a
Git baseline, use the existing snapshot-comparison path below, never fake HEAD or commit early.

Actual dispatch must reference `dispatch-instructions.md` and the returned absolute `reportTemplate`
path. Use that same canonical template, including five axes, valid finding shape, identity and concern
rules; do not dispatch only a diff and have the Owner invent another format. `source-manifest.md`
explicitly exposes unselected dirty files. Never silently filter configuration/temporary files or
assume prior-session assets belong to this task; the Owner judges ownership, exclusions and isolation.
The input inventory/hashes are not actual reading; record actual scope/expansion in Impact independently.

For existing findings reuse the same preparation owner instead of guessing headings, enums or hashes:

```bash
# Original/response paths are project-root relative; use a new output directory each time.
superflow review-coverage --prepare <response-package> --original-review .sdd/reviews/original.md --json
# Save an actual separate Owner response and perform affected verification, then prepare rereview.
superflow review-coverage --prepare <recheck-package> --original-review .sdd/reviews/original.md --owner-response .sdd/reviews/owner-response.md --json
```

The first step prepares only an Owner response template and original identity/stable-ID inventory,
not a Reviewer return.
A complete BLOCKED/NEEDS_CONTEXT original with actual identity, sources, findings and explicit concerns
can also prepare a response or missing context. Preparation never promotes its state or means review
completion; templates with missing fields or no findings are not actual originals. The second reads complete original and actual response through the same auditor,
checking paths, identity, exact original IDs and allowed dispositions. Read-only original snapshots remain
verbatim; generated Review Chain hashes and Finding Rechecks rows use actual inputs. Source may evolve
normally while original historical source hashes remain unchanged. Later input drift invalidates an
already bound chain. All templates remain NEEDS_CONTEXT with no preset fixed/resolved/None or claims of
actual reading/review. Allowed dispositions are fixed/mitigated/deferred/dismissed; recheck results are
resolved/dismissed. Actual Reviewer judgments can resolve/dismiss with new evidence; never mechanically
convert deferrals/mitigations or erase concerns to promote completion. Preserve new findings and concerns.
Reject escaped/missing/incomplete originals and missing/extra response IDs; retain originals rather than
rewriting verdicts for formatting. Dispatch confirmed original goal/contract paths, raw evidence and the
canonical template without implementation chat history or author business conclusions. Investigate actual
callers, SQL/projection consumers and failure counterexamples before comparing the author's matrix.

Audit the first actual return with existing `review-coverage --report <file> --json` immediately.
The reviewer completes valid output before its first reference; thereafter keep the original
immutable and append a new actual return. Dispositions/Rechecks cover precisely original finding
IDs; record concerns/new rereview findings separately and actually handle them. Do not put them in
the original ID set, rewrite old reports or use placeholder hashes. Separate style suggestions
from functional blockers. Do not alter verified source just to tick the final checklist; actual
code changes still require current build/tests and real independent rereview.

### Directly readable review bundle

Before dispatch the Owner actually writes and opens the artifacts below, allowing
review with Read alone. The dispatch message provides actual absolute paths:

| Artifact | Contents |
|---|---|
| diff.patch | Exact baseline→current unified diff including additions, deletions and untracked files; not stat or a command to execute later |
| source-manifest | Repository-relative path, baseline/current versions and SHA-256, readable snapshots; explicitly mark an absent side |
| Existing contracts/evidence | Canonical paths and versions, applicable rules, raw evidence and necessary caller snapshots |

The Owner exports the patch from Git or compares frozen snapshots without Git.
Exclude unrelated repositories and secrets. The Reviewer starts with diff.patch
and source-manifest, then reads both sides and necessary call paths. Bash is not
required. Missing/unreadable artifacts or current-source drift mean NEEDS_CONTEXT;
the Owner supplies a valid bundle before review resumes.

### Observable independence and repair records

Medium/high review counts as independent only after an actual isolated Reviewer
is dispatched and returns. Owner self-checks, role-play, and prepared bundles are
not executed independent review. Record these facts in existing reviewer reports
and test-report; add no persistent state, review_mode values, or JSON protocol fields:

| Record | Required facts |
|---|---|
| Reviewer identity | Actual reviewer identity/session ID and read-only role; separate self-review |
| Dispatch evidence | Actual dispatch tool/call reference, isolation, returned report path; explicitly state not run when absent |
| Reviewed diff | Baseline/head or worktree snapshot, exact diff/file scope, contract version |
| Finding closure | Original finding ID, accepted/rejected/needs-evidence with reasons, repair location, rerun proof, Reviewer recheck verdict |
| Re-review evidence | Original or new isolated Reviewer identity, actual dispatch/return, repair version and finding/regression verdict |
| Post-review changes | New diff after review, impact, invalidated tests/verdicts, actual reruns and rereview reports |

For source, SQL, configuration, or entry changes after review, the Owner assesses
impact, actually reruns affected frozen signals, and returns repair diffs and
related call paths to an isolated Reviewer. Retain still-valid evidence; old PASS
cannot cover new changes, and closing one finding cannot conceal regressions in
previous behavior. Missing rereview or open blockers remain PARTIAL/Blocked;
closing old IDs or phase=archive cannot establish full delivery. If subagents are
unavailable, complete independent authorized implementation, tests, reports, and
cleanup, recording the capability gap and pending independent-review bundle.

### Finding disposition and closure

Under existing Finding closure separate validity from actual disposition; keep IDs:

| Disposition | Evidence |
|---|---|
| FIXED | Original error path changed, affected checks passed and Re-review evidence exists |
| MITIGATED | Probability/impact reduced or observability added; retain original defect, residual risk and follow-up conditions |
| DEFERRED | Explicit authorization to accept deferral, reason, owner and completion conditions; never claim repair |
| NOT_A_DEFECT | Current source/contract counterevidence and independent Reviewer verification |

Logs, alerts or explanatory text cannot make remaining bad writes, exceptions or
state loss FIXED. accepted/rejected/needs-evidence judges validity, not disposition.
Return original findings, repair diff, affected evidence and residual risk to the
original Reviewer; if unavailable use a new isolated context. Missing actual
rereview is not closure; blockers without authorized deferral remain Blocked.

### Main Agent verification and merge

Read all reports, coverage, findings, and concerns. Re-read each file:line, callers,
frozen contracts, and corresponding raw test evidence; attempt to disprove claims
with actual source. Green tests alone neither accept nor reject a finding.
Deduplicate by root cause + affected path + business consequence, keeping reviewer
provenance and full impact. Do not merge solely by line number, wording, or
severity. Resolve conflicting judgments from evidence, not majority vote.

Record accepted / rejected / needs-evidence with reasons. Unsupported claims remain
unconfirmed rather than receiving invented severity. Severity follows actual
impact; separate advice from blocking defects. Do not force generic abstractions
without another caller or contract requirement. Once every axis and included file
has coverage, submit all material findings together. Managed work retains existing
finding IDs / acceptanceContractRefs, protocols, budgets, and state owners.
Subagent reports do not directly promote pass; format checks do not prove code
correctness. Rerun only invalidated or contract-required evidence.


### Operation chains, valid empty responses, and evidence boundaries

Use [test-guide.md](test-guide.md) to check complete user operation chains, not
just endpoint success. For deleted entries, reverse-trace unique state writes and
remaining consumers. Check consumption of valid empty/blank/placeholder responses,
cache/retry boundaries, and regression coverage of real anomalies. Nonempty
placeholder blacklists require contract evidence, never implementer guesses. Verify that
restart scripts preserve verified overrides and dependencies. Separate simulated,
real backend/device, and browser conclusions; reconcile counts, versions, and
blockers per set. Keywords or HTTP 200 cannot prove success. These are Host
semantic checks; existing scripts validate deterministic evidence facts only.

### Reviewer report shape

Use the existing four-state Markdown and one canonical auditor. Current reports
require Review Identity, one Findings section, explicit Concerns and Reviewed
Sources. Reviewer identity and Dispatch evidence reference actual isolated calls
and returns. Free-text references/hashes establish record identity, not genuine
independence, actual reading or resistance to malicious local rewriting. Reviewer
produces its verdict and input identity; Owner retains the original and writes a separate response,
never editing DONE/None, Reviewed Sources or other original conclusions to satisfy format checks.

### Independent source-claim rechecks

Follow [source investigation](document-review-coverage.md) through all write/SQL
consumers, real payloads, single/batch and internal/async re-save routes,
transaction proxies, content/status and side effects. Registered anchors do not
prove entry completeness. For version/snapshot paths, trace load, continued saving after success,
auxiliary refresh and internal re-save: content/token share one coherent source, content writes
and bumps remain consistent, and commit points are real. Use [test-guide](test-guide.md) to check
controlled interleaving, failure after writes and external side effects; serial version changes
or mock call counts cannot substitute. Project prose owns transaction/refresh policy; this
checklist does not invent business designs. Use [traceability](traceability-matrix.md) for original
requirements and Task/Entry/Case IDs; add discovered entries to the same coverage.
The source-manifest binds current input identity, not complete understanding.
Record Reviewed diff, baseline/current, actual inspection and expansion in Impact;
never shrink frozen production/build inputs to pass.

```markdown
DONE_WITH_CONCERNS
## Review Identity
| Field | Value |
|---|---|
| Role | independent-reviewer |
| Dispatch | session:actual-invocation:dispatch |
| Return | session:actual-invocation:return |
## Reviewed Sources
| Path | SHA-256 |
|---|---|
| src/example.ts | Actual current SHA-256 |
## Impact
Reviewed diff: baseline/current, actual reading scope and reasons
## Axes
Each axis: CHECKED/NOT_APPLICABLE/BLOCKED and evidence
## Findings
- [F-001] src/example.ts:12 [correctness][HIGH] Cause, consequence, evidence, repair and acceptance
## Concerns
F-001 remains open; retain missing evidence and risk.
```

Only independent-reviewer qualifies as final independent review; owner cannot
substitute. Dispatch/Return are locatable actual invocation/return references
(for example session:... or a report path#event). Actual re-review requires a new
Return, never any ancestor's return. Missing capability remains a gap, not an
invented identity. Incomplete reports remain diagnosable but cannot become complete delivery.

### Finding closure

1. Retain original reports/states in existing .sdd/reviews with stable finding IDs;
   never overwrite referenced originals.
2. Owner responds separately using `| ID | Disposition | Evidence |`: fixed,
   mitigated, deferred or dismissed with concrete evidence. Responses are not
   independent confirmation. Keep repair location, actual commands/exit codes and
   user authorization separately locatable.
3. After affected verification an actual isolated Reviewer reads original, Owner
   response, current diff and regressions, then creates a new report. Review Chain
   links original/owner-response by path/file SHA-256. Finding Rechecks gives
   resolved or dismissed and evidence for every original ID; no omissions or ID changes.
4. MITIGATED/DEFERRED do not finish incomplete goals/required checks. NOT_A_DEFECT
   needs Reviewer verification; FIXED needs actual repair and tests. accepted is
   not a repair result. Retain PARTIAL rather than rewriting concerns to None.
5. Current reports bind current source; originals retain historical input/file
   identity, never rebind old hashes. Initially clean independent reports require
   no invented repair chain. All historical returns remain distinct.

Owner response example:

```markdown
## Finding Dispositions
| ID | Disposition | Evidence |
|---|---|---|
| F-001 | fixed | test-report.md#actual-repair-and-output |
```

### Final re-review example

Use this shape only after actual Reviewer confirmation; replace every placeholder
with real data. Review Chain/Finding Rechecks carry Re-review evidence. Record
Post-review changes in Impact and determine affected verification.

```markdown
DONE
## Review Identity
| Field | Value |
|---|---|
| Role | independent-reviewer |
| Dispatch | session:actual-rereview:dispatch |
| Return | session:actual-rereview:return |
## Review Chain
| Role | Path | SHA-256 |
|---|---|---|
| original | .sdd/reviews/review-round-1.md | Actual original file SHA-256 |
| owner-response | .sdd/reviews/owner-response-1.md | Actual response file SHA-256 |
## Finding Rechecks
| ID | Result | Evidence |
|---|---|---|
| F-001 | resolved | Current source anchors and actual repair/regression evidence |
## Reviewed Sources
| Path | SHA-256 |
|---|---|
| src/example.ts | Actual current source SHA-256 |
## Findings
None
## Concerns
None
```

Review Chain and Reviewed Sources paths are project-root relative. File hashes
protect reference identity, not actual dispatch or understanding. Owner cannot
clear original concerns/findings for formatting or bulk-copy build hashes to claim
Reviewer verification. The auditor checks shape, identity and per-ID relationships;
Host still judges sufficiency.

Existing specialist checks remain path-scoped; inapplicable checks do not invent
runtime obligations or remove frozen requirements. They detail axes without
owning risk, dispatch, or final conclusions.

## Data Scale And Processing Cost

- For data-intensive paths, are current/expected data scale and growth
  boundaries explicit?
- Is per-request/job work and primary CPU, memory, I/O, or round-trip cost
  assessed, with alternatives and risk-proportionate validation evidence?
- If not applicable, is the lack of meaningful data-volume sensitivity
  explained? Do not block simple work solely because a performance benchmark is
  absent.

- Does the implementation match api.md, design.md, and tests.md?
- Are all required files present and cross-linked?
- Is the frozen handoff hash current in its canonical state file? Do not duplicate raw hashes in report bodies.
- Did Superpowers technical design cover source-level HOW?
- Were field/status and architecture-boundary risks checked?
- For monetary changes, were calculation and settlement states separated, were
  scale and rounding mode explicit, and was early rounding rejected?
- Do half-cent, residual, and multi-detail tests prove deterministic allocation
  and reconciliation of original, discount, actual/refund, and allocated totals?
- For additive identities, is the authoritative total explicit, with only N-1
  components calculated independently and the final complement derived as
  `authoritative total - sum(other components)`?
- Reject designs that calculate and round every component independently before
  rebuilding an authoritative total.
- Are exact decimal construction, currency and provider minor units, rounding
  level/policy source, and persistence precision explicit?
- Does allocation use a declared residual strategy and stable tie-breaker, with
  positive, zero, negative/refund, tied-remainder, and idempotence evidence?
- For FX, are base/quote, source/time, canonical path, and target settlement
  rounding explicit, without early rate rounding or synthesized inverses?
- Are SQL changes reviewed and tied to total version SQL when needed?
- Are RED/GREEN evidence and real-entry evidence present?
- For L3/L4 negative controls, does the raw malformed or forbidden payload reach
  the intended parser/validation branch, rather than merely returning the same
  status code?
- For task-owned resource cleanup, are every frozen identity field (nonce, PID,
  port, signature, etc.) compared and mismatch refusal proven? An unchanged
  certified helper needs integrity, task parameters, one failure cleanup, and
  final zero residue only.
- Are mock-only results clearly labeled?
- Did workers stay inside allowed file boundaries?
- Did hooks and guard scripts pass?

Use spaces and explicit closure for report container fences. Tab-delimited list/quote fences currently fail structural verification: normalize report formatting without using an earlier DONE/PASS to bypass it. Preserve tabs in original execution logs; do not rewrite evidence for formatting.
