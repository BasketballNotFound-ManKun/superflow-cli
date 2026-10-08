import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runChangeGuard } from "../../src/app/commands/change-guard.js";

const scripts = path.resolve("assets/skills/superflow-pipeline/scripts");
describe("anonymous application replay through the actual verify guard", () => {
  it.each(["omit", "complete"])(
    "verifies each service write in %s mode",
    (mode) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-replay-"));
      try {
        const output = execFileSync(
          "python3",
          [
            path.resolve("test/fixture/execution-evidence/replay.py"),
            dir,
            mode,
          ],
          { encoding: "utf8" },
        );
        expect(JSON.parse(output)).toMatchObject({
          httpRequests: 2,
          serversStopped: 2,
        });
        execFileSync("bash", [
          path.join(scripts, "superflow-state.sh"),
          "init",
          dir,
          "docs",
        ]);
        execFileSync("bash", [
          path.join(scripts, "superflow-state.sh"),
          "set",
          dir,
          "verify_mode",
          "light",
        ]);
        execFileSync("bash", [
          path.join(scripts, "superflow-state.sh"),
          "set",
          dir,
          "branch_status",
          "handled",
        ]);
        if (mode === "omit")
          expect(() =>
            runChangeGuard(dir, "verify", { quiet: true }),
          ).toThrow();
        else
          expect(() =>
            runChangeGuard(dir, "verify", { quiet: true }),
          ).not.toThrow();
        const review = path.join(dir, ".sdd/reviews/document-review.json");
        if (mode === "omit") {
          // The E05 receipt remains valid. Relabeling it cannot substitute E11.
          const report = path.join(dir, "test-report.md");
          fs.writeFileSync(
            report,
            fs
              .readFileSync(report, "utf8")
              .replace("logs/E11.json", "logs/E05.json"),
          );
          expect(() =>
            execFileSync(
              "python3",
              [
                path.resolve("assets/scripts/superflow-test-report-lint.py"),
                "--review",
                review,
                report,
              ],
              { stdio: "pipe" },
            ),
          ).toThrow();
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
