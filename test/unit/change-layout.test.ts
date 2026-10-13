import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("canonical OpenSpec change layout", () => {
  it("keeps versioned changes in one flat physical directory", () => {
    const assets = [
      "assets/skills/superflow-propose/SKILL.md",
      "assets/skills-en/superflow-propose/SKILL.md",
      "assets/skills/superflow/SKILL.md",
      "assets/skills-en/superflow/SKILL.md",
    ].map(read);

    for (const content of assets) {
      expect(content).toContain("openspec/changes/<");
      expect(content).toContain("v1-1-1-");
      expect(content).toMatch(/symlink|软链接/);
    }
  });
});
