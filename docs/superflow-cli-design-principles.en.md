# Superflow CLI Global Design Principles

## Default native managed boundary (2026-10-19)

New managed tasks resolve auto to `native`. Management connects native Agents:
it owns original requests, sessions, messages, evidence references, waiting,
recovery and reviews, not the Agent's engineering strategy. Native skills,
plugins, delegation, memory, permissions/approvals, compaction and user settings
remain owned by the CLI. Pass model/effort only when explicitly selected.

Preserve skill commands and document paths verbatim instead of inventing another
engineering contract. Runner wraps natural responses in the existing executor
message with task/round/session provenance; receipt never proves completion.
Progress advances only after explicit Host approval. Deliver review findings and
new user guidance together, retain failed-call guidance and never replay stale
approvals. Explicit user engineering requirements remain effective.

Native management does not mandate engineering JSON, extra acceptance scripts,
shell syntax or curl destinations. It grants no Git/production approval and
does not override native permissions. Runner alone owns transport contracts,
journals and session state; Agents may read handoff but cannot mutate them.

Native budgets default to no hard limits; zero means unset and each positive
user limit applies independently. Unknown usage is not zero. Independent
workspaces run concurrently; overlapping roots queue under existing ownership
and locks. Delivered tasks release workspaces; stopped missing locators are
isolated rather than blocking healthy work.

Explicit quick/engineering/sdd/monitor profiles follow their current contracts;
strict engineering, tool and fixed-budget rules below apply where relevant. All
SDD admission and continuation satisfy current gates without legacy READY exemptions.
The paths share Task/Run, events and three Agent messages without a parallel state machine.


This is the highest maintenance contract for Superflow CLI. Codex, Claude, and
other supported development agents must read it before changing the CLI,
skills, hooks, scripts, MCP, managed work, installation, upgrades, or document
templates. Managed-work changes must also read
`managed-work-design-principles.en.md` and `managed-agent-protocol.en.md`.
Specialized rules may refine this document but never conflict with it.

## 1. Product Position

Superflow is not another general-purpose agent and does not replace Codex,
Claude. It freezes requirements into traceable, low-freedom,
executable OpenSpec/SDD delivery contracts, then optionally automates the
developer-execution, real-verification, independent-review, consolidated-repair,
and delivery loop through lightweight two-agent orchestration.

These capabilities expose three independent but composable entries: generate
and review documents only; start managed delivery from a user-approved
Coding-Ready change or prompt; or manage a small verbal request directly. If
the verbal path contains an unresolved API, data, concurrency, cross-repository,
or owner choice that changes implementation direction, the Host upgrades it to
clarification/documents first. Runner keyword matching and Executor improvisation
must never create a second contract.

In managed mode, the Host owns objectives, clarification, supervision, and review. The Executor
owns coding, startup, testing, and repair. The Runner decides only deterministic
facts and persists state. Never launch a nested Supervisor CLI or replace Agent
semantic judgment with Runner string matching.

### Flow Owner for Ordinary Delivery

The current Codex or Claude is the Flow Owner for ordinary authorized work,
continuously owning implementation, testing, independent-review coordination,
repair, and delivery. The Owner can edit and run verification. The read-only
Host restriction applies to managed mode; explicit managed requests retain the
existing Host/Executor/Runner split.

Reuse the public superflow entry, SDD phases, build_mode, tasks, and test report.
Ordinary SDD uses `build_mode: owner`; add no parallel Task/Run, persona merger,
or background service. Preserve existing execution modes and frozen contracts;
select an unset mode from current authorization and design, never switch silently.
Quick retains its approved spec instead of requiring managed task state.

Continue dependency-ready tasks and check them off only after their signals pass.
Progress updates, repairable failures, and context compaction do not end an
authorized objective. Obtain required independent views through the existing
reviewer-checklist, verify all feedback, repair within contract, retest, and
review again. Self-review is not independent review; real acceptance and gates
must not be weakened. Stop for actual decisions, unavailable permissions, user
pause, or stalled convergence. Persist recovery points, open findings, valid
evidence, and resource identities in existing reports. An exited ordinary
session cannot promise autonomous background continuation. Delivery, environment
acceptance, archive, and Git/release follow their existing authorizations;
missing required verification never permits a complete-delivery claim.

## 2. Sources of Truth and Responsibility Layers

Precedence is: confirmed user intent and source requirement, frozen OpenSpec/SDD
documents, repository engineering rules, managed execution contract, then run
evidence. A later layer inherits and executes earlier layers; it never redesigns
their frozen choices.

