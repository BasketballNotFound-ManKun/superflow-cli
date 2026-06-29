#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  superflow-state.sh init <change-dir> [workflow|phase] [phase]
  superflow-state.sh status <change-dir>
  superflow-state.sh set <change-dir> <key> <value>
  superflow-state.sh get <change-dir> <key>
  superflow-state.sh phase <change-dir>
  superflow-state.sh transition <change-dir> <docs-complete|design-complete|implement-complete|verify-pass|verify-fail|archive-reopen|archived>
  superflow-state.sh next <change-dir>
  superflow-state.sh recover <change-dir>
  superflow-state.sh scale <change-dir>
  superflow-state.sh task-checkoff <file> <task-text>

State is stored at <change-dir>/.sdd/state.yaml.
USAGE
}

die() {
  printf 'superflow-state: %s\n' "$*" >&2
  exit 1
}

today_utc() {
  date -u '+%Y-%m-%d'
}

now_utc() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

state_file() {
  printf '%s/.sdd/state.yaml' "$1"
}

ensure_change_dir() {
  [[ -d "$1" ]] || die "change dir not found: $1"
}

normalize_null() {
  local value="${1:-}"
  if [[ -z "$value" || "$value" == "null" ]]; then
    printf 'null'
  else
    printf '%s' "$value"
  fi
}

yaml_value_from_file() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 1
  awk -F':' -v k="$key" '
    $1 == k {
      value = $0
      sub("^[^:]*:[[:space:]]*", "", value)
      sub("[[:space:]]+#.*$", "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^"|"$/, "", value)
      gsub(/^'\''|'\''$/, "", value)
      print value
      found=1
    }
    END { exit found ? 0 : 1 }
  ' "$file"
}

project_root_for_change() {
  if git -C "$CHANGE_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
    git -C "$CHANGE_DIR" rev-parse --show-toplevel
  else
    dirname "$(dirname "$CHANGE_DIR")"
  fi
}

sdd_config_value() {
  local key="$1"
  local default="$2"
  local env_name="$3"
  local root value

  if [[ -n "${!env_name:-}" ]]; then
    printf '%s\n' "${!env_name}"
    return
  fi

  if value="$(yaml_value_from_file "$CHANGE_DIR/.sdd/config.yaml" "$key" 2>/dev/null)"; then
    [[ -n "$value" ]] && { printf '%s\n' "$value"; return; }
  fi

  root="$(project_root_for_change)"
  if value="$(yaml_value_from_file "$root/.sdd/config.yaml" "$key" 2>/dev/null)"; then
    [[ -n "$value" ]] && { printf '%s\n' "$value"; return; }
  fi

  printf '%s\n' "$default"
}

review_mode_default() {
  local value
  value="$(sdd_config_value review_mode null SUPERFLOW_REVIEW_MODE)"
  if [[ "$value" == "null" && -n "${SDD_REVIEW_MODE:-}" ]]; then
    value="$SDD_REVIEW_MODE"
  fi
  validate_config_enum review_mode "$value" "null off standard thorough"
  printf '%s\n' "$value"
}

validate_config_enum() {
  local key="$1"
  local value="$2"
  local allowed="$3"
  local item
  for item in $allowed; do
    [[ "$value" == "$item" ]] && return
  done
  die "invalid $key: $value (expected: $allowed)"
}

field_value() {
  local key="$1"
  [[ -f "$STATE_FILE" ]] || return 1
  awk -F':' -v k="$key" '
    $1 == k {
      value = $0
      sub("^[^:]*:[[:space:]]*", "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      print value
      found=1
    }
    END { exit found ? 0 : 1 }
  ' "$STATE_FILE"
}

replace_field() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"

  if grep -q "^${key}:" "$STATE_FILE" 2>/dev/null; then
    awk -v k="$key" -v v="$value" '
      index($0, k ":") == 1 { print k ": " v; next }
      { print }
    ' "$STATE_FILE" > "$tmp"
  else
    cat "$STATE_FILE" > "$tmp"
    printf '%s: %s\n' "$key" "$value" >> "$tmp"
  fi

  awk -v now="$(now_utc)" '
    /^updated_at:/ { print "updated_at: " now; seen=1; next }
    { print }
    END { if (!seen) print "updated_at: " now }
  ' "$tmp" > "$STATE_FILE"
  rm -f "$tmp"
}

