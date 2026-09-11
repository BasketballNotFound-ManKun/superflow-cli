# Superflow Managed Work Design Principles

## Status

This document is the long-term design constitution for Superflow managed work.
Every change to prompts, hooks, scripts, MCP, protocols, or the state machine
must be reviewed against it. Practice reports provide evidence; this document
defines the invariants.

The objective is not frequent Agent conversation. It is a recoverable,
auditable, low-intervention workflow that automates the former manual pattern:
one development Agent delivers continuously, and one expensive Host Agent
independently reviews quality.

## Core principles

1. The Host is the architect and independent reviewer, not a second developer.
2. The Executor is the only product writer and owns implementation, tests,
   startup, real calls, and cleanup.
3. The Runner is a deterministic state machine, not a third Agent.
4. Scripts decide repeatable facts; Agents decide context, risk, and semantics.
5. One Executor invocation completes one coherent work batch without max-turn
   fragmentation.
6. Valid evidence survives across rounds; a repair reruns only affected gates.
7. Supervision combines local sampling with an active wait. Runner samples
   without model calls. An active MCP wait exposes stages and healthy checkpoints
   through standard MCP progress notifications without completing the wait or
   waking the Host model. Only review, failure, or two consecutive checkpoints
   without an effective milestone return to Host; CLI blocking wait is the fallback.
8. Recovery, credit, promotion, and human decisions always leave audit events.
9. Runner first normalizes structured-output syntax locally or escalates to Host;
   never launch a full Executor invocation merely to repair JSON. Blank
   `blockers`, `releasePrerequisites`, and `evidence` are deterministic cleanup.
   Only when an entire call yields no parseable delivery JSON and the Host cannot
   safely review from the fact source may Runner preserve raw logs and queue
   **one** fresh, condensed delivery-recovery session. It inherits handoff and
   historical evidence, performs only remaining affected work, and a second
   same-class failure must stop for human attention.
   It deterministically removes blank `blockers`, `releasePrerequisites`, and
   `evidence`. A read-only inspection with exit 1/2 and an explicit no-process,
   listener, container, or residue result is accepted without an Agent call.
10. Stage events represent real work. Recovery continues from the affected
    stage instead of resetting every fresh session to source discovery.
11. Control-plane start is atomic from the caller's perspective and safely
    retryable; a failed start cannot persist a ghost task while returning failure.

Entry and asset protection follow these additional long-term principles:

- Managed work accepts two normalized execution entries: a Coding-Ready frozen
  change/prompt, or a verbal task that the Host has judged bounded. Docs-only
  mode creates no managed Task/Run. A directional choice in a verbal task
  returns to clarification/documents first. All three user entries reuse one
  input resolver, execution contract, and context manifest rather than a
  parallel state machine.
- Runner derives protected assets from frozen inputs. Immutable requirements,
  designs, prompts, handoffs, rules, and task facts are read-only; retained
  tasks/test reports may record progress but cannot be deleted. Native hooks
  block before mutation, while preflight/final gates verify every Host.
- Cleanup separates `runtime`, `workspace-temporary`, `delivery-artifacts`, and
  `protected-contracts`. Executor cleans the first two and retains the latter
  two for Host review. Post-terminal exercise cleanup is a separate, audited
  action rather than part of a development delivery round.
- Every new `task_file`/`sdd` managed task requires a Host-frozen structured
  acceptance contract at start: business invariants, precise source coverage
  (repository-relative paths that exist at start), deliverables, verification,
  and exclusions. Runner includes it in the task-contract hash, persists immutable
  `acceptance-contract.json/md`, and adds it to the context manifest. Missing
  fields, absent targets, snapshot/hash drift, or incomplete first-review coverage
  fail closed. Persisted legacy tasks may resume, but must not claim this start rule.
- The first Host review covers every frozen contract item and every source scope.
  `acceptanceCoverage.reviewed` records complete coverage, and every finding's
  `acceptanceContractRefs` points to relevant items. Runner/final scripts validate
  structure, hashes, paths, and coverage records without replacing Host source
  semantics.

