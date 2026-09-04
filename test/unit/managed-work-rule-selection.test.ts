import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { selectManagedRuleFiles } from "../../src/domains/managed-work/rule-selection.js";

describe("managed work rule selection", () => {
  it("loads Java runtime rules while excluding unrelated frontend rules", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-rules-"));
    fs.writeFileSync(path.join(root, "pom.xml"), "<project />\n");
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# common\n");
    const names = [
      "common/security.md",
      "java/style.md",
      "frontend/vue.md",
      "custom.md",
    ];
    for (const name of names) {
      const file = path.join(root, ".claude", "rules", name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `# ${name}\n`);
    }
    const contract = createManagedTaskContract({
      request: "实现 Spring Boot 接口并启动应用完成 HTTP E2E",
      projectRoot: root,
      profile: "engineering",
    });

    const selection = selectManagedRuleFiles(contract);
    expect(selection.scenarios).toEqual(
      expect.arrayContaining(["core", "java", "runtime"]),
    );
    expect(selection.files).toContain(path.join(root, "AGENTS.md"));
    expect(selection.files).toContain(
      path.join(root, ".claude", "rules", "java", "style.md"),
    );
    expect(selection.files).toContain(
      path.join(root, ".claude", "rules", "custom.md"),
    );
    expect(selection.files).not.toContain(
      path.join(root, ".claude", "rules", "frontend", "vue.md"),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("supports Codex rule directories", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow-rules-hosts-"),
    );
    const relatives = [".codex/rules/common.md"];
    for (const relative of relatives) {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "# rule\n");
    }
    const contract = createManagedTaskContract({
      request: "更新说明",
      projectRoot: root,
      profile: "quick",
    });
    expect(selectManagedRuleFiles(contract).files).toEqual(
      expect.arrayContaining(
        relatives.map((relative) => path.join(root, relative)),
      ),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
});
