# Superflow CLI Unified Evaluation Framework

This framework answers whether a change is genuinely better, why it improved
or regressed, and which layer should change next. It covers document workflows,
skills, hooks, CLI, MCP, managed orchestration, installation, and upgrades.

## Evaluation Dimensions

| Dimension                 | Primary evidence                             | Typical metrics                                                                                                                 |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Document contract quality | traceability, frozen design, gates           | clarification gaps, coding-ready rate, unresolved choices                                                                       |
| Delivery correctness      | Host findings, test reports, real evidence   | first-review pass, blockers, closure ratio, residual defects                                                                    |
| Execution efficiency      | events, invocations, milestones, supervision | effective calls, review rounds, milestones/call, fragmented returns, Host wakeups, effective/idle checkpoints, idle escalations |
| Time and cost             | usage, active/wall time, state intervals     | tokens/milestone, active duration, Host/connectivity/user/unattributed waiting, cost when reliable                              |
| Autonomy                  | user-input and approval events               | guidance, control, budget/permission approvals, autonomous closure, unnecessary clarification                                   |
| Recoverability            | state, fingerprints, retries, evidence       | sleep/restart recovery, duplicate work, evidence loss, transient recovery                                                       |
| Compatibility/portability | platform matrix, clean environment           | Codex/Claude, languages, OS, no personal absolute path                                                                          |
| Install/upgrade closure   | doctor, fingerprint, manifest                | CLI/MCP/skill/hook/script parity, stale-process notice                                                                          |

No single metric proves success. Faster delivery with a lower first-review pass
rate, or fewer tokens with more human intervention, is not automatically better.

Budget extensions, provider changes, data-disclosure approvals, and permission
approvals are auditable human interventions, but must be reported separately
from human coding, business clarification, and pause/resume control. Otherwise
“zero human intervention” hides real operating cost.
Both `human.message_received` and the resumed-execution event
`human.guidance_resumed` count as human guidance; counting only one is invalid.
Automatic Host review rounds are reported separately and must not be presented as
either human guidance or zero-cost work.

**Slow is not idle.** While an Executor has continuous model output or tool activity,
the Host remains in local wait: long duration must not trigger repeated status polling,
a nested supervisor Agent, or an efficiency penalty. Record an idle escalation only when
two consecutive supervision checkpoints have neither a stage advance nor an authoritative
command completion; model output alone is not a useful milestone. Report Host wakeups,
effective/idle checkpoints, and idle escalations separately. When MCP does not persist Host
polling events, report them as unobservable rather than falsely reporting zero polling.

## Minimum Evaluation Record for Every Optimization

1. **Problem evidence** from events, findings, logs, or user feedback.
2. **Owner-layer decision**: documents, gates, Host, Executor, Runner, adapter,
   or installer.
3. **Baseline** with version, task type, calls, reviews, time, tokens,
   interventions, and terminal state.
4. **Change hypothesis** naming the target metric and protected metrics.
5. **Representative scenario** per independent change. Complex certification
   covers both complete-document and verbal-minimal contracts, without rerunning
   framework certification for every business task.
6. **Result** with comparable data, failures, findings, and evidence paths.
7. **Verdict**: effective, partially effective, ineffective, or regression.
8. **Next action and rollback condition**, assigned to the correct layer.

## Evaluation Levels

- **Change-scoped verification**: unit, protocol/schema, bilingual parity, and
  matching smoke scenario; mandatory for every change.
- **Task-level real acceptance**: frozen coding, startup, API/UI/database
  evidence, and cleanup for one delivery. It does not prove universal quality.
- **Framework certification**: benchmark across task types, Hosts, languages,
  sleep/recovery, and faults before major orchestration releases. It must not
  rerun for every business task.

## Automated Evaluation versus Human Review

`superflow eval` derives per-run facts from persisted state, events, usage, review
findings, and Runner-confirmed project acceptance reports, then explains verdict,
reasons, and next actions. A project report is eligible only when authoritative
`workspace.changedFiles` in `review-facts-*.json` references an in-root
`*report.md`; it never scans source, escapes the project root, or infers facts from
invalid Agent delivery metadata. It can diagnose fragmentation, waiting, missing
milestones, first-round blockers, and failed convergence. It attributes waits only
from persisted state intervals (Host review, connectivity, or user control);
remaining time is explicitly unattributed and is never guessed to be Agent idle or
system sleep. Host usage may be unavailable and must not be reported as zero total
cost. It cannot prove code, architecture, or business semantics correct.

