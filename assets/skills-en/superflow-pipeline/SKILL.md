---
name: superflow-pipeline
description: Use when a user asks for the SuperBridge Flow, SDD, OpenSpec, requirements clarification, contract docs, design docs, implementation prompts, verification, archive, or which SuperBridge Flow phase to run.
---

# SuperBridge Flow Pipeline

When maintaining Superflow CLI itself, first read repository-root
`docs/superflow-cli-design-principles.en.md` and
`docs/superflow-cli-evaluation-framework.en.md`. Identify the owner layer before editing,
then record baseline, hypothesis, scenario, result, and rollback condition.

## Role

This is the main router and stateful workflow orchestrator for SuperBridge Flow.
It combines OpenSpec/SDD and Superpowers without letting them overwrite each
other:

- OpenSpec/SDD owns WHAT: requirements, API contracts, data contracts, specs,
  tests, quality gates, traceability, and acceptance rules.
- Superpowers owns HOW: source-level technical design, TDD strategy, worktree
  execution, implementation planning, reviewer/tester roles, and code-level risk
  discovery.
- Handoff files and state files are the memory boundary. Do not rely on chat
  memory after compaction.

## Managed Work And Dual-Agent Closure

When the user says to use Superflow for managed delivery and provides an
implementation prompt, change directory, or direct task, use built-in managed
mode. Do not require the user to name `superflow-pipeline`, roles, or CLI flags:

```bash
superflow pipeline "<implementation prompt, change directory, or direct task>" --managed --project "<project root>" \
  --supervisor codex --executor claude --language en
```

Swap the roles when Claude is the current entry agent. The command always uses
the independent background service while following the local task journal to a
terminal state, then the current agent reads the report and summarizes in the
same conversation. Losing the follower does not stop the task. Read
`references/managed-work.md` before dispatch. Do not spawn the peer CLI by hand.

Hard gates:

- Persist one supervisor session and one executor session per task; resume exact IDs.
- Task contract, event journal, review results, and evidence are authoritative.
- Maximum 5 reviews, 7 executor calls, and 12 total agent calls.
- Revalidate the frozen contract and hard limits on every start or resume. Engineering work cannot enter review with only one verification category.
- Resolve a change directory through `.sdd/state.yaml` `implementation_prompt`, reject `tasks.md` as an execution entry, and freeze one prompt snapshot plus SHA-256 for both agents.
- Supervisor is read-only; executor cannot edit `.superflow/tasks` or commit/push/publish.
- A passing run stops at `awaiting_git_approval`; Git requires the user's approval.
- Use `superflow status <project-root>` instead of model polling.
- `superflow-managed-work-check.mjs` must pass before delivery-ready status.
- Record the single delivery-ready event only after the integrity script passes.
- After the managed command returns a terminal state, read the task report and summarize it to the user instead of returning only a task ID.
- Freeze the selected language into the task contract. Executor and reviewer prompts, resumed rounds, journals, reports, notifications, and errors must inherit that language without switching mid-run.

## Phase Order

Always route work through this order unless the task is explicitly a tweak or
hotfix:

1. clarify: ingest requirements one feature at a time, freeze scope, and produce
   source-ingestion, feature gates, inventory, UI/API gaps, and freeze review.
2. docs: generate OpenSpec/SDD contract artifacts and the first handoff package.
   Before closing docs, run source-backed requirement review, repair blocking
   findings, resolve all source investigations, owner decisions, and implementation-affecting
   external contracts, then record `requirement-review.md`. Naming or assigning a blocker does
   not close it.
3. design: let Superpowers produce source-level technical design from the frozen
   contract and codebase evidence.
4. implement: generate implementation prompts, execution plans, worktree/port
   strategy, TDD entry points, reviewer/tester checkpoints, and delivery gates.
5. verify: prove the implementation with tests, real-entry evidence, DB/log/API
   checks, hook output, and test-report closure.
6. archive: archive only after verification passes and the user confirms.

## Routing

