#!/bin/bash
# SuperBridge Flow delivery closeout verifier.
# Blocks implementation commits that forget to update the matching PXX
# delivery documents and test evidence.

set -u

MODE="${1:-}"

read_json_field() {
  local field="$1"
  python3 -c "
import json, os, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print('')
    raise SystemExit
tool_input = data.get('tool_input', {})
print(tool_input.get('$field') or tool_input.get('cmd') or '')
" 2>/dev/null
}

if [ "$MODE" = "--check-staged" ]; then
  CWD="${2:-$(pwd)}"
else
  INPUT=$(cat)
  COMMAND=$(printf '%s' "$INPUT" | read_json_field command)
  case "$COMMAND" in
    *"git commit"*) ;;
    *) exit 0 ;;
  esac
  CWD=$(printf '%s' "$INPUT" | python3 -c "
import json, os, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print(os.getcwd())
    raise SystemExit
tool_input = data.get('tool_input', {})
print(tool_input.get('cwd') or os.getcwd())
" 2>/dev/null)
fi

REPO_ROOT=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null)
if [ $? -ne 0 ]; then
  exit 0
fi

CHANGED=$(git -C "$REPO_ROOT" diff --cached --name-only)
if [ -z "$CHANGED" ]; then
  exit 0
fi

SDD_ACTIVE=0
if [ -f "$REPO_ROOT/.sdd-enforced" ]; then
  SDD_ACTIVE=1
fi

RUNTIME_CHANGED=$(printf '%s\n' "$CHANGED" | grep -E \
  '(^|/)src/main/.*\.(java|xml|yml|yaml|properties)$|(^|/)mapper/.*\.xml$|(^|/)sql/.*\.sql$' || true)

CODE_RUNTIME_CHANGED=$(printf '%s\n' "$CHANGED" | grep -E \
  '(^|/)src/main/.*\.(java|xml|yml|yaml|properties)$|(^|/)mapper/.*\.xml$' || true)

P_DIRS=$(printf '%s\n' "$CHANGED" | sed -nE \
  's#^(.*embedded-changes/(p[0-9]+[^/]*))/.*$#\1#p' | sort -u)

REPORTS=$(printf '%s\n' "$CHANGED" | grep -E \
  '(^|/)embedded-changes/p[0-9][^/]*/test-report\.md$|(^|/)test-report\.md$' || true)

AGGREGATE_DOCS=$(printf '%s\n' "$CHANGED" | grep -E \
  '(^|/)openspec/changes/[^/]+/(tasks|test-report|traceability-matrix|sdd-quality-gate|tests)\.md$|(^|/)doc/openspec/changes/[^/]+/(tasks|test-report|traceability-matrix|sdd-quality-gate|tests)\.md$' || true)

SDD_DOCS_CHANGED=$(printf '%s\n' "$CHANGED" | grep -E \
  '(^|/)(doc/)?openspec/changes/|(^|/)embedded-changes/p[0-9]' || true)

AGGREGATE_ALLOWED=0
if [ -f "$REPO_ROOT/.sdd-aggregate-closeout" ]; then
  AGGREGATE_ALLOWED=1
fi

if [ "$SDD_ACTIVE" -eq 0 ] && [ -z "$SDD_DOCS_CHANGED" ]; then
  exit 0
fi

FAILED=0

fail() {
  echo "FAIL $1"
  FAILED=1
}

ok() {
  echo "OK   $1"
}

has_staged_file() {
  local path="$1"
  printf '%s\n' "$CHANGED" | grep -Fxq "$path"
}

check_no_open_placeholders() {
  local file="$1"
  if [ ! -f "$file" ]; then
    fail "[$file] 文件不存在"
    return
  fi

  if grep -Eiq '待执行|待补充|后续补测|后续测试|TODO|测试报告待更新|验证待回填' "$file"; then
    fail "[$file] 仍包含待执行/待补充/TODO 类交付占位"
  else
    ok "[$file] 未发现明显交付占位"
  fi
}

check_has_closeout_status() {
  local file="$1"
  if grep -Eiq 'Real integration passed|Partially verified|Partial real entry|Blocked|真实入口|真实接口|验证闭环|阻塞|部分验证' "$file"; then
    ok "[$file] 包含交付结论"
  else
    fail "[$file] 缺少 Real integration passed / Partially verified / Blocked 等交付结论"
  fi
}

