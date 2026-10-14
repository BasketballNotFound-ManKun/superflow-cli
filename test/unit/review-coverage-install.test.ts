import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deploySkill } from "../../src/domains/skill/deploy.js";
import { deployScripts } from "../../src/domains/skill/scripts.js";
import {
  digest,
  mutateReview,
  prepareCoverage,
  REVIEW,
} from "../helpers/review-coverage.js";
import { prepareSourceInvestigation } from "../helpers/source-investigation.js";
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
        for (const skill of [
          "superflow",
          "superflow-verify",
          "superflow-contracts",
          "superflow-design",
          "superflow-requirement-review",
        ]) {
          await deploySkill(skill, source, target, { agent });
        }
        const entry = fs.readFileSync(
          path.join(target, "superflow-verify/SKILL.md"),
          "utf8",
        );
        expect(entry).toContain("references/reviewer-checklist.md");
        const guide = fs.readFileSync(
          path.join(target, "superflow/references/reviewer-checklist.md"),
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
    ["codex", "zh", "project"],
    ["codex", "en", "project"],
    ["claude", "zh", "project"],
    ["claude", "en", "project"],
    ["codex", "zh", "global"],
    ["codex", "en", "global"],
    ["claude", "zh", "global"],
    ["claude", "en", "global"],
  ] as const)(
    "validates installed %s/%s/%s assets without the source checkout",
    async (agent, language, scope) => {
      const host = path.join(
        temporary,
        scope === "global" ? "home" : "project",
        `.${agent}`,
      );
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
        ["superflow-review-coverage.mjs", "superflow-test-report-lint.py"],
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
      prepareSourceInvestigation(change);
      expect(run().status).toBe(0);
      const taskFile = path.join(change, "tasks.md");
      const indexTasks = () => {
        const result = spawnSync(
          "python3",
          [
            path.join(scripts, "superflow-test-report-lint.py"),
            taskFile,
            "--task-index",
          ],
          { encoding: "utf8", env: fixtureProcessEnv(temporary) },
        );
        expect(result.status, result.stderr).toBe(0);
        return JSON.parse(result.stdout);
      };
      fs.writeFileSync(
        taskFile,
        "# Historical\n\n    - [ ] 1.1 Example only\n",
      );
      expect(indexTasks()).toEqual({ ids: [], ambiguous: false });
      fs.writeFileSync(
        taskFile,
        "- Parent\n\n~~~text\nRoot block\n~~~\n\n    - [ ] 1.1 Example only\n",
      );
      expect(indexTasks()).toEqual({ ids: [], ambiguous: false });
      fs.writeFileSync(
        taskFile,
        "- Parent\n    - [x] 1.1 Actual nested task\n",
      );
      expect(indexTasks()).toEqual({ ids: ["1.1"], ambiguous: false });
      prepareSourceInvestigation(change);
      const literal = 'Desired value: "START_PENDING"\n';
      fs.writeFileSync(path.join(change, "literal.txt"), literal);
      for (const role of ["code", "contract", "requirement"]) {
        mutateReview(change, (review) => {
          const sources = review.coverage.sources;
          const source = sources.find((s: any) => s.id === "literal");
          if (source) source.role = role;
          else
            sources.push({
              id: "literal",
              path: "literal.txt",
              role,
              sha256: digest(literal),
            });
          review.coverage.entries[0].valueConstraints = [
            {
              kind: "string-capacity",
              field: "summary",
              schema: {
                sourceRef: "schema",
                lineStart: 1,
                lineEnd: 1,
                text: "  `summary` varchar(20) DEFAULT NULL,",
              },
              values: [
                {
                  sourceRef: "literal",
                  lineStart: 1,
                  lineEnd: 1,
                  text: literal.trim(),
                  value: "START_PENDING",
                },
              ],
            },
          ];
        });
        const receiptFile = path.join(
          change,
          ".sdd/readiness/coding-ready.json",
        );
        const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
        receipt.reviewHash = digest(fs.readFileSync(path.join(change, REVIEW)));
        fs.writeFileSync(receiptFile, JSON.stringify(receipt));
        const result = run();
        expect(result.status, result.stderr).toBe(
          role === "requirement" ? 1 : 0,
        );
        if (role === "requirement")
          expect(result.stderr).toContain("code|contract");
      }
      prepareSourceInvestigation(change);
      fs.writeFileSync(
        path.join(change, "tasks.md"),
        "```md\n- [ ] 1.1 obsolete example\n```\n",
      );
      expect(run().status).toBe(1);
      prepareCoverage(change);
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