The Host independently reviews source, design conformance, and test evidence.
Classify recurring problems by owner layer: implementation/test omissions go to
document skills; deterministic format/state/evidence failures to hooks or gates;
semantic correctness to Host findings; scheduling/wait/recovery/communication to
managed state/protocol; platform differences to adapters; missing assets to the
installation closure.

## Trend Evaluation Rules

Multi-task comparisons fix version, complexity, Host/Executor, environment, and
the effective-invocation definition. Report sample size, success rate,
first-review pass rate, mean and P50/P95 calls/reviews/active and wall duration,
tokens per milestone, intervention rate, recovery rate, and major finding
categories. Provider temporary congestion and transport failures, sleep, and each
waiting category are labeled separately and excluded from effective development
time and budget. Provider dollar estimates are only reference values when the
provider cost is trustworthy; use tokens, effective calls, and milestones for
cross-model trends.

`superflow eval <taskPath...> --summary` read-only aggregates persisted Runs from
the supplied tasks. It reports sample size, delivery-ready and first-review-pass
rates, mean/P50/P95 effective calls and tokens per milestone, plus intervention
and supervision counts. It does not decide whether samples are comparable: the
operator must first fix version, task complexity, Host/Executor, and environment.
Do not mix models, task profiles, or versions and call the result a cost trend.

With insufficient samples, label the result an observation, not a general claim.

## Fixed delivery and change-scoped maintenance verification

**Before delivering every Superflow improvement, run the single full owner:**
`npm run --silent verify:changed -- --full --json --report /tmp/superflow-verification/summary.json`.
Record problem evidence, responsibility, baseline and hypothesis first; implement and observe positive/
negative cases, then record actual results and rollback conditions. Do not add a parallel Skill,
Hook, menu or persistent verification state.

Daily work can still preview `npm run --silent verify:changed -- --base <ref> --plan --json`, then
omit `--plan` for narrow execution. Unknown/shared source, installation, package metadata and Agent
rules conservatively select full verification. Only proven isolated leaves have narrow mappings;
similar filenames do not establish ownership. `--language zh|en` / SUPERFLOW_LANG selects output.
A preview executes nothing and does not prove success.

Full verification runs global/managed design gates, type checking, Lint, strict skill audit,
**one complete npm test**, build, and a real package-install smoke check, in that order.
The sole normal-workflow catalogue lives in `scripts/verify-changed.mjs`. It consumes that same
Vitest JSON report; a missing/empty suite, failure or any skipped assertion in a required suite fails.
It reuses dual-host/bilingual/project/global isolated installation, complete contracts and real
OpenSpec strict validation, docs-to-design-to-implement state transitions, all seven real subgates
producing Coding Ready, incomplete-contract rejection, valid implementation continuation,
contract-drift invalidation, recovery and upgrade tests. Handwritten success receipts cannot replace
the complete positive chain.

Tools are Node 20/24, Python 3.12 and OpenSpec 1.14.1; missing tools fail explicitly, never skip.
Install OpenSpec into a temporary isolated prefix and add its `node_modules/.bin` to PATH if needed;
a global install is not required. CI uses the same `--full --json` entry across Linux/macOS and
Node 20/24, retaining reports and detailed logs even on failure. Setup failures retain the same
owner's NOT_RUN preview (success:null) and setup log; checkout failure only has GitHub's native logs.
Configuration alone is not evidence
that a matrix ran; it proves neither Windows compatibility nor real-model behavior.

Each run gets an exclusive temporary evidence directory; `--report` only chooses its final summary.
Checks report PASS / FAIL / NOT_RUN. Stop at the first failure with its actual exit code; later checks
remain unexecuted, and preview success is null. Full verification compares source, tests, canonical
assets, scripts and configuration before/after execution; drift fails the run without automatic retry.
Package only when the same-run temporary build input/output fingerprint still matches, avoiding
stale dist and duplicate prepack builds. Install the real tarball in an external clean consumer with
isolated user directories and Git/npm configuration; reuse existing CLI/deployment owners, never
link the source checkout, touch real Hosts or treat dry-run as installation. Report success only after
consumer cleanup. CLI update checks run after normal successful commands; help/version exits do not
start background npm work. Automation sets `NO_UPDATE_NOTIFIER=1`; `CI=1/true` also suppresses
optional update checks so no network children are left behind.

Child detail logs use stderr; JSON stdout stays parseable. This proves deterministic workflow and
installation facts, not business sufficiency, real task acceptance or publication. Roll back affected
changes if missing/skipped baselines pass, reports and outputs come from different inputs, unknown
assets are overwritten, or installation touches real global configuration; preserve external failure
evidence and rerun the same full owner after repair.

