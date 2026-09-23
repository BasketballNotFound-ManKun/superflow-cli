import fs from "node:fs";
import path from "node:path";

export type ReviewerState =
  | "DONE"
  | "DONE_WITH_CONCERNS"
  | "BLOCKED"
  | "NEEDS_CONTEXT";

export interface ReviewReportAudit {
  state: ReviewerState | null;
  eligibleForTriage: boolean;
  findings: number;
  issues: string[];
}

const STATES = new Set<ReviewerState>([
  "DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT",
]);

export function auditReviewReport(
  content: string,
  projectRoot: string,
): ReviewReportAudit {
  const lines = content.split(/\r?\n/);
  const first = lines.find((line) => line.trim())?.trim() ?? "";
  const state = STATES.has(first as ReviewerState)
    ? first as ReviewerState
    : null;
  const issues: string[] = [];
  if (!state) issues.push("reviewer report must start with a four-state marker");
  if (state === "DONE_WITH_CONCERNS" && !/^## Concerns\b/m.test(content)) {
    issues.push("DONE_WITH_CONCERNS requires a Concerns section");
  }
  let findings = 0;
  let inFindings = false;
  for (const line of lines) {
    if (/^## Findings\s*$/.test(line)) {
      inFindings = true;
      continue;
    }
    if (/^## /.test(line)) inFindings = false;
    if (!inFindings) continue;
    if (!/^\s*-\s+/.test(line)) continue;
    findings += 1;
    const anchor = /(?:^|\s)([^\s:]+):([1-9]\d*)\b/.exec(line);
    if (!anchor || !validAnchor(projectRoot, anchor[1], Number(anchor[2]))) {
      issues.push(`invalid finding anchor: ${line.trim()}`);
    }
  }
  return {
    state,
    eligibleForTriage: state === "DONE" && issues.length === 0,
    findings,
    issues,
  };
}

function validAnchor(root: string, candidate: string, line: number): boolean {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  try {
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(absolute);
    const realRelative = path.relative(realRoot, realFile);
    if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) return false;
    const content = fs.readFileSync(realFile, "utf8");
    return line <= content.split(/\r?\n/).length;
  } catch {
    return false;
  }
}
