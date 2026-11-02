import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  prepareCapturePackage,
  writeExecutionReceipt,
  writeIndependentReview,
} from "../helpers/execution-receipt.js";

const lint = path.resolve("assets/scripts/superflow-test-report-lint.py");
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-evidence-"));
  directories.push(root);
  const report = path.join(root, "test-report.md");
  const source = path.join(root, "observation.json");
  const copy = path.join(root, "delivered.json");
  fs.writeFileSync(source, '{"winner":"B"}\n');
  fs.copyFileSync(source, copy);
  const hash = createHash("sha256")
    .update(fs.readFileSync(source))
    .digest("hex");
  const table = `## Delivery Evidence\n\n| Source | Delivered copy | SHA-256 |\n|---|---|---|\n| observation.json | delivered.json | ${hash} |\n`;
  const run = (script = lint) =>
    spawnSync(
      "python3",
      [
        script,
        "--repo-root",
        root,
        "--require-complete",
        ...(fs.existsSync(path.join(root, "document-review.json"))
          ? ["--review", path.join(root, "document-review.json")]
          : []),
        report,
      ],
      { encoding: "utf8" },
    );
  fs.writeFileSync(report, `Verification Result: PASS\n${table}`);
  return { root, report, source, copy, hash, table, run };
}

describe("final delivered evidence through the existing report lint", () => {
  it("accepts an identical delivered copy without rewriting either file", () => {
    const f = fixture();
    const before = fs.readFileSync(f.report);
    expect(f.run().status).toBe(0);
    expect(fs.readFileSync(f.report)).toEqual(before);
    expect(fs.readFileSync(f.copy)).toEqual(fs.readFileSync(f.source));
  });

  it.each(["source", "copy"] as const)(
    "rejects a stale %s even when the other copy retains its valid hash",
    (side) => {
      const f = fixture();
      fs.writeFileSync(f[side], '{"winner":"A"}\n');
      const result = f.run();
      expect(result.status).toBe(2);
      expect(result.stdout).toContain("Delivery Evidence");
    },
  );

  it.each(["missing", "same-file", "bad-hash", "empty", "duplicate"])(
    "rejects invalid declared copy mapping: %s",
    (mode) => {
      const f = fixture();
      let table = f.table;
      if (mode === "missing") fs.unlinkSync(f.copy);
      if (mode === "same-file")
        table = table.replace("| delivered.json |", "| observation.json |");
      if (mode === "bad-hash") table = table.replace(f.hash, "not-a-hash");
      if (mode === "empty") table = table.split("| observation.json")[0];
      if (mode === "duplicate")
        table +=
          table
            .split("\n")
            .find((line) => line.startsWith("| observation.json")) + "\n";
      fs.writeFileSync(f.report, `Verification Result: PASS\n${table}`);
      expect(f.run().status).toBe(2);
    },
  );

  it("does not require copies and excludes historical or fenced copy mappings", () => {
    const f = fixture();
    fs.unlinkSync(f.copy);
    fs.writeFileSync(
      f.report,
      `## History\n${f.table.replace("## Delivery", "### Delivery")}\n## Current\nVerification Result: PASS\n\n\`\`\`markdown\n${f.table}\`\`\`\n`,
    );
    expect(f.run().status).toBe(0);
  });

  it("checks every row in a mixed-indentation Markdown copy table", () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, "other.json"), "new bytes");
    fs.writeFileSync(path.join(f.root, "other-copy.json"), "old bytes");
    const hash = createHash("sha256").update("new bytes").digest("hex");
    fs.appendFileSync(
      f.report,
      `  | other.json | other-copy.json | ${hash} |\n`,
    );
    expect(f.run().status).toBe(2);
    fs.copyFileSync(
      path.join(f.root, "other.json"),
      path.join(f.root, "other-copy.json"),
    );
    expect(f.run().status).toBe(0);
    fs.writeFileSync(
      f.report,
      fs
        .readFileSync(f.report, "utf8")
        .split("\n")
        .map((line) => (line.startsWith("|") ? "  " + line : line))
        .join("\n"),
    );
    expect(f.run().status).toBe(0);
  });

  it("requires the actual independent review to bind the final delivered bytes", () => {
    const f = fixture();
    const review = path.join(f.root, "document-review.json");
    fs.writeFileSync(
      review,
      JSON.stringify({
        coverage: {
          schemaVersion: "superflow.review-coverage.v1",
          entries: [{ id: "entry", route: "POST /entry", kind: "api" }],
          cases: [{ id: "C1", entryId: "entry", level: "api" }],
          decisions: [{ disposition: "FIX", caseIds: ["C1"] }],
        },
      }),
    );
    writeExecutionReceipt(f.root, "C1", "entry");
    fs.writeFileSync(
      f.report,
      `Verification Result: PASS\n${f.table}\n| Case ID | Entry ID | Acceptance level | Result | Evidence path |\n|---|---|---|---|---|\n| C1 | entry | api | PASS | logs/C1.json |\n`,
    );
    writeIndependentReview(f.root);
    const script = prepareCapturePackage(f.root);
    const unreviewed = f.run(script);
    expect(unreviewed.status).toBe(2);
    expect(unreviewed.stdout).toContain("delivered.json");
    fs.appendFileSync(
      path.join(f.root, ".sdd/reviews/current-code-review.md"),
      `\n| delivered.json | ${f.hash} |\n`,
    );
    const reviewed = f.run(script);
    expect(reviewed.status, reviewed.stdout + reviewed.stderr).toBe(0);
    // Report-only edits preserve execution receipts and do not run the application.
    const receipt = fs.readFileSync(path.join(f.root, "logs/C1.json"));
    fs.appendFileSync(f.report, "\n## Notes\nDelivery wording clarified.\n");
    expect(f.run(script).status).toBe(0);
    expect(fs.readFileSync(path.join(f.root, "logs/C1.json"))).toEqual(receipt);
  });
});
