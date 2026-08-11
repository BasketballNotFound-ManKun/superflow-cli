#!/bin/bash
# SDD phase-aware hook guard.
# Blocks writes that conflict with .sdd/state.yaml when .sdd-enforced is active.

set -u

INPUT=""
if [ ! -t 0 ]; then
  INPUT=$(cat 2>/dev/null || true)
fi

FILE_PATH="${FILE_PATH:-}"
if [ -z "$FILE_PATH" ] && [ -n "$INPUT" ]; then
  FILE_PATH=$(printf '%s' "$INPUT" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print('')
    raise SystemExit
tool_input = data.get('tool_input', {})
print(tool_input.get('file_path') or '')
" 2>/dev/null)
fi

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

FILE_PATH=$(printf '%s' "$FILE_PATH" | sed 's|\\|/|g')
FILE_DIR=$(dirname "$FILE_PATH")
while [ ! -d "$FILE_DIR" ] && [ "$FILE_DIR" != "." ] && [ "$FILE_DIR" != "/" ]; do
  FILE_DIR=$(dirname "$FILE_DIR")
done
REPO_ROOT=$(git -C "$FILE_DIR" rev-parse --show-toplevel 2>/dev/null)
if [ $? -ne 0 ]; then
  exit 0
fi

if [ ! -f "$REPO_ROOT/.sdd-enforced" ]; then
  exit 0
fi

REL=$(python3 - "$REPO_ROOT" "$FILE_PATH" <<'PY'
import os, sys
root = os.path.abspath(sys.argv[1])
path = os.path.abspath(sys.argv[2])
try:
    print(os.path.relpath(path, root).replace(os.sep, '/'))
except Exception:
    print(path.replace(os.sep, '/'))
PY
)

STATE_FILE=""
case "$REL" in
  *embedded-changes/*)
    prefix=$(printf '%s\n' "$REL" | sed -nE 's#^(.*embedded-changes/[^/]+).*#\1#p')
    [ -n "$prefix" ] && [ -f "$REPO_ROOT/$prefix/.sdd/state.yaml" ] && STATE_FILE="$REPO_ROOT/$prefix/.sdd/state.yaml"
    ;;
  *openspec/changes/*)
    prefix=$(printf '%s\n' "$REL" | sed -nE 's#^(.*openspec/changes/[^/]+).*#\1#p')
    [ -n "$prefix" ] && [ -f "$REPO_ROOT/$prefix/.sdd/state.yaml" ] && STATE_FILE="$REPO_ROOT/$prefix/.sdd/state.yaml"
    ;;
esac

if [ -z "$STATE_FILE" ]; then
  STATE_FILE=$(find "$REPO_ROOT" -path '*/.sdd/state.yaml' -type f 2>/dev/null | head -n 1)
fi

[ -n "$STATE_FILE" ] || exit 0

PHASE=$(awk -F':' '$1=="phase"{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}' "$STATE_FILE" 2>/dev/null)
[ -n "$PHASE" ] || exit 0

is_sdd_doc_path() {
  printf '%s\n' "$REL" | grep -Eq '(^|/)(openspec/changes|embedded-changes)/|(^|/)\.sdd/|(^|/)prompt/|(^|/)docs/superpowers/'
}

is_root_markdown_or_config() {
  case "$REL" in
    */*) return 1 ;;
    *.md|.sdd-enforced|.db-verified) return 0 ;;
    *) return 1 ;;
  esac
}

case "$REL" in
  *.java|*.kt|*.kts|*.xml|*.sql|*.yml|*.yaml|*.properties|*.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.py|*.go|*.rs|*.vue)
    RUNTIME=1
    ;;
  *)
    RUNTIME=0
    ;;
esac

require_coding_ready() {
  local change_dir receipt expected_hash
  change_dir=$(dirname "$(dirname "$STATE_FILE")")
  receipt="$change_dir/.sdd/readiness/coding-ready.json"
  expected_hash=$(awk -F':' '$1=="handoff_hash"{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}' "$STATE_FILE" 2>/dev/null)
  if [ ! -f "$receipt" ] || [ -z "$expected_hash" ]; then
    cat <<'BLOCK_MSG' >&2
[SDD Coding Ready] 当前任务没有可用的 Coding Ready 凭证，禁止修改运行时代码。
请先完成多轮文档评审、环境预检和 docs/design/implement 门禁，再执行：
superflow check <change> --level coding-ready
BLOCK_MSG
    return 2
  fi
  python3 - "$receipt" "$expected_hash" <<'PY'
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        receipt = json.load(handle)
except Exception:
    raise SystemExit(2)
if receipt.get("codingReady") is not True:
    raise SystemExit(2)
if receipt.get("schemaVersion") != "superflow.coding-ready.v1":
    raise SystemExit(2)
if receipt.get("handoffHash") != sys.argv[2]:
    raise SystemExit(2)
PY
  if [ $? -ne 0 ]; then
    cat <<'BLOCK_MSG' >&2
[SDD Coding Ready] 凭证已过期或与当前 handoff hash 不一致。
请重新执行 superflow check <change> --level coding-ready。
BLOCK_MSG
    return 2
  fi
}

case "$PHASE" in
  docs)
    if is_sdd_doc_path || is_root_markdown_or_config; then
      exit 0
    fi
    if [ "$RUNTIME" -eq 1 ]; then
      cat <<'BLOCK_MSG' >&2
[SDD phase guard] 当前 phase=docs，禁止直接修改运行时代码。
请先完成 SDD docs、handoff、state 和 docs guard，再进入 implement 阶段。
BLOCK_MSG
      exit 2
    fi
    ;;
  implement|verify)
    if [ "$RUNTIME" -eq 1 ]; then
      require_coding_ready || exit 2
    fi
    exit 0
    ;;
  archive)
    if printf '%s\n' "$REL" | grep -Eq '(^|/)\.sdd/state\.yaml$|(^|/)\.openspec\.yaml$'; then
      exit 0
    fi
    cat <<'BLOCK_MSG' >&2
[SDD phase guard] 当前 SDD 已进入 archive，禁止继续修改运行时代码或交付文档。
如需调整，请先执行 superflow-state.sh transition <change-dir> archive-reopen。
BLOCK_MSG
    exit 2
    ;;
  done)
    cat <<'BLOCK_MSG' >&2
[SDD phase guard] 当前 SDD 已进入 archive/done，禁止继续修改交付文件或代码。
如需调整，请先执行 superflow-state.sh transition <change-dir> archive-reopen。
BLOCK_MSG
    exit 2
    ;;
esac

exit 0