check_context_drift_guard() {
  local rel_dir="$1"
  local abs_dir="$REPO_ROOT/$rel_dir"
  local state_file="$abs_dir/.sdd/state.yaml"
  local handoff_dir="$abs_dir/.sdd/handoff"
  local hash_file="$handoff_dir/sdd-context.sha256"
  local marker=""

  if [ ! -d "$abs_dir" ]; then
    return
  fi

  marker=$(grep -REi 'handoff_hash|sdd-context|上下文防漂移|防漂移' \
    "$abs_dir/sdd-quality-gate.md" "$abs_dir/test-report.md" "$abs_dir/design.md" \
    "$abs_dir/prompt" 2>/dev/null || true)

  if [ -z "$marker" ] && [ ! -f "$hash_file" ]; then
    return
  fi

  if [ ! -f "$state_file" ]; then
    fail "[$rel_dir] 缺少 .sdd/state.yaml，上下文防漂移状态未初始化"
    return
  fi

  if [ ! -f "$handoff_dir/sdd-context.md" ] \
    || [ ! -f "$handoff_dir/sdd-context.json" ] \
    || [ ! -f "$hash_file" ]; then
    fail "[$rel_dir] 缺少 .sdd/handoff/sdd-context.{md,json,sha256}"
    return
  fi

  local hash_value
  hash_value=$(cat "$hash_file" 2>/dev/null | tr -d '[:space:]')
  if [ -z "$hash_value" ]; then
    fail "[$rel_dir] sdd-context.sha256 为空"
    return
  fi

  if grep -Riq "$hash_value" \
    "$abs_dir/sdd-quality-gate.md" "$abs_dir/test-report.md" "$abs_dir/design.md" \
    "$abs_dir/prompt" 2>/dev/null; then
    ok "[$rel_dir] handoff hash 已被质量门/报告/prompt 继承"
  else
    fail "[$rel_dir] handoff hash 未写入 design、quality gate、prompt 或 test-report"
  fi
}

is_blocked_doc_freeze_report() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 1
  fi

  grep -Eiq 'Blocked|阻塞' "$file" \
    && grep -Eiq 'SDD 文档|文档阶段|范围收口|范围冻结|任务冻结|不包含代码实现|没有 Java 实现变更|未进入实现|当前报告记录可交付边界' "$file"
}

DOC_FREEZE_ALLOWED=0
for report in $REPORTS; do
  if is_blocked_doc_freeze_report "$REPO_ROOT/$report"; then
    DOC_FREEZE_ALLOWED=1
  fi
done

if [ -n "$RUNTIME_CHANGED" ] && [ -z "$REPORTS" ]; then
  fail "检测到运行时代码/SQL 变更，但本次提交没有 staged 当前任务的 test-report.md"
fi

if [ -n "$AGGREGATE_DOCS" ] && [ "$AGGREGATE_ALLOWED" -eq 0 ] && [ "$DOC_FREEZE_ALLOWED" -eq 0 ]; then
  fail "检测到根级汇总 SDD 文档变更，但当前不是汇总收口 worktree"
  printf '%s\n' "$AGGREGATE_DOCS" | sed 's/^/  - /'
  cat <<'AGGREGATE_MSG'

并行研发 agent 只允许更新自己的 embedded-changes/pXX-* 目录，避免多个
worktree 合并时反复冲突根级 test-report/tasks/traceability 文档。

如果你是 Leader/集成收口 agent，需要统一汇总各 P 任务状态，请先执行：
  touch .sdd-aggregate-closeout

然后在单独的汇总提交中更新根级 SDD 文档。
AGGREGATE_MSG
fi

