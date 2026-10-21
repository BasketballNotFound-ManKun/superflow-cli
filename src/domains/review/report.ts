import fs from "node:fs";
import { createHash } from "node:crypto";
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
  findingsClear: boolean;
  reviewedSources: Array<{ path: string; sha256: string }> | null;
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
  let findingsSections = 0;
  const findingsBody: string[] = [];
  for (const line of lines) {
    if (/^## Findings\s*$/.test(line)) {
      inFindings = true;
      findingsSections += 1;
      continue;
    }
    if (/^## /.test(line)) inFindings = false;
    if (!inFindings) continue;
    if (line.trim()) findingsBody.push(line.trim());
    if (!/^\s*(?:[-+*]|\d{1,9}[.)])\s+/.test(line)) continue;
    findings += 1;
    const anchor = /(?:^|\s)([^\s:]+):([1-9]\d*)\b/.exec(line);
    if (!anchor || !validAnchor(projectRoot, anchor[1], Number(anchor[2]))) {
      issues.push(`invalid finding anchor: ${line.trim()}`);
    }
  }
  const reviewedSources = auditReviewedSources(lines, projectRoot, issues);
  return {
    state,
    eligibleForTriage: state === "DONE" && issues.length === 0,
    findings,
    // Modern closure requires an explicit current clearance, rather than
    // assuming unrecognized prose or an absent Findings section means none.
    findingsClear: findingsSections === 1 && findingsBody.length === 1
      && /^(?:None|无)[。.]?$/i.test(findingsBody[0]),
    reviewedSources,
    issues,
  };
}

function auditReviewedSources(
  lines: string[],
  root: string,
  issues: string[],
): ReviewReportAudit["reviewedSources"] {
  const headings = lines.flatMap((line, index) =>
    /^## Reviewed Sources\s*$/.test(line) ? [index] : []);
  if (!headings.length) return null;
  if (headings.length !== 1) issues.push("duplicate reviewed source sections");
  const sources: NonNullable<ReviewReportAudit["reviewedSources"]> = [];
  const seen = new Set<string>();
  for (const line of lines.slice(headings[0] + 1)) {
    if (/^## /.test(line)) break;
    if (!line.trim()) continue;
    if (/^\|\s*Path\s*\|\s*SHA-256\s*\|$/.test(line)
        || /^\|[\s:|-]+\|$/.test(line)) continue;
    const columns = /^\|\s*([^|]+?)\s*\|\s*([a-f0-9]{64})\s*\|$/.exec(line);
    if (!columns) {
      issues.push(`invalid reviewed source row: ${line.trim()}`);
      continue;
    }
    const [, candidate, sha256] = columns;
    const file = containedFile(root, candidate);
    if (!file || path.isAbsolute(candidate)) {
      issues.push(`invalid reviewed source path: ${candidate}`);
      continue;
    }
    if (seen.has(file)) issues.push(`duplicate reviewed source: ${candidate}`);
    seen.add(file);
    try {
      const actual = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      if (actual !== sha256) issues.push(`reviewed source hash drift: ${candidate}`);
      sources.push({ path: candidate, sha256 });
    } catch {
      issues.push(`unreadable reviewed source: ${candidate}`);
    }
  }
  if (!sources.length) issues.push("reviewed sources must contain current files");
  return sources;
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

function containedFile(root: string, candidate: string): string | null {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  try {
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(absolute);
    const realRelative = path.relative(realRoot, realFile);
    if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) return null;
    return fs.statSync(realFile).isFile() ? realFile : null;
  } catch {
    return null;
  }
}

function validAnchor(root: string, candidate: string, line: number): boolean {
  const file = containedFile(root, candidate);
  if (!file) return false;
  try {
    return line <= fs.readFileSync(file, "utf8").split(/\r?\n/).length;
  } catch {
    return false;
  }
}
