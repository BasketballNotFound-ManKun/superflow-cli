#!/bin/bash
# Session-scoped Superflow dependency update checker.
# Default mode installs updates. Set SUPERFLOW_AUTO_UPDATE=check to report only.

set -u

INPUT=""
if [ ! -t 0 ]; then
  INPUT=$(cat 2>/dev/null || true)
fi

MODE="${SUPERFLOW_AUTO_UPDATE:-apply}"
case "$MODE" in
  0|off|false|none) exit 0 ;;
  1|true|yes|apply) MODE="apply" ;;
  check|"") MODE="check" ;;
  *) MODE="check" ;;
esac

if [ "$MODE" = "0" ]; then
  exit 0
fi

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/superflow"
mkdir -p "$STATE_DIR" 2>/dev/null || exit 0

LANGUAGE="${SUPERFLOW_LANG:-}"
if [ -z "$LANGUAGE" ] && [ -f "$HOME/.sdd-state.json" ]; then
  LANGUAGE=$(python3 -c '
import json, os
try:
    with open(os.path.expanduser("~/.sdd-state.json"), encoding="utf-8") as f:
        print((json.load(f).get("language") or "").strip())
except Exception:
    pass
' 2>/dev/null)
fi
case "${LANGUAGE%%_*}" in
  en|en-*) LANGUAGE="en" ;;
  *) LANGUAGE="zh" ;;
esac

SESSION_KEY=$(printf '%s' "$INPUT" | python3 -c '
import hashlib, json, os, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw) if raw.strip() else {}
except Exception:
    data = {}
for key in ("session_id", "conversation_id", "thread_id", "transcript_path"):
    value = data.get(key)
    if value:
        print(str(value))
        raise SystemExit
cwd = data.get("cwd") or os.getcwd()
print("fallback:" + hashlib.sha256(cwd.encode()).hexdigest()[:16])
' 2>/dev/null)

[ -n "$SESSION_KEY" ] || SESSION_KEY="unknown"
SESSION_HASH=$(printf '%s' "$SESSION_KEY" | shasum -a 256 2>/dev/null | awk '{print $1}')
if [ -z "$SESSION_HASH" ]; then
  SESSION_HASH=$(printf '%s' "$SESSION_KEY" | sha256sum 2>/dev/null | awk '{print $1}')
fi
[ -n "$SESSION_HASH" ] || SESSION_HASH="unknown"

STAMP="$STATE_DIR/dependency-update-$SESSION_HASH.stamp"
GLOBAL_STAMP="$STATE_DIR/dependency-update-last.stamp"
LOG_FILE="$STATE_DIR/dependency-update.log"
LOCK_DIR="$STATE_DIR/dependency-update.lock"

# Bound by the existing installer; do not rediscover another installation on PATH.
SUPERFLOW_NODE=__SUPERFLOW_NODE__
SUPERFLOW_CLI=__SUPERFLOW_CLI__
if [ ! -x "$SUPERFLOW_NODE" ] || [ ! -f "$SUPERFLOW_CLI" ]; then
  printf '[Superflow] Installation runtime is unavailable; run superflow update to repair it. / 安装运行时不可用，请运行 superflow update 修复。\n' >&2
  exit 0
fi
PACKAGE_ROOT="$(cd "$(dirname "$SUPERFLOW_CLI")/../.." && pwd)" || exit 0
NPM_ENTRY="$PACKAGE_ROOT/scripts/npm-runtime.cjs"

npm_for_installation() {
  "$SUPERFLOW_NODE" "$NPM_ENTRY" "$@"
}

