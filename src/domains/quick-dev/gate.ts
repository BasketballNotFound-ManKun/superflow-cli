import { createHash } from "node:crypto";

export type QuickGateVerdict = "QUICK" | "STOP";

export interface QuickGateInput {
  request: string;
  changedFiles: string[];
  testSeam?: string;
  activeSddChange?: boolean;
  dirtyWorktree?: boolean;
}

export interface QuickSpecAudit {
  ok: boolean;
  status: "draft" | "ready-for-dev" | "in-progress" | "done" | null;
  errors: string[];
  digest: string;
}

export interface QuickGateResult {
  verdict: QuickGateVerdict;
  target: string;
  reasons: string[];
  next: string;
  nextSkill?: "superflow-clarify";
}

const HIGH_RISK_PATTERNS: Array<[RegExp, string]> = [
  [/(?:\b(?:api|endpoint|public contract)\b|接口|公共\s*API)/i, "公共接口或 API 契约"],
  [/(?:\b(?:db|database|schema|migration|sql)\b|表|数据库|迁移|索引)/i, "数据库或持久化"],
  [/(?:\b(?:transaction|concurrency|lock)\b|事务|并发|锁)/i, "事务、并发或锁"],
  [/(?:\b(?:auth|authorization|permission|security)\b|鉴权|权限|安全)/i, "安全或权限"],
  [/(?:\b(?:payment|refund|billing)\b|支付|退款|结算)/i, "支付或资金语义"],
  [/(?:\b(?:cross[- ]?module|cross[- ]?service)\b|跨模块|跨服务)/i, "跨模块或跨服务"],
];

export function evaluateQuickGate(input: QuickGateInput): QuickGateResult {
  const reasons: string[] = [];
  const target = input.request.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!target) reasons.push("目标为空");
  if (input.activeSddChange) reasons.push("存在相关在途 SDD 变更");
  if (input.dirtyWorktree) reasons.push("工作树不是任务独占");
  if (input.changedFiles.length === 0) reasons.push("尚未确认测试 seam 或改动文件");
  if (!input.testSeam?.trim()) reasons.push("未提供可核查的测试 seam");
  const highRisk = HIGH_RISK_PATTERNS
    .filter(([pattern]) => pattern.test(input.request))
    .map(([, reason]) => reason);
  reasons.push(...highRisk);
  if (input.changedFiles.some((file) =>
    /(?:^|\/)(?:sql|migration|migrations)(?:\/|$)|Mapper\.xml$|Controller\.java$|(?:^|\/)(?:pom\.xml|build\.gradle(?:\.kts)?|application[^/]*\.(?:yml|yaml|properties))$/i
      .test(file))) {
    reasons.push("改动路径触及数据库、公共入口或构建配置");
  }
  if (input.changedFiles.length > 3) reasons.push("改动文件超过单一小任务范围");
  const verdict = reasons.length === 0 ? "QUICK" : "STOP";
  return {
    verdict,
    target,
    reasons,
    next: verdict === "QUICK"
      ? "写入 quick spec，用户批准当前磁盘版本后再实施"
      : "停止 Quick；先核实在途变更是否拥有同一行为，再由 superflow-clarify 对齐正式 SDD",
    ...(verdict === "STOP" ? { nextSkill: "superflow-clarify" as const } : {}),
  };
}

export function auditQuickSpec(content: string): QuickSpecAudit {
  const matched = /^status:\s*(draft|ready-for-dev|in-progress|done)\s*$/m.exec(content)?.[1];
  const status = (matched ?? null) as QuickSpecAudit["status"];
  const required = [
    "## Intent",
    "## Non-goals",
    "## Current behavior",
    "## Target behavior",
    "## Test seam",
    "## Implementation steps",
    "## Acceptance Criteria",
    "## Risks",
  ];
  const normalized = content
    .replace(/^status:\s*(?:draft|ready-for-dev|in-progress|done)\s*$/m, "status: draft")
    .replace(/^approved-digest:\s*[^\n]*\n?/m, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  const digest = createHash("sha256").update(normalized).digest("hex");
  const approved = /^approved-digest:\s*([a-f0-9]{64})\s*$/m.exec(content)?.[1];
  const errors = [
    ...(status ? [] : ["status must be draft, ready-for-dev, in-progress, or done"]),
    ...required.filter((heading) => !content.includes(heading)).map((heading) => `missing section: ${heading}`),
  ];
  if (!/^baseline:\s*[0-9a-f]{7,40}\s*$/m.test(content)) {
    errors.push("quick spec requires a Git baseline commit");
  }
  for (const [index, heading] of required.entries()) {
    const start = content.indexOf(heading);
    if (start < 0) continue;
    const end = index + 1 < required.length
      ? content.indexOf(required[index + 1], start + heading.length)
      : content.length;
    const body = content.slice(start + heading.length, end < 0 ? content.length : end)
      .trim();
    if (!body) errors.push(`empty section: ${heading}`);
  }
  if (/\b(?:TODO|TBD)\b|待补充|<[^>]+>/.test(content)) {
    errors.push("quick spec contains a placeholder");
  }
  if (status && status !== "draft" && approved !== digest) {
    errors.push("approved Quick Spec content has changed; return to draft");
  }
  return { ok: errors.length === 0, status, errors, digest };
}
