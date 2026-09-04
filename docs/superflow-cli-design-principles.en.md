# Superflow CLI Global Design Principles

This is the highest maintenance contract for Superflow CLI. Read it before changing
the CLI, skills, hooks, scripts, installation, upgrades, or document templates.
Specialized rules may refine this document but never conflict with it.

## 1. Product Position

Superflow does not replace development agents. It freezes requirement sources into
traceable, low-freedom, executable OpenSpec/SDD delivery contracts and provides a
controlled delivery workflow.

## 2. Sources of Truth and Responsibility Layers

Precedence is: confirmed user intent and source requirements, frozen OpenSpec/SDD
documents, repository engineering rules, execution contracts, then run evidence.
Later layers inherit and execute earlier layers; they never redesign frozen choices.

- `proposal/spec/api/design/tasks/tests` own business, implementation, and acceptance design.
- `design.md` freezes reuse points, exact change points, call/data flow, transaction/
  concurrency boundaries, errors, and implementation order.
- `tests.md` freezes environment, fixtures, startup and automation commands, assertions,
  cleanup, and evidence paths.
- Implementation prompts compress and inherit the contract; they do not create a second design.

A complete Superflow task is a low-freedom delivery contract. Generic prompts must not
hard-code business APIs, SQL, databases, frameworks, concurrency, or end-to-end tests.

## 3. Agent Judgment and Script Decisions

Scripts own repeatable, provable, offline-replayable facts: schemas, files, hashes,
state transitions, process identity, exit codes, and structured evidence. Agents own
meaning, architecture, correctness, risk, test sufficiency, and repair priority.

Deterministic high-risk rules cannot live only in prompt context; enforce them through
hooks, preflight, or final gates. Open semantic judgment must not be disguised as regex
validation. Every failed gate explains the fact, repair entry, and recovery path.

## 4. Simplicity, Reuse, and Compatibility

- Search and extend existing modules, skills, scripts, protocols, and tests before
  creating parallel implementations.
- Prefer minimal state. Add no layer, cache, async flow, or compensation merely for
  future flexibility.
- Each concept has one canonical source; installation or generation synchronizes assets.
- Persisted formats and protocols are versioned, backward-compatible, fail-safe,
  recoverable, and auditable.
- Chinese and English docs, skills, prompts, CLI help, and tests stay equivalent.

## 5. Installation and Upgrade Closure

Source install, npm install, and automatic upgrades deploy the same capability closure:
CLI, skills, hooks, scripts, docs, and runtime dependencies. The current version and
runtime must be diagnosable. When restart is required, explain why and what to do.

## 6. Evaluation-Driven Maintenance

Every workflow optimization follows `superflow-cli-evaluation-framework.en.md`: capture
baseline and hypothesis, run a representative smoke or regression scenario, then compare
delivery quality, efficiency, cost, recoverability, human intervention, and compatibility.
Never draw an architecture conclusion from one subjective run, elapsed time, or token count.

Evaluators diagnose auditable facts and never replace Agent semantic code and architecture
review. Put recurring problems in the correct layer: implementation and test omissions in
documents, deterministic failures in script gates, and semantic issues in review checklists.

## 7. Change Process and Definition of Done

1. Read this document, the evaluation framework, and affected specialized rules.
2. Search existing code and record evidence, owner layer, hypothesis, and non-goals.
3. Make the smallest change and keep both languages and affected hosts aligned.
4. Run one representative scenario per independent optimization plus tests, build, lint,
   and design gates.
5. Record before/after metrics, failures, conclusion, residual risk, and rollback condition.
6. If evidence rejects the hypothesis, revert or redesign; never loosen tests or gates.

Done means more than written code: sources of truth agree, responsibilities do not leak,
verification passes, installation is complete, evaluation is explainable, and no regression
remains undeclared.
