#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  superflow-handoff.sh <change-dir> [--write|--hash-only|--refresh]

Generate a deterministic SDD handoff pack from OpenSpec/SDD documents.
The pack is context for Superpowers execution strategy; OpenSpec/SDD docs
remain the canonical source of truth.
USAGE
}

die() {
  printf 'superflow-handoff: %s\n' "$*" >&2
  exit 1
}

sha_file() {
  # Ignore generated state/hash marker lines so recording the handoff hash in
  # SDD docs does not change the handoff hash itself.
  if command -v sha256sum >/dev/null 2>&1; then
    sed -E '/handoff_hash/d;/context_hash/d;/sdd-context\.sha256/d;/[a-f0-9]{64}/d;/pending/d;/^[[:space:]]*$/d' "$1" \
      | sha256sum | awk '{print $1}'
  else
    sed -E '/handoff_hash/d;/context_hash/d;/sdd-context\.sha256/d;/[a-f0-9]{64}/d;/pending/d;/^[[:space:]]*$/d' "$1" \
      | shasum -a 256 | awk '{print $1}'
  fi
}

json_escape() {
  sed 's/\\/\\\\/g; s/"/\\"/g'
}

yaml_value() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 1
  awk -F':' -v k="$key" '
    $1 == k {
      value = $0
      sub("^[^:]*:[[:space:]]*", "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
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

config_value() {
  local key="$1"
  local default="$2"
  local env_name="$3"
  local root value

  if [[ -n "${!env_name:-}" ]]; then
    printf '%s\n' "${!env_name}"
    return
  fi

  if value="$(yaml_value "$CHANGE_DIR/.sdd/config.yaml" "$key" 2>/dev/null)"; then
    [[ -n "$value" ]] && { printf '%s\n' "$value"; return; }
  fi

  root="$(project_root_for_change)"
  if value="$(yaml_value "$root/.sdd/config.yaml" "$key" 2>/dev/null)"; then
    [[ -n "$value" ]] && { printf '%s\n' "$value"; return; }
  fi

  if value="$(yaml_value "$CHANGE_DIR/.sdd/state.yaml" "$key" 2>/dev/null)"; then
    [[ -n "$value" ]] && { printf '%s\n' "$value"; return; }
  fi

  printf '%s\n' "$default"
}

source_role() {
  local rel="$1"
  case "$rel" in
    docs/superpowers/specs/*.md|*/docs/superpowers/specs/*.md) printf 'technical-design' ;;
    docs/superpowers/plans/*.md|*/docs/superpowers/plans/*.md) printf 'implementation-plan' ;;
    api.md|*/api.md) printf 'api' ;;
    tests.md|*/tests.md|test-report.md|*/test-report.md) printf 'test' ;;
    spec.md|*/spec.md|specs/*/spec.md|*/specs/*/spec.md) printf 'spec' ;;
    design.md|*/design.md) printf 'design' ;;
    tasks.md|*/tasks.md) printf 'task' ;;
    *) printf 'supporting' ;;
  esac
}

is_beta_projected_role() {
  case "$1" in
    api|spec|test|technical-design) return 0 ;;
    *) return 1 ;;
  esac
}

CHANGE_DIR="${1:-}"
MODE="${2:-}"

if [[ -z "$CHANGE_DIR" || "$CHANGE_DIR" == "-h" || "$CHANGE_DIR" == "--help" ]]; then
  usage
  exit 0
fi

[[ -d "$CHANGE_DIR" ]] || die "change dir not found: $CHANGE_DIR"
[[ -z "$MODE" || "$MODE" == "--write" || "$MODE" == "--hash-only" || "$MODE" == "--refresh" ]] || die "unknown option: $MODE"

CHANGE_DIR="$(cd "$CHANGE_DIR" && pwd)"
OUT_DIR="$CHANGE_DIR/.sdd/handoff"
TMP_LIST="$(mktemp)"
trap 'rm -f "$TMP_LIST"' EXIT

context_compression="$(config_value context_compression off SDD_CONTEXT_COMPRESSION)"
case "$context_compression" in
  off) excerpt_limit=220 ;;
  beta) excerpt_limit=80 ;;
  *) die "invalid context_compression: $context_compression" ;;
