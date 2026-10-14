# Test Selection and Verification Loop

## Scope and ownership

Read when generating tests.md, starting implementation, repairing findings, or
verifying delivery. Inputs are confirmed requirements, source changes, existing
project tests, and frozen contracts. Write outputs into existing tests.md / Quick
Spec and test-report.md. Documentation-only work checks its contracts; pure
functions check their seam without inventing application or database requirements.

superflow-contracts freezes the plan; the implementer executes and records evidence;
superflow-verify / Host judges sufficiency and historical applicability. Existing
coverage/receipt/lint checks deterministic facts; the existing state machine owns
state. Database machine contracts come only from
[document-review-coverage.md](document-review-coverage.md#database-layer-contract).
Reuse testLayer, mockBoundary, and execution-receipt.v1, without another evidence
format or level system. Superflow distributes this guide; no ake verification
skill installation or .ake memory is required.

## Select signals before implementation

Search existing tests, build wiring, environment configuration, and project rules.
Reuse seams, commands, and tools. Before production edits, map each affected
behavior to these signals and freeze case IDs, commands, assertions, and evidence
paths. Give source reasons for inapplicable signals. Missing environments for
required cases mean BLOCKED/PARTIAL, never inapplicable. Implementers cannot
remove frozen obligations; omissions return to the document owner.

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

For cross-round checks sensitive to commands/directories/invocation environments, freeze executionContext under [declared context](document-review-coverage.md#declared-execution-context-and-evidence-reuse). Keep historical proof without calling unbound records complete under a new context.

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
