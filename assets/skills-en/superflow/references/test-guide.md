# Test Selection and Verification Loop

## Owner-led test planning

Flow Owner designs and evolves verification from confirmed goals, current source/diff,
actual callers and project baselines. Owner and independent Reviewers judge scope,
layers, assertions and sufficiency; scripts verify execution, references, identity
and state facts. Filenames, line counts, test counts and keywords are investigation
hints, not automatic full-suite/database/HTTP/browser obligations. Explicit user/project
mandatory baselines remain binding; unavailable environments are not inapplicability.

Before coding, record behavior/impact, main risks, test selection/reasons, counterexamples
and assertions, reused commands/environment and uncovered scope in existing tests.md.
A few lines suffice for a small task; reuse existing case tables for complex work,
without another plan, fixed column count, level taxonomy or approval process. Quick
retains approved spec acceptance/steps; put strengthened verification decisions and
proof in its adjacent test-report, without changing approved steps/digest outside
Quick's existing confirmation boundary.

During implementation/repair the current Owner handles discoveries without asking
whether to continue for routine test additions:
- With unchanged goal, expected behavior, entry and executionContext, extend input
  branches/boundaries/regressions within a case. Rerun affected signals and update
  branch mapping, execution counts and current proof; old runs do not cover new inputs.
- New Case IDs, production entries, frozen commands/context or acceptance contracts
  require the same Owner to maintain tests/coverage/traceability, then refresh affected
  handoff/review/readiness evidence through existing paths before continuing. Never
  hand-edit hashes or receipts.
- Adding tests is not itself a business decision. Ask only for undefined semantics,
  scope/acceptance-baseline changes or unavailable permissions. Missing required
  environments remain PARTIAL/Blocked while independent authorized work continues.

Select the smallest set sufficient to falsify main plausible wrong implementations,
retaining explicit mandatory checks. Before delivery, Reviewers challenge original
objectives against actual diffs: would omitted writes, wrong branches or ineffective
transactions still pass, and which assertion is missing? Owner strengthens, executes
and returns evidence for review. Real API/DB calls normally prove interface/backend
integration; backend end-to-end flows declare boundaries and real/simulated dependencies.
For user-interface flows, browser actions support that user end-to-end conclusion;
HTTP/DB success alone does not.

Apply existing review_mode, actual risk and independence requirements; retain low-risk inline paths without adding fixed testing roles or Agent counts.

## First verification action

Before executing verification, read this section and Runner-Captured Execution in full,
then the frozen commands in tests.md; reuse project tests/acceptance wrappers first.
The existing `superflow-test-report-lint.py --record-execution` owns capture. Run one
minimal build plan and Case plan to establish paths before extending. Do not infer
receipt/capture/event/hash fields or edit generated records; use declared/base/resolved
path diagnostics to repair inputs.

Resolve the script from the same Superflow installation as this guide: from
`<scope>/.codex/skills/superflow/`, ascend to `.codex` and use
`hooks/superflow-test-report-lint.py`; Claude uses `.claude/scripts/`. Scope is the
selected project or user directory. Never mix installations or scan personal directories.
Missing capture scripts require installation repair, not another capture implementation.
Business tests remain independent from any one delivery report.

## Source-driven regression choices

- For wiring/declaration changes, inspect adjacent annotations, field/constructor ownership
  and production creation paths. Reflection or mock injection bypasses the container.
  Owner selects existing real-wiring or affected HTTP smoke evidence when the actual risk
  requires it; fixing duplicate annotation style must not leave another dependency unwired.
  Pure functions without wiring impact do not require application startup.
- For shared write methods, inspect unchanged callers, single/batch paths, internal/async
  calls and content/state/mixed fields. Tests distinguish intended business progression
  from unrelated state updates. Looking up a missing parent ID does not prove every caller.
- For concurrency tokens/snapshots, test binding provenance through load, edit, continued
  saves after success, auxiliary refresh, retry and internal resave. Never attach a fresh
  token to stale content alone. Project api/design owns commit boundaries and content/token
  windows; tests choose controlled interleavings and failure examples without a universal
  transaction strategy.

## Runner-Captured Execution

All SDD executable cases require capture of actual build/case processes. Freeze
`executionEvidence: "runner-captured.v1"` and
`executionContext: {"argv":["node","case.js"],"cwd":".","environmentKeys":[]}`
in the existing document-review coverage case. argv is an argument array without a shell; cwd is
relative to the change directory. environmentKeys declares supported non-secret keys only. Every
PASS receipt requires actual capture. Retain old receipts only as history or PARTIAL;
missing current requirements block until completed. Full fields remain owned by the
[execution evidence contract](document-review-coverage.md) and existing receipt validation.

