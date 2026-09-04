# Superflow CLI Unified Evaluation Framework

This framework answers whether a change is genuinely better, why it improved or
regressed, and which layer should change next. It covers document workflows, skills,
hooks, CLI, installation, upgrades, and controlled delivery workflows.

## Evaluation Dimensions

| Dimension | Primary evidence | Typical metrics |
| --- | --- | --- |
| Document contract quality | traceability, frozen design, gates | clarification gaps, Coding Ready rate, unresolved choices |
| Delivery correctness | review findings, test reports, real evidence | first-review pass, blockers, closure ratio, residual defects |
| Execution efficiency | events, calls, milestones | effective calls, milestones/call, fragmented returns |
| Time and cost | usage, active/wall time | tokens/milestone, active duration, waiting ratio, reliable cost |
| Autonomy | user-input and approval events | interventions, autonomous closure, unnecessary clarification |
| Recoverability | state, retries, evidence | restart recovery, duplicate work, evidence loss, transient recovery |
| Compatibility/portability | platform matrix, clean environment | supported hosts, languages, OS, no personal absolute path |
| Install/upgrade closure | doctor, version, manifest | CLI/skill/hook/script parity, stale-process notice |

No single metric proves success. Faster delivery with a lower first-review pass rate,
or fewer tokens with more human intervention, is not automatically better.

## Minimum Evaluation Record for Every Optimization

1. **Problem evidence** from events, findings, logs, or user feedback.
2. **Owner-layer decision**: documents, gates, Agents, adapters, or installer.
3. **Baseline** with version, task type, calls, time, tokens, interventions, and state.
4. **Change hypothesis** naming target metrics and protected metrics.
5. **Representative scenario** for every independent, repeatable change.
6. **Result** with comparable data, failures, findings, and evidence paths.
7. **Verdict**: effective, partially effective, ineffective, or regression.
8. **Next action and rollback condition**, assigned to the correct layer.

## Evaluation Levels

- **Change-scoped verification**: unit, protocol/schema, bilingual parity, and matching
  smoke scenario; mandatory for every change.
- **Task-level real acceptance**: frozen coding, startup, API/UI/database evidence, and
  cleanup for one delivery. It does not prove universal quality.
- **Framework certification**: benchmark across task types, hosts, languages, restart
  recovery, and faults before major workflow releases.

## Automated Evaluation versus Human Review

Automated evaluation derives auditable metrics from persisted state, events, usage, and
review findings. It can diagnose fragmented calls, excess waiting, missing milestones,
and failed convergence; it cannot prove code, architecture, or business semantics correct.

Classify recommendations by owner layer: implementation or test omissions go to documents;
deterministic format, state, or evidence failures go to hooks or gates; correctness and
architecture risk stay with Agent review; platform differences go to adapters; missing
assets go to installation closure.

## Trend Evaluation Rules

Multi-task comparisons fix version, task complexity, host, environment, and the effective
call definition. Report sample size, success rate, first-review pass rate, mean and
P50/P95 effective calls/active and wall duration, tokens per milestone, intervention rate,
recovery rate, and major finding categories. With insufficient samples, label the result an
observation, not a general claim.
