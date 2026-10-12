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
  const body = reportBodyLines(content);
  const lines = body.lines;
  const first = lines.find((line) => line.trim())?.trim() ?? "";
  const state = STATES.has(first as ReviewerState)
    ? first as ReviewerState
    : null;
  const issues: string[] = [];
  if (body.unclosedContainer) issues.push("unclosed container code fence");
  if (body.unsupportedTabContainer) {
    issues.push("unsupported tab container code fence");
  }
  if (!state) issues.push("reviewer report must start with a four-state marker");
  if (state === "DONE_WITH_CONCERNS" && !lines.some((line) => /^## Concerns\b/.test(line))) {
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

function reportBodyLines(content: string): {
  lines: string[];
  unclosedContainer: boolean;
  unsupportedTabContainer: boolean;
} {
  let fence: string | null = null;
  let prefixes: Array<number | "quote"> = [];
  let unsupportedTabContainer = false;
  const lines = content.split(/\r?\n/).filter((line) => {
    if (fence) {
      const candidate = closingFenceLine(line, prefixes);
      const marker = candidate === null
        ? null : /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(candidate);
      if (marker && marker[1][0] === fence[0]
          && marker[1].length >= fence.length && /^[ \t]*$/.test(marker[2])) {
        fence = null;
      }
      return false;
    }
    const tabContainer = /^((?:[ \t]*>[ \t]*|[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+)+)(`{3,}|~{3,})/.exec(line);
    if (tabContainer?.[1].includes("\t")) {
      unsupportedTabContainer = true;
    }
    const normalized = fenceContainerLine(line);
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(normalized.text);
    if (marker && (marker[1][0] === "~" || !marker[2].includes("`"))) {
      fence = marker[1];
      prefixes = normalized.prefixes;
      return false;
    }
    return true;
  });
  return {
    lines,
    unclosedContainer: fence !== null && prefixes.length > 0,
    unsupportedTabContainer,
  };
}

function closingFenceLine(
  line: string,
  prefixes: Array<number | "quote">,
): string | null {
  let text = line;
  for (const prefix of prefixes) {
    const match = prefix === "quote"
      ? /^ {0,3}> ?/.exec(text)
      : new RegExp(`^ {${prefix}}`).exec(text);
    if (!match) return null;
    text = text.slice(match[0].length);
  }
  return text;
}

function fenceContainerLine(line: string): {
  text: string;
  prefixes: Array<number | "quote">;
} {
  let text = line;
  const prefixes: Array<number | "quote"> = [];
  for (;;) {
    const quote = /^ {0,3}> ?/.exec(text);
    const list = /^ {0,3}(?:[-+*]|\d{1,9}[.)]) +/.exec(text);
    const prefix = quote ?? list;
    if (!prefix) return { text, prefixes };
    prefixes.push(quote ? "quote" : prefix[0].length);
    text = text.slice(prefix[0].length);
  }
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