Place these two minimal plans at the project root:

```json
{"kind":"build","argv":["node","build.js"],"cwd":".","sources":["app.js","build.js","case.js"],"artifact":"dist/app.js","output":"evidence/build.json"}
```

```json
{"kind":"case","changeDir":".","review":"review.json","caseId":"C1","build":"evidence/build.json","output":"evidence/C1.json"}
```

Use the current Host's installed script; replace installed-script-path with its installed location:

```sh
python3 <installed-script-path>/superflow-test-report-lint.py --record-execution build-plan.json
python3 <installed-script-path>/superflow-test-report-lint.py --record-execution case-plan.json
```

Case plans require changeDir relative to the plan directory; output/review/build are also plan-relative.
Build cwd stays plan-relative; only case executionContext.cwd is changeDir-relative. Never infer
the root from review directories. Build sources/artifact are
relative to build cwd. build.sources covers relevant source, build and acceptance scripts, not
unrelated small files. Build/case outputs must share one evidence directory. The case command
comes only from frozen executionContext.

Nested example: plan at project root, change at openspec/changes/sample, frozen
executionContext.cwd is ../../.. (project root), with argv still invoking root case.js.
The review location does not determine cwd:

```json
{"kind":"case","changeDir":"openspec/changes/sample","review":"openspec/changes/sample/.sdd/reviews/document-review.json","caseId":"C1","build":"evidence/build.json","output":"evidence/C1.json"}
```

The acceptance command emits exactly one JSON measurement event matching caseId on stdout;
other diagnostic output may be retained:

```json
{"event":"superflow.measurement.v1","caseId":"C1","executed":1,"assertions":[{"id":"response","expected":"<frozen>","actual":"<observed>","result":"<comparison>"},{"id":"state","expected":"<frozen>","actual":"<observed>","result":"<comparison>"},{"id":"forbiddenEffects","expected":"<frozen>","actual":"<observed>","result":"<comparison>"}],"persistence":[],"target":{"service":"<observed>","route":"<observed>","kind":"<observed>","buildId":"<observed>","buildSha256":"<observed>","sourceFingerprint":"<observed>"}}
```

This illustrates event shape, not valid passing evidence. assertions must cover frozen assertion
IDs and include response/state/forbiddenEffects; database cases also emit applicable measured database/testLayer/mockBoundary/persistence
fields. actual comes from real responses/state/queries; target is observed from the invoked target,
not copied from expectations or placeholders. The Runner retains stdout/stderr through the canonical redactor, exit code,
before/after source fingerprints and build bindings; it never fills actual from expected. Missing
measurements, nonzero exits or source drift remain PARTIAL. Redacted logs are not raw secret bytes;
retain *.stdout.log / *.stderr.log / *.capture.json / *.events.jsonl in the same directory. Capture generates build IDs/fingerprints, not Agent-authored values.
Locally writable files support auditable consistency, not resistance to malicious rewriting. The
Host still independently judges real entries, coverage and business correctness. Capture success
cannot replace tests.md or promote helper units into production acceptance.


When one class run covers multiple Cases, record actual method/assertion mappings and separate
execution count from independent coverage. Rerunning a whole class does not create new case
coverage. Nonzero exits cannot become green through old XML/results; verify current output
freshness. Reuse evidence only with current diff, entry and dependency applicability, rerunning
affected layers. actual must be observed; constant true, copying expected into actual or unchanged
COUNT cannot prove unobserved fields or old rounds unchanged. Sensitive raw evidence may remain
outside the repository: provide authorized successors accessible locations and hashes, without
requiring large Git bundles or giving only inaccessible personal paths.

## Production Entry State Assertions

Freeze these case contracts in tests.md; source HOW links entry boundaries by Case ID. Reports
record raw results without changing expectations. Fill applicable production paths only; pure
functions do not acquire invented HTTP/database obligations.

| Case ID / Decision ID | Real production entry/call chain | Before state | Input snapshot/revision | Action/failure injection | After state | Concurrency/rollback | Response/external effect assertions | Evidence location |
|---|---|---|---|---|---|---|---|---|
| <C/D-ID> | <E-ID + production binding> | <complete relevant same-business-ID values> | <load-time binding> | <actual steps> | <expected changes or strict invariance> | <applicable risk/evidence> | <exact outcome/count> | <existing receipts/logs> |

