import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("managed-work design constitution", () => {
  it("is wired into repository instructions, skills, prompts, and build gates", () => {
    const root = path.resolve(__dirname, "..", "..");
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.prebuild).toContain("check:managed-design");
    expect(packageJson.scripts.pretest).toContain("check:managed-design");
    const processSource = fs.readFileSync(
      path.join(root, "src", "platform", "agent-process.ts"),
      "utf8",
    );
    expect(processSource).toContain("activeInvocationMs");
    expect(processSource).toContain("accountClockGap");
    expect(processSource).toContain("if (finished) return");
    expect(() =>
      execFileSync(
        process.execPath,
        [path.join(root, "scripts", "check-managed-work-design.mjs")],
        {
          cwd: root,
          stdio: "pipe",
        },
      ),
    ).not.toThrow();
  });
});
