# Superflow Managed Agent Protocol

## Goal

Managed participants exchange stable machine messages instead of inferring state
from prose. Ownership is explicit:

- the executor reports work performed, commands, raw outcomes, and real blockers;
- the Runner owns changedFiles, baseline task evidence, verification categories,
  invocation counts, tokens, cost, and state transitions;
- the host independently owns review facts, findings, fixes, and acceptance checks.

Runner-derived facts override executor hints. The protocol references frozen paths,
hashes, and evidence paths instead of copying source code into every message.

The control plane follows the same deterministic contract:
`superflow_managed_start` completes its runtime handshake before persistence and
provides idempotent retry for the same non-terminal request. The registry is only
a locator, so one stale entry never fails the global task list.

MCP also exposes its startup version, time, and runtime fingerprint. If the local
installation changes after MCP startup, `start` fails before any Task/Run/registry
write and instructs the user to restart the Host.
CLI `pipeline --managed` also handshakes before persistence and rolls back the new
Task/Run files if registry persistence fails.
Plain `pipeline --resume-task` for a healthy `running` task means safe attach and
continued wait. It cannot change status, active timing, Executor PID, budget, or
session. Only a recorded PID proven dead enters stale recovery; a missing PID
fails closed into attach-and-wait, and attach requests with budget, provider, or
session mutation flags are rejected.

## Handoff decision boundary

| Fact type                                                                          | Decider        | Transition                                                                                                                 |
| ---------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Schema, hashes, budgets, state, explicit exits, file/port existence                | Runner script  | Continue on deterministic success; repair or stop on deterministic failure                                                 |
| Historical-command deduplication, category merge, explicit negative assertions     | Runner script  | Merge automatically without an Agent call                                                                                  |
| Startup, real invocation, and evidence are complete but only a category is missing | Runner + Host  | Mark verification-category ambiguity, escalate directly for Host semantics, and promote with an audit event after approval |
| Code correctness, requirement coverage, applicability of historical evidence       | Host Agent     | `pass`, `needs_fix`, or `blocked`                                                                                          |
| Suspected credentials or evidence requiring semantic interpretation                | Host Agent     | Script reports the match without asking the Executor to rewrite prose                                                      |
| Source repair, application startup, real calls, and cleanup                        | Executor Agent | Complete one work batch, then submit one structured delivery                                                               |

Scripts decide only repeatable facts with no subjective interpretation. Anything
that asks whether evidence is suspicious, sufficient, or still applicable belongs
to the Host. The Host never operates applications, databases, or Executor-owned
processes.

A mandatory rule never exists only in prompt context. Protocol changes identify
hook/preflight/final-gate enforcement, Host semantic review, or both.
Deterministic enforcement has positive and negative tests plus actionable
remediation; the Runner never replaces Host judgment with keyword matching.

Expected-failure and fault-injection checks use a parent acceptance command that
asserts a non-zero child outcome and itself exits 0. Raw non-zero outcomes stay
in logs and never masquerade as `assertion: negative`. If the final gate finds
this protocol violation, Runner preserves the result and sends it directly to
Host semantic review instead of invoking Executor to rewrite JSON.
Before persistence, Runner deterministically removes blank string metadata. A
read-only resource inspection that exits 1/2 and explicitly reports no process,
listener, container, or residue is a successful empty result. Neither case may
launch the Executor for repair.

When an entire Executor invocation yields no parseable `executor_delivery` JSON,
Runner first preserves redacted raw logs. If the Host cannot safely review from
existing facts, Runner may create exactly one condensed delivery-recovery
session. It reads the current workspace and handoff, inherits valid evidence,
performs only remaining affected work, and returns schema-valid delivery. It
must not be used merely to copy JSON or rerun unrelated environment chains. A
second same-class failure enters `waiting_for_human` with audit evidence.

## Executor handoff

### Document contract versus managed prompt

- A docs-only entry runs Superflow/OpenSpec documents and Coding-Ready review
  without creating a managed Task/Run.
