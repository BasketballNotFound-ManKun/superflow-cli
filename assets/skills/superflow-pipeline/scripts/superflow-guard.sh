#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  superflow-guard.sh <change-dir> docs|design|implement|verify|archive [--apply]

Validate SDD phase readiness. With --apply, update .sdd/state.yaml through
superflow-state transition events.
USAGE
}

die() {
  printf 'superflow-guard: %s\n' "$*" >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="$SCRIPT_DIR/superflow-state.sh"
HANDOFF="$SCRIPT_DIR/superflow-handoff.sh"
VALIDATE="$SCRIPT_DIR/superflow-yaml-validate.sh"

CHANGE_DIR="${1:-}"
PHASE="${2:-}"
MODE="${3:-}"
CHANGE_DIR_INPUT="${CHANGE_DIR%/}"

[[ -n "$CHANGE_DIR" && -n "$PHASE" ]] || {
  usage
  exit 1
}
[[ -d "$CHANGE_DIR" ]] || die "change dir not found: $CHANGE_DIR"
[[ -z "$MODE" || "$MODE" == "--apply" ]] || die "unknown option: $MODE"

CHANGE_DIR="$(cd "$CHANGE_DIR" && pwd)"
issues=()

require_canonical_change_layout() {
  local suffix

  if [[ -L "$CHANGE_DIR_INPUT" ]]; then
    issues+=("symlinked OpenSpec change directory is forbidden; keep one physical openspec/changes/<change-name> directory")
  fi

  [[ "$CHANGE_DIR" == */openspec/changes/* ]] || return 0
  suffix="${CHANGE_DIR#*/openspec/changes/}"
  case "$suffix" in
    archive/*|*/embedded-changes/*) return 0 ;;
  esac
  if [[ "$suffix" == */* ]]; then
    issues+=("non-canonical OpenSpec change directory: encode the version in <change-name> and use openspec/changes/<change-name>")
  fi
}

require_canonical_change_layout

require_file() {
  local path="$1"
  [[ -f "$CHANGE_DIR/$path" ]] || issues+=("missing file: $path")
}

require_grep() {
  local pattern="$1"
  local path="$2"
  local label="$3"
  local target="$CHANGE_DIR/$path"
  [[ -f "$path" ]] && target="$path"
  if [[ ! -f "$target" ]]; then
    issues+=("missing file for check: $path")
  elif ! grep -Eiq "$pattern" "$target"; then
    issues+=("$label not found in $path")
  fi
}