## Continuous Ordinary Delivery with Flow Owner

Evidence: a practical run ended after intermediate progress, requested repeated
continuation for repairable failures, and treated context pressure as delivery
termination. Source comparison found ordinary routing mixed with managed Host
read-only restrictions, mandatory teams, and stop-on-verification-failure rules.
Deterministic baseline: an existing implementation prompt still routed to handoff;
Owner mode could not enter the existing verification phase. Ownership belongs to
Agent execution contracts, existing SDD routing, and recovery, not a new scheduler.

Hypothesis: extend superflow/build/verify continuity and `build_mode: owner`,
retaining contracts, state, independent review, real acceptance, and authorization
to reduce human relay between stages. Representative cases cover both hosts,
languages, project/global installations, missing/present prompts, manual control,
legacy modes, verify-fail return, the complete Coding Ready chain, and Agent
scenarios for docs-only scope, environment blockers, and context recovery.
Independent review caught Quick approval invalidation from mutable spec progress;
progress now lives in the adjacent report. English risk terms retain their original
meaning. Declare the exact task report in Quick file scope while foreign dirty
files still block. Real CLI regression also repaired spec read/write resolution
under the selected project and continuation hints for valid in-progress/done specs.
A zero-match scale baseline first reproduced a nonzero exit, then became
a valid zero count; read errors still fail without weakening risk or required gates.

Before/after commands, scenario behavior, an actual synthetic delivery, full
verification, and package installation results live outside the repository. A
single sample proves that sample only, not population compliance, background
continuation, or Windows execution. Roll back if ordinary routing creates managed
Tasks, docs-only work edits source, modes change silently, missing required evidence
becomes full delivery, custom assets are damaged, or a parallel state owner appears.

## Multica mechanism adoption verification (2026-10-12)

Evidence: quota can be obscured by token-refresh/403 messages; failed calls lose usage; unknown cumulative values revive; duplicate retry events pollute sequences; HOME-only isolation misses Windows profiles; version numbers cannot identify startup builds. The preceding Comet baseline passed 855 tests across 104 files.

Hypothesis: extend existing failure classification, invocation evidence, process supervision, fixture environment, and build finalization without adding Skills, Hooks, or state machines. Independent review found adapter/Runner classification inconsistency; the fix shares the existing failure owner and tests permanent usage limits against temporary concurrency limits.

Representative cases: 403 usage limits receive no credit or automatic retry; failed physical calls contribute usage once; known→unknown→known and unknown→success remain unknown; duplicate attempts, foreign sessions, policy rejection, and late same-chunk success; clean/dirty/nested/non-Git provenance; outer environment restoration and preserved TMP/TEMP. New regression cases were observed failing before passing. Fixture verification uses neither external models nor business databases.

Limits: these checks establish mechanism and installation behavior, not provider reliability, development success rates, or Windows machine compatibility. Codex app-server Guardian and excludeTurns are not copied. Revert affected changes if classification credits, usage duplication, unknown revival, environment leakage, false provenance, or changed stale gating appear; retain failure evidence and rerun representative cases and final full gates after repair.

Final result: all 908 tests across 106 files passed, together with full type checking, ESLint, design/managed gates, and strict Skill Registry audit (16/16, zero English mirror gaps). Independent five-axis review found and closed two classification issues. The 404-file npm package installed into a temporary consumer; a real MCP process verified unknown startup provenance, immutable startup identity across metadata replacement, and rejection after installed-code change. No Windows machine, external model, or business database validation was performed. No commit, release, or global npm CLI replacement was made. Log: `/tmp/superflow-multica-verification-final.log`.

## 0.5.22 global chain review

Baseline: 908 tests across 106 files after Multica adoption. Isolated reproduction found delivery falsely rejecting fenced TODO/CASE_PASS, archive accepting example PASS over body FAIL, pure OpenSpec entry bypassing SDD closeout, selected-agent refresh expanding to another host, asset-only updates escaping MCP staleness, and reused service PIDs exposing unrelated processes to termination. Owners are canonical lint/archive gates, Skill Registry routing, update-target resolution, and runtime service management.

Hypothesis: share body facts, clarify SDD routing, filter selected platforms, and complete fingerprint closure and OS-identity/startup checks without parallel Skills, Hooks, or Task/Run state machines. Positive/negative cases include real body TODO/FAIL, fenced examples, BLOCKED document freezes, moved archive recovery, single/both-agent updates, asset replacement, valid service reuse, legacy unknown identity, reused PIDs, and failed startup identity observation. New regressions were observed RED before GREEN; fixtures prove neither external-model compliance nor Windows machine behavior.