cmd_init() {
  local workflow_or_phase="${3:-full}"
  local phase="${4:-}"
  local workflow
  local base_ref="null"
  local context_compression auto_transition review_mode

  case "$workflow_or_phase" in
    docs|design|implement|verify|archive|done)
      workflow="full"
      phase="$workflow_or_phase"
      ;;
    full|hotfix|tweak)
      workflow="$workflow_or_phase"
      phase="${phase:-docs}"
      ;;
    sdd)
      workflow="full"
      phase="${phase:-docs}"
      ;;
    *)
      die "invalid workflow or phase: $workflow_or_phase"
      ;;
  esac

  mkdir -p "$(dirname "$STATE_FILE")"
  context_compression="$(sdd_config_value context_compression off SDD_CONTEXT_COMPRESSION)"
  auto_transition="$(sdd_config_value auto_transition true SDD_AUTO_TRANSITION)"
  validate_config_enum context_compression "$context_compression" "off beta"
  validate_config_enum auto_transition "$auto_transition" "true false"
  if [[ "$workflow" == "hotfix" || "$workflow" == "tweak" ]]; then
    review_mode="off"
  else
    review_mode="$(review_mode_default)"
  fi

  if git -C "$CHANGE_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if base_ref_candidate="$(git -C "$CHANGE_DIR" rev-parse --verify HEAD 2>/dev/null)"; then
      base_ref="$base_ref_candidate"
    fi
  fi

  if [[ ! -f "$STATE_FILE" ]]; then
    cat > "$STATE_FILE" <<EOF
workflow: $workflow
phase: $phase
canonical_spec: openspec-sdd
context_compression: $context_compression
design_doc: null
technical_design: null
plan: null
base_ref: $base_ref
build_mode: null
build_pause: null
subagent_dispatch: null
tdd_mode: null
review_mode: $review_mode
isolation: null
verify_mode: null
auto_transition: $auto_transition
verify_result: pending
verification_report: null
branch_status: pending
archived: false
direct_override: false
build_command: null
verify_command: null
handoff_context: null
handoff_hash: null
superpower_strategy: null
implementation_prompt: null
worktree_ports: null
created_at: $(today_utc)
verified_at: null
updated_at: $(now_utc)
EOF
  fi

  printf '%s\n' "$STATE_FILE"
}

cmd_set() {
  local key="${3:-}"
  local value="${4:-}"
  [[ -n "$key" ]] || die "missing key"
  [[ -f "$STATE_FILE" ]] || cmd_init init "$CHANGE_DIR" docs >/dev/null

  case "$key" in
    phase)
      if [[ "${SUPERFLOW_FORCE_PHASE:-0}" != "1" && "${SDD_FORCE_PHASE:-0}" != "1" ]]; then
        die "setting phase directly is blocked; use superflow-state.sh transition <change-dir> <event> or set SUPERFLOW_FORCE_PHASE=1 for repair"
      fi
      ;;
    workflow|canonical_spec|context_compression|design_doc|technical_design|plan|base_ref|build_mode|build_pause|subagent_dispatch|tdd_mode|review_mode|isolation|verify_mode|auto_transition|verify_result|verification_report|branch_status|archived|direct_override|build_command|verify_command|handoff_context|handoff_hash|superpower_strategy|implementation_prompt|worktree_ports|created_at|verified_at|updated_at) ;;
    *) die "unknown state key: $key" ;;
  esac

  replace_field "$key" "$(normalize_null "$value")"
}

cmd_get() {
  local key="${3:-}"
  [[ -n "$key" ]] || die "missing key"
  [[ -f "$STATE_FILE" ]] || die "state not found: $STATE_FILE"
  field_value "$key"
}

require_phase() {
  local expected="$1"
  local current
  current="$(field_value phase 2>/dev/null || true)"
  [[ "$current" == "$expected" ]] || die "expected phase '$expected', got '${current:-missing}'"
}

require_file_value_exists() {
  local key="$1"
  local value
  value="$(field_value "$key" 2>/dev/null || true)"
  value="$(normalize_null "$value")"
  [[ "$value" != "null" ]] || die "$key is not set"
  [[ -f "$CHANGE_DIR/$value" || -f "$value" ]] || die "$key path does not exist: $value"
}

