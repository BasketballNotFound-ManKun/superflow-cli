#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  superflow-yaml-validate.sh <change-dir>

Validate <change-dir>/.sdd/state.yaml structure, enums, known fields, and
referenced paths.
USAGE
}

die() {
  printf 'superflow-yaml-validate: %s\n' "$*" >&2
  exit 1
}

CHANGE_DIR="${1:-}"
[[ -n "$CHANGE_DIR" && "$CHANGE_DIR" != "-h" && "$CHANGE_DIR" != "--help" ]] || {
  usage
  exit 0
}

[[ -d "$CHANGE_DIR" ]] || die "change dir not found: $CHANGE_DIR"
CHANGE_DIR="$(cd "$CHANGE_DIR" && pwd)"
STATE="$CHANGE_DIR/.sdd/state.yaml"
[[ -f "$STATE" ]] || die "state not found: $STATE"

ERRORS=0
WARNINGS=0

fail() {
  printf 'FAIL %s\n' "$*" >&2
  ERRORS=$((ERRORS + 1))
}

warn() {
  printf 'WARN %s\n' "$*" >&2
  WARNINGS=$((WARNINGS + 1))
}

value_of() {
  local key="$1"
  awk -F':' -v k="$key" '
    $1 == k {
      value = $0
      sub("^[^:]*:[[:space:]]*", "", value)
      sub("[[:space:]]+#.*$", "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      print value
      found=1
    }
    END { exit found ? 0 : 1 }
  ' "$STATE"
}

require_field() {
  local key="$1"
  grep -q "^${key}:" "$STATE" || fail "missing required field '$key'"
}

validate_enum() {
  local key="$1"
  local allowed="$2"
  local value
  value="$(value_of "$key" 2>/dev/null || true)"
  [[ -z "$value" || "$value" == "null" ]] && return
  for item in $allowed; do
    [[ "$value" == "$item" ]] && return
  done
  fail "$key='$value' is invalid; expected one of: $allowed"
}

validate_path_field() {
  local key="$1"
  local value
  value="$(value_of "$key" 2>/dev/null || true)"
  [[ -z "$value" || "$value" == "null" ]] && return
  [[ -f "$CHANGE_DIR/$value" || -f "$value" ]] || fail "$key path does not exist: $value"
}

REQUIRED_FIELDS="workflow phase canonical_spec build_mode tdd_mode review_mode isolation verify_mode auto_transition verify_result verification_report branch_status archived handoff_context handoff_hash created_at updated_at"
for field in $REQUIRED_FIELDS; do
  require_field "$field"
done

validate_enum workflow "full hotfix tweak"
validate_enum phase "docs design implement verify archive done"
validate_enum build_mode "subagent-driven-development executing-plans team-prompt direct"
validate_enum build_pause "plan-ready"
validate_enum subagent_dispatch "confirmed"
validate_enum tdd_mode "tdd direct"
validate_enum review_mode "off standard thorough"
validate_enum isolation "branch worktree"
validate_enum verify_mode "light full"
validate_enum auto_transition "true false"
validate_enum verify_result "pending pass fail"
validate_enum branch_status "pending handled"
validate_enum archived "true false"
validate_enum direct_override "true false"
validate_enum context_compression "off beta"

handoff_hash="$(value_of handoff_hash 2>/dev/null || true)"
if [[ -n "$handoff_hash" && "$handoff_hash" != "null" && ! "$handoff_hash" =~ ^[a-f0-9]{64}$ ]]; then
  fail "handoff_hash is not a sha256 hex digest: $handoff_hash"
fi

validate_path_field handoff_context
validate_path_field implementation_prompt
validate_path_field verification_report
validate_path_field design_doc
validate_path_field technical_design
validate_path_field plan

KNOWN="workflow phase canonical_spec context_compression design_doc technical_design plan base_ref build_mode build_pause subagent_dispatch tdd_mode review_mode isolation verify_mode auto_transition verify_result verification_report branch_status archived direct_override build_command verify_command handoff_context handoff_hash superpower_strategy implementation_prompt worktree_ports created_at verified_at updated_at"
while IFS= read -r line; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" == *:* ]] || {
    fail "malformed state line without ':' -> $line"
    continue
  }
  IFS=: read -r key _ <<< "$line"
  key="$(printf '%s' "$key" | tr -d '[:space:]')"
  [[ -z "$key" ]] && continue
  found=0
  for known in $KNOWN; do
    [[ "$key" == "$known" ]] && found=1 && break
  done
  [[ "$found" -eq 1 ]] || warn "unknown field '$key'"
done < "$STATE"

if [[ "$ERRORS" -gt 0 ]]; then
  printf 'superflow state validation failed: %s error(s), %s warning(s)\n' "$ERRORS" "$WARNINGS" >&2
  exit 1
fi

printf 'superflow state validation passed: %s warning(s)\n' "$WARNINGS"
