import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditCleanup } from "../../src/domains/cleanup-audit.js";

describe("全仓清理候选扫描", () => {
  it("输出带证据和路由的候选且不修改源码", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-cleanup-"));
    fs.mkdirSync(path.join(root, "a")); fs.mkdirSync(path.join(root, "b"));
    fs.writeFileSync(path.join(root, "a", "Service.java"), `${"// TODO\n".repeat(3)}class Service {}\n`);
    fs.writeFileSync(path.join(root, "b", "Service.java"), "class Service {}\n");
    const before = fs.readFileSync(path.join(root, "a", "Service.java"), "utf8");
    const result = auditCleanup(root);
    expect(result.some((item) => item.kind === "duplicate-name")).toBe(true);
    expect(result.some((item) => item.kind === "todo-hotspot")).toBe(true);
    expect(result.every((item) => item.route)).toBe(true);
    expect(fs.readFileSync(path.join(root, "a", "Service.java"), "utf8")).toBe(before);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