project_root_for_change() {
  if git -C "$CHANGE_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
    git -C "$CHANGE_DIR" rev-parse --show-toplevel
    return
  fi
  if [[ "$CHANGE_DIR" == */openspec/changes/* ]]; then
    dirname "$(dirname "$(dirname "$CHANGE_DIR")")"
    return
  fi
  dirname "$(dirname "$CHANGE_DIR")"
}

require_test_report_lint() {
  local report="$CHANGE_DIR/test-report.md"
  local root lint output
  root="$(project_root_for_change)"

  for lint in \
    "$root/.codex/hooks/superflow-test-report-lint.py" \
    "$HOME/.codex/hooks/superflow-test-report-lint.py"; do
    if [[ -x "$lint" ]]; then
      output="$(mktemp)"
      if ! "$lint" --tests "$CHANGE_DIR/tests.md" "$report" >"$output" 2>&1; then
        issues+=("superflow-test-report-lint failed: $(tr '\n' ' ' < "$output" | sed -E 's/[[:space:]]+/ /g')")
      fi
      rm -f "$output"
      return
    fi
  done

  issues+=("superflow-test-report-lint.py not found for verify guard")
}

require_markdown_links_valid() {
  local output
  output="$(mktemp)"
  if ! python3 - "$CHANGE_DIR" >"$output" 2>&1 <<'PY'
import os
import re
import sys
from pathlib import Path

change_dir = Path(sys.argv[1]).resolve()
files = [
    p for p in change_dir.rglob("*.md")
    if ".sdd" not in p.relative_to(change_dir).parts
]
state = change_dir / ".sdd" / "state.yaml"
if state.exists():
    for line in state.read_text(errors="ignore").splitlines():
        if line.startswith("technical_design:") or line.startswith("design_doc:"):
            value = line.split(":", 1)[1].strip()
            if value and value != "null":
                candidate = (change_dir / value).resolve()
                if candidate.exists() and candidate.suffix == ".md":
                    files.append(candidate)

link_re = re.compile(r"\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)")
bad = []
seen = set()
for file in files:
    if file in seen or not file.exists():
        continue
    seen.add(file)
    try:
        display_file = str(file.relative_to(change_dir))
    except ValueError:
        display_file = os.path.relpath(file, change_dir)
    text = file.read_text(errors="ignore")
    for match in link_re.finditer(text):
        target = match.group(1).strip()
        if (
            target.startswith("#")
            or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target)
            or target.startswith("/")
        ):
            continue
        target_path = target.split("#", 1)[0]
        resolved = (file.parent / target_path).resolve()
        if not resolved.exists():
            bad.append(
                f"{display_file} -> {target} "
                f"(resolved: {os.path.relpath(resolved, change_dir)})"
            )

if bad:
    print("; ".join(bad))
    sys.exit(1)
PY
  then
    issues+=("broken markdown links: $(tr '\n' ' ' < "$output" | sed -E 's/[[:space:]]+/ /g')")
  fi
  rm -f "$output"
}

state_get() {
  "$STATE" get "$CHANGE_DIR" "$1" 2>/dev/null || true
}

require_state_value() {
  local key="$1"
  local label="$2"
  local value
  value="$(state_get "$key")"
  [[ -n "$value" && "$value" != "null" ]] || issues+=("$label is not set in .sdd/state.yaml")
}

require_optional_state_path() {
  local key="$1"
  local label="$2"
  local value
  value="$(state_get "$key")"
  [[ -n "$value" && "$value" != "null" ]] || {
    issues+=("$label is not set in .sdd/state.yaml")
    return 0
  }
  [[ -f "$CHANGE_DIR/$value" || -f "$value" ]] || {
    issues+=("$label path does not exist: $value")
  }
}

require_state_file() {
  require_file .sdd/state.yaml
}

require_tasks_complete() {
  local task_count unchecked_count
  require_file tasks.md
  [[ -f "$CHANGE_DIR/tasks.md" ]] || return 0
  task_count="$(grep -Ec '^[[:space:]]*-[[:space:]]+\[[ xX]\]' "$CHANGE_DIR/tasks.md" || true)"
  unchecked_count="$(grep -Ec '^[[:space:]]*-[[:space:]]+\[[[:space:]]\]' "$CHANGE_DIR/tasks.md" || true)"
  [[ "$task_count" -gt 0 ]] || issues+=("tasks.md has no checkbox tasks")
  [[ "$unchecked_count" -eq 0 ]] || issues+=("$unchecked_count unchecked task(s) remain in tasks.md")
}

verification_report_path() {
  local value
  value="$(state_get verification_report)"
  [[ -n "$value" && "$value" != "null" ]] || return 1
  if [[ -f "$CHANGE_DIR/$value" ]]; then
    printf '%s\n' "$CHANGE_DIR/$value"
    return 0
  fi
  if [[ -f "$value" ]]; then
    printf '%s\n' "$value"
    return 0
  fi
  return 1
}

require_closeout_markers() {
  local report="${1:-$CHANGE_DIR/test-report.md}"
  if [[ ! -f "$report" ]]; then
    issues+=("verification report path does not exist: $report")
    return 0
  fi
  if ! grep -Eiq '(Verification Result|验证结果|验证结论)[[:space:]:：|*-]*(PASS|通过)' "$report"; then
    issues+=("verification result PASS marker not found in verification report")
  fi
  if ! grep -Eiq '(Archive Readiness|归档就绪)[[:space:]:：|*-]*(PASS|READY|通过|就绪)' "$report"; then
    issues+=("archive readiness PASS marker not found in verification report")
  fi
}

require_branch_handled() {
  local branch_status
  branch_status="$(state_get branch_status)"
  [[ "$branch_status" == "handled" ]] || issues+=("branch_status must be handled before verification closeout")
}

require_full_verification_fingerprint() {
  local report="$CHANGE_DIR/test-report.md"
  [[ "$(state_get verify_mode)" == "full" ]] || return 0
  require_grep '测试环境|test environment|staging|sandbox' "$report" "full verification test environment"
  require_grep '分支|提交|版本|构建号|镜像|branch|commit|tag|build|image' "$report" "full verification deployment fingerprint"
  require_grep 'https?://|Base URL|基础地址' "$report" "full verification base URL"
  require_grep '验证时间|执行时间|timestamp|verified[_ -]?at|20[0-9]{2}-[0-9]{2}-[0-9]{2}' "$report" "full verification timestamp"
}

require_spec_doc() {
  if [[ -f "$CHANGE_DIR/spec.md" ]]; then
    return
  fi
  if find "$CHANGE_DIR/specs" -path '*/spec.md' -type f 2>/dev/null | grep -q .; then
    return
  fi
  issues+=("missing spec document: spec.md or specs/<capability>/spec.md")
}

require_handoff() {
  require_file .sdd/handoff/sdd-context.md
  require_file .sdd/handoff/sdd-context.json
  require_file .sdd/handoff/sdd-context.sha256
  require_state_value handoff_context "handoff_context"
  require_state_value handoff_hash "handoff_hash"
}

require_handoff_current() {
  local hash_file="$CHANGE_DIR/.sdd/handoff/sdd-context.sha256"
  local recorded actual
  [[ -f "$hash_file" ]] || return 0
  recorded="$(tr -d '[:space:]' < "$hash_file")"
  actual="$("$HANDOFF" "$CHANGE_DIR" --hash-only 2>/dev/null || true)"
  [[ -n "$actual" ]] || {
    issues+=("could not compute current handoff hash")
    return 0
  }
  [[ "$recorded" == "$actual" ]] || {
    issues+=("handoff hash is stale: recorded=$recorded actual=$actual")
  }
}

require_beta_handoff_structure() {
  local mode json
  mode="$(state_get context_compression)"
  [[ "$mode" == "beta" ]] || return 0
  json="$CHANGE_DIR/.sdd/handoff/sdd-context.json"
  [[ -s "$json" ]] || {
    issues+=("beta handoff json missing or empty")
    return 0
  }
  grep -q '"contextCompression": "beta"' "$json" || issues+=("beta handoff json missing contextCompression=beta")
  grep -q '"role": "api"' "$json" || issues+=("beta handoff json missing api role")
  grep -Eq '"role": "(spec|test)"' "$json" || issues+=("beta handoff json missing spec/test role")
  grep -q '"projected": true' "$json" || issues+=("beta handoff json missing projected=true sources")
}

require_hash_recorded() {
  local hash_file="$CHANGE_DIR/.sdd/handoff/sdd-context.sha256"
  [[ -f "$hash_file" ]] || return 0
  local hash
  hash="$(tr -d '[:space:]' < "$hash_file")"
  [[ -n "$hash" ]] || {
    issues+=("handoff hash file is empty")
    return 0
  }
  if ! grep -Riq "$hash" \
    "$CHANGE_DIR/design.md" "$CHANGE_DIR/sdd-quality-gate.md" \
    "$CHANGE_DIR/test-report.md" "$CHANGE_DIR/prompt" 2>/dev/null; then
    issues+=("handoff hash is not recorded in design, quality gate, prompt, or test-report")
  fi
}

change_has_field_status_risk() {
  grep -RIEiq \
    '字段值|状态|枚举|online|offline|上线|下线|删除|恢复|同步标记|sync marker|payment|refund|支付|退款|第三方状态|running_status|offline_time' \
    "$CHANGE_DIR"/*.md "$CHANGE_DIR"/**/*.md 2>/dev/null
}

change_has_external_enum_risk() {
  grep -RIEiq \
    'BEM|payOrigin|payMode|支付来源|支付方式|财务口径|第三方枚举|第三方字段|third[- ]party enum|source system|SDK.*枚举|枚举.*SDK' \
    "$CHANGE_DIR/proposal.md" \
    "$CHANGE_DIR/api.md" \
    "$CHANGE_DIR/design.md" \
    "$CHANGE_DIR/tests.md" \
    "$CHANGE_DIR/spec.md" \
    "$CHANGE_DIR"/specs/*/spec.md 2>/dev/null
}

change_has_external_config_risk() {
  grep -RIEiq \
    '第三方|外部平台|外部工具|外部集成|third[- ]party|external (platform|tool|integration|system)|SDK|MQ|Kafka|RocketMQ|TDMQ|callback|回调|webhook|支付渠道|payment gateway|cloud service|云服务' \
    "$CHANGE_DIR/proposal.md" \
    "$CHANGE_DIR/api.md" \
    "$CHANGE_DIR/design.md" \
    "$CHANGE_DIR/tests.md" \
    "$CHANGE_DIR/spec.md" \
    "$CHANGE_DIR"/specs/*/spec.md 2>/dev/null
}

change_has_concurrency_idempotency_risk() {
  grep -RIEiq \
    '并发|批量下发|批量开通|批量续费|重复提交|重复回调|重复消费|重复下发|幂等|竞态|原子占用|concurren|idempoten|race condition|duplicate (request|callback|consumption|delivery)|atomic claim' \
    "$CHANGE_DIR/proposal.md" \
    "$CHANGE_DIR/api.md" \
    "$CHANGE_DIR/design.md" \
    "$CHANGE_DIR/tests.md" \
    "$CHANGE_DIR/spec.md" \
    "$CHANGE_DIR"/specs/*/spec.md 2>/dev/null
}

change_has_money_precision_risk() {
  grep -RIEiq \
    '金额|费用|价格|优惠|折扣|抵扣|退款|分账|支付|发票|余额|电费|服务费|套餐结算|比例分摊|明细分配|尾差|精度|舍入|(^|[^[:alnum:]_])(amount|fee|fees|price|discount|deduction|refund|payment|invoice|balance|proration|allocation|reconciliation|rounding)([^[:alnum:]_]|$)|revenue sharing|profit sharing|split payment|serviceFee|chargeFee|totalAmount|actualAmount|payAmount|refundAmount|discountAmount|invoiceAmount|balanceAmount' \
    "$CHANGE_DIR/proposal.md" \
    "$CHANGE_DIR/api.md" \
    "$CHANGE_DIR/design.md" \
    "$CHANGE_DIR/tests.md" \
    "$CHANGE_DIR/spec.md" \
    "$CHANGE_DIR"/specs/*/spec.md 2>/dev/null
}

change_has_fx_precision_risk() {
  grep -RIEiq \
    '汇率|换汇|外汇|币种转换|跨币种|兑换率|(^|[^[:alnum:]_])(exchange rate|fx rate|currency conversion|cross.currency|base currency|quote currency)([^[:alnum:]_]|$)' \
    "$CHANGE_DIR/proposal.md" \
    "$CHANGE_DIR/api.md" \
    "$CHANGE_DIR/design.md" \
    "$CHANGE_DIR/tests.md" \
    "$CHANGE_DIR/spec.md" \
    "$CHANGE_DIR"/specs/*/spec.md 2>/dev/null
}

change_has_architecture_boundary_risk() {
  grep -RIEiq \
    '跨仓|跨服务|sibling|SDK|MQ|topic|consumer|scheduler|定时|device|设备|callback|回调|third[- ]party|第三方|mini[- ]program|小程序|gateway|网关|adapter|适配|protocol|协议|interconnect|互联互通|调用链|入口|出口' \
    "$CHANGE_DIR"/*.md "$CHANGE_DIR"/**/*.md 2>/dev/null
}

first_prompt_rel() {
  find "$CHANGE_DIR" -path '*/prompt/*.md' -type f | head -n 1 | sed "s#^$CHANGE_DIR/##"
}

require_any_prompt() {
  if ! find "$CHANGE_DIR" -path '*/prompt/*.md' -type f | grep -q .; then
    issues+=("missing implementation prompt under prompt/*.md")
  fi
}

require_prompt_set() {
  local task_count prompt_count non_index_prompt_count
  require_file prompt/implementation.md
  task_count="$(grep -E '^[[:space:]]*-[[:space:]]+\[[ xX]\]' "$CHANGE_DIR/tasks.md" 2>/dev/null | wc -l | tr -d ' ')"
  prompt_count="$(find "$CHANGE_DIR/prompt" -maxdepth 1 -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' ')"
  non_index_prompt_count="$(find "$CHANGE_DIR/prompt" -maxdepth 1 -type f -name '*.md' ! -name 'implementation.md' 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "$task_count" -gt 0 && "$non_index_prompt_count" -eq 0 ]]; then
    issues+=("missing task prompt under prompt/<task-name>.md; prompt/implementation.md alone is not enough")
  fi
  if [[ "$prompt_count" -eq 0 ]]; then
    issues+=("missing prompt/*.md files")
  fi
  if [[ -f "$CHANGE_DIR/tasks.md" ]] && ! grep -Riq 'prompt/.*\.md' "$CHANGE_DIR/tasks.md" "$CHANGE_DIR/traceability-matrix.md" "$CHANGE_DIR/sdd-quality-gate.md" "$CHANGE_DIR/test-report.md" 2>/dev/null; then
    issues+=("prompt files are not cross-linked from tasks/traceability/quality gate/test-report")
  fi
}

require_external_enum_contract() {
  local path="$1"
  local label="$2"
  require_grep 'External Enum Binding|外部枚举绑定|第三方字段语义绑定|外部字段.*外部枚举|外部枚举.*展示文案|owner.*确认' "$path" "$label"
  require_grep '外部字段|外部系统字段|External field|target field' "$path" "$label external field column"
  require_grep '外部枚举|外部字典|External enum|target enum' "$path" "$label external enum column"
  require_grep '展示文案|业务语义|财务语义|display|business meaning' "$path" "$label display/business meaning column"
  require_grep 'owner|确认|confirmed|approval' "$path" "$label owner confirmation column"
  require_grep '不确定|阻塞|blocker|unknown|待确认' "$path" "$label unresolved/blocker column"
}

require_external_config_contract() {
  local path="$1"
  local label="$2"
  require_grep 'External Integration Configuration And Deployment Contract|外部集成配置与部署合同|外部配置.*部署合同' "$path" "$label"
  require_grep '本地.*测试.*生产|local.*test.*production|local.*staging.*production' "$path" "$label environment matrix"
  require_grep '注入|创建方式|provision|injection|IaC|Secret|控制台|console' "$path" "$label injection/provisioning"
  require_grep '运行 owner|创建 owner|provisioning owner|runtime owner|owner.*时点|owner.*time' "$path" "$label owner and timing"
  require_grep '就绪|readiness|消息轨迹|trace|health' "$path" "$label readiness evidence"
  require_grep '回滚|rollback|禁用|disable' "$path" "$label rollback"
  require_grep '密钥|凭据|secret|credential' "$path" "$label secret handling"
  require_grep '不得.*硬编码|禁止.*硬编码|not.*hard.?cod|must not.*hard.?cod|do not hard.?code' "$path" "$label no hard-coded external config"
  require_grep '测试.*生产|test.*production|staging.*production' "$path" "$label test-production distinction"
}

require_concurrency_idempotency_contract() {
  local path="$1"
  local label="$2"
  require_grep 'Concurrency And Idempotency Ownership|并发与幂等归属|应用层原子占用' "$path" "$label"
  require_grep '业务幂等键|business idempotency key|business key' "$path" "$label business idempotency key"
  require_grep '应用层原子占用|application.layer atomic claim|atomic claim' "$path" "$label application-layer atomic claim"
  require_grep '短事务|short transaction|事务边界|transaction boundary' "$path" "$label short transaction boundary"
  require_grep '待处理|pending|成功|success|失败|failed|状态流转|state machine' "$path" "$label state machine"
  require_grep '重试|retry' "$path" "$label retry contract"
  require_grep '外部调用|external call|third.party call' "$path" "$label external-call boundary"
  require_grep '唯一索引.*(不是|不得|不作为).*默认|unique index.*not.*default|do not.*default.*unique index' "$path" "$label unique index is not the default"
}

require_money_precision_contract() {
  local path="$1"
  local label="$2"
  require_grep 'Money Precision Boundary|金额精度边界' "$path" "$label"
  require_grep '计算态|calculation.state|calculation source|intermediate precision' "$path" "$label calculation state"
  require_grep '结算态|展示态|settlement|display.state|rounding boundary' "$path" "$label settlement/display boundary"
  require_grep 'scale|rounding mode|RoundingMode|舍入模式' "$path" "$label scale and rounding mode"
  require_grep '分配|对账|allocation|reconciliation|residual|尾差' "$path" "$label allocation/reconciliation rule"
  require_grep '权威总额|真源总额|authoritative total|source.of.truth total' "$path" "$label authoritative total"
  require_grep '差额反推|总额.*减|authoritative total.*minus|derive.*complement|complement amount' "$path" "$label complement derivation"
  require_grep '禁止.*分别计算|不得.*分别计算|禁止.*独立.*舍入|do not.*independently|must not.*calculate.*separately' "$path" "$label independent calculation prohibition"
  require_grep '禁止提前舍入|不得提前.*舍入|forbidden early rounding|do not.*round' "$path" "$label forbidden early rounding"
  require_grep '半分|尾差|多明细|half.cent|residual|multi.detail' "$path" "$label boundary test evidence"
  require_grep 'BigDecimal|MonetaryAmount|整数最小单位|integer minor unit|exact decimal' "$path" "$label exact representation"
  require_grep '禁止.*(float|double)|不得.*(float|double)|never.*(float|double)|do not.*(float|double)' "$path" "$label binary floating-point prohibition"
  require_grep '币种|currency' "$path" "$label currency contract"
  require_grep '最小单位|minor unit|provider unit|渠道单位' "$path" "$label minor-unit boundary"
  require_grep '舍入层级|舍入点|rounding level|rounding point|明细.*整单|line.level.*aggregate' "$path" "$label rounding level"
  require_grep '规则来源|合同依据|policy source|contract source' "$path" "$label rounding policy source"
  require_grep '最大余数|largest remainder|稳定.*排序|stable tie.break|业务主键' "$path" "$label deterministic residual tie-breaker"
  require_grep '正数.*零.*负数|正数.*退款|positive.*zero.*negative|positive.*refund' "$path" "$label signed-value evidence"
  require_grep '舍入前.*舍入后|pre.round.*post.round' "$path" "$label rounding audit evidence"
  require_grep 'DECIMAL|NUMERIC|数据库.*不适用|持久化.*不适用|persistence.*not applicable' "$path" "$label persistence precision contract"
  if change_has_fx_precision_risk; then
    require_grep 'base/quote|基础币种.*目标币种|基准币种.*报价币种' "$path" "$label FX direction"
    require_grep '汇率来源|rate source' "$path" "$label FX source"
    require_grep '汇率.*时间|rate.*timestamp|rate.*effective' "$path" "$label FX timestamp"
    require_grep '唯一换算路径|权威换算路径|canonical conversion path|canonical path' "$path" "$label FX canonical path"
    require_grep '目标.*结算.*舍入|target.*settlement.*round' "$path" "$label FX target rounding"
  fi
}

require_money_precision_evidence() {
  local path="$1"
  local label="$2"
  require_grep 'Money Precision Boundary|金额精度边界' "$path" "$label"
  require_grep '半分|尾差|多明细|half.cent|residual|multi.detail' "$path" "$label boundary cases"
  require_grep '原始金额|优惠金额|实付金额|分配合计|对账|original.*discount.*actual|allocated total|reconciliation' "$path" "$label reconciliation evidence"
  require_grep '权威总额|真源总额|authoritative total' "$path" "$label authoritative total evidence"
  require_grep '差额反推|总额.*减|authoritative total.*minus|derive.*complement|complement amount' "$path" "$label complement derivation evidence"
  require_grep '币种|currency' "$path" "$label currency evidence"
  require_grep '最小单位|minor unit|provider unit|渠道单位' "$path" "$label minor-unit reconciliation"
  require_grep '正数.*零.*负数|正数.*退款|positive.*zero.*negative|positive.*refund' "$path" "$label signed-value cases"
  require_grep '舍入前.*舍入后|pre.round.*post.round' "$path" "$label rounding audit evidence"
  require_grep '尾差接收方|residual recipient' "$path" "$label residual audit evidence"
  require_grep '并列余数|tied remainder' "$path" "$label tied-residual cases"
  require_grep '幂等|idempoten' "$path" "$label allocation idempotence"
  if change_has_fx_precision_risk; then
    require_grep 'base/quote|基础币种.*目标币种|基准币种.*报价币种' "$path" "$label FX direction evidence"
    require_grep '汇率来源|rate source' "$path" "$label FX source evidence"
    require_grep '目标.*结算.*舍入|target.*settlement.*round' "$path" "$label FX target rounding evidence"
  fi
}

transition_event=""

if [[ -x "$VALIDATE" && -f "$CHANGE_DIR/.sdd/state.yaml" ]]; then
  "$VALIDATE" "$CHANGE_DIR" >/dev/null
fi

case "$PHASE" in
  docs)
    require_state_file
    require_file proposal.md
    require_file api.md
    require_spec_doc
    require_file design.md
    require_file tasks.md
    require_file tests.md
    require_file traceability-matrix.md
    require_file review-checklist.md
    require_file sdd-quality-gate.md
    require_file test-report.md
    require_handoff
    require_handoff_current
    require_beta_handoff_structure
    require_hash_recorded
    require_grep 'Superpowers Technical Design Handoff|Superpower 技术详设|technical_design|源码级 HOW' design.md "Superpowers technical design handoff"
    require_grep 'OpenSpec/SDD|WHAT|合同|API|DB|tests|验收' design.md "OpenSpec/SDD contract boundary"
    require_grep '文档完整性|完整文档|proposal.md|api.md|design.md|tasks.md|tests.md' sdd-quality-gate.md "document completeness gate"
    require_grep 'RED|红绿|GREEN' tests.md "RED/GREEN test contract"
    require_grep 'curl|Postman|Newman|pytest|RestAssured|自动化命令' tests.md "interface automation command"
    require_grep 'handoff_hash|sdd-context|上下文包|防漂移' sdd-quality-gate.md "handoff/context-drift gate"
    if change_has_external_enum_risk; then
      require_external_enum_contract api.md "external enum binding contract"
      require_external_enum_contract sdd-quality-gate.md "external enum binding quality gate"
    fi
    if change_has_external_config_risk; then
      require_external_config_contract api.md "external integration configuration contract"
      require_external_config_contract sdd-quality-gate.md "external integration deployment gate"
    fi
    if change_has_concurrency_idempotency_risk; then
      require_concurrency_idempotency_contract sdd-quality-gate.md "concurrency and idempotency ownership quality gate"
    fi
    if change_has_money_precision_risk; then
      require_grep 'Money Precision Boundary|金额精度边界' sdd-quality-gate.md "money precision quality gate"
    fi
    require_markdown_links_valid
    transition_event="docs-complete"
    ;;
  design)
    require_state_file
    require_file proposal.md
    require_file api.md
    require_spec_doc
    require_file design.md
    require_file tasks.md
    require_file tests.md
    require_file traceability-matrix.md
    require_file review-checklist.md
    require_file sdd-quality-gate.md
    require_file test-report.md
    require_handoff
    require_handoff_current
    require_beta_handoff_structure
    require_hash_recorded
    workflow="$(state_get workflow)"
    if [[ "$workflow" == "full" ]]; then
      require_optional_state_path technical_design "technical_design"
      technical_design_rel="$(state_get technical_design)"
      if [[ -n "${technical_design_rel:-}" && "$technical_design_rel" != "null" ]]; then
        require_grep 'Superpowers Technical Design|Superpower 技术详设|Technical Design|源码级 HOW' "$technical_design_rel" "Superpowers technical design"
        require_grep 'OpenSpec/SDD|canonical|事实源|不得覆盖|不能覆盖' "$technical_design_rel" "technical design canonical boundary"
        if change_has_architecture_boundary_risk; then
          require_grep 'Architecture Boundary And Call Direction|架构边界与调用方向|模块职责.*调用方向|owner.*入口.*出口|禁止绕路' "$technical_design_rel" "architecture boundary and call direction matrix"
        fi
        if change_has_field_status_risk; then
          require_grep 'Field And Status Reverse Impact|字段/状态反向影响面|写入点.*读取|读取/过滤点|派生/同步点' "$technical_design_rel" "field/status reverse impact matrix"
        fi
        if change_has_external_enum_risk; then
          require_external_enum_contract "$technical_design_rel" "external enum binding matrix"
        fi
        if change_has_external_config_risk; then
          require_external_config_contract "$technical_design_rel" "external integration configuration and deployment contract"
        fi
        if change_has_concurrency_idempotency_risk; then
          require_concurrency_idempotency_contract "$technical_design_rel" "concurrency and idempotency ownership contract"
        fi
        if change_has_money_precision_risk; then
          require_money_precision_contract "$technical_design_rel" "money precision boundary"
        fi
      fi
    fi
    require_grep 'Superpowers Technical Design Handoff|Superpower 技术详设|technical_design|源码级 HOW' design.md "Superpowers technical design handoff"
    require_grep 'technical_design|Superpowers 技术详设|源码级 HOW' sdd-quality-gate.md "technical design quality gate"
    require_markdown_links_valid
    transition_event="design-complete"
    ;;
  implement)
    require_state_file
    require_handoff
    require_handoff_current
    require_beta_handoff_structure
    require_hash_recorded
    require_any_prompt
    require_prompt_set
    require_grep 'OpenSpec/SDD|设计事实源|canonical|事实源' design.md "canonical source boundary"
    prompt_rel="$(first_prompt_rel)"
    if [[ -n "${prompt_rel:-}" ]]; then
      require_grep 'Superpower 技术详设继承|Superpower 执行策略继承|technical_design|源码级 HOW' "$prompt_rel" "prompt Superpower strategy inheritance"
      technical_design_rel="$(state_get technical_design)"
      if [[ -n "${technical_design_rel:-}" && "$technical_design_rel" != "null" ]]; then
        require_grep 'Superpower 技术详设继承|technical_design|源码级 HOW|Technical Design' "$prompt_rel" "prompt Superpowers technical design inheritance"
        if change_has_field_status_risk; then
          require_grep '字段/状态反向影响面|Field And Status Reverse Impact|读取/过滤点|派生/同步点' "$prompt_rel" "prompt field/status reverse impact inheritance"
        fi
        if change_has_external_enum_risk; then
          require_external_enum_contract "$prompt_rel" "prompt external enum binding inheritance"
        fi
        if change_has_external_config_risk; then
          require_external_config_contract "$prompt_rel" "prompt external integration configuration inheritance"
        fi
        if change_has_concurrency_idempotency_risk; then
          require_concurrency_idempotency_contract "$prompt_rel" "prompt concurrency and idempotency ownership inheritance"
        fi
        if change_has_money_precision_risk; then
          require_money_precision_contract "$prompt_rel" "prompt money precision inheritance"
        fi
      fi
      require_grep '上下文防漂移|handoff_hash|sdd-context' "$prompt_rel" "prompt context drift inheritance"
    fi
    require_state_value build_mode "build_mode"
    require_state_value isolation "isolation"
    require_state_value tdd_mode "tdd_mode"
    workflow="$(state_get workflow)"
    review_mode="$(state_get review_mode)"
    if [[ "$workflow" == "full" ]]; then
      case "$review_mode" in
        off|standard|thorough) ;;
        *) issues+=("review_mode must be off, standard, or thorough before leaving implement") ;;
      esac
    fi
    require_markdown_links_valid
    transition_event="implement-complete"
    ;;
  verify)
    require_state_file
    require_tasks_complete
    require_file test-report.md
    require_grep 'RED|失败证据' test-report.md "RED evidence"
    require_grep 'GREEN|通过证据' test-report.md "GREEN evidence"
    require_grep '接口自动化|curl|Postman|Newman|pytest|RestAssured' test-report.md "interface automation evidence"
    require_grep 'DB|数据库|SELECT|SHOW CREATE' test-report.md "DB evidence"
    require_grep 'superflow-verify-integration|superflow-delivery-check|superflow-test-report-lint' test-report.md "SuperBridge Flow hook/script evidence"
    if change_has_external_enum_risk; then
      require_grep 'External Enum Binding|外部枚举绑定|第三方字段语义绑定|外部展示|展示文案|业务语义|财务语义|BEM|真实入口' test-report.md "external enum binding runtime evidence"
    fi
    if change_has_external_config_risk; then
      require_grep 'External Integration Configuration And Deployment Contract|外部集成配置与部署合同' test-report.md "external integration configuration runtime evidence"
      require_grep '生产.*就绪|production.*ready|provision.*verified|资源.*存在|resource.*exists' test-report.md "external production readiness evidence"
    fi
    if change_has_concurrency_idempotency_risk; then
      require_grep 'Concurrency And Idempotency Ownership|并发与幂等归属|应用层原子占用' test-report.md "concurrency and idempotency runtime evidence"
      require_grep '并发|concurren|重复|duplicate|重试|retry' test-report.md "concurrency duplicate and retry cases"
    fi
    if change_has_money_precision_risk; then
      require_money_precision_evidence test-report.md "money precision runtime evidence"
    fi
    require_test_report_lint
    require_closeout_markers "$CHANGE_DIR/test-report.md"
    require_branch_handled
    require_full_verification_fingerprint
    require_markdown_links_valid
    if [[ "$(state_get verification_report)" == "" || "$(state_get verification_report)" == "null" ]]; then
      "$STATE" set "$CHANGE_DIR" verification_report test-report.md
    fi
    transition_event="verify-pass"
    ;;
  archive)
    require_state_file
    require_tasks_complete
    verify_result="$(state_get verify_result)"
    [[ "$verify_result" == "pass" ]] || issues+=("verify_result must be pass before archive")
    archived="$(state_get archived)"
    [[ "$archived" != "true" ]] || issues+=("archived is already true")
    require_state_value verification_report "verification_report"
    report_path="$(verification_report_path || true)"
    if [[ -z "$report_path" ]]; then
      issues+=("verification_report path does not exist")
    else
      require_closeout_markers "$report_path"
    fi
    require_branch_handled
    require_state_value verified_at "verified_at"
    transition_event="archived"
    ;;
  *)
    usage
    exit 1
    ;;
esac

if [[ "${#issues[@]}" -gt 0 ]]; then
  printf 'SDD guard failed for phase %s:\n' "$PHASE" >&2
  printf -- '- %s\n' "${issues[@]}" >&2
  exit 1
fi

printf 'SDD guard passed for phase %s\n' "$PHASE"

if [[ "$MODE" == "--apply" ]]; then
  "$STATE" transition "$CHANGE_DIR" "$transition_event"
  "$STATE" next "$CHANGE_DIR"
fi