Revert affected owner changes if body FAIL is admitted, valid closeout is rejected, platform writes expand, stale detection is lost, an unverified process is stopped, failed startup claims tasks, or extra calls are introduced. Retain raw evidence, repair, and rerun representative positive/negative cases and full release gates.

Final stable-source result: all 968 tests across 107 files passed, with type checking, ESLint, global/managed design gates, and strict Skill audit. Independent five-axis review reproduced and closed bidirectional readiness, Chinese closeout compatibility, and historical Blocked exemption issues. Owned real Node fixtures cover valid readiness, abnormal exit, and live-lock conflict. Full log: `/tmp/superflow-0.5.22-verification-final.log`. Build, package, and release-artifact evidence is recorded in the 0.5.22 annotated tag release.

## Skill entry and naming consolidation (2026-10-13)

Evidence: users could not identify the router or its product from the menu. Sixteen registered skills mixed Superflow/OpenSpec names; docs/design/implement were hard to distinguish; two archive entries required state-file knowledge. API annotations used a separate optional copy installer outside the Registry. Owners are skill contracts, host presentation, and installation; Task/Run state, the three JSON protocols, and business acceptance strategy do not change.

Baseline: the existing 0.5.22 record reports 107 files and 968 tests; 16 registered skills plus one auxiliary skill and seven Codex phase prompts. Hypothesis: one default superflow entry, consistent internal superflow-* names, explicit contracts/handoff/build duties, and unified archive/installation owners reduce user choices while preserving contracts. The user requested no old-name aliases. Modified or unknown assets remain with diagnostics; fingerprinted original assets move to recoverable backups outside discovery directories.

Cases: repeated bilingual Codex/Claude deployment; Claude-only internal menu hiding while Codex retains explicit access; discovering old project installations without state; original, custom, symlink, and already-backed-up asset retirement; native pure OpenSpec archive and fail-closed missing SDD state. Independent review found and closed four issues: old-project discovery, historical fingerprints, pure OpenSpec Hook conflict, and repeated backup convergence. Fingerprints cover all 24 release tags; retired names serve migration discovery only, never routing.

Results: all 107 test files and 973 tests pass, together with lint, build, global/managed design gates, strict skill audit (16/16, no English gaps), and 32 skill-file validations. Real v0.5.20/v0.5.21 Git assets pass all 16 migration cases across two tags, languages, hosts, and scopes. There remain 16 core skills after merging archive and registering API annotations; exactly one default public entry; Codex prompts decrease from seven to one. A temporary pure OpenSpec change also passed the real Hook and native CLI archive, including delta merge and directory movement. Pack preview verifies new paths and removal of old entries. Log: `/tmp/superflow-skill-cleanup-tests-final.log`.

Limits: this verifies naming, deployment, gates, and migration, not real third-party task success, model routing compliance, or Windows hardware. No current-host installation or npm release was performed. Roll back the affected owner if unknown assets are retired, original old skills remain as defaults, pure OpenSpec is blocked, or missing SDD state is allowed. Preserve original assets and retirement backups; fix and rerun representative cases.

## Evaluation material isolation

Keep external-project raw cases and detailed run evidence in a task-owned external
directory. Retain only de-identified mechanism evaluations and minimal synthetic
regressions here, following “External-project verification isolation” in the global
design principles. Verify existing implementation by default; maintaining an
evaluation does not authorize reimplementation or business dependencies. Evidence
authenticity and eligibility for CLI distribution are separate checks.

## Document delivery exit and workspace convergence (2026-10-15)

Evidence and baseline: targeted review of the latest two commits ran 222 tests;
three failed after the source path base changed. Synthetic cases also reproduced
writes to an unselected workspace, a dropped CLI path option, keyword false
positives, and template guidance accepted as owner confirmation. The proposal
skill explicitly announced implementation readiness after OpenSpec applyRequires
completed, before full Superflow delivery. Owners are document contracts, existing
gates, and workspace resolution.

Hypothesis and ECC scope: one change-relative source base, no fallback from a
selected workspace, and existing templates/language configuration restore factual
consistency. Semantic contradictions remain advisory for Agent review. Proposal
owns base artifacts; existing contracts, design, and handoff owners continue the
same document task. Only the existing coding-ready gate establishes development
readiness. No new Skill, Hook, protocol field, state machine, or legacy-format
compatibility branch is introduced under this request.