- After user approval, the change/prompt entry freezes the original path,
  referenced documents, and hashes before entering the shared managed state machine.
- The Host semantically routes a verbal request: bounded work uses minimal or
  standard contracts; unresolved directional API, data, concurrency,
  cross-repository, or owner choices return to clarification/documents. Runner
  regexes never replace that judgment.
- With Superflow/OpenSpec documents, the Executor reads the frozen implementation
  prompt and follows its references to `api.md`, `design.md`, `tests.md`, and the
  source-level technical design. Managed protocol never copies or rewrites the
  business design.
- For an oral simple request, Runner creates a minimal execution contract. Any
  API, database, concurrency, transaction, or test choice that changes the
  implementation direction returns to the Host instead of being decided by a
  generic Executor prompt.
- A direct `engineering` or `sdd` request without a user prompt still generates
  and freezes a standard execution contract and SHA-256 as the first Executor
  entry. It defines source discovery, reuse, task-owned resources, real
  acceptance, cleanup, and evidence boundaries; it does not invent business API,
  database, transaction, or test design. The handoff shows this frozen contract,
  never “no prompt.”
- Managed prompts contain only role, safety, completion, real verification,
  evidence, cleanup, and structured-delivery rules.
- A Host-native persistent goal may sustain supervision, but it is outside this
  protocol state machine and never duplicates Task/Run state.

Every invocation receives both:

- `executor-handoff-N.json`, the `superflow.handoff.v2` machine source of truth;
- `executor-handoff-N.md`, a human-readable projection of the same facts.

The JSON carries the frozen prompt, authoritative changedFiles, task progress, all
findings, user guidance, remaining budget, exact applicable rule files, and the
deterministic delivery-preflight command. Fresh or resumed sessions read the
JSON first, then open only the referenced documents and source files they need.

Handoff carries `contextManifest.path` and `contextManifest.sha256`. The manifest
lists authoritative requirement, design, task, test, and rule paths with content
hashes without copying source text. Runner validates it before invocation. Drift
in any required document fails closed and requires a newly frozen task instead of
asking the Executor to guess which version applies.

The manifest also declares protection: requirements, designs, prompts,
handoffs, rules, and task facts are `immutable`; task/test-report progress
evidence is `retain`. Immutable inputs are read-only and retained inputs may be
updated but not deleted. Executor cleans runtime and workspace-temporary
resources, while source, SQL, tests, and reports remain delivery artifacts for
Host review. Zero-residue cleanup after terminal state is a separate audited action.

The task directory also contains `execution-contract.json/md`. It references a
canonical tasks.md when available; otherwise it creates a non-empty minimal or
standard machine plan without inventing business semantics. Runner derives those
machine-task outcomes from real changedFiles and successful commands; Executor
never edits `.superflow` files.
The standard contract adds real startup, invocation, and cleanup tasks only for
application, API, database, browser, or container work; pure-library work does
not invent runtime acceptance. For runtime work it requires a portable acceptance
entry, cleanup on representative failure, and rejects broad classpath scanning,
generic bean replacement, or unrelated stubs used to fake startup. For an
explicit concurrency request it may require deterministic non-5xx business
conflict handling and exactly-once durable state transition, without inventing a
concrete API status, database, or implementation approach.

Runner compares blocking findings across consecutive Host reviews. Repair may
continue while prior blockers are being closed, but two review transitions that
close none move the run to `repair_pending`; `maxReviewRounds` remains an
unbreakable hard cap. After a user raises budget with an audit reason, Runner may
resume `repair_pending` only after confirming executor or review capacity is actually
available; a user message alone is never a resume authorization. Host reuses IDs for
unresolved findings, while Runner also recognizes a renumbered issue by category and
target scope.

`workspace-binding.json/md` freezes repository identity, worktree, branch, and
initial HEAD for the primary and related repositories. Runner validates it before
context recovery and never starts Executor after branch or worktree drift. Runner
uses filesystem snapshots for non-Git workspace changes; Executors never initialize
Git for diff, preflight, or delivery, and a new `.git` is repository-identity drift
that fails closed. Its
relative `taskLocator` supports project-local registry recovery; the registry is
not authoritative task state.

