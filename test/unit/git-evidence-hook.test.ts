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

const ROOT = path.resolve(__dirname, "../..");
const temporary: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const p of temporary.splice(0))
    fs.rmSync(p, { recursive: true, force: true });
});
describe("旧 Git 入口的正式提交证据门", () => {
  it.each(["codex", "claude"] as const)(
    "%s 旧路径经安装接入后阻断伪造PASS并保留自定义hook",
    async (host) => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), "superflow-git-evidence-"),
      );
      temporary.push(dir);
      const repo = path.join(dir, "repo");
      fs.mkdirSync(repo);
      const git = (args: string[]) =>
        execFileSync("git", args, { cwd: repo, stdio: "pipe" });
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
      expect(auditProjectGitHook(repo, dir).references).toEqual([
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
        env: { ...process.env, HOME: dir },
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
      const staleIndex = spawnSync("git", ["commit", "-m", "快照错配提交"], {
        cwd: repo,
        env: { ...process.env, HOME: dir },
        encoding: "utf8",
      });
      expect(staleIndex.status).not.toBe(0);
      expect(staleIndex.stdout + staleIndex.stderr).toContain("Git index");
      git(["add", "."]);
      const complete = spawnSync("git", ["commit", "-m", "完整匿名提交"], {
        cwd: repo,
        env: { ...process.env, HOME: dir },
        encoding: "utf8",
      });
      expect(complete.status, complete.stdout + complete.stderr).toBe(0);
    },
  );
});