Representative cases: Chinese and English assets installed for Codex and Claude
must not route a proposal directly to coding. Proposal-only requests retain their
narrow scope; document-only authorization never starts implementation. The real
gate rejects an OpenSpec-only package. Initial implementation requires strict
readiness; resumed implementation with a valid receipt permits intended code
changes while frozen-contract drift still blocks. Other positive/negative cases
cover nested source paths, duplicate change names, real CLI --path, template/guard
integration, and completed owner records.

Limits and rollback: synthetic checks prove routing, contracts, and installation
facts, not real Claude compliance rates or comparative framework efficiency.
Revert the responsible change if cross-workspace writes, premature readiness,
example-based confirmation, false rejection of valid implementation resumes, or
language installation drift recurs. Keep the failure evidence and rerun the
representative cases. Final counts, build, and installation results come from
this iteration's actual command outputs.

Final result: all 1080 tests across 113 files passed, along with build, ESLint,
global/managed design checks, and strict Skill audit (16/16, zero English gaps).
Chinese/English and Codex/Claude installation regressions and real CLI/guard
integration passed. The npm dry-run listed 424 files without temporary review
reports or editor files. Independent review found and closed an English behavior
keyword gap; the final full suite covers that fix. Installed local skills and
running Claude sessions were not updated; real-model compliance remains unproven.

## Native execution capabilities and recovery evidence (2026-10-19)

Observed execution exposed a skill/tool set different from the interactive host;
guidance recovery replaced canonical review references, and new invocations could
report previous runtime identities. Owners are host startup adaptation, existing
message handoff and runtime observations, not business contract rewriting. The
focused baseline passed 66 tests across two files without covering these breaks.

Hypothesis: normal native executor capabilities with a read-only supervisor, an
independent guidance ledger, preserved evidence and separate acknowledgement vs
processing semantics prevent lost entry behavior, stale review replay and repeated
engineering. Cases cover old pass/blocked/needs-fix results, acknowledged failure
and retry, explicit Host escalation, absent telemetry and reported empty sets.
New regressions were observed failing before their fixes.

The final full verification report owns the result. Synthetic tests do not prove
provider model identity, model compliance or all real plugin/delegation behavior.
Roll back affected changes if supervisors gain write access, stale results are
promoted, guidance/evidence is lost, budgets are bypassed, or Host escalation
starts repeated engineering. Keep raw evidence outside this repository.

Reverse-host review also found forced memory disabling on fresh/resumed Codex
Executors. They now inherit user features while retaining session, model/effort
and role sandbox boundaries. Three failing assertions were observed before the
fix; regressions also reject forced skill/delegation toggles, ignored user
configuration and writable supervision.

## Native managed convergence (2026-10-19)

Evidence covered rewritten entries, permission overrides, extra engineering
contracts, the two-hour cutoff, global-asset admission and serialized tasks.
Default native management reuses profiles and Task/Run without another state
machine. Agents own requested engineering, Host judges that scope and Runner
records deterministic facts. Frozen legacy gates remain explicitly covered.

The baseline was 116 files and 1132 passing tests. Cases cover actual CLI inputs
and permissions, non-completing natural replies, guidance/findings together,
zero/positive/cancelled budgets, independent concurrency and overlapping roots,
stopped stale locators, Git initialization identity promotion, internal state
protection and normal native business operations. Observed regressions precede
fixes; synthetic tests do not prove provider identity or real model compliance.

Roll back affected changes if requests are lost, responses are promoted without
approval, positive limits are bypassed, native permissions are overridden,
workspace exclusion fails, state becomes writable or legacy contracts migrate
silently. The final same-input report owns full tests, builds and isolated
installation results; incomplete gates must remain explicit.

## Document-first continuity and captured evidence (2026-10-20)

Two runs with identical business source baselines exposed decision/HOW/prompt drift,
redundant projections, idempotency substituted for state changes, synthesized receipts
and missing independent review. Raw evaluation stays outside this repository. Owners
are existing document contracts, handoff, report linter and Flow Owner review, not new
skills/hooks or business instructions in generic management.

Baseline: 1233 tests across 120 files passed; isolated npm installation was blocked by
official-registry connection resets. The hypothesis is to first converge canonical
decisions/per-entry HOW/real acceptance, then capture actual commands and record
independent review while preserving native capability, frozen legacy semantics and gates.

Cases observed eight missing document structures RED, independently found conflicting
short-transaction defaults, reference projection under half legacy size with unchanged
identity and explicit off retained, synthesized PASS rejected for new capture contracts,
actual build/case measurements GREEN and failures/drift/missing measurements retained.
Clean-source execution, isolated host/language installation and npm shim layouts are
covered separately. Existing Owner prohibitions on self-review are not claimed as new;
new review provenance and repair/retest/re-review slots make the obligation auditable.

