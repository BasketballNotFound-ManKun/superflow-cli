import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditReviewReport } from "../../src/domains/review/report.js";

describe("reviewer four-state report", () => {
  it.each(["-\t```markdown", "1.\t```markdown", ">\t```markdown"])(
    "fails closed for unsupported tab container %s",
    (open) => {
      const result = auditReviewReport(
        `DONE\n## Findings\nNone\n${open}\nexample\n  \`\`\`\n## Findings\n- missing.ts:999: real finding\n`,
        os.tmpdir(),
      );
      expect(result.eligibleForTriage).toBe(false);
      expect(result.issues).toContain("unsupported tab container code fence");
    },
  );

  it.each(["- ```", "> ```"])("keeps %s inside a root code fence", (fakeClose) => {
    const result = auditReviewReport(
      `DONE\n## Findings\nNone\n\`\`\`markdown\n${fakeClose}\n## Findings\n- missing.ts:999: example\n\`\`\`\n`,
      os.tmpdir(),
    );
    expect(result.findings).toBe(0);
    expect(result.eligibleForTriage).toBe(true);
  });

  it.each(["```", "  - ```", ">   ```"])(
    "fails closed when list fence has an invalid closing prefix %s",
    (close) => {
      const result = auditReviewReport(
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
      const result = auditReviewReport(
        `DONE\n## Findings\nNone\n\n${open}\n  ## Findings\n  - missing.ts:999: example\n${close}\n## Findings\n- A.ts:2: real finding\n`,
        root,
      );
      expect(result.findings).toBe(1);
      expect(result.eligibleForTriage).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects an unclosed container fence rather than passing hidden findings", () => {
    const result = auditReviewReport(
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
    const result = auditReviewReport(content, os.tmpdir());
    expect(result.findings).toBe(0);
    expect(result.eligibleForTriage).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it.each(["~~~", "``", "``` trailing text"])(
    "does not close a backtick fence with %s",
    (close) => {
      const result = auditReviewReport(
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
      const result = auditReviewReport(
        `DONE\n## Findings\n${open}\n- missing.ts:999: real finding\n`,
        os.tmpdir(),
      );
      expect(result.findings).toBe(1);
      expect(result.eligibleForTriage).toBe(false);
    },
  );

  it("keeps the surrounding Findings section after a closed example", () => {
    const result = auditReviewReport(
      "DONE\n## Findings\n```markdown\n## Notes\n- example\n```\n- missing.ts:999: real finding\n",
      os.tmpdir(),
    );
    expect(result.findings).toBe(1);
    expect(result.issues.join("\n")).toContain("missing.ts:999");
  });

  it("does not accept a state marker inside a fence", () => {
    const result = auditReviewReport("```markdown\nDONE\n```\n", os.tmpdir());
    expect(result.state).toBeNull();
    expect(result.eligibleForTriage).toBe(false);
  });

  it("does not accept a Concerns section inside a fence", () => {
    const result = auditReviewReport(
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
      const result = auditReviewReport(
        "DONE\n## Findings\n- src/A.java:2: missing null guard\n",
        root,
      );
      expect(result.eligibleForTriage).toBe(true);
      expect(result.issues).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps BLOCKED reports out of triage", () => {
    const result = auditReviewReport(
      "BLOCKED\n## Findings\n- src/A.java:2: tentative finding\n",
      "/tmp",
    );
    expect(result.eligibleForTriage).toBe(false);
  });

  it("rejects an invalid anchor and unstructured concerns", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-report-"));
    try {
      const result = auditReviewReport(
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
      const result = auditReviewReport(
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