When a direct `engineering` or `sdd` entry has no user implementation prompt,
Runner first persists and freezes a standard execution contract: source/reuse
discovery, task-owned resources, acceptance, cleanup, and direction-changing
choices returning to Host. An empty prompt or generic E01–E04 list must not
send the Executor off to design on its own. This contract carries no business
implementation design and preserves the boundary that documents define HOW
while managed work inherits it. 12. The global registry is only a locator index; one stale or missing workspace
must not break listing or healthy tasks. 13. The MCP process exposes its startup runtime fingerprint. If installed files
change, the stale process fails closed before task creation and cannot validate
the new version. 14. Verbose build/runtime logs go to task evidence files. The Agent tool channel
emits bounded stage summaries and failure tails, never unbounded DEBUG output. 15. Raw Agent logs remain complete but rotate into fixed-size parts. Returning
from a late stage to implementation or tests emits `executor.stage_rework`.
`executorStage` remains the monotonic reached milestone, while
`executorActiveStage` records the current stage and may move backward. CLI
and MCP expose both instead of presenting an old milestone as current work. 16. Repeated installation overwrites Superflow Skills instead of continuously
creating backups; historical backups require explicit user cleanup. 17. Detailed logs cited at handoff remain readable after normal cleanup removes
nonce/runtime directories. Escalating a signal after waiting revalidates owner
identity instead of reusing a PID checked only before the wait. 18. Hard-invocation and stalled-output clocks count machine-active time only;
system sleep consumes no execution budget. Late progress or telemetry cannot
overwrite persisted state after completion, timeout, or human escalation. 19. On macOS, Runner holds `caffeinate -im` while a local Agent process runs so
screen lock or idle time does not suspend it. Explicit sleep and lid-close
sleep may still pause the machine and must resume from persisted state. 20. After a Host restart, plain `--resume-task` for a persisted `running` task is
safe attach-and-wait only: it cannot reset state, rewrite budgets, or launch a
duplicate. Safe recovery starts only when Runner confirms that the recorded
Executor PID is dead. A missing PID fails closed into attach-and-wait, and
offline downtime does not count as active runtime. 21. An unavailable third-party enhancement plugin or removed marketplace entry
must warn without blocking core CLI, MCP, protocol, and skill deployment. The
Codex Superpowers `verification-before-completion`, `requesting-code-review`,
and `finishing-a-development-branch` skills are hard dependencies of
Superflow verify: Codex or Claude Superpowers installation during initialization
or package-enabled update must fail closed. `doctor` must check the three Codex
skills individually rather than treating a cache or plugin directory as healthy,
and installation must tell the user to restart the current Host so new sessions
load them. Failures of other core dependencies such as OpenSpec also block
installation. 22. A Run is identified only by a `run-*` directory together with its
`run-state.json`; mistaken evidence directories, archives, and unrelated
subdirectories never count as active Runs. Historical evidence inherits only
commands valid under the current protocol, so invalid negative commands cannot
contaminate the next structured result. 23. Activity is not progress. Heartbeats, repeated reads, unchanged diff stats,
and workspace.changed are raw activity; stage advances, first-time authoritative
command completions, real acceptance outcomes, and structured delivery are
effective milestones. Runner emits a compact checkpoint every 10 minutes.
Healthy checkpoints use MCP progress notifications only; two consecutive
checkpoints without an effective milestone return `attentionRequired` to Host. 24. Executor cannot downgrade task categories or real acceptance levels frozen by
the contract. A successful command that also reports HTTP 4xx/5xx, an expected
failure, or a substitute backend fails closed; checked documentation never
overrides raw evidence. 25. Verification has three fixed levels: change-scoped checks, task-level real
acceptance, and framework certification. A normal business task must not rerun
the complete disaster certification of the shared Superflow owner helper; a
repair first decides which historical evidence the current diff invalidates. 26. One-command source installation includes CLI, Skills/Hooks, and managed MCP
registration for the Codex/Claude Hosts actually present. MCP
registration is not a hidden manual post-step, and a single or non-default
Host combination must not fail because the installer blindly selects `both`.
Homebrew Node registration uses its stable `bin/node` entry instead of a
Cellar version path that disappears after upgrades. 27. Explicit update and Hook auto-apply share one complete deployment closure.
After package upgrade, the newly installed CLI redeploys Skills, Hooks, rules,
scripts, and managed MCP. An old process never reports success after package-only
work. Partial failure or inability to confirm the registry's latest version
preserves retry eligibility and reports the log instead of stamping success. 28. A long Claude Executor session does not rely only on the model's maximum
context window. Runner sets official Claude Code auto-compaction defaults
early and persists Compact Instructions in the system policy, while explicit
user values win. Final `result.usage` is authoritative for the invocation;
large input usage is not blamed on Runner summation without evidence. Host
waits use a compatible 240-second transport window, while capable Hosts may
explicitly request up to twelve hours. Transport expiry continues from
`latestSequence` without full status reads or Executor restart. 29. Runner selects project rules from repository technology, task semantics, and
the execution profile. General, security, and safely unclassified rules always
remain; rules clearly owned by an unrelated stack are excluded. Codex, Claude,
rule directories share one selector. Selected scenarios and exact
files are frozen in the Handoff so the Agent does not repeat a full rule search. 30. The Executor system policy has a stable prefix and a task-context tail. Role,
safety, verification, and cleanup rules form a byte-stable cross-task prefix
with a recorded SHA-256. Paths, stack, toolchain, Handoff, and recovery hints
appear only in the tail. Cache reuse is an observed benefit, not a correctness
dependency. 31. One execution context manifest carries authoritative requirement, design,
task, test, and rule documents. It stores only role, absolute path, and
SHA-256, never copied source content. Runner validates every hash before an
invocation and writes the manifest into the Handoff. Drift fails closed; the
Executor never rebuilds context from chat history or repeated full documents. 32. Before Host review, Runner writes a compact fact packet covering changed paths,
task counts, command exit codes, verification categories, and evidence hashes.
Host reads it first and then performs independent semantic source review. The
packet never claims correctness, test sufficiency, or design quality, and never
justifies skipping the real diff or raw evidence. It provides both cumulative
task changes and changes since the previous Host review; the latter narrows
repair-review scope while the former preserves traceability. 33. Managed entry creates `minimal`, `standard`, or `full` execution contracts from
artifact maturity. Existing Superflow/OpenSpec prompts use canonical tasks;
normal engineering requests add implementation and verification tasks, while
application, API, database, browser, or container work also adds real acceptance
and cleanup tasks; even a small request has implementation and affected-check
tasks. A minimal machine plan never pretends to be business clarification, and
no entry starts development with an empty task list. 34. Review repair is governed by both a hard cap and a convergence gate. Repair may
continue while existing blockers are being closed. Two consecutive review
transitions that close no previous blocker move the run to `repair_pending`
with evidence preserved. After a user raises executor or review budget with an
audit reason, `repair_pending` must safely resume only when capacity is available;
otherwise it remains fail-closed. Newly added findings never count as convergence. 35. Before first execution, managed work freezes each repository's stable identity,
worktree, and branch, then revalidates them on recovery. A different branch,
repository, or worktree fails closed. Non-Git workspaces use Runner filesystem
snapshots as change facts; Executors never initialize Git for diff, preflight, or
delivery, and becoming a Git repository during execution also fails closed. The task directory also stores a relative
locator; the global registry accelerates lookup but is never the sole recovery
source of truth. 36. `superflow doctor` directly probes Codex and Claude versions,
Superflow MCP registration, and the current server path. Invalid configuration
becomes an actionable diagnostic instead of crashing Doctor, and CLI discovery
never depends on the Unix-only `which` command. 37. Agent launch on Windows resolves `.exe/.cmd/.bat` shims through PATH and
PATHEXT without enabling a general-purpose shell. Interruption, timeout,
pause, and runtime replacement stop the task's complete process tree:
`taskkill /T /F` on Windows and the detached process group on Unix. Killing
only the parent PID and leaving children behind is forbidden. 38. Managed orchestration stays lightweight and owns only dual-Agent dispatch,
frozen context, state, waiting, evidence, review loops, and delivery gates.
Business API, database, concurrency, transaction, and test design belongs to
OpenSpec/SDD `api.md`, `design.md`, `tests.md`, and source-level technical
design. Executor prompts inherit rather than redesign. Oral simple requests
may run directly, but decisions that change implementation direction return
to the Host for clarification.
A complete Superflow task is a low-freedom delivery contract: `design.md` and
source-level technical design specify reuse, change points, call paths, data
writes, transaction/concurrency boundaries, error handling, and implementation
order; `tests.md` specifies environment, data, startup commands, steps,
automation commands, response/database/log assertions, and evidence paths.
The Executor follows these frozen contracts and never selects an alternative
implementation or test design. A direct standard contract may require runtime
acceptance portability, representative-failure cleanup, and no broad startup
substitutes; an explicit concurrency request may require a deterministic
non-5xx conflict and exactly-once durable state transition, but never invents
a concrete API, database, or implementation approach. 39. A Host-native persistent goal may wrap one Superflow Task/Run. The goal keeps
the Host supervising until delivery or a real blocker; Superflow owns the
Executor, review, evidence, and state machine. The goal never duplicates
Task/Run state, launches a nested supervisor CLI, bypasses Git/environment
approval, or replaces the event journal. Hosts without a goal feature use
MCP wait and complete the same workflow. 40. When the background MCP/Runner launches a development Agent, it must supplement
operating-system standard executable directories instead of assuming a GUI,
login item, or non-interactive process inherited an interactive-shell PATH. Only
standard system/package-manager directories are allowed: never inject a user's
home directory, private shim, or personal absolute tool path. A missing CLI must
fail diagnostically before consuming a development invocation, not after
`command not found`.

