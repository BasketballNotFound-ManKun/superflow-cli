import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertCodingReadyForPrompt } from "../../src/domains/sdd-readiness.js";
import { prepareCoverage, digest, REVIEW } from "../helpers/review-coverage.js";

let root: string;
let change: string;
let prompt: string;
let hash: string;

describe("SDD coding-ready receipt", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-sdd-ready-"));
    change = path.join(root, "openspec", "changes", "demo");
    prompt = path.join(change, "prompt", "implementation.md");
    hash = createHash("sha256").update("docs").digest("hex");
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.mkdirSync(path.join(change, ".sdd", "readiness"), { recursive: true });
    fs.writeFileSync(prompt, "# Prompt\n");
    fs.writeFileSync(
      path.join(change, ".sdd", "state.yaml"),
      `phase: implement\nhandoff_hash: ${hash}\n`,
    );
    hash = prepareCoverage(change);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("accepts a receipt bound to the current handoff hash", () => {
    writeReceipt(hash);
    expect(() => assertCodingReadyForPrompt(prompt)).not.toThrow();
  });

  it("blocks missing or stale receipts before managed dispatch", () => {
    fs.unlinkSync(path.join(change, ".sdd/readiness/coding-ready.json"));
    expect(() => assertCodingReadyForPrompt(prompt)).toThrow("Coding Ready");
    writeReceipt("0".repeat(64));
    expect(() => assertCodingReadyForPrompt(prompt)).toThrow("开发 Agent");
  });

  it.each(["tests.md", "caller.ts", REVIEW])(
    "blocks changed %s without hash marker updates",
    (file) => {
      fs.appendFileSync(path.join(change, file), "\nchanged\n");
      expect(() => assertCodingReadyForPrompt(prompt)).toThrow("Coding Ready");
    },
  );

  it("keeps task completion and test-report progress valid", () => {
    fs.writeFileSync(path.join(change, "tasks.md"), "- [ ] A\n");
    prepareCoverage(change);
    fs.writeFileSync(path.join(change, "tasks.md"), "- [x] A\n");
    fs.writeFileSync(path.join(change, "test-report.md"), "new run results\n");
    expect(() => assertCodingReadyForPrompt(prompt)).not.toThrow();
  });
});

function writeReceipt(handoffHash: string): void {
  fs.writeFileSync(
    path.join(change, ".sdd", "readiness", "coding-ready.json"),
    JSON.stringify({
      schemaVersion: "superflow.coding-ready.v1",
      codingReady: true,
      handoffHash,
      reviewHash: digest(fs.readFileSync(path.join(change, REVIEW))),
    }),
  );
}