On Windows, Runner resolves Codex and Claude executable shims through
PATH/PATHEXT without concatenating commands in a general-purpose shell. Pause,
timeout, and runtime replacement use one process-tree stop primitive: the full
`taskkill /T /F` tree on Windows and a detached process group on Unix. The target
remains the Agent owner PID recorded by Runner.

When calling `superflow_managed_start`, the host must place mandatory engineering
rules that exist only in its session into `mandatoryEngineeringRules`. The runner
freezes them into the task contract, executor prompt, and deterministic preflight;
it must never assume that the executor can see host system or session rules.

For real-runtime tasks, the first handoff and prompt require a repository-owned
one-command acceptance entry. From a clean state it owns preflight, setup, build,
startup, real calls, assertions, and cleanup without manual steps outside the
command or personal absolute paths. It covers the success path, one representative
setup/verification failure cleanup, and final zero residue. The Host reviews
repeatability, portability, and failure safety together in its first round instead
of discovering script defects across separate rounds.
Verbose build/runtime logs are persisted as task-owned evidence; console output
contains bounded stage summaries and bounded failure tails only.
Evidence paths cited at handoff remain readable after normal cleanup removes the
nonce/runtime directory. If a process signal is escalated after waiting, ownership
is checked again; a PID validated only before the wait is never reused blindly.
Hard-invocation and stalled-output limits count machine-active time only and
exclude system sleep. After failure, timeout, or human escalation, Runner ignores late progress,
telemetry, session, and PID callbacks from that invocation.
On macOS, Runner wraps local Agent processes with `caffeinate -im` to prevent
idle sleep. It does not bypass explicit sleep or lid-close sleep; recovery still
uses the persisted contract and state.
After a Host restart, Runner checks the recorded Executor PID before recovering
a persisted `running` state. A dead PID may transition to `waiting_for_human`;
a live PID rejects duplicate startup. Offline downtime is excluded from active
runtime and the recovery emits `executor.stale_process_recovered`.
Raw Agent logs rotate into complete fixed-size parts. Returning from a late stage
to implementation/tests emits `executor.stage_rework`. `executorStage` remains a
monotonic reached milestone, while `executorActiveStage` exposes the current
rework stage. CLI and MCP show both instead of presenting an old milestone as
current work. Claude Executors default to
`CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000` and
`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70`, while explicit user values win. The
persistent system policy contains Compact Instructions that preserve and reload
the frozen prompt/hash, handoff, unfinished work, active resource ownership, and
valid evidence after compaction. Claude's final `result.usage` is authoritative
for that physical invocation. Handoff includes the owner-template path for direct use through a
configurable path, not for copying template functions. A wrapper that only binds
task nonce, signature, port, and resource names is not custom cleanup. Reimplemented
identity, kill/delete behavior, or a helper bypass raises the task to framework
certification.

## Verification-scope protocol

Verification has three levels without adding a JSON field or state transition:

- `change-scoped checks`: every repair maps findings/current diff to invalidated
  historical evidence and reruns only affected checks. Report, evidence-format,
  log-format, and isolated-test changes do not invalidate unrelated runtime proof.
- `task-level real acceptance`: the engineering/SDD default covers the business
  success path, named real backend, task owner binding, one representative failure
  after major resources exist, each business deletion condition, and final zero
  residue. Multi-repository work verifies each affected repository and the real
  cross-repository path when the requirement spans services.
- `framework certification`: only an explicit frozen prompt, a Superflow owner
  helper/managed-orchestration change, or a new custom cleanup primitive requires
  non-owner, PID-reuse, forged/stale-state, every-interruption, and signal-escalation
  disaster paths.

