#!/bin/bash
# SDD integration evidence commit hook for Codex/Claude hook runners.
# When .sdd-enforced is active, block git commit for runtime code changes unless
# staged test-report evidence passes superflow-verify-integration.sh.

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print('')
    raise SystemExit
ti = d.get('tool_input', {})
print(ti.get('command') or ti.get('cmd') or '')
" 2>/dev/null)

if [ -z "$COMMAND" ]; then
  exit 0
fi

case "$COMMAND" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

CWD=$(echo "$INPUT" | python3 -c "
import sys, json, os
try:
    d = json.load(sys.stdin)
except Exception:
    print(os.getcwd())
    raise SystemExit
ti = d.get('tool_input', {})
print(ti.get('cwd') or os.getcwd())
" 2>/dev/null)

REPO_ROOT=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null)
if [ $? -ne 0 ]; then
  exit 0
fi

if [ ! -f "$REPO_ROOT/.sdd-enforced" ]; then
  exit 0
fi

CHANGED=$(git -C "$REPO_ROOT" diff --cached --name-only)
if [ -z "$CHANGED" ]; then
  exit 0
fi

RUNTIME_CHANGED=$(echo "$CHANGED" | grep -E \
  '(^|/)src/main/.*\.(java|xml|yml|yaml|properties)$|(^|/)mapper/.*\.xml$' || true)

if [ -z "$RUNTIME_CHANGED" ]; then
  exit 0
fi

REPORTS=$(echo "$CHANGED" | grep -E '(^|/)test-report\.md$' || true)

if [ -z "$REPORTS" ]; then
  cat <<'BLOCK_MSG'
[SDD 集成验收拦截] 检测到运行时代码变更，但本次提交没有包含 test-report.md。

涉及 Java/Mapper/XML/配置的 SDD 任务必须先完成真实启动应用后的 API 集成测试，
并把启动、curl、数据库、日志证据回填到 test-report.md 后才能提交。

请补齐证据后重新 git add / git commit。
BLOCK_MSG
  exit 2
fi

REPORT_ARGS=""
for report in $REPORTS; do
  REPORT_ARGS="$REPORT_ARGS $REPO_ROOT/$report"
done

"$HOME/.codex/hooks/superflow-verify-integration.sh" $REPORT_ARGS
exit $?
