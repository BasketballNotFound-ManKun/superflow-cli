#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  superflow-handoff.sh <change-dir> [--write|--hash-only|--manifest|--check|--refresh]

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
    canonical_contract "$1" \
      | sha256sum | awk '{print $1}'
  else
    canonical_contract "$1" \
      | shasum -a 256 | awk '{print $1}'
  fi
}

canonical_contract() {
  # Reports are execution evidence, not frozen requirements. Their existence
  # and validity are checked separately by the delivery/report gates.
  if [[ "${1##*/}" == "test-report.md" ]]; then
    return 0
  fi
  sed -E \
    -e '/^[[:space:]]*(handoff_hash|context_hash):[[:space:]]*[^[:space:]]*[[:space:]]*$/d' \
    -e 's/^([[:space:]]*[-*][[:space:]]+)\[[xX ]\]/\1[ ]/' \
    -e '/^[[:space:]]*$/d' "$1"
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
  if [[ -n "${DECLARED_TECHNICAL_REL:-}" && "$rel" == "$DECLARED_TECHNICAL_REL" ]]; then
    printf 'technical-design'
    return
  fi
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
[[ -z "$MODE" || "$MODE" == "--write" || "$MODE" == "--hash-only" || "$MODE" == "--manifest" || "$MODE" == "--check" || "$MODE" == "--refresh" ]] || die "unknown option: $MODE"

CHANGE_DIR="$(cd "$CHANGE_DIR" && pwd -P)"
OUT_DIR="$CHANGE_DIR/.sdd/handoff"
TMP_LIST="$(mktemp)"
trap 'rm -f "$TMP_LIST"' EXIT

context_compression="$(config_value context_compression references SDD_CONTEXT_COMPRESSION)"
case "$context_compression" in
  references) excerpt_limit=0 ;;
  off) excerpt_limit=220 ;;
  beta) excerpt_limit=80 ;;
  *) die "invalid context_compression: $context_compression" ;;
esac

find "$CHANGE_DIR" -type f \
  \( -name '*.md' -o -name '.openspec.yaml' -o -name '*.yml' -o -name '*.yaml' \) \
  ! -path "$CHANGE_DIR/.sdd/*" \
  ! -path "$CHANGE_DIR/.git/*" \
  | sort > "$TMP_LIST"

# Applicability is a frozen Superflow input, not generated lifecycle state.
if [[ -L "$CHANGE_DIR/.sdd" || -L "$CHANGE_DIR/.sdd/applicability.yaml" ]] ||
   [[ -e "$CHANGE_DIR/.sdd/applicability.yaml" && ! -f "$CHANGE_DIR/.sdd/applicability.yaml" ]]; then
  die "applicability must be a regular project-local file"
fi
if [[ -f "$CHANGE_DIR/.sdd/applicability.yaml" ]]; then
  printf '%s\n' "$CHANGE_DIR/.sdd/applicability.yaml" >> "$TMP_LIST"
  sort -u "$TMP_LIST" -o "$TMP_LIST"
fi

# The declared source-level HOW can live at the project root, outside change.
# This remains the single source inventory used by hashing and every projection.
DECLARED_TECHNICAL_REL=""
technical_design="$(yaml_value "$CHANGE_DIR/.sdd/state.yaml" technical_design 2>/dev/null || true)"
if [[ -n "$technical_design" && "$technical_design" != "null" ]]; then
  authorized_root="$(git -C "$CHANGE_DIR" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$CHANGE_DIR")"
  declared_source="$(python3 - "$CHANGE_DIR" "$authorized_root" "$technical_design" <<'PYHOW'
import os
import pathlib
import sys

change, project, declaration = sys.argv[1:]
if len(declaration) > 1 and declaration[0] == declaration[-1] and declaration[0] in "\"'":
    declaration = declaration[1:-1]
if declaration == "null":
    sys.exit(0)
project = os.path.realpath(project)
source = os.path.realpath(os.path.join(change, declaration))
relative = os.path.relpath(source, change)
if (os.path.commonpath([project, source]) != project
        or any(part in {".sdd", ".git"} for part in pathlib.Path(source).parts)
        or pathlib.Path(source).suffix not in {".md", ".yaml", ".yml"}
        or os.path.basename(source) == "test-report.md"
        or "\n" in source or "\r" in source):
    sys.stderr.write("superflow-handoff: technical_design must be a project-scoped canonical document, outside generated/report paths\n")
    sys.exit(1)
if not os.path.isfile(source):
    sys.stderr.write("superflow-handoff: technical_design document is not readable\n")
    sys.exit(1)
print(source)
print(relative)
PYHOW
)" || die "invalid technical_design source"
  if [[ -n "$declared_source" ]]; then
    DECLARED_TECHNICAL_FILE="${declared_source%%$'\n'*}"
    DECLARED_TECHNICAL_REL="${declared_source#*$'\n'}"
    printf '%s\n' "$DECLARED_TECHNICAL_FILE" >> "$TMP_LIST"
    LC_ALL=C sort -u "$TMP_LIST" -o "$TMP_LIST"
  fi
fi

source_relative() {
  if [[ "$1" == "$CHANGE_DIR/"* ]]; then
    printf '%s\n' "${1#"$CHANGE_DIR"/}"
  else
    python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$1" "$CHANGE_DIR"
  fi
}

[[ -s "$TMP_LIST" ]] || die "no SDD/OpenSpec documents found under $CHANGE_DIR"

if [[ "$MODE" == "--write" || "$MODE" == "--refresh" ]]; then
  mkdir -p "$OUT_DIR"
fi

