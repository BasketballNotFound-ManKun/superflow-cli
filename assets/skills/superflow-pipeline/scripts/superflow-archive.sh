#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  superflow-archive.sh <change-dir> [--dry-run|--apply]

Archive closeout helper. It validates archive readiness and, with --apply,
archives the OpenSpec change when possible, then marks the SDD lifecycle
archived through superflow-state.
USAGE
}

die() {
  printf 'superflow-archive: %s\n' "$*" >&2
  exit 1
}

field_value() {
  local key="$1"
  "$STATE" get "$CHANGE_DIR" "$key" 2>/dev/null || true
}

resolve_doc_path() {
  local value="$1"
  [[ -n "$value" && "$value" != "null" ]] || return 1
  if [[ -f "$CHANGE_DIR/$value" ]]; then
    printf '%s\n' "$CHANGE_DIR/$value"
    return 0
  fi
  if [[ -f "$value" ]]; then
    printf '%s\n' "$value"
    return 0
  fi
  if [[ -f "$PROJECT_ROOT/$value" ]]; then
    printf '%s\n' "$PROJECT_ROOT/$value"
    return 0
  fi
  return 1
}

annotate_frontmatter() {
  local file="$1"
  local archive_name="$2"
  local status_field="${3:-}"
  local tmp

  [[ -f "$file" ]] || return 0
  tmp="$(mktemp)"
  chmod 600 "$tmp"

  if head -1 "$file" | grep -q '^---'; then
    awk -v archive="$archive_name" -v status_field="$status_field" '
      /^archived-with:/ { next }
      status_field != "" && /^status:/ { next }
      NR == 1 && /^---/ { print; next }
      /^---/ && NR > 1 {
        print "archived-with: " archive
        if (status_field != "") print "status: " status_field
        print
        next
      }
      { print }
    ' "$file" > "$tmp"
  else
    {
      printf '%s\n' '---'
      printf 'archived-with: %s\n' "$archive_name"
      if [[ -n "$status_field" ]]; then
        printf 'status: %s\n' "$status_field"
      fi
      printf '%s\n' '---'
      cat "$file"
    } > "$tmp"
  fi

  mv "$tmp" "$file"
}

annotate_archive_docs() {
  local archive_name="$1"
  local design_doc technical_design plan design_path technical_design_path plan_path
  design_doc="$(field_value design_doc)"
  technical_design="$(field_value technical_design)"
  plan="$(field_value plan)"

  if technical_design_path="$(resolve_doc_path "$technical_design")"; then
    if [[ "$MODE" == "--dry-run" ]]; then
      printf '%s\n' "- annotate_technical_design: $technical_design_path"
    else
      annotate_frontmatter "$technical_design_path" "$archive_name" final
      printf '%s\n' "- annotated_technical_design: $technical_design_path"
    fi
  fi

  if design_path="$(resolve_doc_path "$design_doc")"; then
    if [[ -n "${technical_design_path:-}" && "$design_path" == "$technical_design_path" ]]; then
      :
    elif [[ "$MODE" == "--dry-run" ]]; then
      printf '%s\n' "- annotate_design_doc: $design_path"
    else
      annotate_frontmatter "$design_path" "$archive_name" final
      printf '%s\n' "- annotated_design_doc: $design_path"
    fi
  fi

  if plan_path="$(resolve_doc_path "$plan")"; then
    if [[ "$MODE" == "--dry-run" ]]; then
      printf '%s\n' "- annotate_plan: $plan_path"
    else
      annotate_frontmatter "$plan_path" "$archive_name"
      printf '%s\n' "- annotated_plan: $plan_path"
    fi
  fi
}

CHANGE_DIR="${1:-}"
MODE="${2:---dry-run}"

[[ -n "$CHANGE_DIR" && "$CHANGE_DIR" != "-h" && "$CHANGE_DIR" != "--help" ]] || {
  usage
  exit 0
}
[[ -d "$CHANGE_DIR" ]] || die "change dir not found: $CHANGE_DIR"
[[ "$MODE" == "--dry-run" || "$MODE" == "--apply" ]] || die "unknown option: $MODE"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="$SCRIPT_DIR/superflow-state.sh"
GUARD="$SCRIPT_DIR/superflow-guard.sh"
VALIDATE="$SCRIPT_DIR/superflow-yaml-validate.sh"
CHANGE_DIR="$(cd "$CHANGE_DIR" && pwd)"
CHANGE_NAME="$(basename "$CHANGE_DIR")"
PROJECT_ROOT="$(cd "$CHANGE_DIR/../.." && pwd)"
ARCHIVE_ROOT="$PROJECT_ROOT/openspec/changes/archive"
ARCHIVE_NAME="$CHANGE_NAME"

"$VALIDATE" "$CHANGE_DIR"
"$GUARD" "$CHANGE_DIR" archive

printf 'Archive summary:\n'
printf '%s\n' "- change_dir: $CHANGE_DIR"
printf '%s\n' "- change_name: $CHANGE_NAME"
printf '%s\n' "- phase: $("$STATE" get "$CHANGE_DIR" phase 2>/dev/null || true)"
printf '%s\n' "- verification_report: $("$STATE" get "$CHANGE_DIR" verification_report 2>/dev/null || true)"
printf '%s\n' "- verify_result: $("$STATE" get "$CHANGE_DIR" verify_result 2>/dev/null || true)"
if [[ "$CHANGE_DIR" == "$PROJECT_ROOT/openspec/changes/$CHANGE_NAME" ]] && command -v openspec >/dev/null 2>&1; then
  printf '%s\n' "- openspec_archive: openspec archive $CHANGE_NAME --yes"
  ARCHIVE_NAME="$(date -u '+%Y-%m-%d')-$CHANGE_NAME"
else
  printf '%s\n' "- openspec_archive: unavailable; fallback to state-only archive"
fi

if [[ "$MODE" == "--dry-run" ]]; then
  annotate_archive_docs "$ARCHIVE_NAME"
  printf 'dry-run only; ask the user for archive confirmation before --apply.\n'
  exit 0
fi

if [[ "$CHANGE_DIR" == "$PROJECT_ROOT/openspec/changes/$CHANGE_NAME" ]] && command -v openspec >/dev/null 2>&1; then
  (cd "$PROJECT_ROOT" && openspec archive "$CHANGE_NAME" --yes)
  archived_dir=""
  if [[ -d "$ARCHIVE_ROOT/$CHANGE_NAME" ]]; then
    archived_dir="$ARCHIVE_ROOT/$CHANGE_NAME"
  else
    archived_dir="$(find "$ARCHIVE_ROOT" -maxdepth 1 -mindepth 1 -type d -name "*-$CHANGE_NAME" 2>/dev/null | head -1 || true)"
  fi
  [[ -n "$archived_dir" && -d "$archived_dir" ]] || die "openspec archive completed but archive dir was not found"
  ARCHIVE_NAME="$(basename "$archived_dir")"
  CHANGE_DIR="$(cd "$archived_dir" && pwd)"
  annotate_archive_docs "$ARCHIVE_NAME"
  "$STATE" transition "$archived_dir" archived
  printf 'archived_dir: %s\n' "$archived_dir"
else
  annotate_archive_docs "$ARCHIVE_NAME"
  "$STATE" transition "$CHANGE_DIR" archived
  printf 'archived_dir: %s\n' "$CHANGE_DIR"
fi
