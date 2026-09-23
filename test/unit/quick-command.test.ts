import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { quickCommand } from "../../src/app/commands/quick.js";

describe("quick CLI admission", () => {
  it("does not report QUICK for a changed approved spec", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "quick-cli-"));
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "src", "email.ts"), "export const email = true;\n");
    const spec = path.join(root, "spec.md");
    fs.writeFileSync(spec, [
      "status: ready-for-dev", "approved-digest: " + "a".repeat(64),
      "## Intent", "fix email", "## Non-goals", "no API change",
      "## Current behavior", "accepts a@", "## Target behavior", "rejects a@",
      "## Test seam", "email.ts", "## Implementation steps", "change condition",
      "## Acceptance Criteria", "Given a@ Then reject", "## Risks", "keep callers",
    ].join("\n"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const previousExit = process.exitCode;
    try {
      quickCommand("修复邮箱边界", {
        project: root,
        path: ["src/email.ts"],
        seam: "src/email.ts",
        spec,
        approve: true,
        json: true,
      });
      const output = JSON.parse(String(log.mock.calls[0][0]));
      expect(output.verdict).toBe("STOP");
      expect(output.reasons).toEqual(expect.arrayContaining([
        expect.stringContaining("approved Quick Spec content has changed"),
      ]));
      expect(process.exitCode).toBe(2);
      expect(fs.readFileSync(spec, "utf8")).toContain("status: ready-for-dev");
    } finally {
      process.exitCode = previousExit;
      log.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
