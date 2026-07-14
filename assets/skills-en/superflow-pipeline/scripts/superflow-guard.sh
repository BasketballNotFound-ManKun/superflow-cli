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

[[ -n "$CHANGE_DIR" && -n "$PHASE" ]] || {
  usage
  exit 1
}
[[ -d "$CHANGE_DIR" ]] || die "change dir not found: $CHANGE_DIR"
[[ -z "$MODE" || "$MODE" == "--apply" ]] || die "unknown option: $MODE"

CHANGE_DIR="$(cd "$CHANGE_DIR" && pwd)"
issues=()

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
  if ! grep -Eiq '(Verification Result)[[:space:]:|*-]*(PASS)' "$report"; then
    issues+=("verification result PASS marker not found in verification report")
  fi
  if ! grep -Eiq '(Archive Readiness)[[:space:]:|*-]*(PASS|READY)' "$report"; then
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
  require_grep 'test environment|staging|sandbox' "$report" "full verification test environment"
  require_grep 'branch|commit|tag|build|image' "$report" "full verification deployment fingerprint"
  require_grep 'https?://|Base URL' "$report" "full verification base URL"
  require_grep 'timestamp|verified[_ -]?at|20[0-9]{2}-[0-9]{2}-[0-9]{2}' "$report" "full verification timestamp"
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
    'field value|status|enum|online|offline|delete|restore|sync marker|payment|refund|third-party state|running_status|offline_time' \
    "$CHANGE_DIR"/*.md "$CHANGE_DIR"/**/*.md 2>/dev/null
}

change_has_money_precision_risk() {
  grep -RIEiq \
    '(^|[^[:alnum:]_])(amount|fee|fees|price|discount|deduction|refund|payment|invoice|balance|proration|allocation|reconciliation|residual|precision|rounding)([^[:alnum:]_]|$)|revenue sharing|profit sharing|split payment|electricity fee|service fee|package settlement|serviceFee|chargeFee|totalAmount|actualAmount|payAmount|refundAmount|discountAmount|invoiceAmount|balanceAmount' \
    "$CHANGE_DIR/proposal.md" \
    "$CHANGE_DIR/api.md" \
    "$CHANGE_DIR/design.md" \
    "$CHANGE_DIR/tests.md" \
    "$CHANGE_DIR/spec.md" \
    "$CHANGE_DIR"/specs/*/spec.md 2>/dev/null
}

change_has_fx_precision_risk() {
  grep -RIEiq \
    '(^|[^[:alnum:]_])(exchange rate|fx rate|currency conversion|cross.currency|base currency|quote currency)([^[:alnum:]_]|$)' \
    "$CHANGE_DIR/proposal.md" \
    "$CHANGE_DIR/api.md" \
    "$CHANGE_DIR/design.md" \
    "$CHANGE_DIR/tests.md" \
    "$CHANGE_DIR/spec.md" \
    "$CHANGE_DIR"/specs/*/spec.md 2>/dev/null
}