- When the user explicitly asks for rigorous questioning, or a bounded feature
  has unresolved owner decisions, mutually exclusive approaches, an unclear
  source of truth, unclear acceptance behavior, or cross-system responsibility,
  use `superflow-clarify` in embedded deep-clarification mode. This is a mode
  inside the normal clarify phase, not a separate command the user must remember.
- New or unclear requirement: use superflow-clarify.
- Requirement review, reverse review, omission search, design challenge,
  testability review, or over-design review: use superflow-requirement-review.
- Confirmed requirement needing full docs: use openspec-propose, then
  superflow-docs.
- Contract docs exist and code-level HOW is needed: use superflow-design.
- Technical design and handoff exist, and prompts or execution are needed: use
  superflow-implement.
- Code is ready for evidence-based closure: use superflow-verify.
- Verified change needs lifecycle closure: use superflow-archive.
- Small wording or non-runtime process change: use superflow-tweak.
- Urgent small behavior repair: use superflow-hotfix, unless API, DB, cross-repo,
  status, SQL, SDK, or real-entry gates are involved.

## Embedded Deep Clarification

When the router selects embedded deep clarification, follow these rules inside
`superflow-clarify`:

- Do not activate it for a clear, bounded hotfix or tweak whose intended behavior
  and acceptance result are already evidenced. Do not turn routine work into an
  interview.
- Establish facts from the requirement, repository, configuration, tests, logs,
  or available tools before asking the user. Ask only for a decision the user or
  owner must make.
- Ask exactly one decision question at a time. State the recommended option and
  its important consequence, then wait for the answer before the next question.
- After each answer, update `.sdd/handoff/brainstorm-summary.md` with
  `confirmed`, `candidate`, `pending`, and `rejected` entries. Do not rely on
  chat memory for a resolved decision.
- Do not create or change proposal, spec, design, tasks, tests, or implementation
  artifacts until all decisions that affect the current feature are confirmed or
  explicitly marked blocked.
- Exit deep clarification once only repository-verifiable facts remain and the
  user confirms the current feature understanding. Continue through the existing
  clarify workflow without invoking an external skill dependency.

## Required Artifacts

### Source Fact Freeze And Question Eligibility (Blocking)

- When a full workflow involves existing behavior, DB/table relationships,
  cross-repository impact, or a real entry, docs must include
  `source-code-audit.md` with: `Business conclusion | understand-anything
  locator | Data model | All writers | Real user entry | Current callers |
  Legacy conflict | DB check required | Conclusion level | owner decision`.
- understand-anything is a locator, not the final source of truth. Classify
  evidence as `current`, `legacy`, `unmounted`, `data-model-only`,
  `owner-confirmed`, or `blocked`.
- If `List`, `orderIds`, `batchInsert`, or a one-to-many model conflicts with a
  single-item real entry, complete a Conflict Audit instead of inferring current
  product behavior from the data structure.
- Before asking the user, search source, Mapper/SQL, frontend/mini-program/H5
  callers, sibling repositories, and read-only DB data when needed. Do not turn
  repository-verifiable facts into clarification questions.

### Canonical OpenSpec Change Directory (Blocking)

- Superflow must use the OpenSpec CLI single-level layout:
  `openspec/changes/<change-name>/`.
- The release version belongs in the change name, not an intermediate
  directory. Encode `v1.1.1` as `v1-1-1-<feature-slug>` and never create
  `changes/v1.1.1/<feature-slug>/`.
- Keep exactly one physical directory for each change. Do not create a
  compatibility symlink, copied directory, or second canonical document tree.
- Run `openspec new change <change-name>` first, then reuse that same physical
  directory for status, instructions, strict validation, state, handoff, and
  every Superflow guard.
- If a nested version directory or symlinked change is found, stop document
  generation, migrate it to one flat physical directory, and rerun
  `openspec validate <change-name> --strict`.

For a full change, the docs phase must create or refresh:

