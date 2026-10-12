import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { deploySkill } from "../../src/domains/skill/deploy.js";
const root = path.resolve(__dirname, "../..");
describe("数据库分层文档合同", () => {
  const references = "superflow-pipeline/references";
  for (const language of ["skills", "skills-en"]) {
    it(`${language} 所有测试入口指向同一指南且无外部验证技能依赖`, () => {
      for (const skill of [
        "superflow-docs",
        "superflow-implement",
        "superflow-verify",
        "superflow-quick-dev",
        "openspec-apply-change",
      ]) {
        const text = fs.readFileSync(
          path.join(root, "assets", language, skill, "SKILL.md"),
          "utf8",
        );
        expect(text, skill).toContain("references/test-guide.md");
        expect(text, skill).not.toMatch(/\bverification-loop\b/);
      }
    });
    it(`${language} 清除替代引擎示例并保留逻辑与真实验收边界`, () => {
      for (const file of ["mock-strategy-guide.md", "test-guide.md"]) {
        const text = fs.readFileSync(
          path.join(root, "assets", language, references, file),
          "utf8",
        );
        expect(text).toContain("document-review-coverage.md");
        expect(text).toContain("mockBoundary");
      }
      const mock = fs.readFileSync(
        path.join(
          root,
          "assets",
          language,
          references,
          "mock-strategy-guide.md",
        ),
        "utf8",
      );
      expect(mock).not.toMatch(
        /可用 H2|jdbc:h2:mem|Spring Boot 单元\/集成测试/,
      );
      const execution = fs.readFileSync(
        path.join(
          root,
          "assets",
          language,
          references,
          "test-execution-template.md",
        ),
        "utf8",
      );
      expect(execution).not.toContain("MySQL 8.0 / H2");
      expect(execution).toContain("test-guide.md");
      for (const file of [
        "implementation-prompt-template.md",
        "orchestration.md",
        "batch-prompt-template.md",
      ]) {
        const text = fs.readFileSync(
          path.join(root, "assets", language, references, file),
          "utf8",
        );
        expect(text, file).toContain("test-guide.md");
        expect(text, file).not.toMatch(/^\s*pkill -f/m);
        expect(text, file).not.toContain("独立从头执行");
      }
    });
  }
  it.each([
    ["codex", "skills"],
    ["codex", "skills-en"],
    ["claude", "skills"],
    ["claude", "skills-en"],
  ] as const)(
    "%s/%s 重复部署清除旧指导并保留相邻自定义资产",
    async (agent, language) => {
      const temporary = fs.mkdtempSync(
        path.join(os.tmpdir(), "superflow-testing-"),
      );
      try {
        const target = path.join(temporary, `.${agent}/skills`);
        const old = path.join(target, references);
        fs.mkdirSync(old, { recursive: true });
        fs.writeFileSync(path.join(old, "mock-strategy-guide.md"), "可用 H2\n");
        const custom = path.join(target, "custom-testing/SKILL.md");
        fs.mkdirSync(path.dirname(custom), { recursive: true });
        fs.writeFileSync(custom, "user-owned\n");
        for (let round = 0; round < 2; round++) {
          for (const skill of [
            "superflow-pipeline",
            "superflow-docs",
            "superflow-implement",
            "superflow-verify",
            "superflow-quick-dev",
            "openspec-apply-change",
          ]) {
            await deploySkill(
              skill,
              path.join(root, "assets", language),
              target,
              { agent },
            );
            const entry = fs.readFileSync(
              path.join(target, skill, "SKILL.md"),
              "utf8",
            );
            expect(entry, skill).toContain("references/test-guide.md");
            expect(entry, skill).not.toMatch(/\bverification-loop\b/);
          }
          const guide = fs.readFileSync(
            path.join(old, "mock-strategy-guide.md"),
            "utf8",
          );
          expect(guide).not.toContain("可用 H2");
          expect(guide).toContain("document-review-coverage.md");
          expect(fs.readFileSync(custom, "utf8")).toBe("user-owned\n");
        }
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    },
  );
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
