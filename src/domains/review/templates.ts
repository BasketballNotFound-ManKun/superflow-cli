import { REVIEW_DISPOSITIONS, REVIEW_RECHECK_RESULTS } from "./report.js";

export interface ReviewInputReference {
  role: "original" | "owner-response";
  path: string;
  sha256: string;
  content: string;
}

export function renderReviewTemplate(
  sources: Array<{ path: string; sha256: string }>,
  english: boolean,
  chain: ReviewInputReference[] = [],
  findingIds: string[] = [],
): string {
  const note = english
    ? "Template only; retain NEEDS_CONTEXT until actual independent review. Input identity is not actual reading. Fill actual dispatch/return references and inspection scope; do not replace an original report or its historical source hashes."
    : "仅为模板；实际独立评审前保持 NEEDS_CONTEXT。输入身份不等于实际阅读。填写真实派发/返回引用和检查范围；不得覆盖原报告或重绑历史源码哈希。";
  return [
    "NEEDS_CONTEXT",
    "",
    note,
    "",
    "## Review Identity",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Role | independent-reviewer |",
    "| Dispatch | <actual-dispatch-reference> |",
    "| Return | <actual-return-reference> |",
    "",
    "## Impact",
    "",
    "<original-goal-and-contract-paths>",
    "<actual-read-range-and-expansion-reasons; baseline/current; unchanged callers; failure paths; test sufficiency>",
    "",
    "## Axes",
    "",
    "| Axis | Status | Source / evidence / reason |",
    "|---|---|---|",
    ...[
      "security",
      "performance",
      "correctness",
      "maintainability",
      "architecture",
    ].map(
      (axis) => `| ${axis} | BLOCKED | <actual-evidence-or-missing-context> |`,
    ),
    "",
    "## Findings",
    "",
    "<actual anchored findings; explicit None only after actual review>",
    "",
    "## Concerns",
    "",
    "<unresolved concerns and missing evidence; explicit None only after actual clearance>",
    "",
    "## Reviewed Sources",
    "",
    "| Path | SHA-256 |",
    "|---|---|",
    ...sources.map((source) => `| ${source.path} | ${source.sha256} |`),
    "",
    ...(chain.length
      ? [
          "## Review Chain",
          "",
          "| Role | Path | SHA-256 |",
          "|---|---|---|",
          ...chain.map(
            (input) => `| ${input.role} | ${input.path} | ${input.sha256} |`,
          ),
          "",
          "## Finding Rechecks",
          "",
          "| ID | Result | Evidence |",
          "|---|---|---|",
          ...findingIds.map(
            (id) =>
              `| ${id} | <result> | <actual-independent-recheck-evidence> |`,
          ),
          "",
        ]
      : []),
    "## Report Instructions",
    "",
    english
      ? "Paths in tables and finding anchors are project-root relative. Identity placeholders must be replaced with actual locatable references (session:... or report.md#event); a rereview Return must differ from every ancestor. Record actual reading in Impact; Reviewed Sources binds supplied input bytes."
      : "表格路径和 finding 锚点相对项目根。身份占位须替换为真实可定位引用（session:... 或 report.md#event）；复评 Return 不得复用任何祖先。实际阅读写 Impact；Reviewed Sources 绑定收到的输入字节。",
    "",
    english
      ? "Each axis uses CHECKED / NOT_APPLICABLE / BLOCKED with evidence/reason; CHECKED does not prove correctness. Findings use a unique stable ID, a real file:line anchor, cause, consequence and evidence. Example shape only:"
      : "每维使用 CHECKED / NOT_APPLICABLE / BLOCKED 并附证据/理由；CHECKED 不证明正确。Finding 使用唯一稳定 ID、真实 file:line 锚点、根因、后果和证据。仅格式示例：",
    "",
    "```markdown",
    "- [F-001] src/example.ts:12 [correctness][HIGH] <cause; consequence; evidence; repair and acceptance>",
    "```",
    "",
    english
      ? "Use DONE only with explicit Concerns None and no unresolved concerns. Use DONE_WITH_CONCERNS for remaining risk, BLOCKED for blockers, NEEDS_CONTEXT for missing input. Keep new findings in Findings and current concerns in Concerns, separately from original finding IDs."
      : "DONE 必须明确 Concerns None 且无未决风险；残余风险用 DONE_WITH_CONCERNS，阻塞用 BLOCKED，缺输入用 NEEDS_CONTEXT。新增 finding 写 Findings，当前 concern 写 Concerns，与原 finding ID 集合分开。",
    ...(chain.length
      ? [
          "",
          english
            ? `Finding Rechecks must cover exactly the original IDs; allowed results: ${REVIEW_RECHECK_RESULTS.join(", ")}. Fill only actual reviewer judgments. Never mechanically convert mitigated/deferred into resolved or erase concerns to obtain DONE; an actual independent reviewer can resolve or dismiss with new evidence. Missing evidence remains NEEDS_CONTEXT/BLOCKED; a template is not a return.`
            : `Finding Rechecks 精确覆盖原 ID；合法结果：${REVIEW_RECHECK_RESULTS.join(", ")}。只填 Reviewer 实际判断，不得机械地把 mitigated/deferred 改写为 resolved 或擦除 concern 来取得 DONE；实际独立 Reviewer 可基于新证据解消或驳回。缺证据保持 NEEDS_CONTEXT/BLOCKED；模板不是实际返回。`,
        ]
      : []),
    "",
  ].join("\n");
}

export function renderOwnerResponseTemplate(
  findingIds: string[],
  english: boolean,
): string {
  return [
    "NEEDS_CONTEXT",
    "",
    english
      ? "Owner response template only; not an independent review or repair assertion. Preserve the original. Fill actual disposition and evidence; do not clear concerns or claim fixes from green tests alone."
      : "仅为 Owner 响应模板，不是独立评审或修复声明。保留原件，填写实际处置与证据；不得清空 concern 或仅凭绿测试宣称修复。",
    "",
    `Allowed Disposition: ${REVIEW_DISPOSITIONS.join(", ")}`,
    "",
    "## Finding Dispositions",
    "",
    "| ID | Disposition | Evidence |",
    "|---|---|---|",
    ...findingIds.map(
      (id) =>
        `| ${id} | <disposition> | <actual-repair-or-counterevidence-or-deferral-authorization> |`,
    ),
    "",
    "## Remaining Concerns",
    "",
    "<original and new concerns, residual risks, authorization and follow-up conditions>",
    "",
  ].join("\n");
}
