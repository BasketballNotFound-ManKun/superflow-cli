import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditReviewReport } from "../../src/domains/review/report.js";

describe("reviewer four-state report", () => {
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