Runner still merges historical commands, and Host still judges their applicability
to the current diff. The frozen prompt may raise but never silently lower the level.
Production runtime logic, SQL, configuration, authorization, public contracts, the
acceptance entry, or explicit finding checks invalidate the corresponding chain.
The shared helper's full framework certification must not rerun per business task.

## Executor delivery

Protocol `superflow.executor.v2`, message type `executor_delivery`:

```json
{
  "protocolVersion": "superflow.executor.v2",
  "messageType": "executor_delivery",
  "status": "ready_for_review",
  "summary": "Implementation and verification summary",
  "commands": [
    {
      "command": "npm test",
      "exitCode": 0,
      "result": "16/16 passed",
      "categories": ["test", "startup", "invocation"],
      "assertion": "positive"
    }
  ],
  "evidence": ["openspec/changes/demo/test-report.md"],
  "releasePrerequisites": [],
  "blockers": []
}
```

`changedFiles` and `taskEvidence` remain compatibility fields, not executor
requirements. The Runner derives authoritative values from the frozen baseline,
workspace, tasks.md, test-report, and successful commands. Executors provide a
taskEvidence override only when a task needs distinct proof.

`assertion` is either `positive` or `negative`. Absence checks for leaked
credentials, orphan processes, or listeners commonly and correctly return exit
1/2; mark them as `negative` so the Runner does not infer success from command
names or prose. The Runner merges valid commands across executor results, so a
repair must not rerun or manually duplicate established startup, HTTP, test, or
build evidence.
Historical `-invalid` results may contribute only commands that pass the current
protocol. Invalid negative assertions and ordinary failed commands are filtered
before evidence is merged into a later invocation result.

Before StructuredOutput, Executor runs the handoff preflight and fixes
deterministic changed-file line width, whitespace, task checkbox, missing-report,
and suspected-credential failures in the same session. Before accepting
`ready_for_review`, Runner reruns that same gate and never treats an Executor
claim as proof that it passed. `evidence` should contain canonical file or
directory paths. For legacy compatibility it may append a space plus `(note)`;
Runner uses only the preceding path for existence, hashing, and directory checks,
while the raw string remains in delivery JSON.
Write/Edit stream telemetry is observational, not the only source of truth. If
it is absent but the frozen workspace baseline proves at least one declared file
changed, Runner records `executor.write_telemetry_inferred` and forwards the
delivery to Host review without another Executor invocation.

Stream telemetry and delivery JSON are both untrusted Agent input. Commands,
results, summaries, journal events, fact packs, and MCP status must use the
same redactor before their first persistence, including `NAME_PASSWORD=value`,
tokens, headers, URL credentials, and command-line passwords. A redacted
structured delivery never permits a raw progress callback in
`executor-progress-*.jsonl` or `progress.jsonl`. Historical exposure requires
a security migration that rebuilds and audits the whole hash chain; old values
must not remain readable through MCP.

## Host review

Protocol `superflow.review.v2`, message type `host_review`:

```json
{
  "protocolVersion": "superflow.review.v2",
  "messageType": "host_review",
  "result": "needs_fix",
  "summary": "Review summary",
  "findings": [
    {
      "id": "R1-001",
      "severity": "high",
      "blocking": true,
      "category": "correctness",
      "target": "src/server.js",
      "evidence": "Observed fact",
      "risk": "Concrete risk",
      "requiredFix": "Specific fix",
      "acceptanceChecks": ["Executable acceptance command"]
    }
  ],
  "verificationCommands": []
}
```