context_hash_input=""
while IFS= read -r file; do
  rel="$(source_relative "$file")"
  [[ "${file##*/}" == "test-report.md" ]] && continue
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
      rel="$(source_relative "$file")"
      hash="$(sha_file "$file")"
      lines="$(wc -l < "$file" | tr -d ' ')"
      role="$(source_role "$rel")"
      printf '| `%s` | `%s` | `%s` | %s |\n' "$rel" "$role" "$hash" "$lines"
    done < "$TMP_LIST"
    printf '\n## Required Superpower Boundary\n\n'
    printf '%s\n' '- Superpowers owns source-level HOW: technical design, execution strategy, plan, TDD order, reviewer/tester split, worktree/port orchestration, and verification ownership.'
    printf '%s\n' '- Superpowers must not replace OpenSpec/SDD design, API, database, field semantics, SQL, or tests.'
    printf '%s\n\n' '- If source documents conflict or are incomplete, mark `Blocked` and return to SDD docs instead of inventing a second design.'
    if [[ "$context_compression" == "references" ]]; then
      printf '## Canonical Reading Index\n\n'
      printf '%s\n\n' 'Read the canonical files listed above for the current task: API/spec define behavior, design/technical-design define HOW, tasks define scope and tests define acceptance. This index carries identity and paths, not a second copy of their content.'
    elif [[ "$context_compression" == "beta" ]]; then
      printf '## Canonical Projection\n\n'
      printf '%s\n\n' 'Beta mode projects API/spec/test sources verbatim and references supporting docs by hash. Read original supporting files when a design, task, or requirement detail is unclear.'
    else
      printf '## Source Excerpts\n\n'
    fi
    while IFS= read -r file; do
      rel="$(source_relative "$file")"
      role="$(source_role "$rel")"
      printf '### `%s`\n\n' "$rel"
      # Execution reports are live evidence and never a canonical projection.
      if [[ "${file##*/}" == "test-report.md" || "$context_compression" == "references" ]] || { [[ "$context_compression" == "beta" ]] && ! is_beta_projected_role "$role"; }; then
        printf '%s\n' "- Role: \`$role\`"
        printf '%s\n' "- SHA256: \`$(sha_file "$file")\`"
        if [[ "${file##*/}" == "test-report.md" ]]; then
          printf '%s\n\n' "- Live execution evidence, outside the frozen contract. Read \`$rel\` directly."
        else
          printf '%s\n\n' "- Full source remains canonical. Read \`$rel\` directly if needed."
        fi
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
      rel="$(source_relative "$file")"
      hash="$(sha_file "$file")"
      lines="$(wc -l < "$file" | tr -d ' ')"
      role="$(source_role "$rel")"
      [[ "$first" -eq 0 ]] && printf ',\n'
      first=0
      projected=false
      if [[ "${file##*/}" != "test-report.md" ]] && { [[ "$context_compression" == "off" ]] || { [[ "$context_compression" == "beta" ]] && is_beta_projected_role "$role"; }; }; then
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
  technical_design_rel="${DECLARED_TECHNICAL_REL:-}"
  if [[ -z "$technical_design_rel" && -d "$CHANGE_DIR/docs/superpowers/specs" ]]; then
    technical_design_rel="$(
      find "$CHANGE_DIR/docs/superpowers/specs" -maxdepth 1 -type f -name '*.md' \
        | sort | head -n 1 | sed "s#^$CHANGE_DIR/##"
    )"
  fi
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
elif [[ "$MODE" == "--check" ]]; then
  expected_json="$(mktemp)"
  expected_md="$(mktemp)"
  trap 'rm -f "$TMP_LIST" "$expected_json" "$expected_md"' EXIT
  write_json > "$expected_json"
  write_markdown > "$expected_md"
  python3 - "$OUT_DIR" "$expected_json" "$expected_md" <<'PYCHECK'
import json
import pathlib
import re
import sys

root, expected_json, expected_md = sys.argv[1:]
root = pathlib.Path(root)
try:
    actual = json.loads((root / "sdd-context.json").read_text())
    expected = json.loads(pathlib.Path(expected_json).read_text())
    # Line counts are display metadata, not frozen contract identity.
    for manifest in (actual, expected):
        for source in manifest["sources"]:
            source.pop("lines", None)
    if actual != expected:
        raise ValueError("manifest/mode/source role/projected/hash mismatch")
    def normalize(text):
        text = re.sub(r"^- generated_at:.*$", "", text, flags=re.M)
        text = re.sub(r"(\| `[^`]+` \| `[^`]+` \| `[a-f0-9]{64}` \|) \d+ \|", r"\1 |", text)
        text = re.sub(r"^\s*(?:handoff_hash|context_hash):\s*\S*\s*$", "", text, flags=re.M)
        text = re.sub(r"^(\s*[-*]\s+)\[[xX ]\]", r"\1[ ]", text, flags=re.M)
        return "\n".join(line for line in text.splitlines() if line.strip())
    if normalize((root / "sdd-context.md").read_text()) != normalize(pathlib.Path(expected_md).read_text()):
        raise ValueError("generated Markdown body identity mismatch")
    if (root / "sdd-context.sha256").read_text().strip() != expected["contextHash"]:
        raise ValueError("recorded context hash mismatch")
except (OSError, ValueError, KeyError, TypeError) as error:
    sys.stderr.write("superflow-handoff: current pack invalid; run --refresh: " + str(error) + "\n")
    sys.exit(1)
PYCHECK
elif [[ "$MODE" == "--manifest" ]]; then
  write_json
else
  printf '%s\n' "$context_hash"
fi