require_implement_decisions() {
  local workflow build_mode isolation tdd_mode review_mode subagent_dispatch direct_override
  workflow="$(field_value workflow 2>/dev/null || printf 'full')"
  build_mode="$(field_value build_mode 2>/dev/null || printf 'null')"
  isolation="$(field_value isolation 2>/dev/null || printf 'null')"
  tdd_mode="$(field_value tdd_mode 2>/dev/null || printf 'null')"
  review_mode="$(field_value review_mode 2>/dev/null || printf 'null')"
  subagent_dispatch="$(field_value subagent_dispatch 2>/dev/null || printf 'null')"
  direct_override="$(field_value direct_override 2>/dev/null || printf 'false')"

  case "$isolation" in branch|worktree|null) ;; *) die "invalid isolation: $isolation" ;; esac
  [[ "$isolation" != "null" ]] || die "isolation must be branch or worktree before verify"

  case "$build_mode" in subagent-driven-development|executing-plans|team-prompt|direct|null) ;; *) die "invalid build_mode: $build_mode" ;; esac
  [[ "$build_mode" != "null" ]] || die "build_mode must be selected before verify"

  if [[ "$build_mode" == "subagent-driven-development" && "$subagent_dispatch" != "confirmed" ]]; then
    die "subagent_dispatch must be confirmed for subagent-driven-development"
  fi

  if [[ "$workflow" == "full" ]]; then
    case "$tdd_mode" in tdd|direct) ;; *) die "tdd_mode must be tdd or direct for full workflow" ;; esac
    case "$review_mode" in off|standard|thorough) ;; *) die "review_mode must be off, standard, or thorough for full workflow" ;; esac
    if [[ "$build_mode" == "direct" && "$direct_override" != "true" ]]; then
      die "full workflow direct build requires direct_override=true"
    fi
  fi
}

cmd_transition() {
  local event="${3:-}"
  [[ -f "$STATE_FILE" ]] || die "state not found: $STATE_FILE"

  case "$event" in
    docs-complete)
      require_phase docs
      require_file_value_exists handoff_context
      workflow="$(field_value workflow 2>/dev/null || printf 'full')"
      if [[ "$workflow" == "full" ]]; then
        replace_field phase design
      else
        replace_field phase implement
      fi
      ;;
    design-complete)
      require_phase design
      require_file_value_exists technical_design
      replace_field phase implement
      ;;
    implement-complete)
      require_phase implement
      require_implement_decisions
      replace_field phase verify
      replace_field verify_result pending
      replace_field branch_status pending
      ;;
    verify-pass)
      require_phase verify
      require_file_value_exists verification_report
      replace_field verify_result pass
      replace_field verified_at "$(today_utc)"
      replace_field phase archive
      ;;
    verify-fail)
      require_phase verify
      replace_field verify_result fail
      replace_field phase implement
      ;;
    archive-reopen)
      require_phase archive
      replace_field phase verify
      replace_field archived false
      ;;
    archived)
      require_phase archive
      replace_field archived true
      replace_field phase done
      ;;
    *)
      die "unknown transition event: $event"
      ;;
  esac
}

cmd_status() {
  [[ -f "$STATE_FILE" ]] || die "state not found: $STATE_FILE"
  cat "$STATE_FILE"
}

cmd_next() {
  [[ -f "$STATE_FILE" ]] || die "state not found: $STATE_FILE"
  local phase workflow auto archived skill
  phase="$(field_value phase 2>/dev/null || printf 'docs')"
  workflow="$(field_value workflow 2>/dev/null || printf 'full')"
  auto="$(field_value auto_transition 2>/dev/null || printf 'true')"
  archived="$(field_value archived 2>/dev/null || printf 'false')"

  if [[ "$archived" == "true" || "$phase" == "done" ]]; then
    printf 'NEXT: done\n'
    printf 'HINT: SDD lifecycle is complete.\n'
    return
  fi

  case "$phase" in
    docs) skill="superflow-docs" ;;
    design) skill="superflow-design" ;;
    implement) skill="superflow-implement" ;;
    verify) skill="superflow-verify" ;;
    archive) skill="superflow-archive" ;;
    *) skill="superflow-pipeline" ;;
  esac

  if [[ "$workflow" == "hotfix" && "$phase" == "implement" ]]; then
    skill="superflow-hotfix"
  elif [[ "$workflow" == "tweak" && "$phase" == "implement" ]]; then
    skill="superflow-tweak"
  fi

  if [[ "$auto" == "false" ]]; then
    printf 'NEXT: manual\n'
  else
    printf 'NEXT: auto\n'
  fi
  printf 'SKILL: %s\n' "$skill"
  printf 'PHASE: %s\n' "$phase"
  printf 'HINT: continue with $%s for phase %s.\n' "$skill" "$phase"
}

