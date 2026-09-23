import { describe, expect, it } from "vitest";
import { auditSkillRegistry } from "../../src/domains/skill/registry.js";

const base = {
  skills: ["alpha", "beta"],
  contracts: [
    {
      name: "alpha",
      owner: "docs",
      triggers: ["alpha task"],
      excludes: ["beta task"],
      outputs: ["alpha.md"],
      neighbors: ["beta"],
    },
    {
      name: "beta",
      owner: "implement",
      triggers: ["beta task"],
      excludes: ["alpha task"],
      outputs: ["beta.md"],
      neighbors: ["alpha"],
    },
  ],
};

describe("skill contract registry", () => {
  it("accepts a complete registry with both language assets", () => {
    const result = auditSkillRegistry(base, {
      zh: ["alpha", "beta"],
      en: ["alpha", "beta"],
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("reports missing contracts, missing mirrors, and duplicate triggers", () => {
    const result = auditSkillRegistry(
      {
        skills: ["alpha", "beta", "gamma"],
        contracts: [
          {
            name: "alpha",
            owner: "docs",
            triggers: ["same task"],
            excludes: [],
            outputs: ["alpha.md"],
            neighbors: [],
          },
          {
            name: "beta",
            owner: "docs",
            triggers: ["same task"],
            excludes: [],
            outputs: [],
            neighbors: ["missing"],
          },
        ],
      },
      { zh: ["alpha", "beta"], en: ["alpha"] },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("gamma");
    expect(result.errors.join("\n")).toContain("duplicate trigger");
    expect(result.errors.join("\n")).toContain("English mirror");
    expect(result.errors.join("\n")).toContain("missing");
    expect(result.errors.join("\n")).toContain("outputs");
  });
});
