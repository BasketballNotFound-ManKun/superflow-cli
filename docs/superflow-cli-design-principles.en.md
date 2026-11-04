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


### Owner test-strategy judgment

Ordinary Flow Owner selects the smallest sufficient verification before coding
from original goals, actual source/callers and project baselines, recording reasons
in existing tests.md or within Quick's approved boundary. Strengthen same-goal
boundaries/regressions without routine user approval; new Case IDs/frozen contexts
still maintain existing contracts, traceability and affected readiness/review proof.
Never lower expectations/required checks or disguise unavailable environments as
inapplicable. Business meaning/scope/acceptance trade-offs and unavailable permissions
need input. Scripts check facts; Owner and existing risk-required Reviewers judge
sufficiency. No automatic test planner, fixed layer checklist, mandatory planning
table or Test Agent is introduced. Quick retains its approved steps/digest.

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

## Daily automatic-update default (2026-10-22)

The existing dependency-update hook defaults to apply when its mode is unset or
empty. Explicit check reports only; off/0 disables it. Reuse the same update owner,
session deduplication, global six-hour throttle and lock. Failures retain logs and
release throttle eligibility for later-session retry. Success requests a restart;
updating disk assets does not hot-load the current host.

## Handoff navigation, traceability and review closure (2026-10-22)

The main implementation prompt references shared canonical contracts. Batch
prompts navigate to that main prompt and their task/entry/case IDs; shared
constraints are consumed once, never proven by repeated contract bodies. Check
registered navigation against existing coverage/task indexes. Agents still own
entry discovery, real payload investigation and semantic independent review.

Retain the original independent report, state, finding IDs and content identity.
Owner responses are separate and never replace the reviewer conclusion. Findings
require an actual re-review linked to the original report, owner response and
per-finding results. Final reports bind current sources; historical reports retain
historical input identity. DONE cannot retain unresolved Concerns. Hashes and
dispatch references establish record identity, not independence, actual reading
or repair correctness; Host semantic verification remains necessary.

Runtime test-report is excluded from canonical hashing and remains reference-only
in every context_compression mode. Do not preserve old projections with fence
guessing or a parallel body interpreter.

## Delivery depth and current facts (2026-10-23)

Judge implementation, contracts and measurements against original goals, actual callers and
counterexamples. Green tests, CHECKED axes, hashes or closure of listed findings do not establish
goal completion. Owner selects real verification for actual wiring/caller risks, retaining light
pure-function paths. Project prose owns snapshot/token lifecycles, commit and external effects;
a fresh token alone never authorizes stale content.

The main Prompt navigates current canonical contracts. Validate applicable detail at its sole
owner and require the main entry to link that exact source; batches do not duplicate strategies
or inapplicability lists. Concurrency contracts identify stable keys, actual atomic write/claim
boundaries, transactions, outcomes/retries and external effects. Content conflicts without external
actions do not invent pending/claim workflows. Agents still judge source-level sufficiency.

Current summaries, one Case ledger and independent-review references must agree. Explicit history
is historical; code/comment headings cannot change scope. Preserve original review returns/input
identity and append dispositions/rechecks. Derive actuals from observations and propagate failures.
Capture establishes execution facts, neither rejects legitimate actual/expected equality nor
proves business semantics automatically.


## Owner delegation and execution preparation (2026-10-27)

At startup and integration points, the Owner weighs task size, the dependency-ready frontier, shared files/runtime resources, required context and dispatch/integration cost. Small work can stay inline; a tightly sequential chain retains one subagent's context; only independent, non-conflicting branches run in parallel. Shared contracts and integration decisions remain with the Owner, and implementation delegation does not replace independent review. Add no fixed headcount, model policy, supervisor or scheduling state.

Batch-check plans, resolved paths, sources, execution context and output conflicts through the existing capture owner before execution. Preflight runs no commands, writes no evidence and produces no business PASS. Recording reuses the same preparation while preserving exit codes, source/artifact/runtime identity and business assertions. Recapture according to actual changes; planned fields are not observations.

Review preparation uses existing review-coverage templates and original snapshots in actual dispatch. Owner responses and actual re-reviews remain separate additions. Preparation does not prefill verdicts, reading claims or dispositions. Genuine new evidence may independently resolve an earlier finding; do not decide from an old Owner status word alone. Orchestration is neutral: no preset verdict/severity ceiling or automatic exemption for spec-mandated defects.

Current task sources use the existing canonical handoff identity: checkoff does not force contract re-review, while changed task semantics still invalidate it. The live test-report is reference-only, never a frozen contract/requirement. Other files, code execution and original reviews retain their byte identities; add no parallel hash algorithm or raw-byte compatibility fallback.

