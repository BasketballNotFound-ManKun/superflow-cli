# Superflow CLI Global Design Principles

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

The Host owns objectives, clarification, supervision, and review. The Executor
owns coding, startup, testing, and repair. The Runner decides only deterministic
facts and persists state. Never launch a nested Supervisor CLI or replace Agent
semantic judgment with Runner string matching.

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

## 4. Simplicity, Reuse, and Compatibility

- Search and extend existing modules, skills, scripts, protocols, and tests
  before creating parallel implementations.
- Prefer synchronous transactions and minimal state. Add no layer, cache,
  async flow, or compensation merely for future flexibility.
- Each concept has one canonical source; installation or generation synchronizes
  derived assets.
- Persisted formats and protocols are versioned, backward-compatible,
  fail-safe, recoverable, and auditable.
- Codex and Claude differences belong in adapters, not core state.
- Chinese and English docs, skills, prompts, CLI help, and tests stay equivalent.

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
