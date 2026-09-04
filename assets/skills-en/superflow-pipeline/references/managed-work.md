# Managed Work Rules

## Design-constitution gate

Before changing Superflow managed work itself, read
`docs/managed-work-design-principles.en.md` and
`docs/managed-agent-protocol.en.md` completely. Before delivery, walk through
the constitution's mandatory change-review checklist and state whether the
change alters any principle.

Runner and scripts decide deterministic facts. Agents decide correctness,
reasonableness, risk, and evidence sufficiency. Scripts must not replace
semantic review with regexes, and Agents must not take ownership of hashes,
schemas, counters, or state transitions. A new long-term rule first updates the
Chinese and English constitutions, protocol, and tests.

Managed orchestration owns only dual-Agent dispatch, frozen context, state,
waiting, evidence, and review loops. API, database, concurrency, transaction,
and test design belongs to `api.md`, `design.md`, `tests.md`, and source-level
technical design. Executor prompts inherit rather than redesign. Audit every
managed-prompt change against this boundary.

Managed work is built into `superflow-pipeline`. The user only says to use
Superflow and provides an implementation prompt, change directory, or direct
task. Direct tasks receive a minimal contract. SDD work freezes the generated
implementation prompt and never substitutes `tasks.md` for the execution prompt.

Before start, the Host routes by input maturity: docs-only work stops at Coding
Ready without a managed Task; a user-approved change/prompt is frozen directly;
a bounded verbal task uses minimal or standard. If a verbal request has a
direction-changing API, data, concurrency, cross-repository, or owner choice,
return to clarification/documents instead of letting Runner regexes or Executor
improvisation replace Host judgment.

When MCP is installed, the current host must prefer the `superflow_managed_*`
tools for submission, waiting, user guidance, and review submission. MCP is a
channel to the local state machine rather than a third model. Direct host review
is the only supported mode, preventing a nested supervisor CLI from duplicating
context, tokens, and review time.

When MCP is unavailable, dispatch through:

```bash
superflow pipeline "<implementation-prompt|change-dir|task>" --managed --project "<root>" \
  --supervisor current --executor peer --language <en|zh>
```

`current/peer` resolves the host and its counterpart automatically. If host
detection is ambiguous, pass explicit `codex/claude` roles instead of guessing.
Legacy contracts with missing or retired supervision settings are migrated to
direct host review on resume. No entry point may spawn a background supervisor
CLI.
Keep a single foreground `pipeline`/`resume` waiter so the CLI reads local state;
never spend host model turns periodically invoking `superflow status`.
In MCP mode,
`superflow_managed_wait(taskId, afterSequence, timeoutSeconds=240)` defaults to
a Host-compatible transport window below common 300-second tool limits. Hosts
that support longer calls may explicitly request up to 43200 seconds. An active
request exposes stages and healthy checkpoints through standard MCP progress
notifications without waking the Host model. One healthy or idle checkpoint does
not complete wait; two consecutive checkpoints without an effective milestone
return attention. Ordinary window expiry immediately continues wait from the
compact snapshot's `latestSequence`, without status or Executor restart. Call
`superflow_managed_status` for full evidence only when the state requires Host
attention.

After executor delivery, the task enters `external_supervisor_review_required`.
The current host reads `host-review-N.md`, writes the review JSON, and resumes:

```bash
superflow pipeline --resume-task <task-id> --submit-host-review <review.json>
```

Hard gates:

- Claim the 5/7/12 budgets before an Agent call. The default Executor circuit
  also stops at two million cumulative token units. Provider-dollar accounting
  is not comparable, so the default has no USD circuit and Claude receives no
  `--max-budget-usd`.
- Freeze the selected language into the contract; prompts, journals, reports, notifications, errors, and resumed rounds must use that same language.
- Revalidate the frozen contract hash, non-overridable permissions, and 5/7/12 hard limits on every start and resume. Fail closed if persisted contract data changed.
- Runner uses filesystem snapshots for non-Git workspace changes. Executors must
  never run `git init` for diff, preflight, or delivery, and must not create or
  replace `.git`; repository-identity changes during a task still fail closed.
- The context manifest marks frozen requirements, designs, prompts, handoffs,
  rules, and task facts as `immutable`, and task/test-report progress evidence
  as `retain`. Immutable entries are read-only; retained entries may be updated
  but never deleted. Native hooks block before mutation and every Host is still
  verified by preflight/final gates.
- Cleanup separates runtime, workspace-temporary, delivery-artifacts, and
  protected-contracts. Executor cleans only the first two and retains source,
  SQL, tests, reports, and frozen contracts for Host review. Never use pkill,
  killall, a bare kill, port/name-only cleanup, or rm -rf without owner-helper verification.
- Resolve change directories through `.sdd/state.yaml` `implementation_prompt`; treat `tasks.md` as a checklist only. Copy the prompt into a managed snapshot and freeze its SHA-256 for both agents.
- The first executor invocation automatically uses the frozen prompt as its task entry.
- For real-runtime work, the first prompt requires a repository-owned,
  one-command, repeatable, failure-safe, portable acceptance entry covering
  preflight, setup, build, startup, real calls, assertions, and cleanup,
  including the success path and one representative setup/verification failure
  cleanup with final zero residue. The Host reviews all properties together.
- Call the MCP runtime handshake before start. An installed-runtime change makes
  the stale MCP fail closed before persistence and requires a Host restart.
  Persist verbose logs and print bounded summaries and failure tails only.
