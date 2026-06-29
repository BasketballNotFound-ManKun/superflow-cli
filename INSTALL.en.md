# SuperBridge Flow Installation And Usage

[中文教程](./INSTALL.md)

SuperBridge Flow installs OpenSpec, Superpowers, skills, hooks or command
aliases, scripts, rules, and handoff state for Claude Code, Codex, and
OpenCode.

## 1. Install

```bash
npm install -g @chenmk/superflow
```

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

OpenSpec and Superpowers are required for the full workflow. OpenCode receives
skills and command aliases; native hook registration is not enabled for
OpenCode yet. understand-anything is best-effort.

## 3. Daily Workflow

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

## 6. Uninstall

```bash
superflow uninstall --agent codex --force
superflow uninstall --agent claude --force
superflow uninstall --agent opencode --force
```

This removes SuperBridge Flow managed assets only. It does not remove unrelated
agent configuration.