esac

find "$CHANGE_DIR" -type f \
  \( -name '*.md' -o -name '.openspec.yaml' -o -name '*.yml' -o -name '*.yaml' \) \
  ! -path "$CHANGE_DIR/.sdd/*" \
  ! -path "$CHANGE_DIR/.comet/*" \
  ! -path "$CHANGE_DIR/.git/*" \
  | sort > "$TMP_LIST"

[[ -s "$TMP_LIST" ]] || die "no SDD/OpenSpec documents found under $CHANGE_DIR"

if [[ "$MODE" == "--write" || "$MODE" == "--refresh" ]]; then
  mkdir -p "$OUT_DIR"
fi

context_hash_input=""
while IFS= read -r file; do
  rel="${file#"$CHANGE_DIR"/}"
  hash="$(sha_file "$file")"
  context_hash_input+="${rel}:${hash}"$'\n'
done < "$TMP_LIST"

if command -v sha256sum >/dev/null 2>&1; then
  context_hash="$(printf '%s' "$context_hash_input" | sha256sum | awk '{print $1}')"
else
  context_hash="$(printf '%s' "$context_hash_input" | shasum -a 256 | awk '{print $1}')"
fi

write_markdown() {
  {
    printf '# SDD Handoff Context\n\n'
    printf '> OpenSpec/SDD docs remain canonical. This file is a deterministic context pack for Superpowers execution strategy and implementation prompts.\n\n'
    printf '%s\n' "- change_dir: \`$CHANGE_DIR\`"
    printf '%s\n' "- context_hash: \`$context_hash\`"
    printf '%s\n' "- context_compression: \`$context_compression\`"
    printf '%s\n\n' "- generated_at: \`$(date -u '+%Y-%m-%dT%H:%M:%SZ')\`"
    printf '## Source Inventory\n\n'
    printf '| Path | Role | SHA256 | Lines |\n'
    printf '|---|---|---|---:|\n'
    while IFS= read -r file; do
      rel="${file#"$CHANGE_DIR"/}"
      hash="$(sha_file "$file")"
      lines="$(wc -l < "$file" | tr -d ' ')"
      role="$(source_role "$rel")"
      printf '| `%s` | `%s` | `%s` | %s |\n' "$rel" "$role" "$hash" "$lines"
    done < "$TMP_LIST"
    printf '\n## Required Superpower Boundary\n\n'
    printf '%s\n' '- Superpowers owns source-level HOW: technical design, execution strategy, plan, TDD order, reviewer/tester split, worktree/port orchestration, and verification ownership.'
    printf '%s\n' '- Superpowers must not replace OpenSpec/SDD design, API, database, field semantics, SQL, or tests.'
    printf '%s\n\n' '- If source documents conflict or are incomplete, mark `Blocked` and return to SDD docs instead of inventing a second design.'
    if [[ "$context_compression" == "beta" ]]; then
      printf '## Canonical Projection\n\n'
      printf '%s\n\n' 'Beta mode projects API/spec/test sources verbatim and references supporting docs by hash. Read original supporting files when a design, task, or requirement detail is unclear.'
    else
      printf '## Source Excerpts\n\n'
    fi
    while IFS= read -r file; do
      rel="${file#"$CHANGE_DIR"/}"
      role="$(source_role "$rel")"
      printf '### `%s`\n\n' "$rel"
      if [[ "$context_compression" == "beta" ]] && ! is_beta_projected_role "$role"; then
        printf '%s\n' "- Role: \`$role\`"
        printf '%s\n' "- SHA256: \`$(sha_file "$file")\`"
        printf '%s\n\n' "- Full source remains canonical. Read \`$rel\` directly if needed."
        continue
      fi
      printf '```text\n'
      if [[ "$context_compression" == "beta" ]]; then
        cat "$file"
      else
        sed -n "1,${excerpt_limit}p" "$file"
        total="$(wc -l < "$file" | tr -d ' ')"
        if [[ "$total" -gt "$excerpt_limit" ]]; then
          printf '\n[TRUNCATED: showing first %s of %s lines]\n' "$excerpt_limit" "$total"
        fi
      fi
      printf '```\n\n'
    done < "$TMP_LIST"
  }
}