Prove content, state and mixed-entry changes separately. No additional rows under an idempotent
repeat does not prove the required state transition. For concurrency freeze controlled interleaving,
winner/conflict outcomes and final content/revision/state. For rollback inject failure after the first
write and compare every affected record/field and external effect, not only counts. Where proxies,
exception catches or async boundaries can alter transactions, exercise the real production entry;
direct helper calls or mocked units prove only their isolated layer. Missing cross-repository/browser
environments remain BLOCKED/PARTIAL; backend simulation cannot prove the whole delivery.


## Scope and ownership

Read when generating tests.md, starting implementation, repairing findings, or
verifying delivery. Inputs are confirmed requirements, source changes, existing
project tests, and frozen contracts. Write outputs into existing tests.md and test-report.md; Quick follows the approved
spec boundary described above. Documentation-only work checks its contracts; pure
functions check their seam without inventing application or database requirements.

The current Flow Owner forms the pre-coding plan under superflow-contracts and
evolves it using the method above. Implementation executes/retains proof;
superflow-verify / Host independently challenges sufficiency and applicability.
Existing coverage/receipt/lint checks facts; the existing state machine owns state. Database machine contracts come only from
[document-review-coverage.md](document-review-coverage.md#database-layer-contract).
Reuse testLayer, mockBoundary, and execution-receipt.v1, without another evidence
format or level system. Superflow distributes this guide; no ake verification
skill installation or .ake memory is required.

## Select signals before implementation

Use [Owner-led planning](#owner-led-test-planning) to inspect source, existing tests,
build wiring, environment and project rules, reusing seams/commands/tools. The table
is risk guidance, not an automatic classifier or all-items checklist. Before coding
record baseline cases/commands/assertions/evidence. Explain inapplicability from
source; unavailable required environments remain BLOCKED/PARTIAL. Never remove
mandatory checks. The current Owner strengthens same-goal tests or maintains the
original contract before continuing.

| Change/risk | Signals to freeze |
|---|---|
| Pure function or local algorithm | Narrow unit checks, boundaries/failures, applicable build and static checks |
| Component wiring or configuration | Above checks plus real application/context startup and readiness |
| SQL, Mapper, persistence, transactions, CAS, data-driven behavior | Logic checks plus production statements against the same database engine; full SDD also covers real consuming entries |
| API, public fields, authentication | Existing contract tests/snapshots plus affected real entries; establish new contract baselines |
| New capability spanning API, business logic, storage | Build, unit, wiring, real database, API contract, at least one real main flow |
| Bug fix | Same symptom RED → GREEN plus affected regression; environment failure is not business RED |
| MQ, devices, callbacks, cache, third-party semantics | Freeze real protocol/backend/entry verification and isolatable boundaries; missing environment remains blocked |
| Report format or test isolation only | Check affected contracts/evidence without automatically rerunning unrelated business flows |

Keep project case level numbering; do not import ake L1/L3/L5/L7/L8/L10 numbers.
Database testLayer and entry acceptance level are separate dimensions; a level
label cannot hide a missing real backend.

## Mocks and environments

The [Mock guide](mock-strategy-guide.md) describes isolation boundaries. Logic
unit tests may mock data access, but cannot prove SQL, transactions, or persistence.
Required database cases cannot mock production Service/Mapper; mockBoundary
freezes allowed external clients. H2/SQLite cannot substitute for MySQL proof.
A real same-engine container database is not a mock. Freeze engine/major, schema
provenance, production statements, and cleanup. Use a required shared environment;
otherwise use existing container infrastructure when the contract approves it.
Without an executable environment, preserve logic evidence and mark real database
cases BLOCKED/PARTIAL rather than reducing acceptance.

## Retained business scenario tests

Prefer repeatable project-native regression tests for critical business flows and
bug reproductions. Reuse directories, fixtures, authentication, DB helpers, and
execution scripts. Extend equivalent tests instead of building another scenario
framework or public helper. Keep pure logic at the lowest adequate layer. Java
may reuse existing JUnit/RestAssured/JdbcTemplate; other stacks use native tools,
without mandatory Java dependencies.

Assert concrete business response values, same-business-ID database state, and
contract-required messages/logs/side effects separately. Freeze before/after,
affected rows, and unchanged non-target records under the canonical contract.
HTTP 200, non-null values, invocation counts, or affectedRows=1 alone do not prove
correct persistence.

Make subjects unique per run/case; resolve stable base data by business key or
logical name and fail during setup when missing. Reuse project environment and
auth commands; record credential sources rather than passwords/tokens in source
or docs. Never automatically seed or delete shared base data. Freeze data creation
permissions, ownership, cleanup scope, and failure cleanup. Use existing tags,
profiles, or scripts to run environment-dependent scenarios separately from unit
checks. Grouping does not skip required delivery cases: explicitly run required
groups and check execution counts. Cases do not depend on order or share mutable
subjects.

## Execute, review, and inherit evidence

Run narrow tests first, then frozen build/startup/real-entry commands. Read exit
codes, counts, and raw output; fill case evidence using the
[execution template](test-execution-template.md). Never fit frozen assertions to
wrong output. Passing conclusions cover only executed layers; zero cases, skipped,
and unexecuted checks cannot become PASS.

For repairs, map current changes → invalidated evidence → rerun commands.
Production code, SQL, configuration, authentication, public contracts, runtime
entries, or environment changes invalidate affected proof. Report formatting
alone does not automatically invalidate prior runtime results. Historical evidence
must match source/build, backend/entry, and contract; independent review judges
applicability. It cannot authorize another source version. Reuse healthy instances
matching the tested build; restart and reverify when code/configuration/identity
mismatches. Stop only through frozen owner verification and cleanup entry points,
never broad pkill/killall. Pure functions need no process; required real entries
cannot be waived. Reviewers inspect source and raw evidence read-only; implementers
own execution and cleanup. Independent review does not mean mechanical full reruns.

## Repair failures

Reproduce case preconditions and inspect actual SQL/bindings, transaction
boundaries, responses, and logs. For DB failures first inspect production
statements, written fields, schema, and same-ID before/after values; do not blindly
add transaction annotations or replace Mapper methods. Run the same path and
affected regression after repair. Design changes first repair canonical contracts.
Do not skip failures, weaken assertions, or hide blockers.

For every SDD executable case, freeze executionContext under [declared context](document-review-coverage.md#declared-execution-context-and-evidence-reuse). Keep historical proof without calling unbound records complete under a new context.

## User operation chains and real anomaly regressions

For caches, retries, editing, forced refresh, or state changes, freeze the complete
user operation chain in tests.md: initial state, each action, response/side effects,
and assertions that subsequent actions remain possible. Separate endpoint tests
are insufficient. For example, normal call → reject result → edit input and force
a retry → resume normal calls; trace real entries, state writes, and cache reads/
writes at each step. When deleting an old entry, reverse-trace unique side effects
and remaining consumers to preserve business transitions. The business contract
decides whether old cache survives; this guide does not choose it. Pure functions
do not acquire runtime obligations.

A structurally valid response or HTTP 200 does not prove consumability. Check empty
lists, blank text, placeholder records, partially valid values, and downstream
behavior against field contracts. Confirmed semantics decide caching, retries, and
failure. Do not invent a blacklist of nonempty placeholder strings or a number
domain; invalidity requires field/provider contract evidence. For anomalies found
during real validation, retain redacted raw responses
and correlated logs, locate the cause, extend existing regression assets with the
same symptom, and record failure before repair, success after repair, and affected
regressions. Contract omissions return to the document owner for repair and
refreezing. Simulated empty responses are not real-provider verification; real
calls do not replace repeatable regressions.

## Reproduce verified startup configuration

Reuse existing task startup/acceptance scripts. Persist verified argv, relative
cwd, dependencies, non-secret environment overrides, readiness, and stop entries
in that script, referenced by tests.md. Bind environment-sensitive evidence through
existing executionContext. Restarts use the same entry and check effective settings
so manual command reconstruction cannot lose overrides or native-library settings.
Store credential sources only, never secrets or personal paths. Do not add another
launcher or cleanup framework. Reset only task-owned state when isolation requires
it; historical chat consent does not authorize shared process/data cleanup.

## Delivery conclusion boundaries

Report implementation, isolated/simulated tests, real backends/devices, browsers,
commits, and releases separately, including unexecuted work. Label each count by
case set, execution layer, source/config version, passed/failed/skipped/blocked;
one all-passed number cannot represent different sets. API simulation is not
browser integration. Unavailable usage or call counts are unobservable, never
zero. Final summary counts and scope must match the final effective report.

## Current delivery policy

All SDD uses `workflowPolicy: "observed-delivery.v1"`. Admission and continuation are owned by [document-readiness.md](document-readiness.md#current-delivery-policy).

For all complete SDD delivery, verification references current independent rereview reports
in test-report.md using the plain relative-path table below (no link syntax):

```markdown
## Independent Review
| Report |
|---|
| .sdd/reviews/current-code-review.md |
```

Store generated review reports in the existing `.sdd/reviews/` evidence area, excluded from the document handoff digest; updating execution/review evidence must not modify frozen requirement identity.


The actual report uses the canonical four-state shape and `## Reviewed Sources`
`| Path | SHA-256 |` input identity manifest from the Reviewer checklist. It must have
one current `## Findings` whose body is exactly `None` only after real review
finds no remaining unresolved issues. Preserve prior reports and disposition rationale
in history/Notes; never erase an unresolved finding to pass. The manifest must cover
registered code and case/build source inputs; do not trim build provenance to satisfy
coverage. Input identity is not a claim that every dependency was read: actual diff,
read scope and sufficiency belong in Impact and independent judgment. Source changes
after review require affected retesting and actual rereview, not just refreshed hashes.

## Actual assertions and one current verdict

Each case freezes the real business entry and fixture. Every response/state/forbiddenEffects
claim needs actual assertions/observations. Testing null does not also test empty
or malformed values; verifying calls does not prove database rollback; unchanged
zero rows do not establish existing-content preservation. Concurrency needs two
controlled contenders or explicit interleavings. A rollback case first proves the
intended writes were reached, then checks business/related-state rollback and
external effects. Static PASS text never expands the proof.

Alternative entries/simulation retain only actual coverage. A different endpoint
or manual SQL cannot retain the original entry target and end-to-end PASS. An
incomplete original case stays PARTIAL; reconcile receipt, case row, task and
current final verdict together. Existing lint rejects PARTIAL receipts labeled
PASS and PARTIAL rows with final PASS. Only --require-complete supports complete
delivery; delivery-check verifies assets, not acceptance. Link historical records
from existing .sdd evidence rather than mixing old all-PASS summaries into the
current conclusion. Distinguish contract cases, input branches, JUnit methods and
repeated aggregate scenarios.


Equal actual/expected values may legitimately pass. Review data flow rather than banning
matching values: raw response/query/test output -> parse/compare -> measurement -> exit code.
Locate each observation and failure branch; copying actual from frozen assertions or always
printing PASS is insufficient. HTTP 200 with business failure, omitted writes, stale output
or incorrect fields must fail applicable checks. Negative cases follow frozen expectations;
success=false is not universally a failed case. Retain the scope of manual observations
without upgrading a weak automation script by copying their passing conclusion.


All current verification/archive summaries must agree; a later PASS cannot override an
unmarked earlier FAIL in the same language. Keep one current Case ledger, updating its rows
rather than appending a second passing table. Put history under `## History`,
`## Historical Evidence`, or link existing historical files.
A heading at the same/higher level returns to current scope. History retains original text
and identity but supplies no current Cases, summaries or independent-review references.
Fenced/comment headings cannot change scope. Raw HTML/XML is unsupported for report structure; use Markdown/code fences. Separate old recovery points and progress in the same way.

## Capture boundaries without test coupling

Business tests assert actual behavior and need not read a particular delivery's
build.json. Reuse the project's existing acceptance wrapper: execute frozen real
tests, extract actual counts/assertions from original output/test reports, attach
captured build identity, emit measurement, then use existing --record-execution.
Wrappers add provenance only, never invented actual values, execution counts or
successful assertions. Failures exit nonzero; `test ... && echo success || echo failure`
does not ensure that.

Existing artifact binds one real file. To prove a complete artifact set, have the
real build produce a JAR/archive as artifact. One class or an unverified manifest
is not proof of the whole set. Verify source identity, artifact identity and real
runtime target separately; self-reading build receipts does not establish deployment.
Do not add a test framework or parallel capture protocol.

Paths retain the current contract: plan references resolve from the plan file;
case changeDir is plan-relative; executionContext.cwd is change-relative; receipt
references are receipt-directory-relative. Use declared/base/resolved diagnostics,
not guessed alternate roots or old-path fallbacks. Retain readable JSON stdout,
exit codes and full original logs under the existing evidence location.

## Linked independent review

Use the [Reviewer shape](reviewer-checklist.md#reviewer-report-shape) with Review
Identity: Role=independent-reviewer and actual locatable Dispatch/Return references.
Independent Review in test-report still references final reports. When findings
existed, Review Chain links original/Owner response paths and file hashes; Finding
Rechecks records actual resolved/dismissed results for each ID. Owner-generated None
projections do not substitute. Historical source may evolve while original report
identity remains; final reports bind current source. Mitigation/deferral is not
repair. Missing required checks/re-review remain PARTIAL. Identity fields/hashes
do not replace actual independence judgment.
