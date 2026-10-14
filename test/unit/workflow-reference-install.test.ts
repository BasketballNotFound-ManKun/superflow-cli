import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deploySkill } from "../../src/domains/skill/deploy.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("workflow reference installation closure", () => {
  for (const agent of ["codex", "claude"] as const) {
    for (const language of ["zh", "en"] as const) {
      for (const scope of ["project", "global"] as const) {
        it(`${agent}/${language}/${scope} retains canonical guides and their links`, async () => {
          const root = fs.mkdtempSync(
            path.join(os.tmpdir(), "sf-reference-install-"),
          );
          roots.push(root);
          const target = path.join(root, scope, `.${agent}`, "skills");
          const source = path.resolve(
            "assets",
            language === "en" ? "skills-en" : "skills",
          );
          const guides = [
            "test-guide.md",
            "managed-work.md",
            "reviewer-checklist.md",
          ];
          const custom = path.join(target, "custom/SKILL.md");
          fs.mkdirSync(path.dirname(custom), { recursive: true });
          fs.writeFileSync(custom, "user owned\n");
          for (let round = 0; round < 2; round++) {
            await deploySkill("superflow", source, target, { agent });
            const references = path.join(target, "superflow/references");
            for (const guide of guides) {
              const actual = fs.readFileSync(
                path.join(references, guide),
                "utf8",
              );
              const canonical =
                agent === "claude"
                  ? actual
                      .replaceAll("~/.claude/scripts", "~/.codex/hooks")
                      .replaceAll("~/.claude/skills", "~/.codex/skills")
                      .replaceAll("Claude Code Hooks", "Codex Hooks")
                  : actual;
              expect(canonical).toBe(
                fs.readFileSync(
                  path.join(source, "superflow/references", guide),
                  "utf8",
                ),
              );
              for (const match of actual.matchAll(
                /\]\(([^)#]+\.md)(?:#[^)]*)?\)/g,
              )) {
                if (/^[a-z]+:/.test(match[1])) continue;
                expect(fs.existsSync(path.resolve(references, match[1]))).toBe(
                  true,
                );
              }
            }
            expect(fs.readFileSync(custom, "utf8")).toBe("user owned\n");
          }
        });
      }
    }
  }
});
