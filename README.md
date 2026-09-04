<p align="center">
  <img src="./assets/brand/superflow-banner.svg" alt="SuperBridge Flow banner">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@chenmk/superflow"><img alt="npm version" src="https://img.shields.io/npm/v/@chenmk/superflow?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/@chenmk/superflow"><img alt="monthly downloads" src="https://img.shields.io/npm/dm/@chenmk/superflow?style=flat-square&label=Downloads/mo"></a>
  <a href="https://www.npmjs.com/package/@chenmk/superflow"><img alt="weekly downloads" src="https://img.shields.io/npm/dw/@chenmk/superflow?style=flat-square&label=Downloads/wk"></a>
  <a href="https://github.com/BasketballNotFound-ManKun/superflow-cli/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/BasketballNotFound-ManKun/superflow-cli?style=flat-square"></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square"></a>
  <img alt="Node.js 20+" src="https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square">
</p>

<p align="center">
  <strong>A workflow harness for turning OpenSpec/SDD contracts and
  Superpowers engineering discipline into one delivery flow.</strong>
</p>

<p align="center">
  <a href="./README.zh-CN.md">中文文档</a>
  ·
  <a href="#install">Install</a>
  ·
  <a href="#workflow">Workflow</a>
  ·
  <a href="#star-history">Star History</a>
</p>

# SuperBridge Flow

SuperBridge Flow is a workflow CLI for bringing OpenSpec/SDD and Superpowers
together in real software delivery.

## Why SuperBridge Flow

Modern agentic coding often fails in the gap between a well-written spec and
real verified delivery. SuperBridge Flow makes that gap explicit:

- OpenSpec/SDD owns **WHAT**: requirements, API contracts, database and field
  semantics, tests, real-entry acceptance, and quality gates.
- Superpowers owns source-level **HOW**: technical design, TDD order,
  worktree/team execution, review, and verification discipline.
- Handoff files, phase state, hooks, and guards reduce context drift when long
  conversations get compacted or split across agent sessions.

The CLI installs skills, hooks or command aliases, rules, scripts, handoff
state, and dependency guards for Claude Code and Codex.

## Highlights

- **Dual-Agent managed delivery.** The current host Agent reviews directly while
  the peer Agent develops, starts, and verifies in one CLI session without a
  tool-turn limit, then actively returns one structured result. A later session
  is created only for review repair, process failure, or human recovery. Review
  and execution default to 5 reviews, 7 executor calls, and 12 total calls.
  Durable journals allow recovery after terminal or network
  interruption, and passing work stops for explicit Git approval.
- **9 catalogued failure modes, blocked at the gate.** Nine real ways AI breaks
  in production — swallowing the whole PRD then forgetting details, editing
  only the setter while missing consumers, SQL drift across dev/test/DB
  layers, mock-only "已验证" reports, and more — each baked into a hard check
  the agent cannot skip.
- **Architecture 6-questions before cross-service code.** Any change crossing
  service / SDK / MQ / device / callback / gateway boundaries must answer six
  questions in the technical design: who owns the module, what is the call
  direction, where are existing entry/exit points, are new ones allowed, which
  paths are forbidden, what is the evidence anchor.
