import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runChangeGuard } from "../../src/app/commands/change-guard.js";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";
import { replayExecutionEvidence } from "../helpers/execution-replay.js";

const scripts = path.resolve("assets/skills/superflow/scripts");
describe("anonymous application replay through the actual verify guard", () => {
  it.each(["proxy discovery", "reverse DNS"])(
    "keeps loopback HTTP independent from host %s",
    (operation) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-loopback-"));
      try {
        const injection = path.join(dir, "python-startup");
        fs.mkdirSync(injection);
        fs.writeFileSync(
          path.join(injection, "sitecustomize.py"),
          [
            "import socket, urllib.request",
            "def forbidden(*args, **kwargs):",
            `    raise RuntimeError('host ${operation} must not run for loopback HTTP')`,
            operation === "proxy discovery"
              ? "urllib.request.getproxies = forbidden"
              : "socket.getfqdn = forbidden",
            "",
          ].join("\n"),
        );
        const env = fixtureProcessEnv(dir);
        env.PYTHONPATH =
          injection + (env.PYTHONPATH ? path.delimiter + env.PYTHONPATH : "");
        const output = replayExecutionEvidence(dir, "complete", env);
        expect(JSON.parse(output)).toMatchObject({
          httpRequests: 2,
          serversStopped: 2,
        });
        for (const entry of ["E05", "E11"]) {
          const receipt = JSON.parse(
            fs.readFileSync(path.join(dir, "logs", `${entry}.json`), "utf8"),
          );
          expect(receipt.status).toBe("PASS");
          expect(
            receipt.database.assertions.every(
              (assertion: { result: string }) => assertion.result === "PASS",
            ),
          ).toBe(true);
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it.each(["omit", "complete"] as const)(
    "verifies each service write in %s mode",
    (mode) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-replay-"));
      try {
        const output = replayExecutionEvidence(dir, mode);
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
