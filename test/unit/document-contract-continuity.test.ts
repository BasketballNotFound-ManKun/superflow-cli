import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { deploySkill } from "../../src/domains/skill/deploy.js";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (language: string, file: string) =>
  fs.readFileSync(path.join(root, "assets", language, file), "utf8");

describe.each(["skills", "skills-en"])("%s contract continuity", (language) => {
  it("keeps behavior decisions in one document owner before handoff", () => {
    const template = read(
      language,
      "superflow/references/document-templates.md",
    );
    for (const field of [
      "Behavior Decision Matrix",
      "Decision ID",
      "Canonical owner",
      "Consumer references",
      "Conflict resolution",
    ]) {
      expect(template).toContain(field);
    }
    for (const skill of ["clarify", "contracts", "design", "handoff"]) {
      expect(read(language, `superflow-${skill}/SKILL.md`)).toContain(
        "document-templates.md#behavior-decision-matrix",
      );
    }
  });

  it("freezes source HOW at input, write, entry and failure boundaries", () => {
    const template = read(
      language,
      "superflow/references/superpower-technical-design-template.md",
    );
    for (const section of [
      "Input Snapshot Binding",
      "Write Classification",
      "Entry Execution Boundaries",
      "Failure Side-Effect Order",
    ]) {
      expect(template).toContain(`## ${section}`);
    }
  });

  it("generates thin prompts for every execution mode", () => {
    for (const file of [
      "implementation-prompt-template",
      "batch-prompt-template",
    ]) {
      const template = read(language, `superflow/references/${file}.md`);
      expect(template).toContain("## Thin Prompt Contract");
      expect(template).toContain("Acceptance IDs");
      expect(template).toContain("Canonical links");
    }
  });

  it("requires observable state transitions through production entries", () => {
    const guide = read(language, "superflow/references/test-guide.md");
    expect(guide).toContain("## Production Entry State Assertions");
    for (const field of [
      "Before state",
      "After state",
      "Concurrency/rollback",
      "Case ID",
    ]) {
      expect(guide).toContain(field);
    }
  });
});

describe("document contract installation continuity", () => {
  for (const agent of ["codex", "claude"] as const) {
    for (const language of ["skills", "skills-en"]) {
      for (const scope of ["project", "global"]) {
        it(`${agent}/${language}/${scope} installs one linked document contract`, async () => {
          const temporary = fs.mkdtempSync(
            path.join(os.tmpdir(), "sf-contract-"),
          );
          try {
            const destination = path.join(
              temporary,
              scope,
              `.${agent}`,
              "skills",
            );
            for (const name of [
              "superflow",
              "superflow-clarify",
              "superflow-contracts",
              "superflow-design",
              "superflow-handoff",
            ]) {
              await deploySkill(
                name,
                path.join(root, "assets", language),
                destination,
                { agent },
              );
            }
            const references = path.join(destination, "superflow/references");
            for (const file of [
              "document-templates",
              "superpower-technical-design-template",
              "implementation-prompt-template",
              "batch-prompt-template",
              "test-guide",
            ]) {
              const installed = fs.readFileSync(
                path.join(references, `${file}.md`),
                "utf8",
              );
              const normalized =
                agent === "claude"
                  ? installed
                      .replaceAll("~/.claude/scripts", "~/.codex/hooks")
                      .replaceAll("~/.claude/skills", "~/.codex/skills")
                      .replaceAll("Claude Code Hooks", "Codex Hooks")
                  : installed;
              expect(normalized).toBe(
                read(language, `superflow/references/${file}.md`),
              );
              expect(installed).toContain(
                file === "test-guide"
                  ? "## Production Entry State Assertions"
                  : file === "document-templates"
                    ? "## Behavior Decision Matrix"
                    : file === "superpower-technical-design-template"
                      ? "## Entry Execution Boundaries"
                      : "## Thin Prompt Contract",
              );
            }
            for (const skill of ["clarify", "contracts", "design", "handoff"]) {
              const installed = fs.readFileSync(
                path.join(destination, `superflow-${skill}/SKILL.md`),
                "utf8",
              );
              expect(installed).toContain(
                "../superflow/references/document-templates.md#behavior-decision-matrix",
              );
              expect(
                fs.existsSync(
                  path.resolve(
                    destination,
                    `superflow-${skill}`,
                    "../superflow/references/document-templates.md",
                  ),
                ),
              ).toBe(true);
            }
          } finally {
            fs.rmSync(temporary, { recursive: true, force: true });
          }
        });
      }
    }
  }
});
