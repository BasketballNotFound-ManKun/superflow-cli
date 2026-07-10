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
state, and dependency guards for Claude Code, Codex, and OpenCode.

## Highlights

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
- **`superflow check` audits document completeness.** Runs against a 13-item
  required-file checklist per change. Missing a required doc? Exit 1. No more
  surprises at the implement phase — the gate catches gaps while you're still
  in docs.
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

| Phase | Owner | Output |
| --- | --- | --- |
| `docs` | OpenSpec/SDD | Requirements, contracts, API/DB/test docs |
| `design` | Superpowers | Source-level technical design and TDD plan |
| `implement` | Superpowers + SuperBridge Flow | Batched implementation prompts and review gates |
| `verify` | SuperBridge Flow hooks | Evidence-backed test report and real-entry checks |
| `archive` | OpenSpec/SDD | Final spec archive and lifecycle closure |

## Install

```bash
npm install -g @chenmk/superflow
```

Then initialize a project:

```bash
superflow init
```

Interactive init lets you select:

- target agent tools: Claude Code, Codex, OpenCode, or selected combinations
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

## What Init Installs

`superflow init` installs and configures:

- OpenSpec CLI, then runs `openspec init <project> --tools ...`
- Superpowers for the selected agent tools
- SuperBridge Flow/OpenSpec skills
- hooks, scripts, and anti-drift rules
- Codex prompt aliases
- optional understand-anything integration checks
- `docs/sdd-context/` project context scaffolding

OpenSpec and Superpowers are hard dependencies. understand-anything is
best-effort and does not block initialization.

## Commands

| Command | Purpose |
| --- | --- |
| `superflow init` | Install and configure SuperBridge Flow interactively |
| `superflow init --agent opencode` | Install OpenCode skills and command aliases |
| `superflow init --agent all` | Install Claude Code, Codex, and OpenCode |
| `superflow update` | Refresh installed skills, hooks, scripts, and rules |
| `superflow update --with-package` | Also update `@chenmk/superflow`, OpenSpec, and Superpowers |
| `superflow doctor` | Diagnose installed assets and project state |
| `superflow status` | Show active changes, current phase, next command, and risks |
| `superflow --language en --help` | Show English CLI help |
| `superflow scan --language en` | Regenerate project context templates in English |
| `superflow pipeline` | Check pipeline skill deployment |
| `superflow docs` | Check docs-phase skill deployment |
| `superflow design` | Check design-phase skill deployment |
| `superflow implement` | Check implement-phase skill deployment |
| `superflow verify` | Check verify-phase skill deployment |
| `superflow archive` | Check archive-phase skill deployment |
| `superflow check <change>` | Audit 13-file SDD document completeness |
| `superflow config <change> --review-mode <mode>` | Set review depth (off/standard/thorough) |
| `superflow config <change> --auto-transition <bool>` | Toggle automatic phase progression |
| `superflow status` | List active changes with phase, tasks, and doc gaps |
| `superflow update --with-package` | Update superflow, OpenSpec, and Superpowers |

## Agent Usage

In Codex:

```text
Use $superflow-pipeline to analyze this requirement and drive the full workflow.
```

In Claude Code:

```text
/superflow-pipeline
```

In OpenCode:

```text
/superflow-pipeline
```

OpenCode receives `.opencode/skills` and `.opencode/commands` assets. Native
hook registration is not enabled for OpenCode yet; use `/superflow-*` commands
to run workflow gates explicitly.

For large requirements, ask the agent to read one section or one feature at a
time. SuperBridge Flow will route through clarification, OpenSpec docs,
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

# Optional for personal machines: install automatically when updates are found
export SUPERFLOW_AUTO_UPDATE=apply

# Minimum check interval in seconds; default is 21600
export SUPERFLOW_UPDATE_MIN_INTERVAL_SECONDS=21600
```

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
- Claude Code, Codex, or OpenCode
- npm access to install OpenSpec and Superpowers
- Git Bash or a compatible shell on Windows for hook scripts

## Star History

The chart is generated by Star History from public GitHub star data. It may stay
empty while the repository is private.

[![Star History Chart](https://api.star-history.com/svg?repos=basketballnotfound-mankun/superflow-cli&type=Date)](https://star-history.com/#basketballnotfound-mankun/superflow-cli&Date)

[Open the Star History chart](https://star-history.com/#basketballnotfound-mankun/superflow-cli&Date)

## License

MIT