cmd_recover() {
  [[ -f "$STATE_FILE" ]] || die "state not found: $STATE_FILE"
  local phase handoff hash prompt report verify_result archived technical_design
  local build_pause build_mode isolation plan subagent_dispatch review_mode
  phase="$(field_value phase 2>/dev/null || printf 'docs')"
  handoff="$(field_value handoff_context 2>/dev/null || printf 'null')"
  hash="$(field_value handoff_hash 2>/dev/null || printf 'null')"
  prompt="$(field_value implementation_prompt 2>/dev/null || printf 'null')"
  technical_design="$(field_value technical_design 2>/dev/null || printf 'null')"
  report="$(field_value verification_report 2>/dev/null || printf 'null')"
  verify_result="$(field_value verify_result 2>/dev/null || printf 'pending')"
  archived="$(field_value archived 2>/dev/null || printf 'false')"
  build_pause="$(field_value build_pause 2>/dev/null || printf 'null')"
  build_mode="$(field_value build_mode 2>/dev/null || printf 'null')"
  isolation="$(field_value isolation 2>/dev/null || printf 'null')"
  plan="$(field_value plan 2>/dev/null || printf 'null')"
  subagent_dispatch="$(field_value subagent_dispatch 2>/dev/null || printf 'null')"
  review_mode="$(field_value review_mode 2>/dev/null || printf 'null')"

  printf 'SDD Recovery\n'
  printf 'phase: %s\n' "$phase"
  printf 'handoff_context: %s\n' "$handoff"
  printf 'handoff_hash: %s\n' "$hash"
  printf 'implementation_prompt: %s\n' "$prompt"
  printf 'technical_design: %s\n' "$technical_design"
  printf 'plan: %s\n' "$plan"
  printf 'build_pause: %s\n' "$build_pause"
  printf 'build_mode: %s\n' "$build_mode"
  printf 'isolation: %s\n' "$isolation"
  printf 'subagent_dispatch: %s\n' "$subagent_dispatch"
  printf 'review_mode: %s\n' "$review_mode"
  printf 'verification_report: %s\n' "$report"
  printf 'verify_result: %s\n' "$verify_result"
  printf 'archived: %s\n' "$archived"

  case "$phase" in
    docs)
      printf 'Recovery action: read current OpenSpec/SDD contract docs and handoff, regenerate handoff if docs changed, then run superflow-guard docs.\n'
      ;;
    design)
      printf 'Recovery action: read .sdd/handoff/sdd-context.md, api.md, design.md, tests.md, brainstorm-summary.md when present, then use superflow-design to create or refresh technical_design before superflow-guard design.\n'
      ;;
    implement)
      if [[ "$build_pause" == "plan-ready" && "$isolation" != "null" && "$build_mode" != "null" ]]; then
        printf 'Recovery action: stale plan-ready pause detected; run superflow-state.sh set <change-dir> build_pause null, then resume from the first unchecked task using build_mode=%s.\n' "$build_mode"
      elif [[ "$build_pause" == "plan-ready" && "$plan" != "null" ]]; then
        if [[ -f "$CHANGE_DIR/$plan" || -f "$plan" ]]; then
          printf 'Recovery action: plan-ready pause is active; do not regenerate the plan. Ask the user to choose isolation/build_mode/tdd_mode, record decisions, then continue implementation.\n'
        else
          printf 'Recovery action: plan-ready pause is corrupt because plan is missing. Return to superflow-implement to repair or regenerate the plan before coding.\n'
        fi
      elif [[ "$build_mode" == "subagent-driven-development" ]]; then
        printf 'Recovery action: act as coordinator only; reload Superpowers subagent-driven-development, read .sdd/subagent-progress.md, and resume the exact checkpoint without coding in the main session.\n'
      else
        printf 'Recovery action: read .sdd/handoff/sdd-context.md plus api.md/design.md/tests.md and technical_design, verify prompt hash, then continue implementation prompt/worktree from the first incomplete batch.\n'
      fi
      ;;
    verify)
      printf 'Recovery action: read test-report.md, rerun required hook scripts, set verification_report, then run superflow-guard verify.\n'
      ;;
    archive)
      if [[ "$archived" == "true" ]]; then
        printf 'Recovery action: archive already marked complete; do not rerun archive.\n'
      else
        printf 'Recovery action: verification passed; ask user for archive confirmation before marking archived.\n'
      fi
      ;;
    done)
      printf 'Recovery action: lifecycle complete; no further action.\n'
      ;;
  esac
}

