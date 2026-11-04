import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  auditGlobalHooks,
  auditProjectHooks,
  migrateGlobalHooks,
  migrateProjectHooks,
} from "../../src/domains/hook-migration.js";
import { hookMigrateCommand } from "../../src/app/commands/hook-migrate.js";

import { syncManagedHooks } from "../../src/domains/hook.js";
import { getManifestHooks } from "../../src/domains/config/manifest.js";
import { deployScripts } from "../../src/domains/skill/scripts.js";
import { ASSETS_DIR } from "../../src/platform/assets.js";

it.each((["codex", "claude"] as const).flatMap(host =>
  (["event", "matcher", "missingShell", "conditional", "async"] as const)
    .map(fault => ({ host, fault }))))(
  "$host 的 $fault 绑定不能授权移除项目护栏", async ({ host, fault }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-hook-binding-"));
    const homedir = vi.spyOn(os, "homedir").mockReturnValue(root);
    try {
      const relative = host === "codex" ? ".codex/hooks.json" : ".claude/settings.json";
      const file = path.join(root, relative);
      const scripts = path.join(path.dirname(file), host === "codex" ? "hooks" : "scripts");
      const names = getManifestHooks(host);
      await deployScripts(names, path.join(ASSETS_DIR, "scripts"), scripts, { agent: host });
      syncManagedHooks(file, scripts, names);
      const valid = JSON.parse(fs.readFileSync(file, "utf8"));
      const project = path.join(root, "project");
      const projectFile = path.join(project, relative);
      const original = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [
        { type: "command", command: path.join(project, ".claude/scripts/superflow-hook-guard.sh") },
      ] }] } });
      fs.mkdirSync(path.dirname(projectFile), { recursive: true });
      const rejects = (configuration: typeof valid) => {
        fs.writeFileSync(file, JSON.stringify(configuration));
        fs.writeFileSync(projectFile, original);
        expect(auditGlobalHooks(root, host).globalReplacement).toBe(false);
        expect(migrateProjectHooks(project, host).changed).toBe(false);
        expect(fs.readFileSync(projectFile, "utf8")).toBe(original);
      };
      const wrongEvent = { hooks: { SessionEnd: [{ hooks: Object.values(valid.hooks)
        .flatMap((groups: any) => groups.flatMap((group: any) => group.hooks)) }] } };
      const narrowed = structuredClone(valid);
      const guard = narrowed.hooks.PreToolUse.find((group: any) => group.hooks
        .some((hook: any) => hook.command.endsWith("/superflow-hook-guard.sh")));
      guard.matcher = "Read";
      const missingShell = structuredClone(valid);
      missingShell.hooks.PreToolUse = missingShell.hooks.PreToolUse.filter((group: any) =>
        !(group.matcher === "Bash|Shell|exec_command" && group.hooks.some((hook: any) =>
          hook.command.endsWith("/superflow-sql-sync-hook.py"))));
      const conditional = structuredClone(valid);
      conditional.hooks.PreToolUse.find((group: any) => group.hooks
        .some((hook: any) => hook.command.endsWith("/superflow-hook-guard.sh"))).if = "false";
      const asyncObserver = structuredClone(valid);
      asyncObserver.hooks.PostToolUse.find((group: any) => group.hooks
        .some((hook: any) => hook.command.endsWith("/superflow-loop-observer.py")))
        .hooks[0].async = true;
      rejects({ event: wrongEvent, matcher: narrowed, missingShell,
        conditional, async: asyncObserver }[fault]);
      fs.writeFileSync(file, JSON.stringify(valid));
      expect(auditGlobalHooks(root, host).globalReplacement).toBe(true);
    } finally {
      homedir.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

it.each(["codex", "claude"] as const)(
  "%s 实际注册原生事件，并用同一清单确认全局替换与保留自定义资产", async (host) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-native-hooks-"));
    const homedir = vi.spyOn(os, "homedir").mockReturnValue(root);
    try {
      const relative = host === "codex" ? ".codex/hooks.json" : ".claude/settings.json";
      const file = path.join(root, relative);
      const scripts = path.join(path.dirname(file), host === "codex" ? "hooks" : "scripts");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const custom = { command: "./company-hooks/observe.sh", type: "command" };
      const customEvent = { hooks: [custom] };
      fs.writeFileSync(file, JSON.stringify({ env: { KEEP: "yes" }, hooks: {
        PostToolUse: [customEvent],
        // A previous shared registration must disappear for Codex on sync.
        PostToolUseFailure: [{ hooks: [{ command: path.join(scripts, "superflow-loop-failure-hook.sh") }] }],
      } }));
      const names = getManifestHooks(host);
      await deployScripts(names, path.join(ASSETS_DIR, "scripts"), scripts, { agent: host });
      syncManagedHooks(file, scripts, names);
      const installed = JSON.parse(fs.readFileSync(file, "utf8"));
      expect(installed.env).toEqual({ KEEP: "yes" });
      expect(installed.hooks.PostToolUse).toContainEqual(customEvent);
      const failureEntries = installed.hooks.PostToolUseFailure;
      if (host === "codex") expect(failureEntries).toBeUndefined();
      else expect(failureEntries[0].hooks[0].command)
        .toBe(path.join(scripts, "superflow-loop-failure-hook.sh"));
      expect(auditGlobalHooks(root, host).globalReplacement).toBe(true);
      const project = path.join(root, "project");
      const projectFile = path.join(project, relative);
      fs.mkdirSync(path.dirname(projectFile), { recursive: true });
      const projectConfig = { hooks: { PostToolUse: [{ hooks: [
        { command: path.join(project, ".codex/hooks/superflow-hook-guard.sh") }, custom,
      ] }] } };
      fs.writeFileSync(projectFile, JSON.stringify(projectConfig));
      expect(migrateProjectHooks(project, host).changed).toBe(true);
      expect(JSON.parse(fs.readFileSync(projectFile, "utf8")).hooks.PostToolUse)
        .toEqual([{ hooks: [custom] }]);
      expect(migrateProjectHooks(project, host).changed).toBe(false);
      const bytes = fs.readFileSync(file, "utf8");
      expect(syncManagedHooks(file, scripts, names).changed).toBe(false);
      expect(fs.readFileSync(file, "utf8")).toBe(bytes);
      // Missing or modified required assets cannot authorize project removal.
      const observer = path.join(scripts, "superflow-loop-observer.py");
      const original = fs.readFileSync(observer, "utf8");
      fs.writeFileSync(observer, `${original}\n# local customization\n`);
      expect(auditGlobalHooks(root, host).globalReplacement).toBe(false);
      expect(fs.readFileSync(observer, "utf8")).toContain("local customization");
      fs.writeFileSync(observer, original);
      expect(auditGlobalHooks(root, host).globalReplacement).toBe(true);
      fs.rmSync(observer);
      expect(auditGlobalHooks(root, host).globalReplacement).toBe(false);
      fs.writeFileSync(projectFile, JSON.stringify(projectConfig));
      const refused = migrateProjectHooks(project, host);
      expect(refused.changed).toBe(false);
      expect(refused.error).toContain("全局 Superflow Hook");
      expect(fs.readFileSync(projectFile, "utf8")).toBe(JSON.stringify(projectConfig));
      expect(JSON.parse(fs.readFileSync(file, "utf8")).hooks.PostToolUse)
        .toContainEqual(customEvent);
    } finally {
      homedir.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

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

describe("全局相对路径 Hook 安全迁移", () => {
  it("拒绝将项目路径误当全局配置根目录", () => {
    expect(() => hookMigrateCommand({ scope: "global", path: "/tmp/project" }))
      .toThrow("--path only applies to project Hook migration");
    expect(() => hookMigrateCommand({ scope: "unknown" }))
      .toThrow("Unsupported hook scope");
  });

  it("按宿主删除已知旧命令，备份并保留未知及项目配置", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-global-hooks-"));
    try {
      const codex = path.join(root, ".codex/hooks.json");
      const claude = path.join(root, ".claude/settings.json");
      const project = path.join(root, "project/.codex/hooks.json");
      for (const file of [codex, claude, project]) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
      }
      const codexConfig = {
        env: { KEEP: "yes" },
        hooks: {
          Stop: [{ hooks: [
            { type: "command", command: "bash scripts/hooks/stop-compile-check.sh" },
            { type: "command", command: "bash scripts/hooks/custom.sh" },
          ] }],
          UserPromptSubmit: [{ hooks: [
            { type: "command", command: "bash scripts/hooks/usage-collector.sh record codex || true" },
          ] }],
        },
      };
      fs.writeFileSync(codex, JSON.stringify(codexConfig));
      fs.writeFileSync(claude, JSON.stringify({ hooks: { Stop: [
        { hooks: [{ command: "bash scripts/hooks/stop-compile-check.sh" }] },
      ] } }));
      fs.writeFileSync(project, JSON.stringify(codexConfig));
      const claudeBefore = fs.readFileSync(claude, "utf8");
      const projectBefore = fs.readFileSync(project, "utf8");

      const audit = auditGlobalHooks(root, "codex");
      expect(audit.autoMigratable).toBe(2);
      expect(audit.retained).toBe(1);
      expect(auditGlobalHooks(root, "claude").autoMigratable).toBe(1);
      const migrated = migrateGlobalHooks(root, "codex");
      expect(migrated.changed).toBe(true);
      expect(migrated.backup).toBeTruthy();
      expect(fs.readFileSync(migrated.backup!, "utf8")).toBe(JSON.stringify(codexConfig));
      const after = JSON.parse(fs.readFileSync(codex, "utf8"));
      expect(after.env.KEEP).toBe("yes");
      expect(after.hooks.Stop[0].hooks).toEqual([
        { type: "command", command: "bash scripts/hooks/custom.sh" },
      ]);
      expect(after.hooks.UserPromptSubmit).toBeUndefined();
      expect(fs.readFileSync(claude, "utf8")).toBe(claudeBefore);
      expect(fs.readFileSync(project, "utf8")).toBe(projectBefore);
      const bytes = fs.readFileSync(codex, "utf8");
      expect(migrateGlobalHooks(root, "codex").changed).toBe(false);
      expect(fs.readFileSync(codex, "utf8")).toBe(bytes);
      expect(migrateGlobalHooks(root, "claude").changed).toBe(true);
      expect(JSON.parse(fs.readFileSync(claude, "utf8")).hooks.Stop).toBeUndefined();
      expect(migrateGlobalHooks(root, "claude").changed).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("只匹配白名单中的完整旧命令，保留相似的自定义调用", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-global-run-"));
    try {
      const file = path.join(root, ".codex/hooks.json");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ hooks: { Stop: [
        { hooks: [
          { command: "bash scripts/hooks/stop-compile-check.sh" },
          { command: "bash scripts/hooks/stop-compile-check.sh --custom" },
          { command: "bash scripts/hooks/my-private-check.sh" },
        ] },
      ] } }));
      migrateGlobalHooks(root, "codex");
      const hooks = JSON.parse(fs.readFileSync(file, "utf8")).hooks.Stop[0].hooks;
      expect(hooks.map((hook: { command: string }) => hook.command)).toEqual([
        "bash scripts/hooks/stop-compile-check.sh --custom",
        "bash scripts/hooks/my-private-check.sh",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("拒绝迁移损坏或符号链接的全局配置", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-global-invalid-"));
    try {
      const file = path.join(root, ".codex/hooks.json");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "{broken");
      const invalid = migrateGlobalHooks(root, "codex");
      expect(invalid.changed).toBe(false);
      expect(invalid.error).toContain("无法解析");
      fs.rmSync(file);
      const target = path.join(root, "source.json");
      fs.writeFileSync(target, "{}\n");
      fs.symlinkSync(target, file);
      const linked = migrateGlobalHooks(root, "codex");
      expect(linked.changed).toBe(false);
      expect(linked.error).toContain("符号链接");
      expect(fs.readFileSync(target, "utf8")).toBe("{}\n");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