- proposal.md
- api.md
- spec.md or specs/<capability>/spec.md
- design.md
- tasks.md
- tests.md
- traceability-matrix.md
- review-checklist.md
- sdd-quality-gate.md
- test-report.md
- source-code-audit.md when the source fact gate is triggered
- .sdd/state.yaml
- .sdd/handoff/sdd-context.md
- .sdd/handoff/sdd-context.json
- .sdd/handoff/sdd-context.sha256

Every embedded change must include .openspec.yaml, api.md, spec.md, design.md,
tasks.md, tests.md, review-checklist.md, and sdd-quality-gate.md. Missing files
block implementation.

## State And Handoff

Before moving phases, run the local scripts from this skill directory:

- scripts/superflow-env.sh
- scripts/superflow-handoff.sh <change-dir> --refresh
- scripts/superflow-state.sh init <change-dir> <phase>
- scripts/superflow-yaml-validate.sh <change-dir>
- scripts/superflow-guard.sh <change-dir> docs|design|implement|verify|archive
- scripts/superflow-archive.sh <change-dir> --dry-run|--apply
- scripts/superflow-status.sh

Rules:

- Never proceed when superflow-guard fails.
- If any SDD/OpenSpec document changes, regenerate handoff and update all stored
  handoff_hash references.
- design.md, sdd-quality-gate.md, implementation prompts, and test-report.md
  must record the same handoff_hash as .sdd/handoff/sdd-context.sha256.
- After context compaction or session handoff, reload .sdd/state.yaml and
  .sdd/handoff/sdd-context.md before acting.

## Decision Points

## Autonomous Document Delivery Closure

A full-workflow docs Agent must not equate a successful keyword/file guard with
100% implementation readiness. Before developer handoff, record at least three
independent review lenses against the same current handoff hash in
`.sdd/reviews/document-review.json`:

1. `source-contract`: source, cross-repo callers, contracts, and real entries;
2. `architecture-minimality`: ownership, reuse, simplest design, failure owner,
   and overdesign;
3. `e2e-environment`: startup order, configured environment, simulators,
   automation, DB/log assertions, and cleanup.

The Agent resolves every source/config/log/probe-discoverable gap itself. Only
business-owner decisions, unavailable credentials/authority, or external
resources may remain in `openOwnerDecisions`, and they are asked as one final
batch. Open findings mean `BLOCKED_FOR_OWNER_BATCH`, never 100%.

Explore the configured environment during docs and record
`.sdd/readiness/environment.json`. Only fail-safe `file`, `directory`,
`executable`, `tcp`, and `http` probes are allowed. Never print credentials or
write production data. Respect the declared local/dev/test scope instead of
requiring a remote environment by default. Use
`superflow.environment-readiness.v2` to freeze the application location,
`local-isolated/shared-dev/shared-test/mixed` dependency policy, config sources,
allowed/forbidden overrides, and a `contractRef` for every probe. Reachability
alone is not an environment execution contract.

Cross-service, cross-repo, device, MQ, callback, scheduler, state-machine,
compensation, or three-plus-module logic declares `complex_logic: true` or
`mermaid: required` in `.openspec.yaml` and includes both a Mermaid
`sequenceDiagram` and a `flowchart`/`stateDiagram` showing failure exits,
compensation owner, and forbidden fallback.

Run `superflow check <change> --level coding-ready` after all prompts are ready.
It validates YAML, OpenSpec, docs/design/implement, every prompt and exact link,
review receipts, environment probes, and Mermaid diagrams, then writes a receipt
bound to the current handoff hash. Never delegate a failed implement gate to the
developer Agent.

## Cross-System Failure Ownership And Compensation Boundary

Record `Failure signal | Interpreter | Compensation owner | Retry allowed? |
Idempotency basis | Accepted race window | Extreme fallback | Owner approval`.
When the caller receives an explicit failure and owns refund/cancel/state
compensation, the downstream adapter defaults to `Fail-fast + Fail-closed +
At-most-once + Caller-owned compensation`: no transparent retry, reroute,
resend, or guessed success. Accept a bounded false-negative window when duplicate
side effects are more harmful. Additional fallback requires explicit owner
approval and a proven idempotency basis, collected with other owner-only
questions in one final batch.

