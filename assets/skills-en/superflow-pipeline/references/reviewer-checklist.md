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
diff and expand to related callers only for named risks, recording why. Bundle /
source / contract drift yields NEEDS_CONTEXT rather than reviewing old context
against current code. Reviewers are read-only: no source edits, application
management, business DB operations, or nested supervision. New runtime evidence
returns to the implementer.

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

### Reviewer report shape

Reuse the four-state report, not another machine protocol. Managed reviews keep
these records in temporary reports and project the result into existing Host
review JSON summary/findings/coverage. `--report` checks existing markers and
anchors only; the main Agent verifies axes, actual impact, and conclusions. Keep
historical reports without axis records, but do not call them complete under this
guide.

```markdown
DONE
## Impact
Path hint / actual depth / source evidence / adjustment / diff and contract version
## Axes
Axis | CHECKED / NOT_APPLICABLE / BLOCKED | File scope and evidence
# Fill security / performance / correctness / maintainability / architecture
## Findings
- src/example.ts:12: [axis][severity] cause, consequence, proof, repair and acceptance
# Use None without findings; never a placeholder bullet
## Concerns
Unresolved questions and missing proof; required for DONE_WITH_CONCERNS
```

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