- **Field And Status Reverse Impact matrix.** Every schema / status / enum
  change must enumerate its write sites, read sites, filter conditions,
  derived / sync sites, cross-module consumers, and test coverage — including
  reverse-recovery scenarios (down then up again, deleted then re-created, old
  value unavailable while upstream didn't send the field).
- **6 productized lessons as gates, not reminders.** Full-impact discovery,
  business semantics over HTTP 200, no default fallbacks, DB reconciliation,
  real-entry evidence, code-data verification — each baked into a specific
  phase and a specific hook. Missing evidence blocks the next phase.
- **5 phases × 5+ guard scripts as hard gates.** `superflow-guard.sh` +
  `superflow-hook-guard.sh` + `superflow-contract-hooks.sh` +
  `superflow-sql-sync-hook.py` + `superflow-test-report-lint.py` +
  `superflow-verify-integration.sh`. No handoff hash → no implementation. No
  real-entry evidence → no "verified" report.
- **Context-drift proof via handoff + state + sha256.** When long sessions
  compress, when agents switch, when multiple workers parallelize —
  `.sdd/handoff/sdd-context.{md,json}` + sha256 + `.sdd/state.yaml` keep
  Worker / Tester / Reviewer on the same source of truth. Stale prompts
  blocked by hash mismatch.
- **User says one sentence, pipeline runs 9 steps.** No prompt engineering
  required: `> use SuperFlow to handle this requirement` triggers clarify →
  docs → design → implement → verify → archive. Phase progression, guards,
  hashes, and hooks are flow-enforced, not user-discipline.
- **`superflow check` audits delivery readiness by level.** `files` checks the
  required set, `docs` adds every-prompt links, independent reviews, and complex
  diagrams, while `coding-ready` adds environment preflight plus the complete
  docs/design/implement gates and writes a receipt bound to the current handoff hash.
- **`superflow config` tunes review depth per change.** `--review-mode
off|standard|thorough` controls code-review intensity; `--auto-transition`
  controls automatic phase progression. Match the rigor to the risk.
- **Startup version check.** Every superflow command silently compares your
  installed version against the npm registry. A new version triggers a
  non-blocking upgrade hint on stderr.

## Workflow

```text
docs -> design -> implement -> verify -> archive
```

Each phase has a clear owner and an exit gate:

| Phase       | Owner                          | Output                                            |
| ----------- | ------------------------------ | ------------------------------------------------- |
| `docs`      | OpenSpec/SDD                   | Requirements, contracts, API/DB/test docs         |
| `design`    | Superpowers                    | Source-level technical design and TDD plan        |
| `implement` | Superpowers + SuperBridge Flow | Batched implementation prompts and review gates   |
| `verify`    | SuperBridge Flow hooks         | Evidence-backed test report and real-entry checks |
| `archive`   | OpenSpec/SDD                   | Final spec archive and lifecycle closure          |

## Install

```bash
npm install -g @chenmk/superflow
```

For a source checkout, `bash install.sh` detects installed Codex, Claude, and
Codex and Claude Hosts and installs CLI, Skills/Hooks, and their managed MCP registrations
in one pass. Restart the detected Hosts afterwards.

Then initialize a project:

```bash
superflow init
```

Interactive init lets you select:

- target agent tools: Claude Code, Codex, or both
- language: English or Chinese
- install scope: global or project

Non-interactive usage:

```bash
superflow init --yes
superflow init --language en --yes
superflow init --language zh --yes
```

CLI help and runtime prompts can also be switched globally:

```bash
superflow --language en --help
SUPERFLOW_LANG=en superflow init
```

Manage an implementation prompt, OpenSpec change, or direct development task:

```bash
superflow pipeline "<prompt path, change directory, or task>" --managed \
  --project "<project root>" --supervisor current --executor peer
```

The selected language is frozen into the task contract and reused by Agent
prompts, reviews, journals, reports, notifications, and resumed rounds.
The first executor invocation runs continuously without a Superflow tool-turn
limit, while the current host agent reviews directly instead of the service
spawning a nested copy. The first invocation receives the frozen task prompt;
later repair or recovery invocations receive a condensed handoff so a new
session can continue from the workspace, pending tasks, and complete review
findings. When the
task reports `external_supervisor_review_required`, submit the review and resume:

```bash
superflow pipeline --resume-task <task-id> --submit-host-review <review.json>
```

### Interact from the current host Agent (recommended MCP path)

Register the bundled local stdio MCP server for Codex or Claude:

```bash
superflow mcp install --agent both
```

After restarting the host Agent session, keep talking to the current Codex or
Claude Agent. The host uses MCP to supervise while Superflow starts only the
peer executor:

- `superflow_managed_start` freezes the task and always uses `external_host`.
- `superflow_managed_status` and `superflow_managed_list` expose state and evidence.
- `superflow_managed_wait` defaults to a 240-second compatible transport window;
  Hosts with longer tool limits may explicitly request up to twelve hours. Window
  expiry continues compactly from `latestSequence`. Active requests expose healthy
  progress through standard MCP notifications, while two checkpoints without an
  effective milestone return for semantic attention.
- `superflow_managed_message` carries user guidance to the current execution
  boundary or the next handoff.
- `superflow_managed_authorize_executor` freezes task-scoped repository consent without bypassing host DLP.
- `superflow_managed_pause` and `superflow_managed_resume` interrupt the active executor, persist pause, and resume from state.
- `superflow_managed_submit_review` submits one complete structured host review.
- `superflow_managed_record_validation` records environment/release evidence and recomputes three-stage delivery.

Claude Executors receive neither `--max-turns` nor `--max-budget-usd`, so normal
work is not split by a fixed tool-step count or an inaccurate provider-dollar
estimate. The defaults stop a process after 60 minutes with no output or a
two-hour single-invocation deadline. Repeated provider failures,
token/invocation budgets, safety boundaries, and user pause still stop
execution. Safe Java, Maven, Node, and npm executable paths found during
preflight are written into the executor policy to avoid redundant environment
discovery.
To prevent a 1M context window from multiplying input tokens across hundreds of
tool turns, Claude Executors default to early auto-compaction at 70 percent of a
200K effective window. Explicit Claude environment settings win, and the frozen
prompt plus handoff are reloaded after compaction.

MCP mode never starts a nested supervisor CLI. Host conversation and review do
not consume the background Agent invocation budget; only real executor calls do.
Passing delivery enters `environment_validation_blocked`, `local_delivery_ready`,
or `release_ready` according to three-track progress, without automatic commit,
push, deployment, or production writes.

Managed work uses three default circuit breakers: the same mechanical delivery
error receives only one automatic repair, no more than two automatic repairs run
before escalation to the current host, and the next executor call is stopped at
two million cumulative token units. Dollar pricing is not comparable across
model providers, so the default contract has no USD circuit and Claude receives
no `--max-budget-usd`. Three or more permission denials in one invocation also
suppress another executor retry. The Runner derives changedFiles, baseline task
evidence, and verification categories from the real workspace and commands
instead of spending full executor rounds repairing JSON.

Inspect or remove the integration with:

```bash
superflow mcp status --agent both
superflow mcp remove --agent both
```

MCP is the communication channel between the host Agent and the local managed
state machine, not a third model. Host data-disclosure policy for an external
executor provider remains separate from local filesystem access.
An existing task prompt uses a full contract, a direct engineering request gets a
standard execution contract, and even a one-line request receives a minimal
implementation and verification plan before the executor starts.

Design and field evidence:

- [Cross-Agent Managed Work implementation plan](docs/cross-agent-development-implementation-plan.en.md)
- [Managed Work design principles](docs/managed-work-design-principles.en.md)
- [Managed Agent protocol](docs/managed-agent-protocol.en.md)

## What Init Installs

`superflow init` installs and configures:

- OpenSpec CLI, then runs `openspec init <project> --tools ...`
- Superpowers for the selected agent tools. Codex uses the official
  `superpowers@openai-api-curated` plugin, including
  `verification-before-completion`, `requesting-code-review`, and
  `finishing-a-development-branch`.
- SuperBridge Flow/OpenSpec skills
- hooks, scripts, and anti-drift rules
- Codex prompt aliases
- optional understand-anything integration checks
- `docs/sdd-context/` project context scaffolding

OpenSpec and Superpowers are hard dependencies. understand-anything is
best-effort and does not block initialization.

## Commands

| Command                                                      | Purpose                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `superflow init`                                             | Install and configure SuperBridge Flow interactively                     |
| `superflow update`                                           | Refresh installed skills, hooks, scripts, and rules                      |
| `superflow update --with-package`                            | Also update `@chenmk/superflow`, OpenSpec, and Superpowers               |
| `superflow doctor`                                           | Diagnose CLIs, MCP runtime paths, installed assets, and project state     |
| `superflow status`                                           | Show active changes, current phase, next command, and risks              |
| `superflow --language en --help`                             | Show English CLI help                                                    |
| `superflow scan --language en`                               | Regenerate project context templates in English                          |
| `superflow pipeline`                                         | Check pipeline skill deployment                                          |
| `superflow pipeline "<task>" --managed --project <path>`     | Run short-session execution with direct review by the current host agent |
| `superflow docs [change]`                                    | Run the docs gate and check the phase skill                              |
| `superflow design`                                           | Check design-phase skill deployment                                      |
| `superflow implement [change]`                               | Create a current Coding Ready receipt before implementation              |
| `superflow verify`                                           | Check verify-phase skill deployment                                      |
| `superflow archive`                                          | Check archive-phase skill deployment                                     |
| `superflow check <change> --level files\|docs\|coding-ready` | Audit file, document-delivery, or coding readiness                       |
| `superflow config <change> --review-mode <mode>`             | Set review depth (off/standard/thorough)                                 |
| `superflow config <change> --auto-transition <bool>`         | Toggle automatic phase progression                                       |
| `superflow status`                                           | List active changes with phase, tasks, and doc gaps                      |
| `superflow eval <taskPath> [--json]`                         | Evaluate managed quality, calls, tokens, cache, and time offline         |
| `superflow update --with-package`                            | Update superflow, OpenSpec, and Superpowers                              |

## Agent Usage

In Codex:

```text
Use $superflow-pipeline to analyze this requirement and drive the full workflow.
```

In Claude Code:

```text
/superflow-pipeline
```

For large requirements, ask the agent to read one section or one feature at a
time. The total router automatically uses embedded deep clarification when a
feature needs an owner decision; it investigates available facts first and asks
one decision at a time with a recommendation. Clear, bounded work continues
without an interview. SuperBridge Flow then routes through OpenSpec docs,
Superpowers technical design, implementation prompts, verification, and archive.

## Automatic Update Checks

After hooks are registered, SuperBridge Flow checks core dependency updates once
per new session and throttles real network checks to once every 6 hours by
default.

Default behavior is **check only**. It reports available updates but does not
install them. Run this to update explicitly:

```bash
superflow update --with-package
```

Environment controls:

```bash
# Default: check and report
export SUPERFLOW_AUTO_UPDATE=check

# Disable automatic checks
export SUPERFLOW_AUTO_UPDATE=0

# Optional: update packages, Skills, Hooks, rules, scripts, and managed MCP
export SUPERFLOW_AUTO_UPDATE=apply

# Minimum check interval in seconds; default is 21600
export SUPERFLOW_UPDATE_MIN_INTERVAL_SECONDS=21600
```

`apply` re-enters the newly installed CLI after package upgrade and refreshes all
detected Agent assets plus managed MCP registrations. A partial failure keeps its
log and removes the throttle stamp so the next session can retry. Restart the
Agent after success because an existing MCP process cannot hot-load the upgrade.

## Language Support

SuperBridge Flow supports English and Chinese installation modes.

- `--language en`: deploys English-facing SuperBridge Flow skills and CLI
  prompts where available.
- `--language zh`: deploys the original Chinese full-detail skill set.

The Chinese skill set currently contains the most detailed operational
templates. The English skill set is designed as a practical public beta and
keeps the same workflow contracts.

## Requirements

- Node.js 20+
- Claude Code or Codex
- npm access to install OpenSpec and Superpowers
- Git Bash or a compatible shell on Windows for hook scripts

On Windows, managed work resolves Agent `.exe/.cmd/.bat` shims and stops the
complete Agent process tree on pause or timeout. macOS/Linux keep detached
process groups; none of the three Agent launch paths concatenates commands in a
general-purpose shell.

## Star History

The chart is generated by Star History from public GitHub star data. It may stay
empty while the repository is private.

[![Star History Chart](https://api.star-history.com/svg?repos=basketballnotfound-mankun/superflow-cli&type=Date)](https://star-history.com/#basketballnotfound-mankun/superflow-cli&Date)

[Open the Star History chart](https://star-history.com/#basketballnotfound-mankun/superflow-cli&Date)

## License

MIT