Record irreversible or ambiguous decisions in references/decision-point.md
format. Do not store decisions only in chat memory.

Decision points include:

- API compatibility choices
- field semantic uncertainty
- fallback or default behavior approval
- cross-repo ownership boundaries
- SQL migration strategy
- real-entry test blockers
- archive confirmation

## Quality Gates

The machine-readable review, environment, Mermaid, and Coding Ready contracts
are defined in `references/document-readiness.md`.

The workflow must preserve these gates:

- API-first contract freeze before implementation.
- Requirements are processed feature by feature, not as one giant prompt.
- Traceability from requirement to design, task, test, prompt, and report.
- No fallback or guesswork unless explicitly approved with owner, exposure, and
  removal rules.
- Field/status reverse impact analysis for IDs, statuses, enums, payment,
  online/offline, sync markers, external state, or persisted behavior.
- Money Precision Boundary for monetary calculation, settlement, allocation,
  reconciliation, or financial display. Preserve calculation-state precision
  until the confirmed final boundary, forbid early rounding, define scale and
  rounding mode plus deterministic residual handling, and require half-cent or
  multi-detail reconciliation evidence across design, prompts, review, tests,
  and verify. When an additive identity has an authoritative total, calculate
  only N-1 components independently and derive the final complement as
  `authoritative total - sum(other components)`; never round every component
  independently and rebuild the authoritative total.
- Architecture boundary and call-direction analysis for multi-repo, service,
  SDK, MQ, scheduler, callback, gateway, adapter, device, or third-party flows.
- SQL risk review before implementation for DB changes.
- Frozen release SQL before source design for DB changes. `release-sql.md` must
  declare `database_change: true`, an exact placeholder-free
  `target_sql_path`, `copy_policy: verbatim`, and the normalized SQL payload
  `sql_sha256`, with exactly one complete executable SQL block containing the
  required prechecks, DDL/DML, migration, and post-verification. Implementation
  agents may only copy the block verbatim and verify the hash; any SQL design
  omission returns to docs and requires a refreshed handoff.
- Real-entry acceptance for integration, device, callback, payment, client, or
  cross-system flows. Mock-only is never real integration.
- Delivery completeness: runtime code changes must update the relevant task
  docs and evidence docs.

## Implementation Prompt Requirements

Implementation prompts must require:

- required reading list with handoff, api.md, design.md, tests.md,
  review-checklist.md, sdd-quality-gate.md, and technical_design when present;
- inherited handoff_hash and instructions to refresh handoff after SDD doc edits;
- Superpowers technical design inheritance;
- TDD red-green entry points;
- exact allowed and forbidden file boundaries;
- worktree and port plan for parallel work;
- real-entry validation commands from tests.md;
- DB SELECT or SHOW CREATE checks when persisted state is touched;
- `release-sql.md`, its exact target path, verbatim-copy rule, and SHA-256 when
  the change touches schema or data migration; prompts must never ask an
  implementation agent to author or append SQL;
- log checks and error checks;
- superflow-verify-integration and superflow-delivery-check before completion;
- a report format that distinguishes Passed, Partially verified, and Blocked.

## References

Use the reference files in this skill directory as templates:

- references/feature-gated-workflow.md
- references/api-design-template.md
- references/openspec-format.md
- references/document-templates.md
- references/quality-standards.md
- references/quality-gate.md
- references/traceability-matrix.md
- references/mock-strategy-guide.md
- references/test-execution-template.md
- references/test-guide.md
- references/validation-integrity.md
- references/batch-split-guide.md
- references/batch-prompt-template.md
- references/orchestration.md
- references/sql-risk-review-checklist.md
- references/project-config.md
- references/decision-point.md
- references/dirty-worktree.md
- references/subagent-progress.md
- references/superpower-technical-design-template.md
- references/money-precision-algorithms.md