Pressure reasoning and structural tests do not prove population compliance, Windows
execution or a rerun of real business acceptance. The external full report owns final
results; unknown usage is not zero. Roll back affected owners if projections replace
canonical decisions, legacy contracts migrate, synthesized PASS advances, unredacted
output persists, absent reviewers are called independent, stale repair conclusions are
reused or installation damages unknown assets. Never weaken assertions to evade failure.

## Phase reading, fresh admission and rereview continuity (2026-10-21)

The following records historical evaluation; its valid-frozen-legacy-continuation
exemption is now removed. All current SDD admission and continuation require
observed-delivery.v1, runner-captured.v1 and executionContext for every executable case.
Every PASS receipt requires actual capture; complete delivery references actual current
source-bound independent reports. Retain old files only as history or PARTIAL. Missing
requirements return to their owner for repair and rereview, never earlier-policy promotion.

Comparative evidence showed explicit phase handoff and multi-view review in one run.
Another improved startup checks, real state change and one independent review, but
provided no readable diff or rereview, reissued READY for uncaptured legacy cases,
retained contradictory prose and synthesized post-repair evidence. Recovery controls
are not business guidance. Raw cases, paths and scores remain outside this repository.

Owners are existing entry/phase Skills, coding-ready, canonical review audit and report
linter. Baseline: 1276 tests across 122 files and real package installation passed.
The hypothesis combines a short entry, complete phase reading, fresh capture admission
and current source-bound review without another workflow or capability restriction.

RED cases cover uncaptured new/expired READY, missing/stale reports and source identity,
alternative Markdown findings, empty bodies and None mixed with unresolved text. GREEN
cases exercise all real readiness subgates, valid frozen legacy continuation, observed
execution, current rereview and isolated host/language installation. Independent review
found and closed the alternate-list bug. Detailed entry rules migrate intact; tests
continue checking them at the canonical location instead of deleting assertions.

The external full report owns final results. Structure and synthetic pressure do not
prove reviewer independence, malicious-local tamper resistance, population compliance,
Windows execution or renewed business delivery. Roll back owners if missing provenance
advances, legacy continuation migrates, moved rules disappear, stale review is reused,
controls count as guidance or installation harms unknown assets; preserve failure data.

## One current policy without legacy receipt exemptions (2026-10-21)

The user explicitly rejected old-rule compatibility. Baseline: 1326 tests and actual
package installation passed. Remove legacy READY branching, source-less report passes
and missing capture/context exemptions. All SDD admission/recovery follows current
policy. Historical files remain but grant no approval; native non-SDD/Quick scope is
a task distinction, not a legacy exemption.

RED cases reject complete old READY, missing frozen fields despite real capture and
missing/old/BLOCKED readiness despite valid review. Fixtures use real capture instead
of handwritten successful events. Independent review found additional managed reuse,
resume, authorization and guidance entries that mutated state or started service first;
the same admission owner now guards execution, delivery and final preflight. Native
direct tasks gain no SDD requirement. Current implementation sources may evolve while
frozen contracts remain checked. Generated rereviews stay in existing .sdd/reviews so
execution evidence does not change requirement identity.

The external full report owns final test/install results, not business acceptance.
Roll back affected changes if missing requirements advance, legitimate current code
evolution fails, non-SDD tasks acquire state, recovery loses evidence, execution state
changes before admission or installation damages unknown assets. Preserve evidence;
do not reintroduce old-rule exemptions or weaken assertions to claim a repair.

## Automatic npm installation synchronization (2026-10-21)

Baseline: 1358 passing tests; global postinstall migrated Hooks and requested manual
init without deploying skills or MCP. The installation owner now reuses init/update
and the existing registry. First installation deploys globally to detected hosts;
existing installations retain scopes and language. Caller-owned updates skip duplicate
deployment and dependency recursion.

Cases cover single-host detection, recorded project scope, language retention, npx and
internal-update skips, missing hosts, and failed deployment. Verification uses an
isolated source copy, leaving the active local CLI and assets untouched. Final results
are recorded in this run's evidence. Roll back on expanded targets, duplicate deployment,
false success, or writes to the real user home.

## Automatic updates by default (2026-10-22)