## Ownership

| Role           | Owns                                                                                                         | Must not                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Host Agent     | Frozen goal, progress supervision, independent review, complete findings, quality decision                   | Modify product source; operate Executor applications, databases, tests, or processes; demand environment reruns for metadata |
| Executor Agent | Reuse search, code, tests, build, startup, HTTP/browser E2E, temporary data and process cleanup, test report | Edit `.superflow` state; commit/push/deploy; exceed disclosure scope; delegate cleanup to Host                               |
| Runner         | Contract, budget, state, hashes, events, evidence merge, deterministic gates, waits, recovery                | Judge business design, code correctness, test sufficiency, or whether a suspected credential is real                         |
| User           | External-model disclosure, risky environment operations, Git/release, product decisions                      | Participate in ordinary implementation, testing, or mechanical recovery                                                      |

Each capability has exactly one owner. Host and Executor never both write source;
Runner and Agents never both own the final meaning of the same state field.

## Script-versus-Agent decision matrix

| Question                                                                               | Decider       | Transition                                                                                                                                |
| -------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| JSON Schema, hashes, files, budget, state, call counts                                 | Runner        | Continue or fail closed deterministically                                                                                                 |
| changedFiles, task checkboxes, line width, whitespace, explicit exits                  | Runner        | Executor runs preflight before delivery; Runner reruns the same gate before `ready_for_review`, then repairs in the same Executor session |
| Explicit negative exit 1/2                                                             | Runner        | Only inspection commands qualify; build/test failures never do                                                                            |
| Historical command deduplication, categories, evidence merge                           | Runner        | Automatic, with no Agent invocation                                                                                                       |
| Startup, real invocation, and raw evidence are complete but only a category is missing | Runner + Host | Runner marks verification-category ambiguity and escalates directly; Host may approve an audited promotion without restarting Executor    |
| Correctness, reuse, transactions, concurrency, security, performance                   | Host          | Requires source and risk understanding                                                                                                    |
| Requirement coverage and continued applicability of old evidence                       | Host          | Semantic judgment over deterministic facts                                                                                                |
| Suspected credentials or ambiguous evidence                                            | Host          | Script reports location and escalates once                                                                                                |
| Code, startup, HTTP/browser, DB work, cleanup                                          | Executor      | Development execution; Host only inspects                                                                                                 |
| Recoverable JSON escaping, trailing delimiters, derived fields                         | Runner        | Preserve raw output and normalize deterministically; escalate once instead of opening a development round                                 |
| Entire call has no parseable delivery JSON                                               | Runner + Executor | Preserve raw logs; allow one short recovery session using handoff/current workspace, then stop for human attention on a second failure without rerunning unrelated E2E |
| Raw non-zero commands from expected-failure or fault-injection checks                  | Runner + Host | Exclude them from success evidence and escalate directly; never restart Executor merely to rewrite JSON                                   |

