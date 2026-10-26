import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditReviewReport } from "../../src/domains/review/report.js";


// Normal parser fixtures carry the same current source identity as real reports.
// Missing-manifest rejection below deliberately calls the canonical auditor directly.
const fixtureSources: string[] = [];
afterEach(() => {
  for (const directory of fixtureSources.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
function auditCurrentReport(content: string, root: string) {
  if (/^DONE\r?\n/.test(content) && !content.includes("Concerns")) {
    content = content.replace(/^DONE\r?\n/, "DONE\n## Concerns\nNone\n");
  }
  if (!content.includes("## Review Identity")) {
    const split = content.indexOf("\n");
    content = content.slice(0, split + 1) + "## Review Identity\n| Field | Value |\n|---|---|\n| Role | independent-reviewer |\n| Dispatch | session:fixture/dispatch |\n| Return | session:fixture/return |\n" + content.slice(split + 1);
  }
  if (content.includes("## Reviewed Sources")) {
    return auditReviewReport(content, root);
  }
  const directory = fs.mkdtempSync(path.join(root, "review-input-"));
  fixtureSources.push(directory);
  const file = path.join(directory, "source.ts");
  fs.writeFileSync(file, "current source");
  const digest = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const split = content.indexOf("\n");
  const manifest = `\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n| ${path.relative(root, file)} | ${digest} |\n`;
  return auditReviewReport(content.slice(0, split) + manifest + content.slice(split), root);
}

describe("reviewer four-state report", () => {

  it("rejects missing Concerns from DONE with otherwise current identity and sources", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-required-concerns-"));
    fs.writeFileSync(path.join(root, "source.ts"), "source");
    const hash = createHash("sha256").update("source").digest("hex");
    try {
      const result = auditReviewReport(`DONE\n## Review Identity\n| Field | Value |\n|---|---|\n| Role | independent-reviewer |\n| Dispatch | session:d/1 |\n| Return | session:r/1 |\n## Findings\nNone\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n| source.ts | ${hash} |\n`, root);
      expect(result.eligibleForTriage).toBe(false);
      expect(result.issues.join("\n")).toContain("Concerns");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it.each(["unchanged", "changed", "removed"])("retains historical source identity when %s", evolution => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-chain-"));
    const hash = (text: string) => createHash("sha256").update(text).digest("hex");
    const identity = "## Review Identity\n| Field | Value |\n|---|---|\n| Role | independent-reviewer |\n| Dispatch | session:dispatch/1 |\n| Return | session:return/1 |\n";
    fs.writeFileSync(path.join(root, "application.ts"), "before");
    const original = `DONE_WITH_CONCERNS\n${identity}## Concerns\nFix required\n## Findings\n- [F-001] application.ts:1: guard missing\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n| application.ts | ${hash("before")} |\n`;
    const owner = "## Finding Dispositions\n| ID | Disposition | Evidence |\n|---|---|---|\n| F-001 | fixed | test:guard |\n";
    fs.writeFileSync(path.join(root, "original.md"), original);
    fs.writeFileSync(path.join(root, "owner.md"), owner);
    if (evolution === "changed") fs.writeFileSync(path.join(root, "application.ts"), "after");
    if (evolution === "removed") fs.unlinkSync(path.join(root, "application.ts"));
    fs.writeFileSync(path.join(root, "current.ts"), "current");
    const current = `DONE\n${identity.replace("session:return/1", "session:return/2")}## Concerns\nNone\n## Findings\nNone\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n| current.ts | ${hash("current")} |\n## Review Chain\n| Role | Path | SHA-256 |\n|---|---|---|\n| original | original.md | ${hash(original)} |\n| owner-response | owner.md | ${hash(owner)} |\n## Finding Rechecks\n| ID | Result | Evidence |\n|---|---|---|\n| F-001 | resolved | test:guard |\n`;
    try {
      expect(auditReviewReport(current, root).issues).toEqual([]);
      expect(auditReviewReport(current, root).eligibleForTriage).toBe(true);
      const historicalDone = original.replace("DONE_WITH_CONCERNS", "DONE").replace("## Concerns\nFix required\n", "");
      fs.writeFileSync(path.join(root, "original.md"), historicalDone);
      expect(auditReviewReport(current.replace(hash(original), hash(historicalDone)), root).eligibleForTriage).toBe(false);
      fs.writeFileSync(path.join(root, "original.md"), original);
      const spaced = current.replace(/^(## .+)$/gm, "$1 ");
      expect(auditReviewReport(spaced, root).eligibleForTriage).toBe(true);
      expect(auditReviewReport(spaced.replace("| F-001 | resolved | test:guard |", ""), root).eligibleForTriage).toBe(false);
      expect(auditReviewReport(current.replace("| Return | session:return/2 |", "| Return | session:return/2 |\n| Return | session:return/1 |"), root).eligibleForTriage).toBe(false);
      const second = current.replace("DONE\n", "DONE_WITH_CONCERNS\n").replace("## Concerns\nNone", "## Concerns\nNew issue").replace("## Findings\nNone", "## Findings\n- [F-002] current.ts:1: new issue");
      fs.writeFileSync(path.join(root, "second.md"), second);
      fs.writeFileSync(path.join(root, "second-owner.md"), owner.replace("F-001", "F-002"));
      const third = current.replace("original.md", "second.md").replace(hash(original), hash(second)).replace("owner.md", "second-owner.md").replace(hash(owner), hash(owner.replace("F-001", "F-002"))).replace("F-001", "F-002").replace("session:return/2", "session:return/3");
      expect(auditReviewReport(third, root).eligibleForTriage).toBe(true);
      expect(auditReviewReport(third.replace("session:return/3", "session:return/1"), root).eligibleForTriage).toBe(false);
      expect(auditReviewReport(current.replace("session:return/2", "session:return/1"), root).eligibleForTriage).toBe(false);
      const combined = original + owner;
      fs.writeFileSync(path.join(root, "original.md"), combined);
      const sameFile = current.replace(hash(original), hash(combined)).replace(`owner.md | ${hash(owner)}`, `original.md | ${hash(combined)}`);
      expect(auditReviewReport(sameFile, root).eligibleForTriage).toBe(false);
      fs.writeFileSync(path.join(root, "original.md"), original);
      for (const invalid of [current.replace("| F-001 | resolved", "| F-999 | resolved"), current.replace("| F-001 | resolved | test:guard |", ""), current.replace("| F-001 | resolved", "| F-001 | accepted"), current.replace("| Role | independent-reviewer |", "| Role | owner |")]) {
        expect(auditReviewReport(invalid, root).eligibleForTriage).toBe(false);
      }
      const wrongRecheck = auditReviewReport(current.replace("| F-001 | resolved", "| F-999 | resolved"), root);
      expect(wrongRecheck.issues.join("\n")).toContain("missing=[F-001]");
      expect(wrongRecheck.issues.join("\n")).toContain("unexpected=[F-999]");
      fs.writeFileSync(path.join(root, "owner.md"), owner.replace("F-001", "F-999"));
      const changedOwner = fs.readFileSync(path.join(root, "owner.md"), "utf8");
      expect(auditReviewReport(current.replace(hash(owner), hash(changedOwner)), root).eligibleForTriage).toBe(false);
      fs.writeFileSync(path.join(root, "owner.md"), owner);
      const overwritten = original.replace("- [F-001] application.ts:1: guard missing", "None");
      fs.writeFileSync(path.join(root, "original.md"), overwritten);
      expect(auditReviewReport(current, root).eligibleForTriage).toBe(false);
      expect(auditReviewReport(current.replace(hash(original), hash(overwritten)), root).eligibleForTriage).toBe(false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it.each(["## Concerns", "## Concerns ", "## Concerns\t", "  ## Concerns ##", "##\tConcerns"])("rejects DONE with residual concerns and ATX heading %j", heading => {
    const result = auditCurrentReport(`DONE\n## Findings\nNone\n## Notes\nContext\n${heading}\nPending retry semantics\n`, os.tmpdir());
    expect(result.eligibleForTriage).toBe(false);
  });
  it.each(["Role", "Dispatch", "Return"])("rejects duplicate Review Identity field %s", field => {
    const identity = "## Review Identity\n| Field | Value |\n|---|---|\n| Role | independent-reviewer |\n| Dispatch | session:d/1 |\n| Return | session:r/1 |\n";
    const row = identity.split("\n").find(line => line.startsWith(`| ${field} |`));
    expect(auditCurrentReport(`DONE\n${identity}${row}\n## Findings\nNone\n`, os.tmpdir()).eligibleForTriage).toBe(false);
  });
  it("rejects Owner self-review and missing dispatch identity", () => {
    for (const identity of ["| Role | owner |\n| Dispatch | d |\n| Return | r |", "| Role | independent-reviewer |\n| Return | r |"])
      expect(auditCurrentReport(`DONE\n## Review Identity\n| Field | Value |\n|---|---|\n${identity}\n## Findings\nNone\n`, os.tmpdir()).eligibleForTriage).toBe(false);
  });
  it("rejects a missing original review instead of treating Owner response as recheck", () => {
    expect(auditCurrentReport(`DONE\n## Findings\nNone\n## Review Chain\n| Role | Path | SHA-256 |\n|---|---|---|\n| original | missing.md | ${"a".repeat(64)} |\n`, os.tmpdir()).eligibleForTriage).toBe(false);
  });

  it.each(["-", "+", "*", "1.", "1)"])(
    "counts unresolved findings using Markdown list marker %s", marker => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-list-"));
      fs.writeFileSync(path.join(root, "application.ts"), "source");
      try {
        const result = auditCurrentReport(`DONE\n## Findings\n${marker} application.ts:1: unresolved\n`, root);
        expect(result.findings).toBe(1);
        expect(result.findingsClear).toBe(false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );
  it.each(["unresolved issue remains", "", "None\nunresolved issue remains"])(
    "does not mistake an ambiguous Findings body for explicit clearance: %s", body => {
      const result = auditCurrentReport(`DONE\n## Findings\n${body}\n`, os.tmpdir());
      expect(result.findingsClear).toBe(false);
    },
  );
  it("requires explicit clearance in the current Findings section", () => {
    expect(auditCurrentReport("DONE\n## Findings\nNone\n", os.tmpdir()).findingsClear).toBe(true);
    expect(auditCurrentReport("DONE\n", os.tmpdir()).findingsClear).toBe(false);
  });

  it("binds declared reviewed sources to the current source bytes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-snapshot-"));
    fs.writeFileSync(path.join(root, "application.ts"), "before");
    const sha = createHash("sha256").update("before").digest("hex");
    const report = `DONE\n## Findings\nNone\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n| application.ts | ${sha} |\n`;
    try {
      const current = auditCurrentReport(report, root);
      expect(current.eligibleForTriage).toBe(true);
      expect(current.reviewedSources).toEqual([{ path: "application.ts", sha256: sha }]);
      fs.writeFileSync(path.join(root, "application.ts"), "after");
      expect(auditCurrentReport(report, root).eligibleForTriage).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    "", "| Path | SHA-256 |\n|---|---|", "| missing.ts | invalid |",
    `| ../outside.ts | ${"a".repeat(64)} |`,
    `| missing.ts | ${"a".repeat(64)} |`,
  ])("rejects incomplete or invalid declared reviewed sources: %s", (table) => {
    const result = auditCurrentReport(`DONE\n## Reviewed Sources\n${table}\n`, os.tmpdir());
    expect(result.eligibleForTriage).toBe(false);
    expect(result.issues.join("\n")).toContain("reviewed source");
  });

  it("rejects duplicate and symlink-escaped source declarations", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-snapshot-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "review-snapshot-outside-"));
    const sha = createHash("sha256").update("source").digest("hex");
    fs.writeFileSync(path.join(root, "application.ts"), "source");
    fs.writeFileSync(path.join(outside, "outside.ts"), "source");
    fs.symlinkSync(path.join(outside, "outside.ts"), path.join(root, "link.ts"));
    const header = "DONE\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n";
    try {
      expect(auditCurrentReport(header + `| application.ts | ${sha} |\n| ./application.ts | ${sha} |`, root).eligibleForTriage).toBe(false);
      expect(auditCurrentReport(header + `| link.ts | ${sha} |`, root).eligibleForTriage).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a completed report without current reviewed sources", () => {
    const result = auditReviewReport("DONE\n## Findings\nNone\n", os.tmpdir());
    expect(result.eligibleForTriage).toBe(false);
    expect(result.reviewedSources).toBeNull();
  });

  it.each(["-\t```markdown", "1.\t```markdown", ">\t```markdown"])(
    "fails closed for unsupported tab container %s",
    (open) => {
      const result = auditCurrentReport(
        `DONE\n## Findings\nNone\n${open}\nexample\n  \`\`\`\n## Findings\n- missing.ts:999: real finding\n`,
        os.tmpdir(),
      );
      expect(result.eligibleForTriage).toBe(false);
      expect(result.issues).toContain("unsupported tab container code fence");
    },
  );

  it.each(["- ```", "> ```"])("keeps %s inside a root code fence", (fakeClose) => {
    const result = auditCurrentReport(
      `DONE\n## Findings\nNone\n\`\`\`markdown\n${fakeClose}\n## Findings\n- missing.ts:999: example\n\`\`\`\n`,
      os.tmpdir(),
    );
    expect(result.findings).toBe(0);
    expect(result.eligibleForTriage).toBe(true);
  });

  it.each(["```", "  - ```", ">   ```"])(
    "fails closed when list fence has an invalid closing prefix %s",
    (close) => {
      const result = auditCurrentReport(
        `DONE\n## Findings\nNone\n- \`\`\`markdown\n${close}\n`,
        os.tmpdir(),
      );
      expect(result.eligibleForTriage).toBe(false);
    },
  );

  it.each([
    ["list", "- ```markdown", "  ```"],
    ["nested list", "  - - ~~~~markdown", "      ~~~~~"],
    ["quote", "> ```markdown", "> ```"],
    ["quoted list", "> - ```markdown", ">   ```"],
    ["ordered list", "1. ```markdown", "   ```"],
  ])("ignores %s container examples and retains following real findings", (_name, open, close) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-container-"));
    fs.writeFileSync(path.join(root, "A.ts"), "a\nb\n");
    try {
      const result = auditCurrentReport(
        `DONE\n## Findings\nNone\n\n${open}\n  ## Findings\n  - missing.ts:999: example\n${close}\n## Findings\n- A.ts:2: real finding\n`,
        root,
      );
      expect(result.findings).toBe(1);
      expect(result.eligibleForTriage).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects an unclosed container fence rather than passing hidden findings", () => {
    const result = auditCurrentReport(
      "DONE\n## Findings\nNone\n- ```markdown\n## Findings\n- missing.ts:999: hidden\n",
      os.tmpdir(),
    );
    expect(result.eligibleForTriage).toBe(false);
    expect(result.issues).toContain("unclosed container code fence");
  });

  it.each([
    ["backticks", "```markdown", "```", "\n"],
    ["tildes", "~~~markdown", "~~~", "\n"],
    ["longer closing fence", "````markdown", "`````", "\n"],
    ["three leading spaces", "   ```markdown", "   ```", "\n"],
    ["CRLF", "```markdown", "```", "\r\n"],
    ["unclosed fence", "```markdown", "", "\n"],
  ])("ignores example findings inside %s", (_name, open, close, newline) => {
    const content = [
      "DONE", "## Findings", "None", "", "## Notes", open,
      "## Findings", "- missing.ts:999: example only", close,
    ].join(newline);
    const result = auditCurrentReport(content, os.tmpdir());
    expect(result.findings).toBe(0);
    expect(result.eligibleForTriage).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it.each(["~~~", "``", "``` trailing text"])(
    "does not close a backtick fence with %s",
    (close) => {
      const result = auditCurrentReport(
        `DONE\n## Findings\nNone\n\`\`\`markdown\n${close}\n- missing.ts:999: example\n`,
        os.tmpdir(),
      );
      expect(result.findings).toBe(0);
      expect(result.eligibleForTriage).toBe(true);
    },
  );

  it.each(["    ```markdown", "```mark`down"])(
    "keeps findings after invalid opening fence %s",
    (open) => {
      const result = auditCurrentReport(
        `DONE\n## Findings\n${open}\n- missing.ts:999: real finding\n`,
        os.tmpdir(),
      );
      expect(result.findings).toBe(1);
      expect(result.eligibleForTriage).toBe(false);
    },
  );

  it("keeps the surrounding Findings section after a closed example", () => {
    const result = auditCurrentReport(
      "DONE\n## Findings\n```markdown\n## Notes\n- example\n```\n- missing.ts:999: real finding\n",
      os.tmpdir(),
    );
    expect(result.findings).toBe(1);
    expect(result.issues.join("\n")).toContain("missing.ts:999");
  });

  it("does not accept a state marker inside a fence", () => {
    const result = auditCurrentReport("```markdown\nDONE\n```\n", os.tmpdir());
    expect(result.state).toBeNull();
    expect(result.eligibleForTriage).toBe(false);
  });

  it("does not accept a Concerns section inside a fence", () => {
    const result = auditCurrentReport(
      "DONE_WITH_CONCERNS\n```markdown\n## Concerns\nexample\n```\n",
      os.tmpdir(),
    );
    expect(result.issues.join("\n")).toContain("requires a Concerns section");
  });

  it("accepts anchored findings only when review is complete", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-report-"));
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "src", "A.java"), "a\nb\n");
    try {
      const result = auditCurrentReport(
        "DONE\n## Findings\n- [F-001] src/A.java:2: missing null guard\n",
        root,
      );
      expect(result.eligibleForTriage).toBe(true);
      expect(result.issues).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps BLOCKED reports out of triage", () => {
    const result = auditCurrentReport(
      "BLOCKED\n## Findings\n- src/A.java:2: tentative finding\n",
      "/tmp",
    );
    expect(result.eligibleForTriage).toBe(false);
  });

  it("rejects an invalid anchor and unstructured concerns", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-report-"));
    try {
      const result = auditCurrentReport(
        "DONE_WITH_CONCERNS\n## Findings\n- src/Missing.java:88: concern\n",
        root,
      );
      expect(result.eligibleForTriage).toBe(false);
      expect(result.issues.join("\n")).toContain("Concerns");
      expect(result.issues.join("\n")).toContain("Missing.java:88");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects an anchor that escapes through a symlink", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-report-root-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "review-report-outside-"));
    fs.writeFileSync(path.join(outside, "Outside.java"), "a\n");
    fs.symlinkSync(path.join(outside, "Outside.java"), path.join(root, "Inside.java"));
    try {
      const result = auditCurrentReport(
        "DONE\n## Findings\n- Inside.java:1: finding\n",
        root,
      );
      expect(result.eligibleForTriage).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