write_json() {
  {
    printf '{\n'
    printf '  "changeDir": "%s",\n' "$(printf '%s' "$CHANGE_DIR" | json_escape)"
    printf '  "contextHash": "%s",\n' "$context_hash"
    printf '  "canonical": "openspec-sdd",\n'
    printf '  "contextCompression": "%s",\n' "$context_compression"
    printf '  "role": "superpowers-execution-context",\n'
    printf '  "sources": [\n'
    first=1
    while IFS= read -r file; do
      rel="${file#"$CHANGE_DIR"/}"
      hash="$(sha_file "$file")"
      lines="$(wc -l < "$file" | tr -d ' ')"
      role="$(source_role "$rel")"
      [[ "$first" -eq 0 ]] && printf ',\n'
      first=0
      projected=false
      if [[ "$context_compression" == "off" ]] || is_beta_projected_role "$role"; then
        projected=true
      fi
      printf '    {"path": "%s", "sha256": "%s", "lines": %s, "role": "%s", "projected": %s}' \
        "$(printf '%s' "$rel" | json_escape)" "$hash" "$lines" "$role" "$projected"
    done < "$TMP_LIST"
    printf '\n  ]\n'
    printf '}\n'
  }
}

sync_state() {
  local state_sh="$1"
  local technical_design_rel current_design_doc

  "$state_sh" init "$CHANGE_DIR" docs >/dev/null
  "$state_sh" set "$CHANGE_DIR" context_compression "$context_compression"
  "$state_sh" set "$CHANGE_DIR" handoff_context .sdd/handoff/sdd-context.json
  "$state_sh" set "$CHANGE_DIR" handoff_hash "$context_hash"
  technical_design_rel="$(
    find "$CHANGE_DIR/docs/superpowers/specs" -maxdepth 1 -type f -name '*.md' 2>/dev/null \
      | sort | head -n 1 | sed "s#^$CHANGE_DIR/##"
  )"
  if [[ -n "$technical_design_rel" ]]; then
    "$state_sh" set "$CHANGE_DIR" technical_design "$technical_design_rel"
  fi

  current_design_doc="$("$state_sh" get "$CHANGE_DIR" design_doc 2>/dev/null || true)"
  if [[ -z "$current_design_doc" || "$current_design_doc" == "null" ]]; then
    if [[ -f "$CHANGE_DIR/design.md" ]]; then
      "$state_sh" set "$CHANGE_DIR" design_doc design.md
    elif [[ -n "$technical_design_rel" ]]; then
      "$state_sh" set "$CHANGE_DIR" design_doc "$technical_design_rel"
    fi
  fi
}

run_refresh_checks() {
  local script_dir validate_sh guard_sh
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  validate_sh="$script_dir/superflow-yaml-validate.sh"
  guard_sh="$script_dir/superflow-guard.sh"

  if [[ -x "$validate_sh" ]]; then
    "$validate_sh" "$CHANGE_DIR" >/dev/null
    printf 'yaml validation passed\n'
  fi
  if [[ -x "$guard_sh" ]]; then
    "$guard_sh" "$CHANGE_DIR" docs >/dev/null
    printf 'guard docs passed\n'
  fi
}

if [[ "$MODE" == "--write" || "$MODE" == "--refresh" ]]; then
  write_markdown > "$OUT_DIR/sdd-context.md"
  write_json > "$OUT_DIR/sdd-context.json"
  printf '%s\n' "$context_hash" > "$OUT_DIR/sdd-context.sha256"
  STATE_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/superflow-state.sh"
  if [[ -x "$STATE_SH" ]]; then
    sync_state "$STATE_SH"
  fi
  printf 'wrote %s\n' "$OUT_DIR/sdd-context.md"
  printf 'hash %s\n' "$context_hash"
  if [[ "$MODE" == "--refresh" ]]; then
    run_refresh_checks
  fi
else
  printf '%s\n' "$context_hash"
fi
