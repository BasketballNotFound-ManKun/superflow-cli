import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
const installer = path.resolve("assets/scripts/install-sql-pre-commit.sh");
const paths: string[] = [];
afterEach(() => {
  for (const p of paths.splice(0))
    fs.rmSync(p, { recursive: true, force: true });
});
describe("已有 Git 安装入口不覆盖用户代码", () => {
  it.each(["codex", "claude"])(
    "%s实际core.hooksPath安装，两项门禁且重复幂等",
    (host) => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), "superflow-hook-install-"),
      );
      paths.push(dir);
      const repo = path.join(dir, "repo");
      fs.mkdirSync(repo);
      const git = (args: string[]) =>
        execFileSync("git", args, { cwd: repo, stdio: "pipe" });
      git(["init"]);
      git(["config", "core.hooksPath", ".company-hooks"]);
      const scripts = path.join(
        dir,
        `.${host}`,
        host === "codex" ? "hooks" : "scripts",
      );
      fs.mkdirSync(scripts, { recursive: true });
      for (const name of [
        "superflow-sql-sync-hook.py",
        "superflow-delivery-check.sh",
        "superflow-test-report-lint.py",
      ])
        fs.writeFileSync(path.join(scripts, name), "#!/bin/sh\nexit 0\n", {
          mode: 0o755,
        });
      const run = () =>
        spawnSync("sh", [installer, "--agent", host], {
          cwd: repo,
          env: { ...process.env, HOME: dir },
          encoding: "utf8",
        });
      expect(run().status).toBe(0);
      const hook = path.join(repo, ".company-hooks/pre-commit");
      const bytes = fs.readFileSync(hook, "utf8");
      expect(bytes).toContain("superflow-sql-sync-hook.py");
      expect(bytes).toContain("superflow-delivery-check.sh");
      fs.chmodSync(hook, 0o644);
      expect(run().status).toBe(0);
      expect(fs.statSync(hook).mode & 0o111).not.toBe(0);
      expect(fs.readFileSync(hook, "utf8")).toBe(bytes);
      fs.writeFileSync(hook, "#!/bin/sh\n# user custom\nexit 0\n");
      const custom = fs.readFileSync(hook, "utf8");
      expect(run().status).toBe(2);
      expect(fs.readFileSync(hook, "utf8")).toBe(custom);
    },
  );
});
