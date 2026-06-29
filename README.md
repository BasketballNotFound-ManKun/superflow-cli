# SuperBridge Flow

[中文文档](./README.zh-CN.md)

SuperBridge Flow is a workflow CLI for bringing OpenSpec/SDD and Superpowers
together in real software delivery.

- OpenSpec/SDD owns **WHAT**: requirements, API contracts, database and field
  semantics, tests, real-entry acceptance, and quality gates.
- Superpowers owns source-level **HOW**: technical design, TDD order,
  worktree/team execution, review, and verification discipline.
- The full lifecycle is `docs -> design -> implement -> verify -> archive`.

The CLI installs skills, hooks, rules, scripts, handoff state, and dependency
guards for Claude Code and Codex.

## Install

```bash
npm install -g @chenmk/superflow
```

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
- Claude Code or Codex
- npm access to install OpenSpec and Superpowers
- Git Bash or a compatible shell on Windows for hook scripts

## License

MIT