Rule of thumb: if identical input must always produce the same answer, use a
script. If the question asks whether something is reasonable, sufficient,
applicable, or suspicious, use an Agent.

## Stable dual-Agent JSON protocol

Agents communicate through Runner-managed JSON, not fragile chat history.
Markdown is a human projection; JSON is the machine source of truth. Protocol
changes require backward compatibility or explicit migration.

### Executor handoff: `superflow.handoff.v2`

It contains Task/Run/invocation/language, frozen prompt and SHA-256, changedFiles,
diff stat, local/external progress, every finding, recent user guidance, physical
and effective calls, credits, tokens, exact rule files, and the deterministic
preflight command. A fresh session reads the handoff first and never guesses with
`--last`, `--continue`, or model memory.

### Executor delivery: `superflow.executor.v2`

```json
{
  "protocolVersion": "superflow.executor.v2",
  "messageType": "executor_delivery",
  "status": "ready_for_review",
  "summary": "Implementation and verification summary",
  "commands": [
    {
      "command": "mvn test",
      "exitCode": 0,
      "result": "12/12 passed",
      "categories": ["test"],
      "assertion": "positive"
    },
    {
      "command": "lsof -iTCP:20062 -sTCP:LISTEN",
      "exitCode": 1,
      "result": "No listener; cleanup passed",
      "categories": ["runtime"],
      "assertion": "negative"
    }
  ],
  "evidence": ["openspec/changes/demo/test-report.md"],
  "releasePrerequisites": [],
  "blockers": []
}
```

Only successful gates and explicit negative assertions belong in `commands`.
Negative assertions are restricted to inspection tools. Runner derives
changedFiles, categories, and baseline task evidence and inherits valid history;
no Executor round exists merely to duplicate JSON.
Expected-failure and fault-injection checks use a parent acceptance command that
asserts the child failed and then exits 0. The raw child failure stays in logs.
Invalid negative evidence goes directly to Host for raw-log judgment instead of
launching a full Executor to delete or rewrite JSON.

Runner may normalize only exit 1/2, constrained inspection commands (such as
`ls ... | grep`), and an explicit no-match/no-residue result into absence
evidence. It must not use regexes to decide business correctness, whether input
reached a real branch, or whether resource deletion is safe. The first two belong
to document contracts and Host semantic review; the last is protected jointly by
the owner-identity contract and Host review.

### Host review: `superflow.review.v2`