change_has_architecture_boundary_risk() {
  grep -RIEiq \
    'cross-repo|cross-service|sibling|SDK|MQ|topic|consumer|scheduler|scheduled|device|callback|third[- ]party|mini[- ]program|gateway|adapter|protocol|interconnect|call chain|entry|exit' \
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

require_money_precision_contract() {
  local path="$1"
  local label="$2"
  require_grep 'Money Precision Boundary' "$path" "$label"
  require_grep 'calculation.state|calculation source|intermediate precision' "$path" "$label calculation state"
  require_grep 'settlement|display.state|rounding boundary' "$path" "$label settlement/display boundary"
  require_grep 'scale|rounding mode|RoundingMode' "$path" "$label scale and rounding mode"
  require_grep 'allocation|reconciliation|residual' "$path" "$label allocation/reconciliation rule"
  require_grep 'authoritative total|source.of.truth total' "$path" "$label authoritative total"
  require_grep 'authoritative total.*minus|derive.*complement|complement amount' "$path" "$label complement derivation"
  require_grep 'do not.*independently|must not.*calculate.*separately' "$path" "$label independent calculation prohibition"
  require_grep 'forbidden early rounding|do not.*round' "$path" "$label forbidden early rounding"
  require_grep 'half.cent|residual|multi.detail' "$path" "$label boundary test evidence"
  require_grep 'BigDecimal|MonetaryAmount|integer minor unit|exact decimal' "$path" "$label exact representation"
  require_grep 'never.*(float|double)|do not.*(float|double)' "$path" "$label binary floating-point prohibition"
  require_grep 'currency' "$path" "$label currency contract"
  require_grep 'minor unit|provider unit' "$path" "$label minor-unit boundary"
  require_grep 'rounding level|rounding point|line.level.*aggregate' "$path" "$label rounding level"
  require_grep 'policy source|contract source' "$path" "$label rounding policy source"
  require_grep 'largest remainder|stable tie.break|business key' "$path" "$label deterministic residual tie-breaker"
  require_grep 'positive.*zero.*negative|positive.*refund' "$path" "$label signed-value evidence"
  require_grep 'pre.round.*post.round' "$path" "$label rounding audit evidence"
  require_grep 'DECIMAL|NUMERIC|persistence.*not applicable' "$path" "$label persistence precision contract"
  if change_has_fx_precision_risk; then
    require_grep 'base/quote|base currency.*quote currency' "$path" "$label FX direction"
    require_grep 'rate source' "$path" "$label FX source"
    require_grep 'rate.*timestamp|rate.*effective' "$path" "$label FX timestamp"
    require_grep 'canonical conversion path|canonical path' "$path" "$label FX canonical path"
    require_grep 'target.*settlement.*round' "$path" "$label FX target rounding"
  fi
}

require_money_precision_evidence() {
  local path="$1"
  local label="$2"
  require_grep 'Money Precision Boundary' "$path" "$label"
  require_grep 'half.cent|residual|multi.detail' "$path" "$label boundary cases"
  require_grep 'original.*discount.*actual|allocated total|reconciliation' "$path" "$label reconciliation evidence"
  require_grep 'authoritative total' "$path" "$label authoritative total evidence"
  require_grep 'authoritative total.*minus|derive.*complement|complement amount' "$path" "$label complement derivation evidence"
  require_grep 'currency' "$path" "$label currency evidence"
  require_grep 'minor unit|provider unit' "$path" "$label minor-unit reconciliation"
  require_grep 'positive.*zero.*negative|positive.*refund' "$path" "$label signed-value cases"
  require_grep 'pre.round.*post.round' "$path" "$label rounding audit evidence"
  require_grep 'residual recipient' "$path" "$label residual audit evidence"
  require_grep 'tied remainder' "$path" "$label tied-residual cases"
  require_grep 'idempoten' "$path" "$label allocation idempotence"
  if change_has_fx_precision_risk; then
    require_grep 'base/quote|base currency.*quote currency' "$path" "$label FX direction evidence"
    require_grep 'rate source' "$path" "$label FX source evidence"
    require_grep 'target.*settlement.*round' "$path" "$label FX target rounding evidence"
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
    require_grep 'Superpowers Technical Design Handoff|Superpowers Technical Design|technical_design|source-level HOW' design.md "Superpowers technical design handoff"
    require_grep 'OpenSpec/SDD|WHAT|contract|API|DB|tests|acceptance' design.md "OpenSpec/SDD contract boundary"
    require_grep 'document completeness|complete documents|proposal.md|api.md|design.md|tasks.md|tests.md' sdd-quality-gate.md "document completeness gate"
    require_grep 'RED|red-green|GREEN' tests.md "RED/GREEN test contract"
    require_grep 'curl|Postman|Newman|pytest|RestAssured|automation command' tests.md "interface automation command"
    require_grep 'handoff_hash|sdd-context|context package|anti-drift' sdd-quality-gate.md "handoff/context-drift gate"
    if change_has_money_precision_risk; then
      require_grep 'Money Precision Boundary' sdd-quality-gate.md "money precision quality gate"
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
        require_grep 'Superpowers Technical Design|Superpowers Technical Design|Technical Design|source-level HOW' "$technical_design_rel" "Superpowers technical design"
        require_grep 'OpenSpec/SDD|canonical|source of truth|must not override|must not override' "$technical_design_rel" "technical design canonical boundary"
        if change_has_architecture_boundary_risk; then
          require_grep 'Architecture Boundary And Call Direction|Architecture Boundary And Call Direction|module responsibility.*call direction|owner.*entry.*exit|no bypass' "$technical_design_rel" "architecture boundary and call direction matrix"
        fi
        if change_has_field_status_risk; then
          require_grep 'Field And Status Reverse Impact|Field And Status Reverse Impact|write point.*read|read/filter points|derived/sync points' "$technical_design_rel" "field/status reverse impact matrix"
        fi
        if change_has_money_precision_risk; then
          require_money_precision_contract "$technical_design_rel" "money precision boundary"
        fi
      fi
    fi
    require_grep 'Superpowers Technical Design Handoff|Superpowers Technical Design|technical_design|source-level HOW' design.md "Superpowers technical design handoff"
    require_grep 'technical_design|Superpowers Technical Design|source-level HOW' sdd-quality-gate.md "technical design quality gate"
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
    require_grep 'OpenSpec/SDD|canonical design source|canonical|source of truth' design.md "canonical source boundary"
    prompt_rel="$(first_prompt_rel)"
    if [[ -n "${prompt_rel:-}" ]]; then
      require_grep 'Superpowers Technical Design inheritance|Superpowers execution strategy inheritance|technical_design|source-level HOW' "$prompt_rel" "prompt Superpower strategy inheritance"
      technical_design_rel="$(state_get technical_design)"
      if [[ -n "${technical_design_rel:-}" && "$technical_design_rel" != "null" ]]; then
        require_grep 'Superpowers Technical Design inheritance|technical_design|source-level HOW|Technical Design' "$prompt_rel" "prompt Superpowers technical design inheritance"
        if change_has_field_status_risk; then
          require_grep 'Field And Status Reverse Impact|Field And Status Reverse Impact|read/filter points|derived/sync points' "$prompt_rel" "prompt field/status reverse impact inheritance"
        fi
        if change_has_money_precision_risk; then
          require_money_precision_contract "$prompt_rel" "prompt money precision inheritance"
        fi
      fi
      require_grep 'context anti-drift|handoff_hash|sdd-context' "$prompt_rel" "prompt context drift inheritance"
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
    require_grep 'RED|failure evidence' test-report.md "RED evidence"
    require_grep 'GREEN|pass evidence' test-report.md "GREEN evidence"
    require_grep 'interface automation|curl|Postman|Newman|pytest|RestAssured' test-report.md "interface automation evidence"
    require_grep 'DB|database|SELECT|SHOW CREATE' test-report.md "DB evidence"
    require_grep 'superflow-verify-integration|superflow-delivery-check|superflow-test-report-lint' test-report.md "SuperBridge Flow hook/script evidence"
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
