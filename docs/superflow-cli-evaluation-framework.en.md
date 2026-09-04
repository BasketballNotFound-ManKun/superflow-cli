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
