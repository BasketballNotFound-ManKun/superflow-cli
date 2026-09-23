import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { auditDocs } from "../../src/domains/docs-audit.js";

describe("文档落位与策展审计", () => {
  it("采集失效锚点、入链和琐碎文档，不执行删除", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-docs-"));
    fs.mkdirSync(path.join(root, "docs"));
    fs.writeFileSync(path.join(root, "README.md"), "See docs/guide.md\n");
    fs.writeFileSync(path.join(root, "docs", "guide.md"), "`missing.java`\n`gone.xml`\n");
    fs.writeFileSync(path.join(root, "docs", "empty.md"), "x\n");
    const result = auditDocs(root);
    expect(result.find((item) => item.path === "docs/guide.md")?.state).toBe("obsolete");
    expect(result.find((item) => item.path === "docs/guide.md")?.deadAnchors).toHaveLength(2);
    expect(result.find((item) => item.path === "docs/guide.md")?.inboundLinks).toBe(0);
    expect(result.find((item) => item.path === "docs/empty.md")?.state).toBe("trivial");
    expect(fs.existsSync(path.join(root, "docs", "guide.md"))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("新建仓根 Markdown 提醒但恒退 0，已有文件静默", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-place-"));
    const hook = path.resolve("assets/scripts/superflow-doc-placement-hook.py");
    const input = JSON.stringify({ cwd: root, tool_input: { file_path: "draft.md" } });
    const first = spawnSync("python3", [hook], { input, cwd: root, encoding: "utf8" });
    expect(first.status).toBe(0);
    expect(first.stderr).toContain("文档落位");
    fs.writeFileSync(path.join(root, "draft.md"), "existing");
    const second = spawnSync("python3", [hook], { input, cwd: root, encoding: "utf8" });
    expect(second.status).toBe(0);
    expect(second.stderr).toBe("");
    fs.rmSync(root, { recursive: true, force: true });
  });
});
