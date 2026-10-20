import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { quickCommand } from "../../src/app/commands/quick.js";
import {
  fixtureProcessEnv,
  withFixtureProcessEnv,
} from "../helpers/fixture-process-env.js";

describe("quick CLI admission", () => {
  it("resumes an approved task with its declared report but rejects foreign changes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "quick-owner-"));
    const env = fixtureProcessEnv(root);
    const report = ".sdd/tasks/example/test-report.md";
    const spec = ".sdd/tasks/example/spec.md";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const previousExit = process.exitCode;
    try {
      fs.mkdirSync(path.join(root, "src"));
      fs.mkdirSync(path.join(root, path.dirname(spec)), { recursive: true });
      fs.writeFileSync(
        path.join(root, "src/labels.ts"),
        "export const labels = [];\n",
      );
      execFileSync("git", ["init", "-q"], { cwd: root, env });
      execFileSync("git", ["add", "src/labels.ts"], { cwd: root, env });
      execFileSync(
        "git",
        [
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "-c",
          `core.hooksPath=${path.join(root, "empty-hooks")}`,
          "commit",
          "-qm",
          "建立测试基线",
        ],
        { cwd: root, env },
      );
      const baseline = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
        env,
      }).trim();
      fs.writeFileSync(path.join(root, report), "# Task evidence\n");
      fs.writeFileSync(
        path.join(root, spec),
        [
          "status: draft",
          `baseline: ${baseline}`,
          "## Intent",
          "normalize labels",
          "## Non-goals",
          "no unrelated changes",
          "## Current behavior",
          "keeps whitespace",
          "## Target behavior",
          "trims labels",
          "## Test seam",
          "existing labels seam",
          "## Implementation steps",
          `change src/labels.ts; record evidence in ${report}`,
          "## Acceptance Criteria",
          "Given whitespace Then trim",
          "## Risks",
          "preserve callers",
        ].join("\n"),
      );
      const run = (approve = false) => {
        log.mockClear();
        process.exitCode = previousExit;
        withFixtureProcessEnv(env, () =>
          quickCommand("修复标签归一化", {
            project: root,
            path: ["src/labels.ts", report],
            seam: "src/labels.ts",
            spec,
            approve,
            json: true,
          }),
        );
        return JSON.parse(String(log.mock.calls[0][0]));
      };
      expect(run(true).verdict).toBe("QUICK");
      fs.appendFileSync(
        path.join(root, report),
        "\n## Owner Recovery\nNext: independent review\n",
      );
      fs.writeFileSync(
        path.join(root, spec),
        fs
          .readFileSync(path.join(root, spec), "utf8")
          .replace("status: ready-for-dev", "status: in-progress"),
      );
      const resumed = run();
      expect(resumed.verdict).toBe("QUICK");
      expect(resumed.spec.ok).toBe(true);
      expect(resumed.next).not.toContain("用户批准");
      fs.writeFileSync(path.join(root, "foreign.txt"), "unrelated\n");
      expect(run().verdict).toBe("STOP");
      fs.unlinkSync(path.join(root, "foreign.txt"));
      fs.appendFileSync(path.join(root, spec), "\nNew acceptance behavior\n");
      expect(run().verdict).toBe("STOP");
    } finally {
      process.exitCode = previousExit;
      log.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not report QUICK for a changed approved spec", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "quick-cli-"));
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(
      path.join(root, "src", "email.ts"),
      "export const email = true;\n",
    );
    const spec = path.join(root, "spec.md");
    fs.writeFileSync(
      spec,
      [
        "status: ready-for-dev",
        "approved-digest: " + "a".repeat(64),
        "## Intent",
        "fix email",
        "## Non-goals",
        "no API change",
        "## Current behavior",
        "accepts a@",
        "## Target behavior",
        "rejects a@",
        "## Test seam",
        "email.ts",
        "## Implementation steps",
        "change condition",
        "## Acceptance Criteria",
        "Given a@ Then reject",
        "## Risks",
        "keep callers",
      ].join("\n"),
    );
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
      expect(output.nextSkill).toBe("superflow-clarify");
      expect(output.next).toContain("用户明确选择 ake SSD 时才切换");
      expect(output.reasons).toEqual(
        expect.arrayContaining([
          expect.stringContaining("approved Quick Spec content has changed"),
        ]),
      );
      expect(process.exitCode).toBe(2);
      expect(fs.readFileSync(spec, "utf8")).toContain("status: ready-for-dev");
    } finally {
      process.exitCode = previousExit;
      log.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
