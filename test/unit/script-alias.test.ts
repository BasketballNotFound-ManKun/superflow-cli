import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  auditLegacyScriptAliases,
  deployScripts,
} from "../../src/domains/skill/scripts.js";
import { auditProjectGitHook } from "../../src/domains/hook-migration.js";
import * as manifest from "../../src/domains/config/manifest.js";
import { digest } from "../helpers/review-coverage.js";
let dir: string;
let assets: string;
let scripts: string;
const legacy = "#!/bin/sh\n# known obsolete gate\nexit 0\n";
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-alias-"));
  assets = path.join(dir, "assets");
  scripts = path.join(dir, ".codex/hooks");
  fs.mkdirSync(assets);
  fs.mkdirSync(scripts, { recursive: true });
  fs.writeFileSync(
    path.join(assets, "superflow-delivery-check.sh"),
    "#!/bin/sh\nprintf '%s\\n' \"$*\"\n",
  );
  vi.spyOn(manifest, "getManifest").mockReturnValue({
    ...manifest.getManifest(),
    legacyScriptAliases: {
      "sdd-delivery-check.sh": {
        target: "superflow-delivery-check.sh",
        knownHashes: [digest(legacy)],
      },
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});
describe("唯一安装owner的受管理旧入口", () => {
  it("备份精确已知旧文件，重复部署不新建备份，所有参数继续传递", async () => {
    const alias = path.join(scripts, "sdd-delivery-check.sh");
    fs.writeFileSync(alias, legacy);
    await deployScripts(["superflow-delivery-check.sh"], assets, scripts);
    expect(auditLegacyScriptAliases(assets, scripts, "codex")[0]).toMatchObject(
      { status: "delegated", targetCurrent: true },
    );
    const backups = fs
      .readdirSync(scripts)
      .filter((name) => name.includes(".superflow-migrate-"));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(scripts, backups[0]), "utf8")).toBe(
      legacy,
    );
    expect(
      execFileSync(alias, ["--check-staged", "path with spaces"], {
        encoding: "utf8",
      }),
    ).toContain("path with spaces");
    await deployScripts(["superflow-delivery-check.sh"], assets, scripts);
    expect(
      fs
        .readdirSync(scripts)
        .filter((name) => name.includes(".superflow-migrate-")),
    ).toEqual(backups);
  });
  it.each(["custom", "symlink", "dangling", "modified-wrapper"])(
    "保留%s入口并给诊断",
    async (kind) => {
      const alias = path.join(scripts, "sdd-delivery-check.sh");
      if (kind === "dangling") {
        fs.symlinkSync(path.join(dir, "missing-target"), alias);
        await deployScripts(["superflow-delivery-check.sh"], assets, scripts, {
          skipExisting: true,
        });
        expect(fs.lstatSync(alias).isSymbolicLink()).toBe(true);
        expect(
          auditLegacyScriptAliases(assets, scripts, "codex")[0].status,
        ).toBe("custom");
        return;
      } else if (kind === "symlink") {
        const external = path.join(dir, "external");
        fs.writeFileSync(external, legacy);
        fs.symlinkSync(external, alias);
      } else if (kind === "modified-wrapper") {
        await deployScripts(["superflow-delivery-check.sh"], assets, scripts);
        fs.appendFileSync(alias, "# custom change\n");
      } else fs.writeFileSync(alias, "#!/bin/sh\n# Company custom\nexit 0\n");
      const before = fs.readFileSync(alias, "utf8");
      await deployScripts(["superflow-delivery-check.sh"], assets, scripts);
      expect(fs.readFileSync(alias, "utf8")).toBe(before);
      expect(auditLegacyScriptAliases(assets, scripts, "codex")[0].status).toBe(
        "custom",
      );
    },
  );
  it("skip-existing不偷偷迁移现存旧文件", async () => {
    const alias = path.join(scripts, "sdd-delivery-check.sh");
    fs.writeFileSync(alias, legacy);
    await deployScripts(["superflow-delivery-check.sh"], assets, scripts, {
      skipExisting: true,
    });
    expect(fs.readFileSync(alias, "utf8")).toBe(legacy);
  });
  it("doctor审计实际core.hooksPath引用及规范脚本内容漂移", async () => {
    const repo = path.join(dir, "repo");
    fs.mkdirSync(repo);
    const git = (args: string[]) =>
      execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    git(["init"]);
    git(["config", "core.hooksPath", ".company-hooks"]);
    fs.mkdirSync(path.join(repo, ".company-hooks"));
    fs.writeFileSync(
      path.join(repo, ".company-hooks/pre-commit"),
      '#!/bin/sh\n"$HOME/.codex/hooks/sdd-delivery-check.sh" --check-staged\n',
    );
    fs.chmodSync(path.join(repo, ".company-hooks/pre-commit"), 0o755);
    fs.writeFileSync(path.join(scripts, "sdd-delivery-check.sh"), legacy);
    expect(auditProjectGitHook(repo, dir, assets).references[0].current).toBe(
      false,
    );
    await deployScripts(["superflow-delivery-check.sh"], assets, scripts);
    expect(auditProjectGitHook(repo, dir, assets).references[0].current).toBe(
      true,
    );
    fs.appendFileSync(
      path.join(scripts, "superflow-delivery-check.sh"),
      "# drift\n",
    );
    expect(auditProjectGitHook(repo, dir, assets).references[0].current).toBe(
      false,
    );
  });
  it("可诊断并修复已知wrapper丢失执行权限", async () => {
    await deployScripts(["superflow-delivery-check.sh"], assets, scripts);
    const file = path.join(scripts, "sdd-delivery-check.sh");
    fs.chmodSync(file, 0o644);
    expect(
      auditLegacyScriptAliases(assets, scripts, "codex")[0].executable,
    ).toBe(false);
    await deployScripts(["superflow-delivery-check.sh"], assets, scripts);
    expect(
      auditLegacyScriptAliases(assets, scripts, "codex")[0].executable,
    ).toBe(true);
  });
  it("规范脚本路径的自定义符号链接不能写入外部目标", async () => {
    const external = path.join(dir, "external-user-file");
    fs.writeFileSync(external, "preserve");
    fs.symlinkSync(external, path.join(scripts, "superflow-delivery-check.sh"));
    await expect(
      deployScripts(["superflow-delivery-check.sh"], assets, scripts),
    ).rejects.toThrow("Preserve custom script symlink");
    expect(fs.readFileSync(external, "utf8")).toBe("preserve");
  });
  it("Python兼容入口使用当前解释器委托，不能空成功", async () => {
    const target = "superflow-test-report-lint.py";
    const alias = "sdd-test-report-lint.py";
    fs.writeFileSync(
      path.join(assets, target),
      "#!/usr/bin/env python3\nimport sys\nprint(sys.argv[1])\nraise SystemExit(2)\n",
    );
    vi.mocked(manifest.getManifest).mockReturnValue({
      ...manifest.getManifest(),
      legacyScriptAliases: { [alias]: { target, knownHashes: [] } },
    });
    await deployScripts([target], assets, scripts);
    expect(() =>
      execFileSync(
        "python3",
        [path.join(scripts, alias), "argument with spaces"],
        { stdio: "pipe" },
      ),
    ).toThrow();
    fs.rmSync(path.join(scripts, target));
    expect(() =>
      execFileSync("python3", [path.join(scripts, alias)], { stdio: "pipe" }),
    ).toThrow();
  });
});
