import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(__dirname, "../..");
describe("数据库分层文档合同", () => {
  for (const language of ["skills", "skills-en"]) {
    it(`${language} 在规范事实源冻结分层与证据边界`, () => {
      const text = fs.readFileSync(
        path.join(
          root,
          "assets",
          language,
          "superflow-pipeline/references/document-review-coverage.md",
        ),
        "utf8",
      );
      for (const token of [
        "testLayer",
        "sql-binding",
        "schemaSourceRefs",
        "mockBoundary",
        "databaseAssertions",
        "affectedRows",
        "unchangedRows",
      ])
        expect(text).toContain(token);
    });
    for (const skill of [
      "docs",
      "design",
      "implement",
      "verify",
      "table-impact-analysis",
    ])
      it(`${language}/${skill} 继承唯一数据库合同`, () => {
        const text = fs.readFileSync(
          path.join(root, "assets", language, `superflow-${skill}/SKILL.md`),
          "utf8",
        );
        expect(text).toContain("testLayer");
        expect(text).toContain("document-review-coverage.md");
      });
  }
});
