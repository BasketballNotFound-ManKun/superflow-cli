#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  superflow-status.sh <repo-root> [--json]

List active SDD changes under a repository.
USAGE
}

die() {
  printf 'superflow-status: %s\n' "$*" >&2
  exit 1
}

repo="${1:-}"
mode="${2:-}"
[[ -n "$repo" && "$repo" != "-h" && "$repo" != "--help" ]] || {
  usage
  exit 0
}
[[ -d "$repo" ]] || die "repo root not found: $repo"
[[ -z "$mode" || "$mode" == "--json" ]] || die "unknown option: $mode"

repo="$(cd "$repo" && pwd)"
state_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/superflow-state.sh"
shopt -s globstar nullglob 2>/dev/null || true

state_value() {
  local file="$1"
  local key="$2"
  awk -F':' -v k="$key" '
    $1 == k {
      value = $0
      sub("^[^:]*:[[:space:]]*", "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      print value
      found=1
    }
    END { exit found ? 0 : 1 }
  ' "$file" 2>/dev/null || true
}

count_tasks() {
  local dir="$1"
  local total done
  total="$(grep -RHE '^[[:space:]]*-[[:space:]]+\[[ xX]\]' "$dir"/*.md "$dir"/**/*.md 2>/dev/null | wc -l | tr -d ' ')"
  done="$(grep -RHE '^[[:space:]]*-[[:space:]]+\[[xX]\]' "$dir"/*.md "$dir"/**/*.md 2>/dev/null | wc -l | tr -d ' ')"
  printf '%s/%s' "$done" "$total"
}

task_total() {
  printf '%s' "$1" | awk -F/ '{print $2}'
}

task_done() {
  printf '%s' "$1" | awk -F/ '{print $1}'
}

next_reason() {
  local phase="$1"
  local verify_result="$2"
  local tasks="$3"
  local total done remaining
  total="$(task_total "$tasks")"
  done="$(task_done "$tasks")"
  remaining=$((total - done))
  [[ "$verify_result" == "fail" ]] && {
    printf '最近一次 verify 失败，先修复验证报告中的失败项。'
    return
  }
  case "$phase" in
    docs) printf '当前处于 docs 阶段，继续生成或补齐 OpenSpec/SDD 合同文档。' ;;
    design) printf '当前处于 design 阶段，继续生成 Superpowers 源码级技术详设。' ;;
    implement)
      if [[ "$remaining" -gt 0 ]]; then
        printf '当前处于 implement 阶段，还有 %s 个任务未完成。' "$remaining"
      else
        printf 'implement 任务已完成，可以进入 verify 前检查。'
      fi
      ;;
    verify) printf '当前处于 verify 阶段，补齐真实验证证据并运行验收门禁。' ;;
    archive) printf 'verify 已通过后进入 archive，等待明确归档确认。' ;;
    *) printf '当前 phase 未知，先检查 .sdd/state.yaml。' ;;
  esac
}

print_risks() {
  local dir="$1"
  local workflow="$2"
  local phase="$3"
  local review_mode="$4"
  local verify_result="$5"
  local tasks="$6"
  local total done
  total="$(task_total "$tasks")"
  done="$(task_done "$tasks")"
  [[ "$phase" == "" ]] && printf '  WARNING UNKNOWN_PHASE: phase 缺失或未知。\n'
  if [[ "$total" -eq 0 || ! -f "$dir/tasks.md" ]]; then
    printf '  WARNING TASKS_MISSING: 缺少 tasks.md 或任务清单为空。\n'
  elif [[ "$phase" == "implement" && "$done" -lt "$total" ]]; then
    printf '  WARNING TASKS_INCOMPLETE: 仍有 %s 个任务未完成。\n' "$((total - done))"
  fi
  if [[ "${workflow:-full}" == "full" && "${review_mode:-null}" == "null" ]]; then
    printf '  WARNING REVIEW_MODE_MISSING: full workflow 尚未选择 review_mode。\n'
  fi
  if [[ "$verify_result" == "fail" ]]; then
    printf '  ERROR VERIFY_FAILED: 最近一次 verify 失败。\n'
  elif [[ "$phase" == "verify" && ! -f "$dir/test-report.md" ]]; then
    printf '  WARNING TEST_REPORT_MISSING: verify 阶段缺少 test-report.md。\n'
  fi
  for artifact in proposal.md design.md tests.md; do
    [[ -f "$dir/$artifact" ]] || printf '  INFO ARTIFACT_MISSING: 缺少 %s。\n' "$artifact"
  done
}

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

find "$repo" -path '*/.sdd/state.yaml' -type f 2>/dev/null | sort > "$tmp"

if [[ "$mode" == "--json" ]]; then
  printf '{\n  "changes": [\n'
  first=1
  while IFS= read -r state; do
    dir="${state%/.sdd/state.yaml}"
    archived="$(state_value "$state" archived)"
    phase="$(state_value "$state" phase)"
    [[ "$archived" == "true" || "$phase" == "done" ]] && continue
    workflow="$(state_value "$state" workflow)"
    build_mode="$(state_value "$state" build_mode)"
    review_mode="$(state_value "$state" review_mode)"
    verify_mode="$(state_value "$state" verify_mode)"
    verify_result="$(state_value "$state" verify_result)"
    next="$("$state_script" next "$dir" 2>/dev/null | tr '\n' ';' || true)"
    tasks="$(count_tasks "$dir")"
    reason="$(next_reason "$phase" "$verify_result" "$tasks")"
    [[ "$first" -eq 0 ]] && printf ',\n'
    first=0
    printf '    {"path": "%s", "workflow": "%s", "phase": "%s", "buildMode": "%s", "reviewMode": "%s", "verifyMode": "%s", "verifyResult": "%s", "tasks": "%s", "next": "%s", "reason": "%s"}' \
      "${dir#"$repo"/}" "$workflow" "$phase" "$build_mode" "$review_mode" "$verify_mode" "$verify_result" "$tasks" "$next" "$reason"
  done < "$tmp"
  printf '\n  ]\n}\n'
  exit 0
fi

printed=0
while IFS= read -r state; do
  dir="${state%/.sdd/state.yaml}"
  archived="$(state_value "$state" archived)"
  phase="$(state_value "$state" phase)"
  [[ "$archived" == "true" || "$phase" == "done" ]] && continue
  workflow="$(state_value "$state" workflow)"
  build_mode="$(state_value "$state" build_mode)"
  review_mode="$(state_value "$state" review_mode)"
  verify_mode="$(state_value "$state" verify_mode)"
  verify_result="$(state_value "$state" verify_result)"
  tasks="$(count_tasks "$dir")"
  printed=1
  printf '%s\n' "- ${dir#"$repo"/}"
  printf '  phase: %s | workflow: %s | build_mode: %s | review_mode: %s | verify_mode: %s | verify_result: %s | tasks: %s\n' \
    "$phase" "$workflow" "$build_mode" "$review_mode" "$verify_mode" "$verify_result" "$tasks"
  printf '  reason: %s\n' "$(next_reason "$phase" "$verify_result" "$tasks")"
  print_risks "$dir" "$workflow" "$phase" "$review_mode" "$verify_result" "$tasks"
  "$state_script" next "$dir" | sed 's/^/  /'
done < "$tmp"

if [[ "$printed" -eq 0 ]]; then
  printf 'No active SuperBridge Flow changes.\n'
fi
