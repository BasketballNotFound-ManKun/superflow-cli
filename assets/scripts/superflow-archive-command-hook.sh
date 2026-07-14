#!/bin/bash
# Blocks direct OpenSpec/Superflow archive commands that bypass lifecycle gates.

set -u

INPUT=$(cat)

read_json_field() {
  local field="$1"
  printf '%s' "$INPUT" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print('')
    raise SystemExit
tool_input = data.get('tool_input', {})
print(tool_input.get('$field') or tool_input.get('cmd') or '')
" 2>/dev/null
}

COMMAND=$(read_json_field command)
[ -n "$COMMAND" ] || exit 0

CHANGE=$(printf '%s' "$COMMAND" | python3 -c '
import shlex, sys

try:
    tokens = shlex.split(sys.stdin.read())
except ValueError:
    raise SystemExit

for index in range(len(tokens) - 1):
    binary = tokens[index].rsplit("/", 1)[-1]
    if binary not in {"openspec", "superflow"} or tokens[index + 1] != "archive":
        continue
    skip_value = False
    for token in tokens[index + 2:]:
        if skip_value:
            skip_value = False
            continue
        if token in {"--store", "--agent"}:
            skip_value = True
            continue
        if token.startswith("-"):
            continue
        print(token)
        raise SystemExit
' 2>/dev/null)

[ -n "$CHANGE" ] || exit 0

CWD=$(read_json_field cwd)
[ -n "$CWD" ] || CWD=$(pwd)
REPO_ROOT=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null) || exit 0

if [ -d "$CWD/$CHANGE" ]; then
  CHANGE_DIR="$CWD/$CHANGE"
else
  CHANGE_DIR="$REPO_ROOT/openspec/changes/$CHANGE"
fi

[ -d "$CHANGE_DIR" ] || exit 0

ARCHIVE_SCRIPT=${SUPERFLOW_ARCHIVE_SCRIPT:-$HOME/.codex/skills/superflow-pipeline/scripts/superflow-archive.sh}
if [ ! -x "$ARCHIVE_SCRIPT" ]; then
  echo "[Superflow 归档门禁] 归档脚本不存在或不可执行：$ARCHIVE_SCRIPT" >&2
  exit 2
fi

if ! "$ARCHIVE_SCRIPT" "$CHANGE_DIR" --dry-run; then
  cat <<'BLOCK_MSG' >&2
[Superflow 归档门禁] 归档门禁未通过，已阻止直接归档。
请先完成 tasks、test-report、测试环境证据、verify 状态和归档确认；
不要用 openspec archive 绕过 Superflow 生命周期。
BLOCK_MSG
  exit 2
fi

exit 0
