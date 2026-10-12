import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectChangedFiles,
  planChangedVerification,
  runChecks,
  resolveNpmInvocation,
} from "../../scripts/verify-changed.mjs";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("changed verification", () => {
  it.each([
    "src/new.ts",
    "installer/bin/main.cjs",
    "package.json",
    "assets/manifest.json",
    "src/platform/fs.ts",
    "src/platform/process-tree.ts",
    "src/platform/process-liveness.ts",
    "scripts/release-notes-check.js",
    "src/platform/version-check.ts",
  ])("falls back conservatively for %s", (file) => {
    const plan = planChangedVerification([file, "test/unit/path.test.ts"]);
    expect(plan.full).toBe(true);
    expect(plan.reasons.length).toBeGreaterThan(0);
    expect(
      plan.checks.filter((check) => check.id.startsWith("test")),
    ).toHaveLength(1);
    expect(plan.checks.find((check) => check.id === "test:full")?.args).toEqual(
      ["test"],
    );
  });
  it("keeps ordinary docs narrow but treats agent rules as shared", () => {
    expect(planChangedVerification(["docs/example.md"]).full).toBe(false);
    expect(planChangedVerification(["AGENTS.md"]).full).toBe(true);
    expect(planChangedVerification(["CLAUDE.md"]).full).toBe(true);
  });
  it("supports English reasons and an explicit full plan without changes", () => {
    const plan = planChangedVerification([], { full: true, language: "en" });
    expect(plan.message).toMatch(/^Planned/);
    expect(plan.reasons).toEqual(["Full verification explicitly requested."]);
    expect(plan.checks.find((check) => check.id === "test:full")?.args).toEqual(
      ["test"],
    );
    expect(
      plan.checks.every((check) => !/[\u4e00-\u9fff]/u.test(check.reason)),
    ).toBe(true);
  });
  it("selects shared asset checks and skill audit", () => {
    const plan = planChangedVerification(["assets/skills/example/SKILL.md"]);
    expect(plan.checks.map((check) => check.id)).toContain("skill-audit");
    expect(plan.full).toBe(true);
  });
  it("runs a newly added test directly and deduplicates", () => {
    const plan = planChangedVerification([
      "test/unit/new.test.ts",
      "test/unit/new.test.ts",
    ]);
    expect(plan.full).toBe(false);
    expect(
      plan.checks.filter((check) => check.id.startsWith("test"))[0].args,
    ).toContain("test/unit/new.test.ts");
  });
  it("explains no changes and preserves explicit full", () => {
    expect(planChangedVerification([]).message).toContain("没有");
    expect(
      planChangedVerification([], { full: true }).checks.some(
        (check) => check.id === "test:full",
      ),
    ).toBe(true);
  });
  it("resolves npm through Node on Windows without a shell", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "verify-npm-"));
    temporaryDirectories.push(directory);
    const entry = path.join(directory, "npm-cli.js");
    writeFileSync(entry, "");
    expect(
      resolveNpmInvocation({ platform: "win32", npmExecPath: entry }),
    ).toEqual({ executable: process.execPath, argumentPrefix: [entry] });
    expect(() =>
      resolveNpmInvocation({
        platform: "win32",
        npmExecPath: "",
        pathValue: directory,
      }),
    ).toThrow();
  });
  it("selects its own tests without generating build output", () => {
    const plan = planChangedVerification([
      "scripts/verify-changed.mjs",
      "test/unit/verify-changed.test.ts",
    ]);
    expect(plan.full).toBe(false);
    expect(
      plan.checks.find((check) => check.id === "typecheck")?.args,
    ).toContain("--noEmit");
    expect(
      plan.checks
        .find((check) => check.id === "test:selected")
        ?.args.filter((arg) => arg.endsWith("verify-changed.test.ts")),
    ).toHaveLength(1);
    expect(plan.checks.some((check) => check.args.includes("build"))).toBe(
      false,
    );
  });
  it("propagates a failed check without executing later checks", () => {
    const seen: unknown[] = [];
    const status = runChecks(
      [{ args: ["test"] }, { args: ["run", "lint"] }],
      { executable: "npm", argumentPrefix: [] },
      (_exe, args) => {
        seen.push(args);
        return { status: 7 };
      },
    );
    expect(status).toBe(7);
    expect(seen).toHaveLength(1);
  });
  it("enumerates committed, staged, dirty and untracked names with whitespace", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "verify-changed-"));
    temporaryDirectories.push(cwd);
    const git = (...args: string[]) => spawnSync("git", args, { cwd });
    git("init");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    writeFileSync(path.join(cwd, "dirty.txt"), "old");
    git("add", ".");
    git("commit", "-m", "baseline");
    writeFileSync(path.join(cwd, "dirty.txt"), "new");
    writeFileSync(path.join(cwd, "staged.txt"), "new");
    git("add", "staged.txt");
    writeFileSync(path.join(cwd, "untracked space\nname.txt"), "new");
    expect(collectChangedFiles("HEAD", cwd).sort()).toEqual([
      "dirty.txt",
      "staged.txt",
      "untracked space\nname.txt",
    ]);
    expect(() => collectChangedFiles("--output=/tmp/injected", cwd)).toThrow();
    const result = spawnSync(
      process.execPath,
      [path.resolve("scripts/verify-changed.mjs"), "--plan", "--json"],
      {
        cwd,
        encoding: "utf8",
        env: { ...process.env, npm_execpath: "/missing/npm-cli.js" },
      },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).files).toContain("staged.txt");
    const npmEntry = path.join(cwd, "fake-npm.cjs");
    writeFileSync(
      npmEntry,
      'console.log("child stdout"); console.error("child stderr"); process.exit(7);',
    );
    const execute = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [path.resolve("scripts/verify-changed.mjs"), ...args],
        {
          cwd,
          encoding: "utf8",
          env: { ...process.env, npm_execpath: npmEntry, SUPERFLOW_LANG: "en" },
        },
      );
    const checked = execute("--json");
    expect(checked.status).toBe(7);
    expect(JSON.parse(checked.stdout).status).toBe(7);
    expect(JSON.parse(checked.stdout).message).toMatch(/^Planned/);
    expect(checked.stderr).toContain("child stdout");
    expect(checked.stderr).toContain("child stderr");
    expect(execute("--help").stdout).toContain("Usage:");
    expect(execute("--language", "zh", "--help").stdout).toContain("用法：");
    expect(execute("--language", "xx", "--plan").status).toBe(1);
    expect(execute("--bogus").stderr).toContain("Unknown argument:");
    expect(execute("--language", "zh", "--bogus").stderr).toContain(
      "未知参数：",
    );
  });
});
