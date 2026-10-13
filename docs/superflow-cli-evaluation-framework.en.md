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

## Change-scoped maintenance verification

During Superflow repository iteration, inspect a deterministic plan with
`npm run --silent verify:changed -- --base <ref> --plan --json`, then omit --plan to execute.
`--language zh|en` / SUPERFLOW_LANG selects output. --full explicitly retains npm
test. Unknown/shared source, installation, package metadata, and Agent-rule changes
fall back to full checks with reasons. Only verified isolated leaves have narrow
mappings; similar names do not establish test ownership. This repository helper
never decides business sufficiency or replaces final full/build/install/release
checks. Plan mode executes nothing; failures retain exit codes and detailed logs
use stderr for structured output.

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
