# SuperBridge Flow Installation And Usage

[中文教程](./INSTALL.md)

SuperBridge Flow installs OpenSpec, Superpowers, skills, hooks or command
aliases, scripts, rules, and handoff state for Claude Code and Codex.

## 1. Install

```bash
npm install -g @chenmk/superflow
```

The repository `install.sh` and `install.ps1` scripts detect the Codex/Claude
Hosts actually installed and register their managed MCP entries together with
CLI, Skills, and Hooks. Single and non-default Host combinations are not forced
through `both`; only restart the detected Hosts after installation.

## 2. Initialize A Project

```bash
superflow init
```

Interactive init lets you select agent tools and language. For scripts:

```bash
superflow init --language en --yes
superflow init --language zh --yes
```

Global language selection is also supported:

```bash
superflow --language en --help
SUPERFLOW_LANG=en superflow init
```

`superflow init` performs:

1. Detect platform paths.
2. Install OpenSpec CLI.
3. Run native `openspec init <project> --tools ... --profile custom`.
4. Install Superpowers for selected Claude Code/Codex agents.
5. Try understand-anything and api-doc-changelog.
6. Deploy SuperBridge Flow/OpenSpec skills.
7. Register hooks and rules.
8. Scaffold `docs/sdd-context/`.

### 2.1 Register The Managed MCP (Recommended)

To start managed delivery directly from the current Codex or Claude host while
Superflow launches only the peer executor in the background, register the stdio
MCP server:

```bash
superflow mcp install --agent both
superflow mcp status --agent both
```

Restart Codex and Claude after registration. The current host remains responsible
for user interaction and independent review. MCP-created tasks always use
`external_host`, so Superflow does not launch another supervisor CLI of the same
type. This avoids duplicated context, nested-session authentication retries, and
duplicate supervisor token usage.

Use `superflow_managed_wait` for a local wait of up to twelve hours by default.
An active request exposes healthy progress through standard MCP progress
notifications. One checkpoint does not wake Host; two consecutive checkpoints
without an effective milestone return for attention, without repeating large
evidence payloads. When a task reaches `waiting_for_host_review`, the current host performs
one complete review and submits the structured result. Superflow then enters a
three-stage delivery state and never commits, pushes, deploys, or writes to production automatically.

To remove the registration:

```bash
superflow mcp remove --agent both
```

Superflow no longer provides a background supervisor CLI mode. Historical tasks
are migrated to direct host review on resume, and no entry point starts a second
supervisor Agent process.

Verify the registrations with:

```bash
codex mcp get superflow
claude mcp get superflow
```

OpenSpec and Superpowers are required for the full workflow. understand-anything
is best-effort.

## 3. Daily Workflow

In Codex:

```text
Use $superflow-pipeline to analyze this requirement and drive the full workflow.
```

In Claude Code:

```text
/superflow-pipeline
```

The workflow phases are:

```text
docs -> design -> implement -> verify -> archive
```

OpenSpec/SDD owns WHAT and contracts. Superpowers owns source-level HOW.

## 4. Status And Recovery

```bash
superflow status
superflow doctor
```

`status` shows active changes, phase, next command, and risk hints. If a session
was compressed or interrupted, ask the agent to continue the current SuperBridge
Flow change. It will read `.sdd/state.yaml` and `.sdd/handoff`.

To regenerate project context templates:

```bash
superflow scan --language en
superflow scan --language en --force
```

`scan` keeps edited files by default. Use `--force` only when you want to
overwrite the four files under `docs/sdd-context/`.

## 5. Updates

Refresh installed skills, hooks, scripts, and rules:

```bash
superflow update
```

Also update the npm package, OpenSpec, and Superpowers:

```bash
superflow update --with-package
```

Automatic checks are enabled by default but do not install updates:

```bash
export SUPERFLOW_AUTO_UPDATE=check
export SUPERFLOW_AUTO_UPDATE=0
export SUPERFLOW_AUTO_UPDATE=apply
export SUPERFLOW_UPDATE_MIN_INTERVAL_SECONDS=21600
```

Team environments should keep `check`. Personal machines may choose `apply`.
In `apply` mode, package upgrades are followed by the newly installed CLI, which
redeploys Skills, Hooks, rules, scripts, and managed MCP registrations. Partial
failure removes the throttle stamp and remains eligible for the next-session retry.
Restart the Agent after success to load the new MCP process.

## 6. Uninstall

```bash
superflow uninstall --agent codex --force
superflow uninstall --agent claude --force
```

This removes SuperBridge Flow managed assets only. It does not remove unrelated
agent configuration.
