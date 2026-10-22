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
              "superflow-requirement-review",
              "superflow-build",
              "superflow-verify",
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
              "routing-contract",
              "document-readiness",
              "document-review-coverage",
              "flow-owner",
              "reviewer-checklist",
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
              const headings: Record<string, string> = {
                "document-readiness": "## Final document review inputs",
                "document-review-coverage": "### No existing source",
                "flow-owner": "## Existing document implementation",
                "reviewer-checklist": "### Goal, contract and evidence",
                "routing-contract": language === "skills"
                  ? "## Non-Negotiable Rules" : "## Quality Gates",
                "test-guide": "## Production Entry State Assertions",
                "document-templates": "## Behavior Decision Matrix",
                "superpower-technical-design-template": "## Entry Execution Boundaries",
              };
              expect(installed).toContain(headings[file] ?? "## Thin Prompt Contract");
            }
            for (const phase of ["design", "requirement-review", "handoff"]) {
              const consumer = path.join(
                destination,
                `superflow-${phase}/SKILL.md`,
              );
              const body = fs.readFileSync(consumer, "utf8");
              const link = body.match(
                /\]\(([^)]+#final-document-review-inputs)\)/,
              );
              expect(link, consumer).not.toBeNull();
              const [relative, anchor] = link![1].split("#");
              const source = path.resolve(path.dirname(consumer), relative);
              expect(fs.readFileSync(source, "utf8")).toContain(
                `## ${anchor.replaceAll("-", " ").replace(/^f/, "F")}`,
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

describe.each(["skills", "skills-en"])("%s phase reading and refreeze", (language) => {
  it("routes using the full current phase instead of the owner summary", () => {
    const entry = read(language, "superflow/SKILL.md");
    expect(entry).toContain("Full phase read");
    expect(entry.split("\n").length).toBeLessThan(130);
    expect(entry).toContain("references/routing-contract.md");
    const detail = read(language, "superflow/references/routing-contract.md");
    expect(detail).not.toMatch(/^---\nname:/);
    expect(detail).toContain(language === "skills" ? "## Non-Negotiable Rules" : "## Quality Gates");
    expect(detail).toContain("../scripts/superflow-handoff.sh");
    expect(detail).not.toContain("(references/");
    expect(entry).toContain("reviewer-checklist.md");
  });

  it("repairs canonical bodies before refreshing readiness", () => {
    for (const phase of ["contracts", "design", "handoff"]) {
      const skill = read(language, `superflow-${phase}/SKILL.md`);
      expect(skill, phase).toContain("Canonical body repair");
      expect(skill, phase).toContain("observed-delivery.v1");
      expect(skill, phase).toContain("runner-captured.v1");
    }
  });
});

describe.each(["skills", "skills-en"])(
  "%s source-to-delivery consumption",
  (language) => {
    it("keeps raw handoff hashes out of canonical prose and prompt inheritance", () => {
      const handoff = read(language, "superflow-handoff/SKILL.md");
      expect(handoff).toContain(".sdd/state.yaml");
      expect(handoff).toContain("sdd-context.sha256");
      expect(handoff).not.toMatch(/record the exact `handoff_hash`/);
      expect(handoff).not.toMatch(/禁止自由发挥项 \| handoff_hash \|/);
      expect(handoff).not.toMatch(/clickable handoff link, handoff_hash,/);
      expect(handoff).not.toMatch(
        /the prompt and\s+`test-report.md` record the same hash/,
      );
      const contracts = read(language, "superflow-contracts/SKILL.md");
      expect(contracts).not.toMatch(/records the handoff command, context hash/);
      expect(contracts).not.toMatch(/It records\s+`handoff_hash`,/);
      const routing = read(language, "superflow/references/routing-contract.md");
      expect(routing).not.toContain("inherited handoff_hash and instructions");
      expect(routing).not.toMatch(
        /prompt must record and\s+inherit the same handoff hash/,
      );
      expect(routing).not.toContain("handoff hash 未被 prompt 继承");
      // Recovery records retain actual runtime hashes; canonical prompts do not.
      expect(read(language, "superflow/references/subagent-progress.md"))
        .toContain("- handoff_hash: `<hash>`");
    });

    it("uses the declared compression index for prompt and recovery reading", () => {
      for (const file of [
        "superflow-handoff/SKILL.md",
        "superflow/references/implementation-prompt-template.md",
        "superflow/references/batch-prompt-template.md",
        "superflow/references/subagent-progress.md",
        "superflow/references/routing-contract.md",
        "superflow/references/quality-gate.md",
      ]) {
        const body = read(language, file);
        expect(body, file).toContain("context_compression");
        expect(body, file).toContain("manifest");
        expect(body, file).toMatch(/Decision\/Entry\/Case|canonical 正文/);
        expect(body, file).not.toMatch(
          /handoff plus original|先读 handoff，再回读原始|重新读 handoff 和原始文档|重读 handoff 和原始文档|未先读 handoff 和原始文档|reread the handoff and\s+original|Read `\.sdd\/handoff\/sdd-context\.md` and original/,
        );
      }
    });

    it("routes existing-document implementation through owner repair", () => {
      const entry = read(language, "superflow/SKILL.md");
      expect(entry).toContain("flow-owner.md#existing-document-implementation");
      const owner = read(language, "superflow/references/flow-owner.md");
      const repair = owner
        .split("## Existing document implementation")[1]
        ?.split("\n## ")[0];
      expect(repair).toBeDefined();
      for (const stage of [
        "clarify",
        "contracts",
        "design",
        "handoff",
        "build",
      ])
        expect(repair).toContain(`superflow-${stage}`);
      expect(repair).toContain("Coding Ready");
    });

    it("makes final HOW consumption shared by design, review and handoff", () => {
      for (const phase of ["design", "requirement-review", "handoff"])
        expect(read(language, `superflow-${phase}/SKILL.md`)).toContain(
          "document-readiness.md#final-document-review-inputs",
        );
      const readiness = read(
        language,
        "superflow/references/document-readiness.md",
      );
      const inputs = readiness
        .split("## Final document review inputs")[1]
        ?.split("\n## ")[0];
      expect(inputs).toBeDefined();
      for (const field of [
        "technical_design",
        "coverage.sources",
        "contract",
        "--manifest",
        "source-contract",
        "architecture-minimality",
        "e2e-environment",
        "inputHash",
      ])
        expect(inputs).toContain(field);
    });

    it("publishes case plans with an explicit change root", () => {
      const guide = read(language, "superflow/references/test-guide.md");
      const plans = [...guide.matchAll(/```json\n([\s\S]*?)```/g)]
        .map((match) => JSON.parse(match[1]))
        .filter((plan) => plan.kind === "case");
      expect(plans.length).toBeGreaterThan(0);
      for (const plan of plans) expect(plan.changeDir).toBeTypeOf("string");
      expect(guide).not.toMatch(
        /cwd 相对 review|cwd is\s*relative to the review/,
      );
    });

    it("documents the only no-source investigation scope", () => {
      const coverage = read(
        language,
        "superflow/references/document-review-coverage.md",
      );
      const scope = coverage
        .split("### No existing source")[1]
        ?.split("\n### ")[0];
      expect(scope).toBeDefined();
      for (const field of [
        "no-existing-source",
        "sourceChecks",
        "CONFIRMED",
        "VERIFIED",
      ])
        expect(scope).toContain(field);
    });
  },
);
