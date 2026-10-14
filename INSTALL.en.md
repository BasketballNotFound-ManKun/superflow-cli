# SuperBridge Flow Installation And Usage

[中文教程](./INSTALL.md)

SuperBridge Flow installs OpenSpec, Superpowers, skills, hooks or command
aliases, scripts, rules, and handoff state for Claude Code and Codex.

## 1. Install

```bash
npx --yes --package=@chenmk/superflow@latest --registry=https://registry.npmjs.org superflow-install
```

This bootstrap command installs the CLI. Continue with initialization and MCP
registration below before using the skills and managed work in a conversation.
With Node.js 20+ already available, you can also install directly:

```bash
npm install -g @chenmk/superflow@latest --registry https://registry.npmjs.org
```

> **Node.js requirement:** Node.js 20 or later is required. If `node -v` is older,
> installation stops before command aliases are created. With nvm, run
> `nvm install 20 && nvm use 20 && nvm alias default 20`, open a new terminal, and reinstall.

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
5. Try understand-anything; API change annotation is deployed with the core skills.
6. Deploy Superflow skills under the unified superflow namespace.
7. Register hooks and rules.
8. Scaffold `docs/sdd-context/`.

### 2.1 Register The Managed MCP

To start managed delivery directly from the current Codex or Claude host while
Superflow launches only the peer executor in the background, register the stdio
MCP server:

```bash
superflow mcp install --agent claude
superflow mcp status --agent claude
```

Use `codex` for Codex or `both` for both tools. Restart the selected tools after
registration. In Claude Code conversations use `/superflow`; in Codex use
`$superflow`. The current host remains responsible
for user interaction and independent review. MCP-created tasks always use
`external_host`, so Superflow does not launch another supervisor CLI of the same
type. This avoids duplicated context, nested-session authentication retries, and
duplicate supervisor token usage.

Use `superflow_managed_wait` with its default 240-second transport window.
Resume a timed-out window using its returned sequence; hosts that support
longer tool calls can explicitly increase the window.
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
Use $superflow to analyze this requirement and drive the full workflow.
```

In Claude Code:

```text
/superflow
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

Default checks query npm and remind you to refresh Superpowers. Manual update or
`apply` updates the plugins. Use `superflow update --agent codex --scope global --with-dependencies`
to refresh OpenSpec, Superpowers and host assets without reinstalling the CLI.
Codex plugin identity/version/enablement comes from native inventory (currently
`superpowers@openai-curated-remote`), not legacy config.toml entries or residual caches.

```bash
export SUPERFLOW_AUTO_UPDATE=check
export SUPERFLOW_AUTO_UPDATE=0
export SUPERFLOW_AUTO_UPDATE=apply
export SUPERFLOW_UPDATE_MIN_INTERVAL_SECONDS=21600
```

Team environments should keep `check`. Personal machines may choose `apply`.
In `apply` mode, package upgrades are followed by the newly installed CLI, which
updates OpenSpec/Superpowers and redeploys Skills, Hooks, rules, scripts, and managed MCP registrations. Partial
failure removes the throttle stamp and remains eligible for the next-session retry.
Restart the Agent after success to load the new MCP process.

## 6. Uninstall

```bash
superflow uninstall --agent codex --force
superflow uninstall --agent claude --force
```

This removes SuperBridge Flow managed assets only. It does not remove unrelated
agent configuration.

`--agent` limits both current-scope and registered-project refreshes; selecting Codex does not add Claude. `--scope` selects the current entry scope. Existing registered projects still refresh the selected platforms at their recorded scope; the update plan lists every target.