```json
{
  "protocolVersion": "superflow.review.v2",
  "messageType": "host_review",
  "result": "needs_fix",
  "summary": "Complete review summary",
  "findings": [
    {
      "id": "R1-001",
      "severity": "high",
      "blocking": true,
      "category": "correctness",
      "target": "Exact file or contract",
      "evidence": "Reproducible fact",
      "risk": "Concrete risk",
      "requiredFix": "Precise correction",
      "acceptanceChecks": ["Executable check"]
    }
  ],
  "verificationCommands": []
}
```

The Host completes a full sweep and returns all material findings in one round.
When raw evidence proves delivery and only metadata is invalid, the Host passes
and Runner promotes with an audit event rather than calling Executor to rewrite
JSON.

## State, notification, and stages

Runner alone writes state and the append-only hash-chained journal. Executor
delivery wakes Host through `waiting_for_host_review`; Host submission resumes
Executor or final gates. Ordinary heartbeat never wakes Host. Stage changes are
visible progress but do not invoke another Agent. During an active MCP request,
standard progress notifications expose stages and healthy checkpoints; they are
request-scoped, not autonomous callbacks after the Host turn ends. Two consecutive
checkpoints without stage advance or authoritative command completion create an
attention event and complete the wait for Host judgment. A single healthy or idle
checkpoint never consumes a new Host model turn.

Stages advance from real tool activity or delivery evidence. A repair inherits
the latest valid stage and only moves back to the stage affected by its finding;
a fresh session must not automatically display `source_discovery`.

```text
source_discovery → implementation → unit_test → package
→ application_startup → http_e2e → cleanup → delivery_self_check
```

Only one effective `run.delivery_ready` exists unless paired with an audited
reopen. `release_ready` never grants Git, deployment, or production-write rights.

## Control-plane atomicity and registry fault isolation

- `superflow_managed_start` completes the background-runtime handshake before
  persisting Task, Run, or registry state. A failed handshake creates none of them.
- CLI `pipeline --managed` has the same atomic contract: runtime handshake first,
  and any Task/Run/registry persistence failure rolls back the new project task.
- A retry with the same project, frozen request, agents, profile, related roots,
  and mandatory rules returns the existing non-terminal Task instead of creating
  a duplicate. The same request may start a new Task after a delivery terminal.
- Plain `pipeline --resume-task` for a healthy running task is read-only safe
  attach: status, active timing, Executor PID, and budgets remain unchanged while
  waiting continues. Budget, session, or provider mutation flags are rejected;
  only a recorded PID proven dead enters stale-process recovery.
- MCP metadata marks managed start as idempotent so the Host can retry after a
  timeout or lost response.
- Registry entries are locators, not task truth. Listing isolates missing,
  corrupt, or deleted workspaces per entry and keeps returning healthy tasks.
- The Runner never makes the Host guess whether a lifecycle error happened before
  or after persistence; deterministic outcomes and persisted state stay aligned.

## Evidence

- Every persisted value readable by Host, MCP, or task reports (raw logs,
  streamed progress, delivery JSON, event journals, fact packs, and state
  snapshots) must pass through one redactor **before its first write**.
  Display-only redaction is not an acceptable substitute.
- When history contains a secret, redact it consistently, rebuild the journal
  hash chain, and leave a non-sensitive migration audit. Never alter a single
  event while retaining a misleading integrity hash.
- Runner derives files, categories, task evidence, and effective call counts.
- Repository files, `AGENTS.md`, the frozen prompt, and mandatory engineering
  rules supplied by the Host session are merged into task policy before
  execution. Deterministic rules enter preflight; semantic-only rules remain
  explicit Host checks. Preflight never claims coverage for a rule it did not
  load.
- Valid commands enter historical evidence; failed commands never do.
- Host decides whether history remains applicable to the current diff.
- Formatting-only repairs reuse startup/HTTP/DB evidence; changes to runtime,
  configuration, authentication, or SQL require the affected real chain again.
- Test reports match actual commands, exits, and counts and never claim false
  green results.
- Immutable contract-hash projection has one source of truth. When runtimes
  cannot share it directly, parity tests cover every optional field. A new
  contract field never updates the Runner while omitting a script gate.
- Real-environment tasks freeze a repository-owned, one-command, repeatable,
  failure-safe, portable acceptance entry in the first prompt. Setup,
  verification, and cleanup never rely on undocumented Agent steps.
- Mandatory rules never rely on prompt context alone. Every new or strengthened
  long-term rule records its enforcement level: deterministic facts move into a
  hook, preflight, or final gate; semantic rules enter the Host checklist; rules
  needing both use both. Script gates provide actionable failures and positive
  and negative tests, and never use keyword regexes as a substitute for business
  judgment.
- When a hook or final gate finds an evidence-format violation while the
  workspace may already be complete, it preserves raw evidence and escalates to
  Host. Deterministic gates prevent invalid promotion; they do not turn JSON
  cleanup or removal of auxiliary failure records into a development invocation.