- `proposal/spec/api/design/tasks/tests` own business, implementation, and
  acceptance design.
- `design.md` freezes reuse points, exact change points, call/data flow,
  transaction/concurrency boundaries, errors, and implementation order.
- `tests.md` freezes environment, fixtures, startup and automation commands,
  steps, response/database/log assertions, cleanup, and evidence paths.
- Implementation prompts compress and inherit that contract; they do not create
  a second design.
- Managed work owns context freezing, dispatch, waiting, evidence, review/repair
  loops, and terminal delivery only.
- A verbal simple request may create a minimal execution contract; any choice
  that changes direction returns to the Host for clarification.

A direct `engineering` or `sdd` request without a user-supplied implementation
prompt must still generate, freeze, and hash a **standard execution contract**
before the Executor starts. It constrains source discovery, reuse, resource
ownership, real acceptance, cleanup, evidence, and clarification boundaries;
for runtime work it also requires a portable acceptance entry, failure cleanup,
and no broad substitute used to fake startup. A direct concurrency request may
require a deterministic non-5xx business conflict and one durable state
transition, but it must not invent concrete API, database, transaction, or test
details. Those details remain frozen by project documents or Host clarification.
“No external prompt” must never be presented as “no frozen contract.”

A complete Superflow task is a low-freedom delivery contract. Generic managed
prompts must not hard-code business API, SQL, database, framework, concurrency,
or end-to-end testing strategies.

## 3. Agent Judgment and Script Decisions

Scripts own repeatable, provable, offline-replayable facts: schemas, files,
hashes, state transitions, process identity, exit codes, structured evidence,
and protocol compatibility. Agents own meaning, architecture, correctness,
risk, test sufficiency, and repair priority.

Deterministic high-risk rules cannot live only in prompt context; enforce them
through a hook, preflight, or final gate. Open semantic judgment must not be
disguised as regex validation. Every failed gate explains the fact, repair
entry, and recovery path.

## 4. Simplicity, Reuse, and Current-Policy Consistency

- Search and extend existing modules, skills, scripts, protocols, and tests
  before creating parallel implementations.
- Prefer synchronous transactions and minimal state. Add no layer, cache,
  async flow, or compensation merely for future flexibility.
- Each concept has one canonical source; installation or generation synchronizes
  derived assets.
- Persisted formats and protocols are versioned, consistent with current policy,
  fail-safe, recoverable, and auditable. This early project makes no default
  backward-compatibility promise. Missing current requirements block until completed.
  Preserve historical files and unknown/user assets; preservation grants no earlier-policy pass.
- Codex and Claude differences belong in adapters, not core state.
- Chinese and English docs, skills, prompts, CLI help, and tests stay equivalent.

### ECC-style capability governance (default)

Before every Superflow change, inspect the capability inventory and sole owner:
the Skill Registry owns triggers and exclusions, path-scoped rules own project
applicability, hooks and scripts enforce narrow deterministic facts, and the
existing state machine retains state ownership. Reuse and consolidate before
adding a skill, hook, prompt, or durable state; a new entry must not conceal
ambiguous routing. Installation and migration remain idempotent, diagnosable,
backed up, and provenance-aware while preserving unknown and user-owned assets.
Keep a change only after positive and negative examples, both host installs,
and actual cost evidence support it.

### External-project verification isolation

External business projects are verification targets, not Superflow source,
dependencies or a built-in case library. By default reuse existing implementation
and acceptance entries, verifying only authorized scope. Reimplementation, business
repairs or environment expansion require an explicit user request. Any authorized
replay uses an independent checkout/worktree outside this repository.

Keep raw cases, conversations, detailed evaluations, logs, screenshots, XML,
probes and business data in a task-owned external directory. Repository evaluations
retain only de-identified mechanism issues, baselines, hypotheses, synthetic
positive/negative cases, result scope, conclusions and rollback conditions.
Project identities, real classes/endpoints/tables, devices, business commit hashes
and personal absolute paths must not become templates, test names or distributed
assets. Use minimal synthetic fixtures, never copied business projects,
dependencies, configuration or data. Neither gitignore nor excluding docs from
publication substitutes for isolation.

Before closeout inspect tracked/untracked files, canonical asset content, and npm
package files/content separately. Move leaked case materials outside and regenerate
affected build outputs. Keep only proven general rules under existing owners; add
no business-specific Skill, Hook, blacklist or runtime dependency. Apply this to
Codex/Claude, both languages and project/global scopes without authorizing shared
resource changes or unrelated business repository edits.

