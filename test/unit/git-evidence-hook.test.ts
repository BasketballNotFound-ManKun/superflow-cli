import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { auditProjectGitHook } from "../../src/domains/hook-migration.js";
import {
  deployScripts,
  auditLegacyScriptAliases,
} from "../../src/domains/skill/scripts.js";
import * as manifest from "../../src/domains/config/manifest.js";
import { digest } from "../helpers/review-coverage.js";

import {
  fixtureProcessEnv,
  withFixtureProcessEnv,
} from "../helpers/fixture-process-env.js";

const ROOT = path.resolve(__dirname, "../..");
const temporary: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const p of temporary.splice(0))
    fs.rmSync(p, { recursive: true, force: true });
});
describe("旧 Git 入口的正式提交证据门", () => {
  it.each(
    (["codex", "claude"] as const).flatMap((host) =>
      ["current", "custom", "absent"].map((installation) => ({
        host,
        installation,
      })),
    ),
  )(
    "$host 旧路径在宿主 $installation 环境经安装后阻断伪造PASS并保留自定义hook",
    async ({ host, installation }) => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), "superflow-git-evidence-"),
      );
      temporary.push(dir);
      const repo = path.join(dir, "repo");
      fs.mkdirSync(repo);
      const parentHome = path.join(dir, "parent-home");
      const parentHooks = path.join(parentHome, "hooks");
      fs.mkdirSync(parentHooks, { recursive: true });
      if (installation !== "absent") {
        fs.writeFileSync(
          path.join(parentHooks, "pre-commit"),
          `#!/bin/sh\necho ${installation} host hook must not run >&2\nexit 77\n`,
          { mode: 0o755 },
        );
      }
      const parentScripts = path.join(
        parentHome,
        `.${host}`,
        host === "codex" ? "hooks" : "scripts",
      );
      fs.mkdirSync(parentScripts, { recursive: true });
      if (installation === "current") {
        for (const name of [
          "superflow-delivery-check.sh",
          "superflow-test-report-lint.py",
        ])
          fs.copyFileSync(
            path.join(ROOT, "assets/scripts", name),
            path.join(parentScripts, name),
          );
        fs.writeFileSync(
          path.join(parentScripts, "sdd-delivery-check.sh"),
          '#!/bin/sh\nexec sh "$(dirname "$0")/superflow-delivery-check.sh" "$@"\n',
          { mode: 0o755 },
        );
      } else if (installation === "custom") {
        fs.writeFileSync(
          path.join(parentScripts, "sdd-delivery-check.sh"),
          "#!/bin/sh\nexit 77\n",
          { mode: 0o755 },
        );
      }
      const parentConfig = path.join(parentHome, ".gitconfig");
      fs.writeFileSync(parentConfig, `[core]\n hooksPath = ${parentHooks}\n`);
      const env = fixtureProcessEnv(dir, {
        ...process.env,
        HOME: parentHome,
        XDG_CONFIG_HOME: path.join(parentHome, ".config"),
        GIT_CONFIG_GLOBAL: parentConfig,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "core.hooksPath",
        GIT_CONFIG_VALUE_0: parentHooks,
        GIT_DIR: path.join(parentHome, "foreign.git"),
        GIT_WORK_TREE: parentHome,
        GIT_INDEX_FILE: path.join(parentHome, "foreign-index"),
      });
      const git = (args: string[]) =>
        execFileSync("git", args, { cwd: repo, env, stdio: "pipe" });
      git(["init"]);
      git(["config", "user.name", "Synthetic"]);
      git(["config", "user.email", "synthetic@example.invalid"]);
      const change = path.join(repo, "openspec/changes/anonymous");
      fs.mkdirSync(change, { recursive: true });
      execFileSync("python3", [
        path.join(ROOT, "test/fixture/execution-evidence/replay.py"),
        change,
        "omit",
      ]);
      fs.writeFileSync(path.join(repo, ".sdd-aggregate-closeout"), "");
      fs.writeFileSync(
        path.join(repo, "custom.sh"),
        "#!/bin/sh\necho retained > custom.called\n",
      );
      const scripts = path.join(
        dir,
        `.${host}`,
        host === "codex" ? "hooks" : "scripts",
      );
      fs.mkdirSync(scripts, { recursive: true });
      const legacy = "#!/bin/sh\n# Known synthetic legacy fixture\nexit 0\n";
      fs.writeFileSync(path.join(scripts, "sdd-delivery-check.sh"), legacy, {
        mode: 0o755,
      });
      const preCommit = `#!/bin/sh\nsh ./custom.sh || exit $?\nDELIVERY_HOOK="$HOME/.${host}/${host === "codex" ? "hooks" : "scripts"}/sdd-delivery-check.sh"\n"$DELIVERY_HOOK" --check-staged "$(pwd)" || exit $?\n`;
      const hook = path.join(repo, ".git/hooks/pre-commit");
      fs.writeFileSync(hook, preCommit, { mode: 0o755 });
      const original = manifest.getManifest();
      vi.spyOn(manifest, "getManifest").mockReturnValue({
        ...original,
        legacyScriptAliases: {
          "sdd-delivery-check.sh": {
            target: "superflow-delivery-check.sh",
            knownHashes: [digest(legacy)],
          },
        },
      });
      git(["add", "."]);
      git(["commit", "-m", "旧入口基线"]);
      await deployScripts(
        ["superflow-delivery-check.sh", "superflow-test-report-lint.py"],
        path.join(ROOT, "assets/scripts"),
        scripts,
        { agent: host },
      );
      expect(
        auditLegacyScriptAliases(
          path.join(ROOT, "assets/scripts"),
          scripts,
          host,
        )[0],
      ).toMatchObject({ status: "delegated", targetCurrent: true });
      expect(
        withFixtureProcessEnv(env, () => auditProjectGitHook(repo, dir))
          .references,
      ).toEqual([
        expect.objectContaining({
          host,
          script: "sdd-delivery-check.sh",
          current: true,
        }),
      ]);
      const receiptPath = path.join(change, "logs/E11.json");
      const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
      receipt.status = "PASS";
      receipt.persistence.forEach((write: any) => {
        write.result = "PASS";
      });
      const event = {
        ...receipt,
        command: { argv: receipt.command.argv, exitCode: 0 },
      };
      const raw = JSON.stringify(event) + "\n";
      fs.writeFileSync(path.join(change, "logs/E11.jsonl"), raw);
      receipt.command.sha256 = digest(raw);
      fs.writeFileSync(receiptPath, JSON.stringify(receipt));
      git(["add", "."]);
      const commit = spawnSync("git", ["commit", "-m", "匿名提交"], {
        cwd: repo,
        env,
        encoding: "utf8",
      });
      expect(commit.status).not.toBe(0);
      expect(commit.stdout + commit.stderr).toMatch(
        /通过证据不可验证|持久化值未达到预期/,
      );
      expect(fs.existsSync(path.join(repo, "custom.called"))).toBe(true);
      expect(fs.readFileSync(hook, "utf8")).toBe(preCommit);
      expect(
        fs
          .readdirSync(scripts)
          .some((name) =>
            name.startsWith("sdd-delivery-check.sh.superflow-migrate-"),
          ),
      ).toBe(true);
      const backupCount = fs
        .readdirSync(scripts)
        .filter((name) => name.includes(".superflow-migrate-")).length;
      await deployScripts(
        ["superflow-delivery-check.sh", "superflow-test-report-lint.py"],
        path.join(ROOT, "assets/scripts"),
        scripts,
        { agent: host },
      );
      expect(
        fs
          .readdirSync(scripts)
          .filter((name) => name.includes(".superflow-migrate-")).length,
      ).toBe(backupCount);
      fs.rmSync(change, { recursive: true, force: true });
      fs.mkdirSync(change);
      execFileSync("python3", [
        path.join(ROOT, "test/fixture/execution-evidence/replay.py"),
        change,
        "complete",
      ]);
      fs.appendFileSync(
        path.join(change, "test-report.md"),
        "\nNew verification summary.\n",
      );
      git(["add", "openspec/changes/anonymous/test-report.md"]);
      const staleIndex = spawnSync("git", ["commit", "-m", "快照错配提交"], {
        cwd: repo,
        env,
        encoding: "utf8",
      });
      expect(staleIndex.status).not.toBe(0);
      expect(staleIndex.stdout + staleIndex.stderr).toContain("Git index");
      git(["add", "."]);
      const complete = spawnSync("git", ["commit", "-m", "完整匿名提交"], {
        cwd: repo,
        env,
        encoding: "utf8",
      });
      expect(complete.status, complete.stdout + complete.stderr).toBe(0);
      const rawPath = "openspec/changes/anonymous/logs/E11.jsonl";
      const retained = fs.readFileSync(path.join(repo, rawPath));
      git(["rm", rawPath]);
      fs.writeFileSync(path.join(repo, rawPath), retained);
      fs.appendFileSync(
        path.join(change, "test-report.md"),
        "\nRetained deleted dependency.\n",
      );
      git(["add", "openspec/changes/anonymous/test-report.md"]);
      const deleted = spawnSync("git", ["commit", "-m", "删除证据快照"], {
        cwd: repo,
        env,
        encoding: "utf8",
      });
      expect(deleted.status).not.toBe(0);
      expect(deleted.stdout + deleted.stderr).toContain("Git index");
    },
  );
});