- Offline managed evaluation derives a verdict, reasons, and next actions from
  persisted events, usage, review findings, terminal state, and Runner-confirmed
  project acceptance reports while retaining the raw metrics. A project report is
  eligible only when authoritative changedFiles in `review-facts-*.json` references
  an in-root `*report.md`; it never scans source, escapes the project root, or
  trusts invalid Agent delivery metadata. It diagnoses workflow facts such as fragmented invocations,
  first-review pass rate, repair convergence, waiting ratio, human intervention,
  provider credits, delivery evidence, and status-recorded Host, connectivity, and
  user-control waits. Time without an attributable state remains explicitly
  unattributed; it must not be guessed as Agent idle or system sleep. It never
  replaces Host semantic review of code, concurrency, transactions, or business
  correctness. Every rule remains explainable, offline-replayable, and available
  in Chinese and English.

## Three verification levels

| Level                      | Applies to                                                                                                   | Minimum scope                                                                                                                                                                   | Explicitly excluded                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Change-scoped checks       | Every repair; non-runtime quick/monitor work                                                                 | Map each finding and current diff to invalidated evidence, then rerun only affected build, test, or contract checks                                                             | Report, evidence-format, or isolated-test changes do not rerun unrelated startup, HTTP, or database chains |
| Task-level real acceptance | Engineering/SDD by default; application, API, database, browser, or cross-repository contracts               | Business success path, named real backend, task owner binding, one representative failure after major resources exist, each business deletion condition, and final zero residue | Do not rerun shared-helper non-owner, PID-reuse, forged-state, and every-signal disaster suites            |
| Framework certification    | Explicit frozen prompt; Superflow owner-helper/managed-orchestration changes; a new custom cleanup primitive | Non-owner, PID reuse, forged/stale state, partial setup, assertion failure, SIGINT/SIGTERM, signal escalation, and false-green cleanup                                          | Must not rerun for every normal business task                                                              |

The frozen prompt may raise a level but never silently lower it. Task-level real
acceptance still runs every requirement-specific Spring Boot startup, real HTTP,
MySQL/Testcontainers, browser E2E, or cross-repository contract check. The levels
remove duplicated framework self-certification, not business acceptance.

A repair first builds a change-to-invalidated-evidence map. Production runtime
logic, SQL, configuration, authorization, public contracts, or an acceptance-entry
change invalidates the corresponding real chain. Documentation, evidence schema,
log formatting, or an isolated test change does not automatically invalidate
historical evidence. An explicit finding `acceptanceChecks` still overrides reuse.
Multi-repository work verifies every affected repository's build/runtime contract
and the real cross-repository path when the requirement spans services. Evidence
from one repository never substitutes for another.

Shared owner-helper certification is bound to its content and installed runtime
fingerprint. A helper or managed-orchestration change runs framework certification
inside Superflow, while the MCP fingerprint gate rejects a stale process after
installation changes. A normal business task checks the current helper source,
task arguments, one representative failure, and zero residue. It creates neither
a certificate state machine nor an assumption that helper certification proves a
business table, key, or container is safe to delete.

## Cost and recovery

For a normal real-runtime task, the first Host review checks task owner binding,
deletion gates, one representative setup/assertion failure cleanup, and final
zero residue together. PID reuse, non-owner, forged-state, and every-signal
disaster paths belong only to framework certification. Runner supplies facts and
does not claim semantic safety using keyword regular expressions.

Every Host review records real `hostUsage` or an explicit reason why the Host
cannot expose usage. Null means unknown and is never reported as zero cost.

Runner provides a directly reusable deterministic owner template for PID, lstart,
process signature, listener, Docker task/nonce/name, and runtime-marker checks.
Acceptance entries call it through a configurable path instead of copying its
functions into parallel destructive paths. A task wrapper that only binds nonce,
signature, port, and resource names is not custom cleanup. Reimplementing identity,
kill/delete behavior, or bypassing the template is custom cleanup and raises the
task to framework certification. Anonymous container volumes require `rm -v` plus
verification by actual volume ID. The template does not decide business deletion
safety; Executor retains task-specific checks and Host retains semantic review.

- Always display physical calls, infrastructure credits, effective Executor
  calls, and Host rounds separately.
- All network and model-connectivity failures share one consecutive counter and
  stop after three physical attempts. Confirmed transient 429/529/overloaded
  provider failures and pre-Agent-result connection refused/reset/close failures
  are credited; permission, quota, billing, and token-plan failures are not, but
  all connectivity failures still open the circuit on the third failure.
  HTTP/provider status codes require standalone token boundaries, so a UUID, path,
  or ordinary text containing `503` cannot become a connectivity failure. Only a complete Agent response resets the counter; waiting or starting another session does not.