# One safe project migration per session. The CLI only removes known managed
# legacy entries after a provenance check, backs up the project config, and
# preserves custom hooks. A running Host may need a restart to reload hooks.
PROJECT_STAMP="$STATE_DIR/project-hooks-$SESSION_HASH.stamp"
if [ ! -f "$PROJECT_STAMP" ]; then
  HOST_AGENT=""
  case "$0" in
    */.codex/*) HOST_AGENT="codex" ;;
    */.claude/*) HOST_AGENT="claude" ;;
  esac
  if [ -n "$HOST_AGENT" ]; then
    MIGRATION_JSON="$("$SUPERFLOW_NODE" "$SUPERFLOW_CLI" hook-migrate --path "$PWD" --agent "$HOST_AGENT" --apply --json 2>/dev/null || true)"
    if [ -n "$MIGRATION_JSON" ]; then
      MIGRATED="$(printf '%s' "$MIGRATION_JSON" | python3 -c '
import json, sys
try:
    report = json.load(sys.stdin)
    print("1" if any(item.get("changed") for item in report.get("hosts", [])) else "0")
except Exception:
    print("0")
' 2>/dev/null)"
      if [ "$MIGRATED" = "1" ]; then
        printf '[Superflow] 已备份并迁移当前项目旧 Hook；请重启本会话以加载新配置。\n' >&2
      fi
      printf '%s\n' "$(date +%s)" > "$PROJECT_STAMP" 2>/dev/null || true
    fi
  fi
fi

now_epoch() {
  date +%s
}

MIN_INTERVAL="${SUPERFLOW_UPDATE_MIN_INTERVAL_SECONDS:-21600}"
NOW=$(now_epoch)

if [ -f "$STAMP" ]; then
  exit 0
fi

if [ -f "$GLOBAL_STAMP" ]; then
  LAST=$(cat "$GLOBAL_STAMP" 2>/dev/null || printf '0')
  case "$LAST" in
    ''|*[!0-9]*) LAST=0 ;;
  esac
  if [ "$((NOW - LAST))" -lt "$MIN_INTERVAL" ]; then
    printf '%s\n' "$NOW" > "$STAMP" 2>/dev/null || true
    exit 0
  fi
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

printf '%s\n' "$NOW" > "$STAMP" 2>/dev/null || true
printf '%s\n' "$NOW" > "$GLOBAL_STAMP" 2>/dev/null || true

run_logged() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE" 2>/dev/null || true
  "$@" >> "$LOG_FILE" 2>&1
}

latest_npm_version() {
  npm_for_installation view "$1" version --registry https://registry.npmjs.org 2>/dev/null | tail -n 1
}

installed_npm_version() {
  local json
  json="$(npm_for_installation list -g "$1" --depth=0 --json 2>/dev/null || true)"
  printf '%s' "$json" | python3 -c '
import json, sys
package_name = sys.argv[1]
try:
    data = json.load(sys.stdin)
except Exception:
    raise SystemExit
dep = (data.get("dependencies") or {}).get(package_name) or {}
version = dep.get("version")
if version:
    print(version)
' "$1"
}

detected_agents() {
  local agents=""
  command -v codex >/dev/null 2>&1 && agents="codex"
  if command -v claude >/dev/null 2>&1; then
    agents="${agents:+$agents,}claude"
  fi
  printf '%s' "$agents"
}

refresh_superflow_installation() {
  local agents="$1"
  [ -n "$agents" ] || return 1
  # The CLI owns package installation, handoff and asset verification once.
  run_logged "$SUPERFLOW_NODE" "$SUPERFLOW_CLI" update --agent "$agents" --scope auto --with-package
}

check_npm_package() {
  local package_name="$1"
  local current latest
  latest="$(latest_npm_version "$package_name")"
  [ -n "$latest" ] || return 0
  current="$(installed_npm_version "$package_name")"
  if [ -z "$current" ]; then
    printf '%s latest=%s installed=missing\n' "$package_name" "$latest"
  elif [ "$current" != "$latest" ]; then
    printf '%s latest=%s installed=%s\n' "$package_name" "$latest" "$current"
  fi
}

if [ "$MODE" = "apply" ]; then
  APPLY_FAILED=0
  if [ -z "$(latest_npm_version '@chenmk/superflow')" ]; then
    printf '[Superflow] Cannot confirm the latest version / 无法确认 @chenmk/superflow 的最新版本\n' >> "$LOG_FILE"
    APPLY_FAILED=1
  else
    AGENT_VALUE="$(detected_agents)"
    refresh_superflow_installation "$AGENT_VALUE" || APPLY_FAILED=1
  fi

  if [ "$APPLY_FAILED" -ne 0 ]; then
    rm -f "$STAMP" "$GLOBAL_STAMP" 2>/dev/null || true
    if [ "$LANGUAGE" = "en" ]; then
      printf '[Superflow] Automatic update was incomplete and remains retryable; details: %s\n' "$LOG_FILE" >&2
    else
      printf '[Superflow] 自动升级未完整完成，已保留重试资格；详情：%s\n' "$LOG_FILE" >&2
    fi
  else
    if [ "$LANGUAGE" = "en" ]; then
      printf '[Superflow] Automatic update refreshed CLI, dependencies, Skills, Hooks, rules, and managed MCP; restart the Agent to load the new runtime.\n' >&2
    else
      printf '[Superflow] 自动升级已完整更新 CLI、依赖、Skills、Hooks、规则和托管 MCP；请重启 Agent 加载新运行时。\n' >&2
    fi
  fi
else
  STATUS_FILE="$STATE_DIR/dependency-update-status.txt"
  {
    printf 'checked_at=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    check_npm_package "@chenmk/superflow"
    check_npm_package "@fission-ai/openspec"
    printf 'superpowers=run superflow update --with-package to refresh selected agent plugins\n'
  } > "$STATUS_FILE" 2>/dev/null || true
  if grep -Eq '^@' "$STATUS_FILE" 2>/dev/null; then
    if [ "$LANGUAGE" = "en" ]; then
      printf '[Superflow] Core dependency updates are available. Run superflow update --with-package; details: %s\n' "$STATUS_FILE" >&2
    else
      printf '[Superflow] 有核心依赖更新，执行 superflow update --with-package 统一更新；详情：%s\n' "$STATUS_FILE" >&2
    fi
  fi
fi

exit 0
