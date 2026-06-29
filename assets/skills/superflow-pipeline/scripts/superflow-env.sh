#!/usr/bin/env bash
# SuperBridge Flow script locator. Source this file to export paths to bundled scripts.
#
# Usage:
#   . /path/to/superflow-pipeline/scripts/superflow-env.sh
#
# This file is safe to source; it does not set global shell options.

_superflow_env_source="${BASH_SOURCE[0]:-$0}"
_superflow_script_dir="$(cd "$(dirname "$_superflow_env_source")" && pwd -P)"
_superflow_env_sourced=0
(return 0 2>/dev/null) && _superflow_env_sourced=1

export SUPERFLOW_GUARD="${SUPERFLOW_GUARD:-${_superflow_script_dir}/superflow-guard.sh}"
export SUPERFLOW_STATE="${SUPERFLOW_STATE:-${_superflow_script_dir}/superflow-state.sh}"
export SUPERFLOW_HANDOFF="${SUPERFLOW_HANDOFF:-${_superflow_script_dir}/superflow-handoff.sh}"
export SUPERFLOW_ARCHIVE="${SUPERFLOW_ARCHIVE:-${_superflow_script_dir}/superflow-archive.sh}"
export SUPERFLOW_STATUS="${SUPERFLOW_STATUS:-${_superflow_script_dir}/superflow-status.sh}"
export SUPERFLOW_YAML_VALIDATE="${SUPERFLOW_YAML_VALIDATE:-${_superflow_script_dir}/superflow-yaml-validate.sh}"

export SDD_GUARD="${SDD_GUARD:-$SUPERFLOW_GUARD}"
export SDD_STATE="${SDD_STATE:-$SUPERFLOW_STATE}"
export SDD_HANDOFF="${SDD_HANDOFF:-$SUPERFLOW_HANDOFF}"
export SDD_ARCHIVE="${SDD_ARCHIVE:-$SUPERFLOW_ARCHIVE}"
export SDD_STATUS="${SDD_STATUS:-$SUPERFLOW_STATUS}"
export SDD_YAML_VALIDATE="${SDD_YAML_VALIDATE:-$SUPERFLOW_YAML_VALIDATE}"

_superflow_bash_is_usable() {
  local candidate="$1"
  [ -n "$candidate" ] || return 1
  case "$candidate" in
    */Windows/System32/bash.exe|*/windows/system32/bash.exe|*\\Windows\\System32\\bash.exe|*\\windows\\system32\\bash.exe)
      return 1
      ;;
  esac
  "$candidate" -lc 'printf superflow-bash-ok' >/dev/null 2>&1
}

_superflow_resolve_bash() {
  local candidate

  if _superflow_bash_is_usable "${SDD_BASH:-}"; then
    printf '%s\n' "$SDD_BASH"
    return 0
  fi

  if _superflow_bash_is_usable "${BASH:-}"; then
    printf '%s\n' "$BASH"
    return 0
  fi

  candidate="$(command -v bash 2>/dev/null || true)"
  if _superflow_bash_is_usable "$candidate"; then
    printf '%s\n' "$candidate"
    return 0
  fi

  candidate="$(command -v sh 2>/dev/null | awk '{ sub(/\/sh(\.exe)?$/, "/bash.exe"); print }')"
  if _superflow_bash_is_usable "$candidate"; then
    printf '%s\n' "$candidate"
    return 0
  fi

  return 1
}

SDD_BASH="$(_superflow_resolve_bash || true)"
export SDD_BASH

_superflow_env_fail() {
  echo "ERROR: SuperBridge Flow scripts not found. Ensure the superflow-pipeline skill is installed completely." >&2
  echo "Expected path pattern: */superflow-pipeline/scripts/superflow-*.sh" >&2
}

_superflow_bash_fail() {
  echo "ERROR: usable bash not found. Install Git Bash or set SDD_BASH to a working bash executable." >&2
  echo "Windows WSL launcher bash.exe is not supported for SuperBridge Flow scripts." >&2
}

_superflow_env_abort() {
  local was_sourced="$_superflow_env_sourced"
  unset _superflow_env_source _superflow_script_dir _superflow_script _superflow_env_missing _superflow_env_sourced
  unset candidate
  unset -f _superflow_env_fail _superflow_bash_fail _superflow_bash_is_usable _superflow_resolve_bash
  if [ "$was_sourced" -eq 1 ]; then
    unset -f _superflow_env_abort
    return 1
  fi
  exit 1
}

_superflow_env_missing=0
if [ -z "$SDD_BASH" ]; then
  _superflow_bash_fail
  _superflow_env_missing=1
fi

for _superflow_script in \
  "$SDD_GUARD" \
  "$SDD_STATE" \
  "$SDD_HANDOFF" \
  "$SDD_ARCHIVE" \
  "$SDD_STATUS" \
  "$SDD_YAML_VALIDATE"; do
  if [ ! -f "$_superflow_script" ]; then
    _superflow_env_fail
    _superflow_env_missing=1
    break
  fi
done

if [ "$_superflow_env_missing" -ne 0 ]; then
  _superflow_env_abort
else
  unset _superflow_env_source _superflow_script_dir _superflow_script _superflow_env_missing _superflow_env_sourced
  unset candidate
  unset -f _superflow_env_fail _superflow_bash_fail _superflow_bash_is_usable _superflow_resolve_bash _superflow_env_abort
fi