- `--provider-switched <reason>` preserves audit and credits, resets provider
  failures, creates a fresh Executor session, and resumes the same Task/Run.
- Normal development has no max-turn or inaccurate provider-dollar cutoff.
- The token circuit counts Executor output tokens only. Repeated input context
  and cache reads are not new development work; invocation, hard-timeout,
  permission, and provider circuits remain the safety controls.
- `maxExecutorTokenUnits` means cumulative output tokens. Missing output or
  provider cost remains `null`/unknown and must not be displayed, compared, or
  used as proof of a real zero or an unexhausted circuit. A cost circuit compares
  only known, trustworthy cost.
- Only an actively resumed native Executor session with a deterministically
  classified missing, invalid, or resume-context-limit failure is retired. Runner
  preserves its ID, reason, time, handoff, and valid evidence, then queues exactly
  one fresh session. A second matching failure goes to Host; ordinary repair stays
  a fresh short session and max-turn remains the sole normal same-session path.
- Claude Executors default to a 200K auto-compaction window at 70 percent so a
  1M model does not carry ever-growing context through hundreds of tool turns.
  Explicit `CLAUDE_CODE_AUTO_COMPACT_WINDOW` and
  `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` values win. After compaction, the Executor
  reloads the frozen prompt and handoff.
- Runner samples process and state locally every 10–30 seconds without model calls.
  An active MCP wait emits healthy checkpoints through standard progress
  notifications and does not return Host. Only two consecutive checkpoints
  without an effective milestone return attention. Thirty-second model polling,
  full-log reads, and full Prompt rewrites at checkpoints are forbidden.
- MCP defaults to a 240-second wait for Hosts with a known 300-second tool-call
  ceiling. Window expiry is transport continuation, not attention, task timeout,
  or model failure. Host immediately waits again from returned `latestSequence`
  without status or full-event reads. Hosts that support longer calls may still
  request up to twelve hours.
- Review, provider failure, permission blocking, and hard deadlines wake Host
  immediately instead of waiting for the next checkpoint.
- A new Executor invocation requires a real finding, abnormal recovery, or
  provider failure—not formatting or duplicated evidence.

## Safety and resource ownership

External-model source disclosure requires explicit task-scoped authorization.
Authorization never silently carries to another task. Git, deployment,
production writes, and risky DB actions stay separately authorized. Credentials
are runtime-only and never enter source, reports, structured output, or summaries.
Executor cleans every uniquely named temporary table, token, application, and
helper process it creates. Host neither reads unauthorized credentials nor
performs Executor-owned environment writes.

## Forbidden regressions

- Nested Host CLIs and left-hand/right-hand orchestration loops.
- Host writing product source or cleaning Executor processes.
- Runner regex deciding business correctness or design quality.
- Executor returning after every small step.
- Agent calls dedicated to changedFiles, taskEvidence, or JSON formatting that
  Runner can repair locally.
- Treating JSON parse failure as business repair or asking Executor to duplicate
  commands and evidence already preserved by Runner. The sole exception is one
  short delivery-recovery session when an entire call has no parseable delivery
  JSON; it must not rerun already valid real acceptance.
- Repeating startup/DB/E2E for a metadata-only repair.
- Rerunning the shared owner helper's full framework certification for every
  business task, or copying the helper to rebuild a cleanup framework.
- Displaying physical calls as effective development calls.
- Model polling instead of local event waits.
- Completing every healthy checkpoint wait and waking the Host model.
- Resetting state or budgets, or launching another Executor, when attaching to a
  healthy running task.
- Conflicting ownership rules across scripts, skills, hooks, and prompts.

## Mandatory change review

Every managed-work change verifies ownership, protocol compatibility,
historical-evidence preservation, negative-assertion safety, call-count semantics,
provider recovery, unique terminal events, permission fail-closed behavior,
English/Chinese parity, and MCP notification behavior.

It also verifies that invalid JSON is normalized locally or escalated once;
when an entire call has no parseable delivery, it permits at most one condensed
recovery session without repeating unaffected acceptance. Repair stages resume
from the affected point, and Host-provided mandatory engineering rules are
either injected into preflight or explicitly reviewed by Host.

It also verifies that every contract field is covered by the shared hash
projection or a cross-runtime parity test, and that real-environment acceptance
can perform setup, verification, and failure cleanup from a clean state with one
command.

Every new mandatory rule also identifies hook/gate enforcement, Host semantic
review, or both. Deterministic enforcement has positive and negative tests and
does not overreach into business-semantic decisions.

The review also confirms that cited raw logs survive runtime-directory cleanup
and that every escalated signal revalidates PID, lstart, nonce, signature, and the
actual listening port.

It also confirms that sleep is excluded from invocation/stall clocks and that
buffered callbacks after timeout cannot regress `waiting_for_human` to `running`.
It confirms that macOS idle execution is sleep-protected, explicit sleep resumes
from disk, missing Write/Edit telemetry with baseline-proven changes goes to
Host without another Executor call, and repeated input is excluded from token
circuit units.

