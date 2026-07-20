#!/bin/bash
# Session-scoped Superflow dependency update checker.
# Default mode checks and reports updates. Set SUPERFLOW_AUTO_UPDATE=apply to install.

set -u

INPUT=""
if [ ! -t 0 ]; then
  INPUT=$(cat 2>/dev/null || true)
fi

MODE="${SUPERFLOW_AUTO_UPDATE:-check}"
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
  npm view "$1" version 2>/dev/null | tail -n 1
}

installed_npm_version() {
  local json
  json="$(npm list -g "$1" --depth=0 --json 2>/dev/null || true)"
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

update_npm_if_needed() {
  local package_name="$1"
  local current latest
  command -v npm >/dev/null 2>&1 || return 0
  latest="$(latest_npm_version "$package_name")"
  [ -n "$latest" ] || return 0
  current="$(installed_npm_version "$package_name")"
  if [ "$current" != "$latest" ]; then
    run_logged npm install -g "$package_name@latest" || true
  fi
}

check_npm_package() {
  local package_name="$1"
  local current latest
  command -v npm >/dev/null 2>&1 || return 0
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
  update_npm_if_needed "@chenmk/superflow"
  update_npm_if_needed "@fission-ai/openspec"

  if command -v claude >/dev/null 2>&1; then
    run_logged claude plugin install superpowers@superpowers-marketplace || true
  fi

  if command -v codex >/dev/null 2>&1; then
    run_logged codex plugin add superpowers@openai-api-curated || true
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
    printf '[Superflow] 有核心依赖更新，执行 superflow update --with-package 统一更新；详情：%s\n' "$STATUS_FILE" >&2
  fi
fi

exit 0
