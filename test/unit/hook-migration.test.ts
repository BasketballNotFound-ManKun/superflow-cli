import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditProjectHooks, migrateProjectHooks } from "../../src/domains/hook-migration.js";

describe("项目级 Hook 安全迁移", () => {
  it("删除已知旧 ake Hook，保留自定义 Hook，并可重复执行", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-hook-migration-"));
    fs.mkdirSync(path.join(root, ".codex"), { recursive: true });
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(root, ".claude", ".ake-install-state.json"), "{}\n");
    const file = path.join(root, ".codex", "hooks.json");
    fs.writeFileSync(file, JSON.stringify({ hooks: { PreToolUse: [
      { matcher: "Bash", hooks: [{ type: "command", command: "bash scripts/hooks/block-no-verify.sh" }] },
      { matcher: "Bash", hooks: [{ type: "command", command: "./company-hooks/check.sh" }] },
    ] } }, null, 2));
    const audit = auditProjectHooks(root, "codex");
    expect(audit.autoMigratable).toBe(1); expect(audit.retained).toBe(1);
    const refused = migrateProjectHooks(root, "codex", { replacementAvailable: false });
    expect(refused.changed).toBe(false);
    expect(refused.error).toContain("全局 Superflow Hook");
    const migrated = migrateProjectHooks(root, "codex", { replacementAvailable: true });
    expect(migrated.changed).toBe(true); expect(migrated.backup).toBeTruthy();
    const after = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(after.hooks.PreToolUse).toHaveLength(1);
    expect(after.hooks.PreToolUse[0].hooks[0].command).toContain("company-hooks");
    expect(migrateProjectHooks(root, "codex", { replacementAvailable: true }).changed).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("缺少 ake 来源标记时保留同名项目脚本", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-hook-unowned-"));
    fs.mkdirSync(path.join(root, ".codex"));
    const file = path.join(root, ".codex", "hooks.json");
    fs.writeFileSync(file, JSON.stringify({ hooks: { PreToolUse: [
      { hooks: [{ command: "bash scripts/hooks/block-no-verify.sh" }] },
    ] } }));
    expect(auditProjectHooks(root, "codex").autoMigratable).toBe(0);
    expect(migrateProjectHooks(root, "codex").changed).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