It confirms that Run discovery requires both a `run-*` directory and
`run-state.json`, mistaken evidence directories are isolated, and invalid commands
from historical invalid results are filtered before the next result is normalized.

It classifies the change as change-scoped checks, task-level real acceptance, or
framework certification; preserves applicable historical evidence; prevents a
normal business task from rerunning the shared helper disaster suite; and raises
helper, managed-orchestration, or custom-cleanup changes to framework certification.

It verifies that a running task may only be safely attached, that MCP progress
notifications remain request-scoped, that two consecutive checkpoints without an effective milestone
are the attention threshold, and that verification-category
ambiguity reaches Host semantic review and audited promotion without a full
Executor metadata-repair invocation.
It also verifies token-boundary matching for provider status codes so identifiers,
paths, and ordinary text cannot consume connectivity retries.
Unix and Windows source installers must detect actual Hosts, register their managed
MCP entries, print verifiable status before restart, and never leave a half-installed
state where the CLI exists but the Host cannot manage work.
MCP registration must also normalize Homebrew Node to a stable absolute entry so
an ordinary package upgrade cannot disable every Host at once.
Both `superflow update --with-package` and Hook `apply` must re-enter the newly
installed CLI for the complete asset and MCP refresh. Partial failure removes the
throttle stamp and remains retryable in the next session.
The mandatory review also verifies overridable early Claude compaction, preservation
of the frozen prompt/hash, remaining work, owned resources, and validation evidence
across compaction, and authoritative final-result usage. It verifies that default
MCP wait expiry continues compactly from `latestSequence` without a full status
read or Executor restart.

Start failure, lost-response retry, and stale-registry isolation are mandatory
regression cases: Task/Run/registry stay atomic, retries stay duplicate-free, and
one stale locator never disables global list/status behavior.

Minimum regression coverage includes schemas, historical evidence, negative
assertion bypass prevention, Host promotion, provider switching, effective call
display, stage events, same-session preflight repair, MCP wait/notify, and the
single delivery-ready event.

## Practice baseline

- R5: six Claude calls and four Host rounds exposed evidence loss and mechanical
  JSON repairs.
- R6: two effective Claude calls and two Host rounds validated history and
  negative assertions with zero mechanical repair.
- R8: laptop sleep interrupted connectivity and the user stopped the run; it
  validated durable pause and invocation credit only.
- R9: business delivery passed, but all three Claude results contained malformed
  JSON, one full mechanical invocation was wasted, startup/HTTP/cleanup stages
  were omitted, and preflight missed a Host global Java rule. Orchestration did
  not pass.
- R17: delivery passed after four Claude invocations and two Host reviews; sleep,
  late callbacks, Write/Edit telemetry inference, and repeated-input token
  accounting caused avoidable work. R18 validates the fixes.
- R18: delivery passed after two Claude invocations and two Host reviews. The R17
  fixes held, but repeated two-round E2E, cross-round invalid-command contamination,
  and a mistaken evidence directory counted as a Run still required manual
  arbitration. R19 validates the fixes.
- R20: delivery passed after five Claude invocations and four Host reviews.
  Event waiting and Host escalation for invalid negative evidence worked, but
  later reviews still found a production classpath shadow, global test pollution,
  false cleanup evidence, prod/Nacos leakage, and a Lettuce lifecycle leak.
  Power-loss recovery and optional-plugin installation fallback were fixed here.
- R25: delivery passed after three Claude invocations and three Host reviews, but
  every business task repeated the complete owner disaster certification and made
  acceptance infrastructure more complex than the business change. The three-level
  model fixes this; later runs measure full-suite runs, correct framework-suite
  skipping, calls, active time, and tokens.
- R29: business quality passed with real MySQL 8, Spring Boot, HTTP
  200/400/404/409, concurrency, transaction, fault-injection, and zero-residue
  evidence. Orchestration still consumed six Claude invocations, four Host rounds,
  about 2h59m active time, 3h50m wall time, and about USD 44.72. The avoidable work
  came from mutating a running task on resume, unclear healthy-checkpoint
  communication, and launching a full Executor when only the `invocation`
  verification category was missing. This change must prevent all three regressions.
- R30: one Claude invocation and one Host review completed in about 35m44s active
  and 37m44s wall time with real runtime quality. Claude's authoritative result
  nevertheless reported 180 turns and 16,033,460 input tokens. The cause was
  growing context under a 1M window, not Runner double counting. Codex also
  imposed an approximately 300-second MCP tool limit, so the next run validates
  early auto-compaction and compact 240-second wait continuation.
- Target: after local JSON recovery, stage inheritance, and rule injection are
  fixed, comparable CRUD work converges to one effective Claude call and one
  Host review.