if [ -n "$P_DIRS" ]; then
  for p_dir in $P_DIRS; do
    rel_tasks="$p_dir/tasks.md"
    rel_report="$p_dir/test-report.md"
    rel_gate="$p_dir/sdd-quality-gate.md"

    if [ -f "$REPO_ROOT/$rel_tasks" ]; then
      if has_staged_file "$rel_tasks"; then
        ok "[$rel_tasks] 已 staged"
      else
        fail "[$rel_tasks] 未 staged，当前 P 任务交付状态可能未同步"
      fi
    fi

    if [ -f "$REPO_ROOT/$rel_report" ]; then
      if has_staged_file "$rel_report"; then
        ok "[$rel_report] 已 staged"
        check_no_open_placeholders "$REPO_ROOT/$rel_report"
        check_has_closeout_status "$REPO_ROOT/$rel_report"
        if [ -x "$HOME/.codex/hooks/superflow-test-report-lint.py" ]; then
          lint_args=(--repo-root "$REPO_ROOT")
          if [ -f "$REPO_ROOT/$p_dir/tests.md" ]; then
            lint_args+=(--tests "$REPO_ROOT/$p_dir/tests.md")
          fi
          "$HOME/.codex/hooks/superflow-test-report-lint.py" \
            "${lint_args[@]}" "$REPO_ROOT/$rel_report"
          if [ $? -ne 0 ]; then
            FAILED=1
          fi
        fi
      else
        fail "[$rel_report] 未 staged，当前 P 任务测试报告未同步"
      fi
    else
      fail "[$rel_report] 不存在，当前 P 任务缺少独立测试报告"
    fi

    if [ -f "$REPO_ROOT/$rel_gate" ]; then
      if has_staged_file "$rel_gate"; then
        ok "[$rel_gate] 已 staged"
        check_no_open_placeholders "$REPO_ROOT/$rel_gate"
      else
        fail "[$rel_gate] 未 staged，当前 P 任务质量门禁可能未同步"
      fi
    fi

    check_context_drift_guard "$p_dir"
  done
fi

VERIFY_REPORTS=$(printf '%s\n' "$REPORTS" | grep -E \
  '(^|/)embedded-changes/p[0-9][^/]*/test-report\.md$' || true)

if [ -n "$VERIFY_REPORTS" ] && [ -x "$HOME/.codex/hooks/superflow-verify-integration.sh" ]; then
  VERIFY_ARGS=""
  for report in $VERIFY_REPORTS; do
    abs_report="$REPO_ROOT/$report"
    if is_blocked_doc_freeze_report "$abs_report" && [ -z "$CODE_RUNTIME_CHANGED" ]; then
      ok "[$report] 为 SDD 文档冻结 Blocked 报告，跳过真实集成验收脚本"
      continue
    fi
    VERIFY_ARGS="$VERIFY_ARGS $abs_report"
  done
  if [ -n "$VERIFY_ARGS" ]; then
    "$HOME/.codex/hooks/superflow-verify-integration.sh" $VERIFY_ARGS
    if [ $? -ne 0 ]; then
      FAILED=1
    fi
  fi
fi

ROOT_REPORTS=$(printf '%s\n' "$REPORTS" | grep -E \
  '(^|/)openspec/changes/[^/]+/test-report\.md$|(^|/)doc/openspec/changes/[^/]+/test-report\.md$' || true)

if [ -n "$ROOT_REPORTS" ] && [ -x "$HOME/.codex/hooks/superflow-test-report-lint.py" ]; then
  for report in $ROOT_REPORTS; do
    root_lint_args=(--warn-only --repo-root "$REPO_ROOT")
    root_tests="${report%/test-report.md}/tests.md"
    if [ -f "$REPO_ROOT/$root_tests" ]; then
      root_lint_args+=(--tests "$REPO_ROOT/$root_tests")
    fi
    "$HOME/.codex/hooks/superflow-test-report-lint.py" \
      "${root_lint_args[@]}" "$REPO_ROOT/$report"
    if [ $? -ne 0 ]; then
      FAILED=1
    fi
  done
fi

if [ "$FAILED" -ne 0 ]; then
  cat <<'BLOCK_MSG'

[SDD 交付完整性拦截]
当前提交还没有形成可交付闭环。请补齐当前 P 任务的：
  1. tasks.md 状态
  2. test-report.md 真实验证证据
  3. sdd-quality-gate.md 质量门禁状态（如果存在）

如果确实无法验证，请在 test-report.md 中写明 Blocked 或 Partially verified
以及具体阻塞原因，不能用“后续补测/待补充”作为完成态。
BLOCK_MSG
  exit 2
fi

echo "SDD 交付完整性检查通过"
exit 0
