import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("superflow requirement review skill", () => {
  it("ships Chinese and English skill assets through the manifest", () => {
    const manifest = JSON.parse(read("assets/manifest.json")) as {
      skills: string[];
    };

    expect(manifest.skills).toContain("superflow-requirement-review");
    expect(
      read("assets/skills/superflow-requirement-review/SKILL.md"),
    ).toContain("requirement-review.md");
    expect(
      read("assets/skills-en/superflow-requirement-review/SKILL.md"),
    ).toContain("requirement-review.md");
  });

  it("defines source-backed remediation and re-review", () => {
    const skill = read("assets/skills/superflow-requirement-review/SKILL.md");

    expect(skill).toContain("六向反查");
    expect(skill).toContain("BLOCKER/IMPORTANT");
    expect(skill).toContain("修正原始 canonical 文档");
    expect(skill).toContain("独立复审");
    expect(skill).toContain("superflow-table-impact-analysis");
    expect(skill).toContain("review_verdict: PASS");
    expect(skill).toContain("open_blockers: 0");
  });

  it("blocks full docs without a closed requirement review", () => {
    const guard = read(
      "assets/skills/superflow-pipeline/scripts/superflow-guard.sh",
    );
    const englishGuard = read(
      "assets/skills-en/superflow-pipeline/scripts/superflow-guard.sh",
    );

    for (const content of [guard, englishGuard]) {
      expect(content).toContain("require_file requirement-review.md");
      expect(content).toContain("requirement reverse review PASS verdict");
      expect(content).toContain(
        "requirement reverse review has no open blockers",
      );
    }
  });
});