Baseline: 1419 tests and real package installation passed, but the daily hook
still defaulted to check despite the requested automatic updates. Responsibility
belongs to the existing installation/update owner. Default to apply; retain
explicit check/off, locking, throttling and failure retries without adding a
skill, hook or updater. RED cases cover unset/empty modes and default failure;
positive and negative cases exercise command dispatch, both languages, explicit
opt-outs, session/global throttling and locking. Final verification and local
installation results live in the external run report. Synthetic CLI fixtures do
not establish provider-catalog availability. Roll back this default-policy change
if opt-outs install, concurrent updates duplicate work, failures claim success or
lose retry eligibility. Never substitute old caches for official plugin inventory.

## Handoff, traceability and independent review closure (2026-10-22)

Baseline d2c39bb passed 1426 tests and real isolated package installation. External
run evidence exposed repeated batch contracts, closed entry inventories, Owner
rewrites of reviewer conclusions, alternative-entry claims and ambiguous path
bases. Responsibility remains in existing handoff/guard, coverage/task indexes,
review auditor/report linter and Agent semantic judgment.

Reuse these owners for one main/batch ID graph, generated mode/source/body identity,
original four-state reports, separate Owner responses, actual per-finding re-review
with historical file identity, declared/base/resolved path diagnostics and PARTIAL
combinations. Known completion-time stream disconnections use existing transient
classification; authentication/quota failures receive neither retry nor credit.
Guidance covers actual callers/payloads, transaction counterexamples, current
verdicts, business-test/capture-wrapper/archive boundaries and authorization/recovery
evidence. No new Skill, Hook, task state or old-format exemption was introduced.

Representative RED cases retain original assertions: main contracts plus thin
batches, unknown/missing Task/Entry/Case IDs, stale mode/body packages, rewritten
Concerns, duplicate/ancestor Returns, original tampering/missing finding IDs,
historical source evolution, nested paths, PARTIAL/PASS combinations and disconnects
mixed with authentication errors. Independent review findings require repair and
actual re-review. Neutral old/new application probes do not establish population
model compliance or turn structural checks into semantic proof.

The user explicitly deferred local installation: verify/commit only in the isolated
worktree, never merge into the source-linked installed checkout. Package installation
uses isolated consumers only. Final verification, packaging, application comparison
and installed fingerprint checks are recorded externally. Roll back the affected
change if valid tasks/history are rejected, reports are washed clean, normal progress
becomes contract drift, permissions receive credits or metadata is treated as
authenticity proof. Preserve evidence without weakening goals or gates.

## Owner-led test-strategy clarification (2026-10-23)

Baseline b607ed1 passed 1508 tests and real isolated package installation. Existing
guidance already selects signals from source risks, but frozen-plan/inherit-only/
return-to-document-owner wording did not directly distinguish within-case input
strengthening from new Case IDs/contexts, risking static checklists or repeated
approval requests. Responsibility is existing test-guide, Owner/phase and Reviewer
semantic judgment, not another automatic business-test classifier.

Clarify pre-coding agreement, implementation discoveries and final counterexample
review. Same-goal additions proceed autonomously; changed contract identity follows
existing update paths. Business/acceptance baselines and permission decisions remain
protected. Quick retains its approved spec and records proof/decisions alongside it.
Label API/backend integration and browser E2E by actual scope, without a new format,
Hook, state or old-rule exemption.

Use six neutral old/new application scenarios: same-file pure logic, omitted batch
callers, within-case/new-case boundary, unavailable required DB, UI evidence and
undefined business semantics. Old guidance already made reasonable choices; do not
invent baseline failure or improved detection rates. Keep results externally.
Existing deployment consumers, fact gates, strict audit, full verification and
isolated package installation establish wiring, not Agent compliance from prose.

The user defers local installation. Retain commits in the isolated branch, never
merge into the source-linked installed checkout, and compare installed fingerprints.
Revert affected wording if it removes mandatory tests, uses filename heuristics,
bypasses contract/Quick identity, stalls for routine approval or adds a planner.
Do not weaken deterministic verification; final results are recorded externally.

## Delivery depth and canonical consumption (2026-10-23)

Baseline 9e2d7c1 passed 1508 full checks. External analysis found missed real-wiring/caller
counterexamples, measurements copied from expectations, repeated prompts/inapplicability lists
and history mixed with current results. Much of the guidance already existed; missing reads and
contradictory consumers also matter, so additional reminders alone cannot count as resolution.
Owners remain existing semantic guidance, navigation and report gates.

