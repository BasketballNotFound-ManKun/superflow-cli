#!/bin/bash
# Managed-work role guard. Active only inside a Superflow managed Agent process.

set -u

ROLE="${SUPERFLOW_MANAGED_ROLE:-}"
[ -n "$ROLE" ] || exit 0

block() {
  echo "[Superflow 托管任务门禁] $1" >&2
  exit 2
}

case "$ROLE" in
  supervisor|executor) ;;
  *) block "检测到非法托管角色，按失败关闭。" ;;
esac

INPUT=""
if [ ! -t 0 ]; then
  INPUT=$(cat 2>/dev/null || true)
fi
[ -n "$INPUT" ] || block "Hook 没有收到工具调用数据，按失败关闭。"

VALID_JSON=$(printf '%s' "$INPUT" | python3 -c "
import json, sys
try:
    value = json.load(sys.stdin)
    print('yes' if isinstance(value, dict) else 'no')
except Exception:
    print('no')
" 2>/dev/null)
[ "$VALID_JSON" = "yes" ] || block "Hook 输入不是有效 JSON，按失败关闭。"

read_field() {
  local field="$1"
  printf '%s' "$INPUT" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print('')
    raise SystemExit
tool_input = data.get('tool_input', {})
print(tool_input.get('$field') or '')
" 2>/dev/null
}

TOOL_NAME=$(printf '%s' "$INPUT" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print('')
    raise SystemExit
print(data.get('tool_name') or data.get('tool') or '')
" 2>/dev/null)
FILE_PATH=$(read_field file_path)
[ -n "$FILE_PATH" ] || FILE_PATH=$(read_field path)
[ -n "$FILE_PATH" ] || FILE_PATH=$(read_field file)
COMMAND=$(read_field command)
[ -n "$COMMAND" ] || COMMAND=$(read_field cmd)

normalize() {
  printf '%s' "$1" | sed 's|\\|/|g'
}

FILE_PATH=$(normalize "$FILE_PATH")
COMMAND=$(printf '%s' "$COMMAND" | tr '\n' ' ')

if [ "$ROLE" = "supervisor" ]; then
  case "$TOOL_NAME" in
    Edit|Write|MultiEdit|NotebookEdit|apply_patch)
      block "监督角色只允许检查，禁止修改目标文件。"
      ;;
  esac
  if [ -n "$COMMAND" ] && printf '%s' "$COMMAND" | grep -Eiq \
    '(^|[[:space:]])(rm|mv|cp|mkdir|touch|chmod|chown)([[:space:]]|$)|git[[:space:]]+(add|commit|push|tag|reset|checkout|restore)|npm[[:space:]]+publish|apply_patch|sed[[:space:]]+-i|(^|[^>])>[>|[:space:]]|tee[[:space:]]'; then
    block "监督角色的 Bash 仅允许只读检查，检测到可能写入的命令。"
  fi
fi

if [ "$ROLE" = "executor" ]; then
  case "$TOOL_NAME" in
    Edit|Write|MultiEdit|NotebookEdit|apply_patch)
      [ -n "$FILE_PATH" ] || block "写入工具缺少目标路径，按失败关闭。"
      ;;
  esac
  if [ -n "$FILE_PATH" ] && printf '%s' "$FILE_PATH" | grep -Eq \
    '(^|/)\.superflow/tasks/'; then
    block "执行角色禁止修改托管状态、事件、Prompt 和过程报告。"
  fi
  if [ -n "$COMMAND" ] && printf '%s' "$COMMAND" | grep -Eq \
    '\.superflow/tasks/'; then
    block "执行角色的 Bash 禁止直接访问托管运行目录，请使用提示词中提供的只读证据。"
  fi
  if [ -n "$COMMAND" ] && printf '%s' "$COMMAND" | grep -Eiq \
    'git[[:space:]]+(add|commit|push|tag)|npm[[:space:]]+publish|dangerously-(bypass|skip)|kubectl[[:space:]]+(apply|delete)|helm[[:space:]]+(install|upgrade)|DROP[[:space:]]+(DATABASE|TABLE)|TRUNCATE[[:space:]]+TABLE'; then
    block "执行角色禁止自动 Git 提交/推送、发布、部署、绕过沙箱或高破坏数据库操作。"
  fi
fi

exit 0