## Source authority and observed verification (2026-10-30)

Before freezing documents, the existing source-code-audit records source identity, actual reading, read/write facts, resource owner, user authorization and current delivery duties. Only verified local source explicitly placed in scope by the user becomes implementation work. Remote references, read-only investigation, static bundles and writable directories do not grant control. Investigate real consumers without turning uncontrolled frontend/external repositories or rollout coordination into backend delivery gates, or disguising local required tests as external work. Agents clarify any genuine external dependency affecting an approved business floor and preserve evidence limits.

One actual process may serve several Cases with identical frozen execution context. Existing capture binds its exit, before/after sources, build and target while retaining every Case's assertions; missing/duplicate/failed events cannot borrow old output. Offline measurement diagnostics only inspect observations, never execute or create/promote receipts; contracts do not supply actuals. Unique attempts and original history are retained; current failure remains PARTIAL and historical PASS still requires current applicability.

Owners make actual delegation decisions at startup/integration and isolate or serialize shared files, build results and databases. Subjective context pressure triggers a compact recovery point, not termination of executable authorized work. Preserve original review status and Concerns: Findings None is not absence of risk, and post-review changes require actual re-review. Add no Skill, Hook, scheduling state or default hard budget; the three managed messages remain unchanged.

Applicability has one owner in `.sdd/applicability.yaml`, included in the existing canonical handoff inventory. Native `.openspec.yaml` contains only supported OpenSpec fields, without old-location fallback or duplicate declarations. Readiness and review outputs remain derived receipts, excluded from their own input hash.

## Phase handoff and delivered copies (2026-11-02)

Existing next output identifies the phase skill and verify guard command. Actual verify execution follows implementation; missing/failed checks stay pending. Prefer captured originals and immutable attempts. Retained copies use the existing report Delivery Evidence table to declare source, delivered path and original digest; the same report lint checks both identities and full independent review binds delivered files. Receipts remain the execution authority; copy mappings create no execution verdict. Reviewer inspects the final report and evidence, and Owner runs the final guard after integration. Format/copy repairs reuse valid tests; no new Hook, state or fixed agent scheduling.


## Dependency closure for first verification (2026-11-03)

When existing tasks require early real verification, the necessary observations and capture adapter must be ready with that batch, not simultaneously deferred behind every feature. The document owner repairs the sole order in tasks/tests; handoff navigates and build uses existing capture to close actual assertion observations → adapter → receipt → current report check before expanding. Full regression and final independent review remain after integration. Never reconstruct business actuals from method counts. Add no plan generator, Hook or scheduling state, or replace Owner judgment with mechanical phase rules.
## Execution facts and autonomous decisions (2026-11-03)

The existing verify entry reuses original-plan preflight and capture. Only explicit run executes
the frozen command. Case capture can project actual receipts into the report's single current
ledger, preserving history and original reviews rather than creating another contract or pass
count. Read-only execution-status uses the same receipt validator; recover/next show current facts
and diagnostics without execution or phase promotion. Complete Case evidence is not independent
review or full delivery approval. Owner still decides test sufficiency, ordering and delegation.

Observation reminders must reach the Host's native context protocol; exit-0 stderr records do
not establish model receipt. Keep them advisory and fail-open, without forcing retries or
delegation via blocking exits. Register only Host-supported events through the existing manifest;
do not infer business failures from arbitrary tool text. Retain observability limits when no
structured exit facts exist.

Build sources bind production build inputs; explicit Case plan sources bind execution inputs.
Case receipts/capture validate their union while the embedded build and its fingerprint stay
unchanged. Recapture affected Cases for execution-input changes; changed common production
inputs still invalidate evidence. Case sources cannot supply a missing frozen production chain.
Reuse capture, independent review and report consumers without another receipt protocol,
persistent state or Runner. Agents still check actual selector propagation and assertion sufficiency.

The existing loop observer finds the nearest fixed SDD marker from cwd up to the Git root,
including nested document roots. It counts failures by actual operation identity; unrelated
successful calls do not clear them. Bounded content snapshots observe Shell file changes and
share file buckets with explicit Edit. Bounds limit observer overhead, not Agent commands.
Unknown/over-limit observations are skipped without reconstructing unknown counts on recovery;
explicit single-file edits retain a bounded fallback. Feedback stays advisory, without deciding
business failures, automatically delegating/stopping, or adding a Hook, supervisor or durable state.
Project ownership follows the host's session cwd. A tool workdir distinguishes operation identity
but does not silently switch the session into another subproject. Start in that project's directory
to observe it; SessionEnd cleans up along the same ownership boundary.