Preserve eight anonymous old-guidance applications, most already sound; evaluate the candidate
under the same conditions without fabricating a detection-rate gain. Deterministic RED cases
cover unmarked same-language conflicts, multiple current Case ledgers and history supplying
current evidence. Independent review exposed HTML code headings/comment-table scope errors,
which receive real repairs using the canonical body classifier without task-index syntax changes.
Thin Prompts require exact current HOW links and full canonical contract checks instead of copied
keywords. Content CAS and external-action claims describe their actual boundaries without a new
classifier. A real anonymous HTTP200 business-failure/database process fixture compares response,
state and persistence separately; equal observed/expected values may pass. This does not certify
production databases or model compliance.

Mirror assets and Registry, preserve original reviews and append dispositions/rechecks. Add no
Skill/Hook/protocol/long-lived state/legacy exemption or external business fix. Commit on the same
branch; use the existing isolated checkout for build/full verification without local installation
or publication. Current external evidence owns final results, costs, limits and rollback. Revert
on historical promotion, valid-evidence rejection, forced deployment for pure functions, admission
without canonical detail, overwritten original reviews or changes to the installed host; never
weaken goals or assertions.


## Existing-contract intake and review preparation (2026-10-26)

Evidence and ownership: external runs still reused stale prose, mechanically rebound review
identity, missed unchanged callers, retried report paths/enums/hashes and recaptured evidence after
style-only edits. Owners are contract consumption, Agent semantic review and existing review-coverage
preparation/diagnostics, not managed state or another supervisor.

Baseline: 3817cef. An anonymized pressure probe already found batch omissions, status writes,
snapshot/token lifecycle gaps and fake measurement with old guidance; do not claim improved model
detection from more prose. Deterministic RED cases show the missing preparation option, nested-cwd
report resolution and finding-set diagnostics without concrete missing/unexpected IDs.

Hypothesis: extend review-coverage to produce exact diff, both snapshots including untracked tests
and a NEEDS_CONTEXT template, avoiding early commits and hand-built omissions. Project-root paths
and complete set diagnostics reduce retries. Guidance changes consumption order, intake and original
preservation; nonfunctional cleanup moves before the first binding build without weakening identity.

Examples cover unstaged/staged additions, removed directories, explicit baseline plus working tree,
nested cwd, symlink escape, non-overwrite and executing the CLI from a real installed tarball.
Keep four states, original identity, actual independent review and capture gates. No new Skill/Hook,
long-lived state, semantic decision engine or old-policy exemption. Both languages/hosts reuse the
single installer. Final tests/review/full verification/local installation are recorded externally.

Synthetic cases do not prove overall model compliance or repaired external business behavior.
Roll back affected changes if packages omit/duplicate changes, expose outside sources, overwrite
returns, promote templates/rebound old hashes, reuse stale builds after source changes or force
unrelated runtime work after documentation-only repairs. Preserve evidence and gates.


## Delegation consumption, capture preflight and review preparation (2026-10-27)

Baseline 258452f passed 88 targeted tests in three files; the previous full run of 1,587 tests is historical baseline evidence. External observations exposed mostly sequential Owner work, plan/path errors discovered after expensive execution, review-format/hash rework, and byte-freezing mutable task progress/live reports. Responsibility belongs to existing Agent consumption, capture/review preparation and source identity, not a new managed scheduler.

Inspect reference source first: computing a dependency frontier differs from deciding how Agents execute it. Retain path rules, precise briefs, neutral orchestration and batched repairs; do not import fixed headcounts, model switching, per-ticket pauses or another checkpoint system. Old Owner guidance already supported reasonable decisions. Isolated old/new consumer probes observe application, not newly invented capabilities, discovery rates or runtime gains.

Deterministic RED/GREEN cases cover batch plan diagnostics without command/output effects, unbuilt dependencies without fabricated PASS, actual build/case capture, canonical initial/response/re-review templates that remain NEEDS_CONTEXT, immutable original/historical source identities and legitimate new-evidence resolved/dismissed results, task checkoff remaining valid while semantic changes invalidate identity, and live reports rejected as contracts. Ordinary files/code/original reviews retain byte checks. A proposed blanket DONE block based on Owner mitigation/deferral words was rejected and is not counted as a gain.

No new Skill, Hook or long-lived state; bilingual/dual-host deployment keeps its existing owner. Targeted tests, independent review, the single full verification entry and local installation are evidenced in the external run records, not inferred from templates or structural PASS. Installation is local-only under user authorization; no release.

Rollback on preflight command execution/input replacement/hidden failure, overwritten original reviews or prepared inputs counted as actual review, status-word rules overriding semantics, changed tasks passing or progress-only edits failing, delegation conflicts/context loss/self-review relabeling, or installation damaging unknown assets. Repair the existing owner or revert the change; never weaken gates or rewrite history to claim success.
