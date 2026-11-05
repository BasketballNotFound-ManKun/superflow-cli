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
  findingEntries: Array<{ id: string; text: string }>;
  concerns: string[] | null;
  issues: string[];
}

export const REVIEW_DISPOSITIONS = ["fixed", "mitigated", "deferred", "dismissed"] as const;
export const REVIEW_RECHECK_RESULTS = ["resolved", "dismissed"] as const;

const STATES = new Set<ReviewerState>([
  "DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT",
]);

export function auditReviewReport(
  content: string,
  projectRoot: string,
  historical = false,
  ancestors: Set<string> = new Set(),
  ancestorReturns: Set<string> = new Set(),
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
  if (fields.size !== identity.length) {
    issues.push("Review Identity fields must be unique");
  }
  if (fields.get("Role") !== "independent-reviewer"
      || !["Dispatch", "Return"].every(key => validReference(fields.get(key)))) {
    issues.push("Review Identity requires independent-reviewer Role, Dispatch and Return references");
  }
  const returnReference = fields.get("Return");
  if (returnReference && ancestorReturns.has(returnReference)) {
    issues.push("Finding recheck requires a distinct actual Return reference throughout its chain");
  }
  const nextReturns = new Set(ancestorReturns);
  if (returnReference) nextReturns.add(returnReference);
  if (state === "DONE") {
    const concerns = sectionLines(lines, "Concerns", issues);
    if (concerns === null || !(concerns.length === 1 && /^(?:None|无)[。.]?$/i.test(concerns[0]))) {
      issues.push("DONE requires explicit Concerns None/无 without unresolved items");
    }
  }
  const findingIds: string[] = [];
  const findingEntries: ReviewReportAudit["findingEntries"] = [];
  let findings = 0;
  let inFindings = false;
  let findingsSections = 0;
  const findingsBody: string[] = [];
  let finding: ReviewReportAudit["findingEntries"][number] | undefined;
  let continuationIndent = 0;
  for (const line of lines) {
    if (/^## Findings\s*$/.test(line)) {
      inFindings = true;
      findingsSections += 1;
      finding = undefined;
      continue;
    }
    if (/^## /.test(line)) inFindings = false;
    if (!inFindings) continue;
    if (line.trim()) findingsBody.push(line.trim());
    if (!line.trim()) continue;
    const item = /^([ \t]*)(?:[-+*]|\d{1,9}[.)])[ \t]+/.exec(line);
    const id = /^\s*(?:[-+*]|\d{1,9}[.)])\s+\[([A-Z][A-Z0-9]*-\d+)\]/.exec(line)?.[1];
    const indent = /^[ \t]*/.exec(line)![0].replaceAll("\t", "    ").length;
    if (finding && indent >= continuationIndent) {
      if (id) issues.push(`finding requires a unique stable ID in a top-level item: ${line.trim()}`);
      finding.text += `\n${line}`;
      continue;
    }
    finding = undefined;
    if (!item) {
      if (!/^(?:None|无)[。.]?$/i.test(line.trim())) {
        issues.push(`invalid Findings item: ${line.trim()}; expected - [F-001] file:line; indent explanations under their finding`);
      }
      continue;
    }
    findings += 1;
    if (!id || findingIds.includes(id)) issues.push("finding requires a unique stable ID");
    else {
      findingIds.push(id);
      finding = { id, text: line.trim() };
      findingEntries.push(finding);
      continuationIndent = item[0].replaceAll("\t", "    ").length;
    }
    const anchor = /(?:^|\s)([^\s:]+):([1-9]\d*)\b/.exec(line);
    if (!anchor || !safeRelative(anchor[1])
        || !historical && !validAnchor(projectRoot, anchor[1], Number(anchor[2]))) {
      issues.push(`invalid finding anchor: ${line.trim()}; expected project-root-relative file:line; ${pathDiagnostic(projectRoot, anchor?.[1])}`);
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
  const concerns = sectionLines(lines, "Concerns", issues);
  auditReviewChain(lines, projectRoot, issues, dependencies, ancestors, nextReturns);
  return {
    state,
    eligibleForTriage: state === "DONE" && issues.length === 0,
    findings,
    // Current closure requires explicit clearance, never an inferred absence.
    findingsClear,
    reviewedSources,
    dependencies,
    findingIds,
    findingEntries,
    concerns,
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
  const rows = reportTable(lines, "Reviewed Sources", ["Path", "SHA-256"], issues);
  const sources: NonNullable<ReviewReportAudit["reviewedSources"]> = [];
  const seen = new Set<string>();
  for (const [candidate, sha256] of rows) {
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      issues.push(`invalid reviewed source SHA-256: ${candidate}; expected 64 lowercase hexadecimal characters`);
      continue;
    }
    if (historical && safeRelative(candidate)) {
      if (seen.has(path.resolve(root, candidate))) issues.push(`duplicate reviewed source: ${candidate}`);
      seen.add(path.resolve(root, candidate));
      sources.push({ path: candidate, sha256 });
      continue;
    }
    const file = containedFile(root, candidate);
    if (!file || !safeRelative(candidate)) {
      issues.push(`invalid reviewed source path: ${candidate}; ${pathDiagnostic(root, candidate)}`);
      continue;
    }
    if (seen.has(file)) issues.push(`duplicate reviewed source: ${candidate}`);
    seen.add(file);
    try {
      const actual = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      if (actual !== sha256) {
        issues.push(`reviewed source hash drift: ${candidate}; declared=${sha256}, actual=${actual}; ${pathDiagnostic(root, candidate)}`);
      }
      sources.push({ path: candidate, sha256 });
    } catch {
      issues.push(`unreadable reviewed source: ${candidate}; ${pathDiagnostic(root, candidate)}`);
    }
  }
  if (!sources.length) issues.push("reviewed sources must contain current files");
  return sources;
}

// References prove recorded identities, never real Agent independence or sufficiency.
function validReference(reference: string | undefined): boolean {
  return !!reference && !/[<>`]/.test(reference)
    && /^(?:[a-z][a-z0-9+.-]*:|[^ \t]+[\/#])\S+$/i.test(reference);
}

function safeRelative(candidate: string): boolean {
  return !path.isAbsolute(candidate) && !/^[A-Za-z]:[\\/]/.test(candidate)
    && !candidate.split(/[\\/]/).includes("..");
}

function sectionLines(lines: string[], title: string, issues: string[]): string[] | null {
  return sectionBodyLines(lines, title, issues)?.map(line => line.trim()).filter(Boolean) ?? null;
}

function sectionBodyLines(lines: string[], title: string, issues: string[]): string[] | null {
  const starts = lines.flatMap((line, index) => line.trimEnd() === `## ${title}` ? [index] : []);
  if (!starts.length) return null;
  if (starts.length !== 1) issues.push(`duplicate ${title} sections`);
  const rest = lines.slice(starts[0] + 1);
  const end = rest.findIndex(line => /^## /.test(line));
  return end < 0 ? rest : rest.slice(0, end);
}

function reportTable(lines: string[], title: string, header: string[], issues: string[]): string[][] {
  const body = sectionBodyLines(lines, title, issues);
  if (!body) return [];
  const rows: string[][] = [];
  const expected = `| ${header.join(" | ")} |`;
  let tables = 0;
  let inTable = false;
  for (let index = 0; index < body.length; index += 1) {
    const line = body[index].trim();
    const row = tableCells(line);
    if (row?.join("|") === header.join("|")) {
      tables += 1;
      const separator = tableCells(body[index + 1]?.trim() ?? "");
      inTable = separator?.length === header.length
        && separator.every(cell => /^:?-{3,}:?$/.test(cell));
      if (inTable) index += 1;
      else issues.push(`invalid ${title} table separator; expected ${expected} followed immediately by |${header.map(() => "---").join("|")}|`);
      continue;
    }
    if (!line.startsWith("|") && !line.endsWith("|")
        && !(inTable && line.includes("|"))) {
      inTable = false;
      continue;
    }
    if (!inTable || !row || row.length !== header.length
        || row.some(value => !value)) {
      issues.push(`invalid ${title} row: ${line}; expected ${expected} in one contiguous table`);
    } else rows.push(row);
  }
  if (tables === 0) issues.push(`missing ${title} table; expected ${expected} and a Markdown separator`);
  if (tables > 1) issues.push(`duplicate ${title} tables; expected exactly one ${expected}`);
  return rows;
}

function tableCells(line: string): string[] | null {
  if (!line.startsWith("|") || !line.endsWith("|")) return null;
  const cells: string[] = [];
  let start = 1;
  let backslashes = 0;
  for (let index = 1; index < line.length; index += 1) {
    const character = line[index];
    if (character === "|" && backslashes % 2 === 0) {
      cells.push(line.slice(start, index).trim());
      start = index + 1;
    }
    backslashes = character === "\\" ? backslashes + 1 : 0;
  }
  return start === line.length ? cells : null;
}

function pathDiagnostic(root: string, candidate?: string): string {
  return `projectRoot=${path.resolve(root)}; declared=${candidate ?? "<missing>"}; resolved=${candidate ? path.resolve(root, candidate) : "<missing>"}`;
}

function auditReviewChain(lines: string[], root: string, issues: string[],
  dependencies: string[], ancestors: Set<string>, ancestorReturns: Set<string>): void {
  const chain = reportTable(lines, "Review Chain", ["Role", "Path", "SHA-256"], issues);
  const rechecks = reportTable(lines, "Finding Rechecks", ["ID", "Result", "Evidence"], issues);
  if (sectionLines(lines, "Review Chain", issues) === null
      && sectionLines(lines, "Finding Rechecks", issues) === null) return;
  const files = new Map<string, string>();
  for (const [role, candidate, hash] of chain) {
    const file = safeRelative(candidate) ? containedFile(root, candidate) : null;
    if (!file || !/^[a-f0-9]{64}$/.test(hash)
        || createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== hash) {
      issues.push(`Review Chain invalid file/hash: ${candidate}; ${pathDiagnostic(root, candidate)}`);
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
  const previous = auditReviewReport(originalContent, root, true, next, ancestorReturns);
  dependencies.push(...previous.dependencies);
  issues.push(...previous.issues.map(issue => `original: ${issue}`));
  if (!previous.findingIds.length) issues.push("Review Chain original must retain finding IDs");
  const owner = auditOwnerResponse(fs.readFileSync(files.get("owner-response")!, "utf8"), previous.findingIds);
  issues.push(...owner.issues);
  auditFindingRows("Finding Rechecks", rechecks, previous.findingIds, REVIEW_RECHECK_RESULTS, issues);
}

export function auditOwnerResponse(
  content: string,
  findingIds: string[],
): {
  dispositions: string[][];
  issues: string[];
} {
  const issues: string[] = [];
  const body = reportBodyLines(content);
  if (body.unclosedContainer || body.unsupportedTabContainer)
    issues.push("invalid Owner response Markdown");
  const dispositions = reportTable(
    body.lines,
    "Finding Dispositions",
    ["ID", "Disposition", "Evidence"],
    issues,
  );
  auditFindingRows(
    "Finding Dispositions",
    dispositions,
    findingIds,
    REVIEW_DISPOSITIONS,
    issues,
  );
  return { dispositions, issues };
}

function auditFindingRows(
  label: string,
  rows: string[][],
  findingIds: string[],
  allowed: readonly string[],
  issues: string[],
): void {
  const ids = rows.map((row) => row[0]);
  if (
    new Set(ids).size === ids.length &&
    ids.length === findingIds.length &&
    findingIds.every((id) => ids.includes(id)) &&
    rows.every((row) => allowed.includes(row[1]))
  )
    return;
  const missing = findingIds.filter((id) => !ids.includes(id));
  const unexpected = ids.filter((id) => !findingIds.includes(id));
  const invalid = rows.filter((row) => !allowed.includes(row[1]));
  issues.push(
    `${label} must cover every original finding ID with an explicit result and evidence; ` +
      `missing=[${missing.join(",")}], unexpected=[${unexpected.join(",")}], ` +
      `allowed=[${allowed.join(",")}], invalid=[${invalid.map((row) => `${row[0]}:${row[1]}`).join(",")}]`,
  );
}


function normalizeSectionHeading(line: string): string {
  const heading = /^ {0,3}##[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
  return heading ? `## ${heading[1]}` : line;
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
    lines: lines.map(normalizeSectionHeading),
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
