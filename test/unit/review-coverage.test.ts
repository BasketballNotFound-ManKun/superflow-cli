import { describe, expect, it } from "vitest";
import {
  resolveReviewCoverage,
  type ReviewRule,
} from "../../src/domains/review/coverage.js";

const rules: ReviewRule[] = [
  { path: "**/*Mapper.xml", rule: "MyBatis parameters" },
  { path: "**/*.java", rule: "Java safety" },
];

describe("deterministic review coverage", () => {
  it("assigns path rules and bundles related Java/XML files", () => {
    const result = resolveReviewCoverage(
      [
        "src/OrderMapper.java",
        "src/OrderMapper.xml",
        "src/OrderService.java",
        "src/OrderTest.java",
      ],
      rules,
    );

    expect(result.coverage).toEqual({ total: 4, included: 3, excluded: 1 });
    expect(result.bundles.OrderMapper).toEqual([
      "src/OrderMapper.java",
      "src/OrderMapper.xml",
    ]);
    expect(result.files.find((file) => file.path.endsWith("OrderMapper.xml"))?.rules)
      .toEqual(["MyBatis parameters"]);
    expect(result.risk.tier).toBe("high");
  });

  it("reports missing and duplicate files without guessing", () => {
    const result = resolveReviewCoverage(
      ["src/A.java", "src/A.java", "src/B.java"],
      rules,
    );

    expect(result.errors).toContain("duplicate changed file: src/A.java");
    expect(result.coverage.total).toBe(3);
  });

  it("supports project rules overriding system rules", () => {
    const result = resolveReviewCoverage(
      ["src/OrderMapper.xml"],
      [
        { path: "**/*Mapper.xml", rule: "Project Mapper rule", source: "project" },
        { path: "**/*Mapper.xml", rule: "System Mapper rule", source: "system" },
      ],
    );

    expect(result.files[0].rules).toEqual(["Project Mapper rule"]);
  });

  it("matches root-level source files and does not exclude root tests silently", () => {
    const result = resolveReviewCoverage(
      ["OrderMapper.xml", "OrderTest.java"],
      rules,
    );

    expect(result.files[0].rules).toEqual(["MyBatis parameters"]);
    expect(result.files[1]).toMatchObject({ included: false });
  });

  it("keeps same-named files from separate modules in separate bundles", () => {
    const result = resolveReviewCoverage(
      [
        "billing/src/main/java/OrderMapper.java",
        "billing/src/main/resources/OrderMapper.xml",
        "member/src/main/java/OrderMapper.java",
        "member/src/main/resources/OrderMapper.xml",
      ],
      rules,
    );

    expect(result.bundles["billing:OrderMapper"]).toHaveLength(2);
    expect(result.bundles["member:OrderMapper"]).toHaveLength(2);
  });
});
