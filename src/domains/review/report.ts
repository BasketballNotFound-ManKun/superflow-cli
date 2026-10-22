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
  dependencies: string[];
  findingIds: string[];
  issues: string[];
}

const STATES = new Set<ReviewerState>([
  "DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT",
]);

export function auditReviewReport(
  content: string,
  projectRoot: string,
  historical = false,
  ancestors: Set<string> = new Set(),
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
  const dependencies: string[] = [];
  const identity = reportTable(lines, "Review Identity", ["Field", "Value"], issues);
  const fields = new Map(identity.map(row => [row[0], row[1]]));
  if (fields.get("Role") !== "independent-reviewer" || !["Dispatch", "Return"].every(key => /^(?:[a-z][a-z0-9+.-]*:|[^ \t]+[\/#])\S+$/i.test(fields.get(key) ?? ""))) {
    issues.push("Review Identity requires independent-reviewer Role, Dispatch and Return references");
  }
  if (state === "DONE") {
    const concerns = sectionLines(lines, "Concerns", issues);
    if (concerns !== null && !(concerns.length === 1 && /^(?:None|无)[。.]?$/i.test(concerns[0]))) {
      issues.push("DONE cannot retain unresolved Concerns");
    }
  }
  const findingIds: string[] = [];
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
    const id = /^\s*(?:[-+*]|\d{1,9}[.)])\s+\[([A-Z][A-Z0-9]*-\d+)\]/.exec(line)?.[1];
    if (!id || findingIds.includes(id)) issues.push("finding requires a unique stable ID");
    else findingIds.push(id);
    const anchor = /(?:^|\s)([^\s:]+):([1-9]\d*)\b/.exec(line);
    if (!anchor || !(historical ? safeRelative(anchor[1]) : validAnchor(projectRoot, anchor[1], Number(anchor[2])))) {
      issues.push(`invalid finding anchor: ${line.trim()}`);
    }
  }
  const reviewedSources = auditReviewedSources(lines, projectRoot, issues, historical);
  const findingsClear = findingsSections === 1 && findingsBody.length === 1
    && /^(?:None|无)[。.]?$/i.test(findingsBody[0]);
  if (findingsSections !== 1) {
    issues.push("reviewer report requires one current Findings section");
  } else if (findings === 0 && !findingsClear) {
    issues.push("Findings must explicitly declare None or list anchored issues");
  }
  auditReviewChain(lines, projectRoot, issues, dependencies, ancestors);
  return {
    state,
    eligibleForTriage: state === "DONE" && issues.length === 0,
    findings,
    // Current closure requires explicit clearance, never an inferred absence.
    findingsClear,
    reviewedSources,
    dependencies,
    findingIds,
    issues,
  };
}

function auditReviewedSources(
  lines: string[],
  root: string,
  issues: string[],
  historical: boolean,
): ReviewReportAudit["reviewedSources"] {
  const headings = lines.flatMap((line, index) =>
    /^## Reviewed Sources\s*$/.test(line) ? [index] : []);
  if (!headings.length) {
    issues.push("reviewer report requires current Reviewed Sources");
    return null;
  }
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
    if (historical && safeRelative(candidate)) {
      if (seen.has(path.resolve(root, candidate))) issues.push(`duplicate reviewed source: ${candidate}`);
      seen.add(path.resolve(root, candidate));
      sources.push({ path: candidate, sha256 });
      continue;
    }
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

// References prove recorded identities, never real Agent independence or sufficiency.
function safeRelative(candidate: string): boolean {
  return !path.isAbsolute(candidate) && !/^[A-Za-z]:[\\/]/.test(candidate)
    && !candidate.split(/[\\/]/).includes("..");
}

function sectionLines(lines: string[], title: string, issues: string[]): string[] | null {
  const starts = lines.flatMap((line, index) => line === `## ${title}` ? [index] : []);
  if (!starts.length) return null;
  if (starts.length !== 1) issues.push(`duplicate ${title} sections`);
  const rest = lines.slice(starts[0] + 1);
  const end = rest.findIndex(line => /^## /.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).map(line => line.trim()).filter(Boolean);
}

function reportTable(lines: string[], title: string, header: string[], issues: string[]): string[][] {
  const body = sectionLines(lines, title, issues);
  if (!body) return [];
  const rows: string[][] = [];
  for (const line of body) {
    if (/^\|[\s:|-]+\|$/.test(line)) continue;
    const row = line.startsWith("|") && line.endsWith("|")
      ? line.slice(1, -1).split("|").map(value => value.trim()) : [];
    if (row.join("|") === header.join("|")) continue;
    if (row.length !== header.length || row.some(value => !value)) {
      issues.push(`invalid ${title} row: ${line}`);
    } else rows.push(row);
  }
  return rows;
}

function auditReviewChain(lines: string[], root: string, issues: string[],
  dependencies: string[], ancestors: Set<string>): void {
  const chain = reportTable(lines, "Review Chain", ["Role", "Path", "SHA-256"], issues);
  const rechecks = reportTable(lines, "Finding Rechecks", ["ID", "Result", "Evidence"], issues);
  if (sectionLines(lines, "Review Chain", issues) === null
      && sectionLines(lines, "Finding Rechecks", issues) === null) return;
  const files = new Map<string, string>();
  for (const [role, candidate, hash] of chain) {
    const file = safeRelative(candidate) ? containedFile(root, candidate) : null;
    if (!file || !/^[a-f0-9]{64}$/.test(hash)
        || createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== hash) {
      issues.push(`Review Chain invalid file/hash: ${candidate}`);
      continue;
    }
    if (!["original", "owner-response"].includes(role) || files.has(role)) {
      issues.push(`Review Chain invalid or duplicate role: ${role}`);
      continue;
    }
    files.set(role, file);
    dependencies.push(candidate);
  }
  if (!files.has("original") || !files.has("owner-response")) {
    issues.push("Review Chain requires original and owner-response files");
    return;
  }
  const original = files.get("original")!;
  if (original === files.get("owner-response")) {
    issues.push("Review Chain original and Owner response must be separate files");
  }
  if (ancestors.has(original) || ancestors.size >= 32) {
    issues.push("Review Chain cycle or excessive depth");
    return;
  }
  const next = new Set(ancestors).add(original);
  const originalContent = fs.readFileSync(original, "utf8");
  const previous = auditReviewReport(originalContent, root, true, next);
  const previousIdentity = reportTable(reportBodyLines(originalContent).lines,
    "Review Identity", ["Field", "Value"], issues);
  const currentIdentity = reportTable(lines, "Review Identity", ["Field", "Value"], issues);
  if (previousIdentity.find(row => row[0] === "Return")?.[1]
      === currentIdentity.find(row => row[0] === "Return")?.[1]) {
    issues.push("Finding recheck requires a distinct actual Return reference");
  }
  dependencies.push(...previous.dependencies);
  issues.push(...previous.issues.map(issue => `original: ${issue}`));
  if (!previous.findingIds.length) issues.push("Review Chain original must retain finding IDs");
  const owner = reportBodyLines(fs.readFileSync(files.get("owner-response")!, "utf8"));
  if (owner.unclosedContainer || owner.unsupportedTabContainer) issues.push("invalid Owner response Markdown");
  const dispositions = reportTable(owner.lines, "Finding Dispositions", ["ID", "Disposition", "Evidence"], issues);
  for (const [label, rows, allowed] of [
    ["Finding Dispositions", dispositions, ["fixed", "mitigated", "deferred", "dismissed"]],
    ["Finding Rechecks", rechecks, ["resolved", "dismissed"]],
  ] as const) {
    const ids = rows.map(row => row[0]);
    if (new Set(ids).size !== ids.length || ids.length !== previous.findingIds.length
        || previous.findingIds.some(id => !ids.includes(id))
        || rows.some(row => !(allowed as readonly string[]).includes(row[1]))) {
      issues.push(`${label} must cover every original finding ID with an explicit result and evidence`);
    }
  }
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
