# Test Execution Template

Before first verification actually read the full [test-guide.md](test-guide.md).
For SDD build/case verification prepare plans through [Runner-Captured Execution](test-guide.md#runner-captured-execution)
and call the installed `superflow-test-report-lint.py --record-execution`. The script
generates build/Case receipts, fingerprints and redacted stdout/stderr. Link those
artifacts without hand-filling capture fields. Historical evidence keeps its level;
missing provenance remains PARTIAL.

Inherit commands, toolchains, runtime versions, startup/login/readiness/stop entries,
environment, ports and assertions from current tests.md / the approved Quick Spec.
Existing project scripts/tests are the execution entry; this template supplies no
fixed cross-project command. Missing mandatory environments remain BLOCKED/PARTIAL
while other authorized work continues. Local containers/mocks cannot replace an
explicitly required shared environment; future release environments do not
automatically become development-delivery gates.

Strengthen the existing plan through [Owner-led planning](test-guide.md#owner-led-test-planning),
briefly recording reasons, added branches and changed proof. Distinguish within-Case
parameters from new Cases/frozen contexts through the original contract. Low-risk
reports keep a few applicable sections; specialized proof follows frozen Cases
without an unrelated inapplicability checklist.
Quick records approved-Spec steps and observations without adding R/E/C indexes or SDD receipts to fit this template.

## One current record

Keep one current verdict, one current Case table and one set of current independent
review/re-review references. Update the current recovery point as work proceeds;
place older points, results and Case tables under explicit `## History`, or link
existing historical files. Start the current record at a heading of the same level
after History. Append new disposition/re-review files; preserve the original Reviewer
report's state, finding IDs, file hash and conclusion.

For full SDD fill every R/E/C from document-review.json through existing
[coverage/receipts](document-review-coverage.md). The Case table is the only current
result ledger; link detailed output as evidence. Separate contract Cases, parameter
branches, test methods and repeated executions in counts.

## Report shape

These are sections/fields of the existing report; fill the applicable scope:

```markdown
# Test Execution Report

## History

- Earlier results/recovery points: <relative links to existing evidence/reports>
- Original review and disposition: <original report, Owner response and actual re-review links>

## Current verification

### Environment and execution

| Item | Observed information and source |
|---|---|
| Verification time | <current run> |
| Workspace and source | <branch/commit and source identity reference> |
| Build/runtime target | <captured build receipt; actual target when applicable> |
| Toolchain and environment | <tests.md tools/versions/non-secret configuration sources> |
| Execution entry | <tests.md command and relative cwd; build/Case plan links> |
| Raw output | <current stdout/stderr, native test reports and receipt links> |

### Current Case results

| Case ID | Entry ID | Acceptance level | Result | Evidence path |
|---|---|---|---|---|
| <C-ID> | <E-ID> | <frozen level> | <PASS/FAIL/BLOCKED/PARTIAL> | <current receipt path> |

### Verification scope and open items

- Goal and actual implementation: <goal, observed entry/call path and version reconciliation>
- Test selection and strengthening: <reasons, added branches and affected proof>
- Actual counts: <separate unit/API or backend integration/backend flows/browser sets with passed/failed/skipped/blocked>
- Open items: <failed/blocked Cases and findings, cause, impact, disposition and needed coordination; state none when true>
- External coordination and control: <unfinished integration; actual Git/release authorization and actions>

## Owner Recovery

<Current remaining tasks, valid evidence, owned resource identity and next action; state completion when true>

## Independent Review

| Report |
|---|
| .sdd/reviews/current-code-review.md |

## Current conclusion

Verification Result: PASS / FAIL / BLOCKED / PARTIALLY_VERIFIED
Archive Readiness: PASS / BLOCKED
```

Current Case results use only PASS/FAIL/BLOCKED/PARTIAL; explain non-PASS in open
items. Reconcile the current verdict with Cases, receipts, tasks and re-review.
Full delivery runs the installed lint with `--require-complete`. For verify_mode:
full also record environment, branch/commit/build or image, Base URL and verification
time. Bilingual result markers must agree. Archive readiness grants no archive,
Git or publication authority.

Use the [Reviewer checklist](reviewer-checklist.md#finding-closure)'s existing four
review states. The table references current actual returns; the new re-review's
Review Chain links originals and Owner responses, recording each finding recheck.
Changed source requires affected retesting and actual re-review. Missing mandatory
independence, checks or re-review remains PARTIAL.

## Detailed proof by applicable Case

Keep the following in Case evidence or linked reports, without a second current
Case result table.

### RED/GREEN and observed assertions

Applicable RED occurs before production edits; record command, actual failure
output and expected business assertion. Environment, compilation, credential or
test-code failures are not correct RED. GREEN uses the same command and business
expectation. Response/state/forbidden effects come from this run's observations;
native test output owns executed, failed and skipped counts. Strengthen gaps via
test-guide without deleting or lowering assertions to turn failure into success.

### Real entries, databases and user operation chains

Inherit real parameters/sources, authentication entry, request/role/scenario and
assertions from tests.md. Retain redacted requests, responses, database queries and
before/after values plus correlated logs. Preserve frozen schema checks, migration
SQL execution/rechecks and all consumer Entity/Mapper/SQL comparisons for shared
tables. Missing columns remain blocked; adding obsolete columns to a test database
cannot bypass the contract. Money/device/third-party/callback Cases follow their
real-entry contracts.

When every endpoint is required, exercise the tests.md endpoint/role/scenario matrix
using one healthy application instance and test accounts. Record restarts required
by code/configuration/health and verify current build/configuration identity. Reuse
existing startup/readiness/log-assertion/stop scripts; clean only verified task-owned
resources and record zero residue.

Mocks, test Controllers and authentication bypasses support isolated/test-endpoint
conclusions only. HTTP 200, nonempty fields, DB-only output, compilation, skipped
tests or static frontend configuration alone cannot prove real business success.
Real frontend/external payloads, responses, logs and DB closure support their actual
scope. Label API/backend integration separately from browser E2E. Display fields
need same-ID non-null API/DB comparisons, historical NULL separately and actual
browser evidence. Missing real parameters/credentials/configuration/devices leave
required Cases BLOCKED/PARTIAL; label simulations with their actual boundary.

### Money Precision Boundary

Money Cases inherit the frozen contract and record identities/authoritative totals,
independent components, final complement/formula, currency/minor unit, calculation
sources, intermediate precision, pre/post-round values, final rounding boundary/mode,
allocation strategy and residual recipient. Verify original/discount/actual or refund/
allocated totals reconcile, no early rounding, positive/zero/negative or refund,
half-cent/residual/multiple details, tied remainders and idempotent recalculation.
When the total is authoritative, derive the final component as total minus the other
components; independent calculation/rounding does not prove that contract. FX adds
base/quote, rate source and target-settlement rounding. Two-decimal display alone
does not prove correct precision.

## Before completion

Check actual evidence for every tests.md mandatory signal and quality gate; mark
tasks only when their signals hold. Independent Tester/Leader duties apply when the
selected mode already requires them, using raw proof and rerunning affected or
contract-required paths. Owner continues other authorized work; Reviewers stay
read-only. Inherited valid evidence keeps its explicit version/scope; source, entry
or context changes require affected new proof. Old PASS does not cover new impact.
