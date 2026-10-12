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
  if [[ "$value" == /* && -f "$value" ]]; then
    [[ ! -L "$value" ]] || die "symbolic document link rejected: $value"
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
  [[ ! -L "$file" ]] || die "symbolic document link rejected: $file"
  tmp="$(mktemp)"
  chmod 600 "$tmp"

  if head -1 "$file" | grep -q '^---'; then
    awk -v archive="$archive_name" -v status_field="$status_field" '
      closed { print; next }
      /^archived-with:/ { next }
      status_field != "" && /^status:/ { next }
      NR == 1 && /^---/ { print; next }
      /^---/ && NR > 1 {
        print "archived-with: " archive
        if (status_field != "") print "status: " status_field
        print
        closed = 1
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
[[ ! -L "${CHANGE_DIR%/}" ]] || die "canonical change directory required; symbolic link rejected"
CHANGE_DIR="$(cd "$CHANGE_DIR" && pwd -L)"
for component in "$CHANGE_DIR" "$(dirname "$CHANGE_DIR")" "$(dirname "$(dirname "$CHANGE_DIR")")" "$(dirname "$(dirname "$(dirname "$CHANGE_DIR")")")"; do
  [[ ! -L "$component" ]] || die "canonical directory required; symbolic link rejected: $component"
done
CHANGE_DIR="$(cd "$CHANGE_DIR" && pwd -P)"
CHANGE_NAME="$(basename "$CHANGE_DIR")"
IS_MOVED=false
IS_STANDARD=false
case "$CHANGE_DIR" in
  */openspec/changes/archive/*)
    [[ "$(basename "$(dirname "$CHANGE_DIR")")" == archive ]] || die "canonical archive directory required"
    PROJECT_ROOT="$(cd "$CHANGE_DIR/../../../.." && pwd -P)"
    IS_MOVED=true
    ;;
  */openspec/changes/*)
    [[ "$(basename "$(dirname "$CHANGE_DIR")")" == changes ]] || die "canonical change directory required"
    IS_STANDARD=true
    PROJECT_ROOT="$(cd "$CHANGE_DIR/../../.." && pwd -P)"
    ;;
  *) PROJECT_ROOT="$(cd "$CHANGE_DIR/../../.." && pwd -P)" ;;
esac
for component in "$PROJECT_ROOT/openspec" "$PROJECT_ROOT/openspec/changes" "$PROJECT_ROOT/openspec/changes/archive"; do
  [[ ! -L "$component" ]] || die "canonical directory required; symbolic link rejected: $component"
done
ARCHIVE_ROOT="$PROJECT_ROOT/openspec/changes/archive"
ARCHIVE_NAME="$CHANGE_NAME"

"$VALIDATE" "$CHANGE_DIR"
if [[ "$IS_STANDARD" == true && ( "$(field_value archived)" == true || "$(field_value phase)" == done ) ]]; then
  die "active standard directory has archived state: $CHANGE_DIR; confirm the physical archive location first. If this was state-only closeout, repair through the existing state owner: SUPERFLOW_FORCE_PHASE=1 $STATE set '$CHANGE_DIR' phase archive; $STATE set '$CHANGE_DIR' archived false; then rerun --apply with OpenSpec available"
fi
if [[ "$IS_STANDARD" == true ]] && ! command -v openspec >/dev/null 2>&1; then
  die "OpenSpec is required for standard change directory: $CHANGE_DIR; install/restore openspec, then rerun this command"
fi
if [[ "$(field_value archived)" == true && "$(field_value phase)" == done ]]; then
  printf 'already archived: %s; no changes required\n' "$CHANGE_DIR"
  exit 0
fi
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
  if [[ "$IS_MOVED" == true ]]; then
    printf '%s\n' "- openspec_archive: already moved; recover remaining closeout"
  else
    printf '%s\n' "- openspec_archive: unavailable; fallback to state-only archive"
  fi
fi

if [[ "$MODE" == "--dry-run" ]]; then
  annotate_archive_docs "$ARCHIVE_NAME"
  printf 'dry-run only; ask the user for archive confirmation before --apply.\n'
  exit 0
fi

if [[ "$CHANGE_DIR" == "$PROJECT_ROOT/openspec/changes/$CHANGE_NAME" ]] && command -v openspec >/dev/null 2>&1; then
  (cd "$PROJECT_ROOT" && openspec archive "$CHANGE_NAME" --yes)
  candidates=()
  if [[ -d "$ARCHIVE_ROOT" ]]; then
    for candidate in "$ARCHIVE_ROOT"/*; do
      [[ -d "$candidate" ]] || continue
      candidate_name="$(basename "$candidate")"
      if [[ "$candidate_name" == "$CHANGE_NAME" || "$candidate_name" == *-"$CHANGE_NAME" ]]; then
        [[ ! -L "$candidate" ]] || die "canonical archive directory required; symbolic link rejected"
        candidates+=("$candidate")
      fi
    done
  fi
  [[ "${#candidates[@]}" -gt 0 ]] || die "openspec archive completed but archive dir was not found; supply explicit archive path"
  [[ "${#candidates[@]}" -eq 1 ]] || die "multiple archive targets found; supply explicit archive path"
  archived_dir="${candidates[0]}"
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