## 5. Installation and Upgrade Closure

Source install, npm install, and hook auto-upgrade install the same complete
capability closure: CLI, MCP, skills, hooks, scripts, docs, and runtime
dependencies. Runtime version and fingerprint must be diagnosable. When a Host
restart is required, the current conversation states why and what to do instead
of silently using a stale process.

## 6. Evaluation-Driven Maintenance

Every workflow or orchestration optimization follows
`superflow-cli-evaluation-framework.en.md`: capture baseline and hypothesis,
run representative smoke or regression scenarios, then compare delivery
quality, efficiency, cost, recoverability, human intervention, and compatibility.
Never draw an architecture conclusion from one subjective run, elapsed time, or
token count alone.

Evaluators diagnose auditable facts and never replace Host semantic code and
architecture review. Recurring requirements go to the correct layer: business
implementation/testing into documents, deterministic failures into script
gates, semantic issues into Host checklists, and communication/state problems
into managed orchestration.

## 7. Change Process and Definition of Done

1. Read this document, the evaluation framework, and affected specialized rules.
2. Search existing code and record evidence, owner layer, hypothesis, and non-goals.
3. Make the smallest change and keep both languages and three supported Hosts aligned.
4. Run one representative scenario per independent optimization plus affected
   tests, full tests, build, lint, and design gates.
5. Record before/after metrics, failures, conclusion, residual risk, and rollback condition. Human approvals must distinguish guidance, control, and budget/permission approvals; a budget extension must not be reported as zero human intervention.
6. If evidence rejects the hypothesis, revert or redesign; never loosen tests,
   protocols, or gates to claim success.

Done means more than written code: sources of truth agree, responsibilities do
not leak, verification passes, installation is complete, evaluation is
explainable, and no regression remains undeclared.

## Document continuity and observed execution (2026-10-20)

Assign one canonical prose owner per spec/API/design/tests decision. Source-level HOW
references those decisions and records snapshot/version provenance, content versus state
writes, per-entry transaction/proxy/exception/async boundaries and failure side effects.
Resolve contradictions with the document owner and refresh review/readiness references
before implementation. Prompts navigate task/file/case IDs; release-sql alone owns SQL
payload and digest. Existing applicability controls specialist contracts rather than
copying unrelated financial boilerplate as proof of completeness.

New changes default handoff projection to references: canonical paths, roles and existing
normalized fingerprints. Explicit off/beta and old state retain their behavior. Projection
does not change identity; checkbox/report progress stays outside frozen requirements,
while task meaning and design changes invalidate prior readiness evidence.

All SDD executable cases freeze executionEvidence: runner-captured.v1 and executionContext.
The existing report linter actually runs build/case commands and records redacted-before-persistence
output, exit codes, observed values and version binding. Legacy evidence is not upgraded;
missing execution remains PARTIAL. Consistent hashes, handwritten PASS and copied expected
values do not alone prove execution. Capture proves neither semantic sufficiency nor
resistance to a malicious local writer.

Record actual isolated Reviewer dispatch, diff scope, report and finding re-review in
existing reports. Identity fields do not authenticate independence. Missing delegation
capability remains an explicit gap while other authorized work continues. Prior PASS
cannot cover new repair impacts; delivery reconciles goals, observations, re-review,
external coordination and owned resources.

## Phase handoff and current delivery closure (2026-10-21)

Keep entry routing short and retain detailed rules on demand. Actually read the current
phase Skill and required references; an entry summary is not a substitute. Repair
canonical prose and consumer references, not just priority choices or rebound hashes.

All SDD admission and continuation require workflowPolicy: observed-delivery.v1 and
declared cases freeze runner-captured.v1 and executionContext. Existing coding-ready
enforces current requirements and persists BLOCKED for missing fields until the document
owner repairs and rereviews them. Every PASS receipt requires actual capture. Old READY
receives no exemption; retain old evidence only as history or PARTIAL.

All complete SDD validation reuses the report linter to reference actual
independent review/rereview reports with current state, explicitly clear Findings and
Reviewed Sources identity. Repairs invalidate stale source identities. The manifest is
input provenance, not proof every dependency was read. Agents judge actual diff/read
scope, reviewer independence and sufficiency. Separate fixed, mitigated, authorized
deferred and not-a-defect dispositions; logging alone is not a functional fix.

Reuse existing documents, four-state reports, Coding Ready and all three managed
messages. Add no Task/Run, hook or Agent capability restriction. Native non-SDD requests
receive no engineering contract; record pause/recovery/Git authorization separately.
