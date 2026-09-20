import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deployScripts } from "../../src/domains/skill/scripts.js";
import { prepareCoverage } from "../helpers/review-coverage.js";

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
    "validates installed %s/%s assets without the source checkout",
    async (agent, language) => {
      const host = path.join(temporary, `.${agent}`);
      const scripts = path.join(host, agent === "codex" ? "hooks" : "scripts");
      const skills = path.join(host, "skills/superflow-pipeline");
      fs.mkdirSync(skills, { recursive: true });
      fs.cpSync(
        path.join(
          ROOT,
          `assets/${language === "en" ? "skills-en" : "skills"}/superflow-pipeline`,
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
            env: { ...process.env, HOME: temporary },
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