cmd_scale() {
  [[ -f "$STATE_FILE" ]] || cmd_init init "$CHANGE_DIR" docs >/dev/null
  local task_count capability_count changed_files risk_hits mode

  task_count="$(grep -RE '^- \[[ xX]\]' "$CHANGE_DIR"/*.md "$CHANGE_DIR"/**/*.md 2>/dev/null | wc -l | tr -d ' ')"
  capability_count="$(find "$CHANGE_DIR" -path '*/specs/*/spec.md' -type f 2>/dev/null | wc -l | tr -d ' ')"
  changed_files=0
  if git -C "$CHANGE_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    changed_files="$(git -C "$CHANGE_DIR" diff --name-only HEAD 2>/dev/null | wc -l | tr -d ' ')"
  fi

  risk_hits="$(grep -REi 'api|接口|curl|SQL|数据库|Mapper|XML|跨仓|状态字段|枚举|真实入口|payment|refund|MQ|定时任务|第三方|SDK' "$CHANGE_DIR"/*.md "$CHANGE_DIR"/**/*.md 2>/dev/null | wc -l | tr -d ' ')"

  mode="light"
  if [[ "$task_count" -gt 3 || "$capability_count" -gt 1 || "$changed_files" -gt 4 || "$risk_hits" -gt 0 ]]; then
    mode="full"
  fi

  replace_field verify_mode "$mode"
  printf 'verify_mode: %s\n' "$mode"
  printf 'task_count: %s\n' "$task_count"
  printf 'capability_count: %s\n' "$capability_count"
  printf 'changed_files: %s\n' "$changed_files"
  printf 'sdd_risk_hits: %s\n' "$risk_hits"
}

cmd_task_checkoff() {
  local file="${2:-}"
  local task_text="${3:-}"
  [[ -n "$file" && -n "$task_text" ]] || die "usage: superflow-state.sh task-checkoff <file> <task-text>"
  [[ -f "$file" ]] || die "task file not found: $file"

  awk -v task="$task_text" '
    index($0, task) > 0 {
      count++
      if ($0 ~ /^[[:space:]]*-[[:space:]]+\[[xX]\]/) checked++
      last=$0
    }
    END {
      if (count == 0) {
        printf "task-checkoff failed: task text not found: %s\n", task > "/dev/stderr"
        exit 1
      }
      if (count > 1) {
        printf "task-checkoff failed: task text is not unique (%d matches): %s\n", count, task > "/dev/stderr"
        exit 1
      }
      if (checked != 1) {
        printf "task-checkoff failed: task is not checked: %s\n", last > "/dev/stderr"
        exit 1
      }
      printf "task-checkoff passed: %s\n", task
    }
  ' "$file"
}

CMD="${1:-}"
CHANGE_DIR="${2:-}"

[[ -n "$CMD" && "$CMD" != "-h" && "$CMD" != "--help" ]] || {
  usage
  exit 0
}

if [[ "$CMD" == "task-checkoff" ]]; then
  cmd_task_checkoff "$@"
  exit 0
fi

[[ -n "$CHANGE_DIR" ]] || die "missing change dir"
ensure_change_dir "$CHANGE_DIR"
CHANGE_DIR="$(cd "$CHANGE_DIR" && pwd)"
STATE_FILE="$(state_file "$CHANGE_DIR")"

case "$CMD" in
  init) cmd_init "$@" ;;
  status) cmd_status ;;
  set) cmd_set "$@" ;;
  get) cmd_get "$@" ;;
  phase) cmd_get get "$CHANGE_DIR" phase ;;
  transition) cmd_transition "$@" ;;
  next) cmd_next ;;
  recover) cmd_recover ;;
  scale) cmd_scale ;;
  *)
    usage
    exit 1
    ;;
esac
