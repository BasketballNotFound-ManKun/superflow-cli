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
