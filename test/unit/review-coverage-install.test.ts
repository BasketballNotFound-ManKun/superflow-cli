import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deploySkill } from "../../src/domains/skill/deploy.js";
import { deployScripts } from "../../src/domains/skill/scripts.js";
import { prepareCoverage } from "../helpers/review-coverage.js";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";

const ROOT = path.resolve(__dirname, "../..");
let temporary: string;
describe("review coverage installation closure", () => {
  beforeEach(() => {
    temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow-coverage-install-"),
    );
  });
  afterEach(() => {
    fs.rmSync(temporary, { recursive: true, force: true });
  });

  it.each([
    ["codex", "zh"],
    ["codex", "en"],
    ["claude", "zh"],
    ["claude", "en"],
  ] as const)(
    "%s/%s installs one isolated five-axis review owner",
    async (agent, language) => {
      const target = path.join(temporary, `.${agent}/skills`);
      const source = path.join(
        ROOT,
        "assets",
        language === "en" ? "skills-en" : "skills",
      );
      const custom = path.join(target, "custom-review/SKILL.md");
      fs.mkdirSync(path.dirname(custom), { recursive: true });
      fs.writeFileSync(custom, "user-owned\n");
      for (let round = 0; round < 2; round++) {
        for (const skill of ["superflow", "superflow-verify"]) {
          await deploySkill(skill, source, target, { agent });
        }
        const entry = fs.readFileSync(
          path.join(target, "superflow-verify/SKILL.md"),
          "utf8",
        );
        expect(entry).toContain("references/reviewer-checklist.md");
        const guide = fs.readFileSync(
          path.join(
            target,
            "superflow/references/reviewer-checklist.md",
          ),
          "utf8",
        );
        for (const axis of [
          "security",
          "performance",
          "correctness",
          "maintainability",
          "architecture",
        ]) {
          expect(guide).toContain(`| ${axis} |`);
        }
        for (const section of [
          "## Impact",
          "## Axes",
          "## Findings",
          "NOT_APPLICABLE",
        ]) {
          expect(guide).toContain(section);
        }
        expect(fs.readFileSync(custom, "utf8")).toBe("user-owned\n");
      }
    },
  );

  it.each([
    ["codex", "zh"],
    ["codex", "en"],
    ["claude", "zh"],
    ["claude", "en"],
  ] as const)(
    "validates installed %s/%s assets without the source checkout",
    async (agent, language) => {
      const host = path.join(temporary, `.${agent}`);
      const scripts = path.join(host, agent === "codex" ? "hooks" : "scripts");
      const skills = path.join(host, "skills/superflow");
      fs.mkdirSync(skills, { recursive: true });
      fs.cpSync(
        path.join(
          ROOT,
          `assets/${language === "en" ? "skills-en" : "skills"}/superflow`,
        ),
        skills,
        { recursive: true },
      );
      await deployScripts(
        ["superflow-review-coverage.mjs"],
        path.join(ROOT, "assets/scripts"),
        scripts,
        { agent },
      );
      const change = path.join(temporary, "change");
      fs.mkdirSync(change);
      fs.writeFileSync(path.join(change, "tests.md"), "# Tests\n");
      prepareCoverage(change);
      const run = () =>
        spawnSync(
          process.execPath,
          [
            path.join(scripts, "superflow-review-coverage.mjs"),
            change,
            "--check-sources",
          ],
          {
            encoding: "utf8",
            env: fixtureProcessEnv(temporary),
          },
        );
      expect(run().status).toBe(0);
      fs.appendFileSync(path.join(change, "caller.ts"), "// drift\n");
      expect(run().status).toBe(1);
      expect(
        fs.existsSync(
          path.join(skills, "references/document-review-coverage.md"),
        ),
      ).toBe(true);
    },
  );
});