- Verification has three levels: repairs use change-scoped checks; engineering/SDD
  defaults to task-level real acceptance; only an explicit frozen prompt, an owner
  helper/managed-orchestration change, or a new custom cleanup primitive uses
  framework certification. The frozen contract may raise but never silently lower
  the level, and historical evidence reruns only when the diff/finding invalidates it.
- A normal real-runtime Host review checks task PID/start-fingerprint binding,
  deletion gates, one representative setup/assertion failure cleanup, and final
  zero residue. Distinct business deletion paths and affected/cross-service
  repositories still receive their own proof. It must not rerun shared-helper PID-reuse, non-owner, forged-state,
  and every-signal disaster suites for each business task. Reuse the helper directly
  through a configurable path instead of copying a cleanup framework. Record Host
  usage or an explicit unavailable reason.
- Pass neither `--max-turns` nor `--max-budget-usd` to a Claude Executor. Do not
  split normal work by a fixed tool-step count or an inaccurate provider-dollar
  estimate. The defaults stop after 60 minutes with no output or a two-hour
  single-invocation deadline; repeated provider failures, token/invocation
  budgets, safety boundaries, and user pause still stop execution.
- Claude Executor defaults to the official
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000` and
  `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` settings for earlier long-session
  compaction; explicit user values win. It reloads the frozen prompt and handoff
  after compaction, and final `result.usage` is authoritative for the invocation.
- Network errors, closed connections, timeouts, and provider overloads share one
  consecutive-failure counter and must open the circuit on the third failure;
  only a complete Agent response resets it. Transient 429/529/overloaded calls
  and connection refused/reset/close or socket failures confirmed before an Agent
  response may be credited; permission, token-plan, quota, and billing failures
  are not, and none may bypass the three-failure circuit.
- Keep the first invocation in one continuous session. Create a new session for
  review repair or abnormal recovery and retain old IDs for audit; never guess
  with `--last` or `--continue`. Generate `executor-handoff-N.md` for later
  invocations with the prompt hash, task progress, local pending work, external
  prerequisites, all findings, diff stat, and recent report. A new session must
  read it and verify against the current workspace.
- Write safely discovered Java, Maven, Node, and npm executable paths into the
  first executor policy so the Agent does not waste tool calls rediscovering the
  basic toolchain.
- Handoff includes exact applicable rule files and a deterministic delivery
  preflight. Executor runs it before returning and fixes line width, whitespace,
  task checkboxes, and missing reports in the same session.
- The current host performs review in `external_host` mode; the background
  service must not spawn a nested supervisor CLI.
- Treat `progress.jsonl`, the task contract, review results, and evidence as truth.
- Executor cannot edit managed state or commit, push, publish, deploy, or bypass sandbox.
- Supervisor cannot modify target files.
- Invalid JSON, missing session IDs, and review-time workspace drift block pass. Absence checks use `assertion: negative` to express an expected exit 1/2 without guessing from command names or prose.
- Expected-failure and fault-injection checks must use a parent command that
  asserts the child's non-zero outcome and itself exits 0. Raw non-zero outcomes
  stay in logs. Invalid negative evidence goes directly to Host review and never
  triggers a full Executor invocation merely to rewrite JSON.
- Engineering and SDD tasks need successful command evidence from at least two categories among build, test, and runtime/real invocation. Compile-only or unit-test-only delivery cannot enter formal review.
- Run `superflow-managed-work-check.mjs <root> <task-id>` before delivery-ready.
- `tasks.md` recognizes only local_required, environment_required, and release_required; untagged work is local. The Runner derives baseline evidence from the checklist, real workspace changes, test report, and successful commands. Executors add taskEvidence only for tasks that need distinct evidence.
- The Runner merges the complete changedFiles set and stores structured command categories. The same mechanical rejection gets one automatic repair, with at most two automatic repairs overall, then the current host reviews it. Three or more permission denials in one invocation suppress another executor retry.
- The Runner inherits valid startup, HTTP, test, and build commands across executor results. When the Host confirms complete historical evidence and only current structured metadata is invalid, it passes and promotes the artifact with an audit event instead of asking the Executor to rerun the environment or rewrite JSON.
- When successful Spring Boot evidence already covers startup, real HTTP/runtime,
  and evidence paths, and only the `invocation` category is missing, this is
  verification-category ambiguity. Runner escalates directly to Host; after a
  pass it promotes with an audit event instead of launching a full Executor for
  metadata repair.
- The Runner deterministically removes blank structured-array entries. A read-only
  inspection with exit 1/2 that explicitly reports no process, listener,
  container, or residue is a successful empty result; neither case launches the
  Executor for metadata repair.
- Status separates physical calls, infrastructure credits, and effective
  development calls. Provider switches resume through
  `--provider-switched <reason>`, and stage changes notify the Host conversation
  without waking it for ordinary heartbeat.
- Page/permission changes require frontend startup and Playwright/Cypress real-browser E2E. Cross-stack API changes require backend Controller and frontend request contracts plus an API-export snapshot.
- Append the single `run.delivery_ready` event only after the integrity script passes. On failure, require human attention without leaving false delivery-ready evidence.
- A passing run enters a three-stage source/environment/release state and still requires explicit Git approval.

## Recovery

After a background failure, recover from the task contract, event journal, run
state, and latest checks. Old session IDs are audit records, not recovery
dependencies. Plain `--resume-task` for a healthy `running` task is safe attach
and continued wait only: it cannot reset state or budgets or launch another
Executor. Only a recorded PID proven dead enters stale recovery; a missing PID
fails closed into attach-and-wait. An active MCP wait's progress notifications
are request-scoped, not autonomous callbacks after the Host turn ends.