The host reports every material finding in one round. Formatting, changedFiles,
or derivable-evidence gaps are not product-code findings; once automatic repair
hits a circuit breaker, the host judges the current artifacts directly.
Host first reads Runner's `review-facts-N.json` and reuses its paths, hashes, exit
codes, task counts, and verification categories. It then independently reads the
real diff and required raw evidence. The packet contains no correctness or test-
sufficiency conclusion and is never treated as semantic review output.
For repair rounds, Host first uses `workspace.roundChangedFiles` to narrow the
current inspection, then reads cumulative `changedFiles` and raw evidence as risk
requires. No delta never permits an unresolved finding to be skipped.
When raw historical evidence already proves delivery and only JSON metadata or
evidence duplication is invalid, the Host returns `pass`. The Runner filters
invalid commands, merges historical evidence, and records promotion instead of
calling the Executor to rewrite JSON or rerun the environment.
When a successful Spring Boot command already proves startup, real HTTP/runtime,
and evidence paths, and the only omission is the `invocation` category, Runner
records `executor.verification_metadata_escalated_to_host` and enters Host review.
After Host confirms applicability, Runner adds the category and records
`executor.verification_metadata_host_promoted`. Verification-category ambiguity
must not start a full Executor invocation.

A normal real-runtime first review covers task PID/start-fingerprint binding,
deletion gates, one representative setup/assertion failure cleanup, and final zero
residue together. PID reuse, non-owner, forged-state, and every signal path are
checked only for framework certification. Review submission includes `hostUsage`,
or MCP records an explicit `hostUsageUnavailableReason`; unknown usage is never
treated as zero.

For CLI submission, the review JSON must live outside every target project
(prefer the system temporary directory), so Git and changedFiles cannot treat it
as a product artifact. Review, Task, Run, and global-registry persistence roll back
on failure; no failed write may leave a partially accepted review.

## Circuit semantics

- one automatic repair for the same mechanical rejection, two overall;
- three permission denials in one invocation suppress another executor retry;
- the next executor call stops at two million cumulative Executor output tokens;
  repeated input context and cache reads do not count toward this circuit, and a
  cost circuit applies only when the provider reports known, trustworthy cost.
  `maxExecutorTokenUnits` is the output-token limit; missing output/cost remains
  `null`/unknown and is neither real zero nor proof that a circuit is open;
- when an actively resumed Executor session is deterministically classified as
  missing, invalid, or over its resume context limit, Runner records its retired
  ID, reason, and time, preserves handoff/valid evidence, and queues exactly one
  fresh session without that ID. A second matching failure emits a circuit event
  and goes to Host; ordinary repair remains fresh short sessions and a retired ID
  is never resumed;
- network errors, closed connections, timeouts, and provider overloads share one
  consecutive-failure counter and stop after three physical attempts; confirmed
  transient 429/529 overloads and pre-Agent-result connection refused/reset/close
  failures are credited, while permission, quota, billing, and token-plan failures
  are not; provider status codes require standalone token boundaries so identifiers,
  paths, and ordinary text cannot trigger retries; only a complete Agent response
  resets the counter;
- no terminal state grants Git, deployment, or database-write authority.

After a provider switch, `--provider-switched <reason>` resumes the same Task/Run,
preserves physical-call credits, resets consecutive provider failures, and creates
a fresh Executor session. Status always separates physical, credited, and
effective development calls.

Runner emits `executor.stage_changed` only for source_discovery, implementation,
unit_test, package, application_startup, http_e2e, cleanup, and
delivery_self_check. Ordinary heartbeat never wakes Host. Runner appends a
checkpoint every 10 minutes with only stage changes, first-time authoritative
command completions, real diff changes, and repeated failures. An active
`superflow_managed_wait` sends stages and healthy checkpoints through standard
MCP progress notifications. They are scoped to the active request, may be ignored
by the receiver, and are not autonomous callbacks after the Host turn ends. A
single healthy or idle checkpoint does not complete wait. Two consecutive
checkpoints without an effective milestone emit
`executor.supervision_attention_required` and return to Host. CLI blocks on the
same journal without high-frequency model polling. MCP defaults to a compatible
240-second transport window, while an explicit argument may still request up to
twelve hours. Window expiry returns only a compact snapshot; Host immediately
waits again from its `latestSequence` without full status, Task/Run mutation, or
Executor restart. Superflow currently does not
depend on experimental MCP Tasks; its durable Task/Run remains authoritative.

Legacy messages without protocol fields are normalized to v2 at the read boundary.
Backward compatibility never justifies another executor round to repair formatting.
