import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";

const project = path.resolve(__dirname, "../..");
const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "review-package-"));
  temporary.push(directory);
  const root = path.join(directory, "project");
  fs.mkdirSync(root);
  const env = fixtureProcessEnv(path.join(directory, "home"), {
    ...process.env,
    NO_UPDATE_NOTIFIER: "1",
    SUPERFLOW_LANG: "en",
  });
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  git("init", "-q");
  fs.writeFileSync(
    path.join(root, "application.ts"),
    "export const value = 1;\n",
  );
  fs.writeFileSync(path.join(root, "removed.ts"), "old source\n");
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "baseline",
  );
  const base = git("rev-parse", "HEAD");
  const runFrom = (cwd: string, ...args: string[]) =>
    spawnSync(
      process.execPath,
      [
        path.join(project, "node_modules/tsx/dist/cli.mjs"),
        path.join(project, "src/app/cli.ts"),
        "review-coverage",
        ...args,
      ],
      { cwd, env, encoding: "utf8" },
    );
  const run = (...args: string[]) => runFrom(root, ...args);
  return { root, directory, git, base, run, runFrom };
}

describe("review package preparation through the existing CLI", () => {
  it("captures unstaged, added and deleted sources without committing or rewriting them", () => {
    const f = fixture();
    fs.writeFileSync(
      path.join(f.root, "application.ts"),
      "export const value = 2;\n",
    );
    fs.rmSync(path.join(f.root, "removed.ts"));
    fs.mkdirSync(path.join(f.root, "new"));
    fs.writeFileSync(path.join(f.root, "new", "added test.ts"), "new test\n");
    const before = f.git("status", "--porcelain", "-uall");
    const directory = path.join(f.directory, "review");
    const result = f.run("--prepare", directory, "--json");
    expect(result.status, result.stderr).toBe(0);
    const prepared = JSON.parse(result.stdout).package;
    expect(prepared.baseline).toBe(f.base);
    expect(prepared.files).toEqual([
      "application.ts",
      "new/added test.ts",
      "removed.ts",
    ]);
    const patch = fs.readFileSync(prepared.diff, "utf8");
    expect(patch).toContain("+export const value = 2;");
    expect(patch).toContain("+new test");
    expect(patch).toContain("-old source");
    const manifest = fs.readFileSync(prepared.sourceManifest, "utf8");
    expect(manifest).toContain(
      createHash("sha256").update("new test\n").digest("hex"),
    );
    expect(manifest).toContain("deleted");
    expect(fs.readFileSync(prepared.reportTemplate, "utf8")).toMatch(
      /^NEEDS_CONTEXT\n/,
    );
    const audit = f.run(
      "--report",
      prepared.reportTemplate,
      "--path",
      "application.ts",
      "--json",
    );
    expect(audit.status).toBe(1);
    expect(JSON.parse(audit.stdout).report.state).toBe("NEEDS_CONTEXT");
    expect(f.git("rev-parse", "HEAD")).toBe(f.base);
    expect(f.git("status", "--porcelain", "-uall")).toBe(before);
  }, 15_000);

  it("includes committed and still uncommitted changes against an explicit baseline from a nested cwd", () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, "application.ts"), "committed\n");
    f.git("add", ".");
    f.git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "change",
    );
    fs.writeFileSync(path.join(f.root, "application.ts"), "current\n");
    const nested = path.join(f.root, "module");
    fs.mkdirSync(nested);
    const result = f.runFrom(
      nested,
      "--base",
      f.base,
      "--prepare",
      path.join(f.directory, "review"),
      "--json",
    );
    expect(result.status, result.stderr).toBe(0);
    const prepared = JSON.parse(result.stdout).package;
    expect(fs.readFileSync(prepared.diff, "utf8")).toContain("+current");
    expect(
      fs.readFileSync(
        path.join(prepared.directory, "baseline", "application.ts"),
        "utf8",
      ),
    ).toBe("export const value = 1;\n");
    expect(
      fs.readFileSync(
        path.join(prepared.directory, "current", "application.ts"),
        "utf8",
      ),
    ).toBe("current\n");
  }, 15_000);

  it("refuses an existing package without changing the original reviewer return", () => {
    const f = fixture();
    const directory = path.join(f.directory, "review");
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, "review-report.md"),
      "original return\n",
    );
    const result = f.run("--prepare", directory, "--json");
    expect(result.status).not.toBe(0);
    expect(
      fs.readFileSync(path.join(directory, "review-report.md"), "utf8"),
    ).toBe("original return\n");
    expect(fs.readdirSync(directory)).toEqual(["review-report.md"]);
  }, 15_000);

  it("rejects a symlink escape before writing any package", () => {
    const f = fixture();
    const outside = path.join(f.directory, "private.txt");
    fs.writeFileSync(outside, "private\n");
    fs.symlinkSync(outside, path.join(f.root, "leak.ts"));
    const directory = path.join(f.directory, "review");
    const result = f.run("--prepare", directory, "--json");
    expect(result.status).not.toBe(0);
    expect(fs.existsSync(directory)).toBe(false);
    expect(result.stderr).toMatch(/symbolic|symlink/i);
  }, 15_000);
  it("captures a staged addition exactly once and preserves deleted directory snapshots", () => {
    const f = fixture();
    fs.mkdirSync(path.join(f.root, "nested"));
    fs.writeFileSync(path.join(f.root, "nested", "gone.ts"), "gone\n");
    f.git("add", ".");
    f.git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "nested baseline",
    );
    fs.rmSync(path.join(f.root, "nested"), { recursive: true });
    fs.writeFileSync(path.join(f.root, "added.ts"), "new source\n");
    f.git("add", "added.ts");
    const result = f.run(
      "--prepare",
      path.join(f.directory, "review"),
      "--json",
    );
    expect(result.status, result.stderr).toBe(0);
    const prepared = JSON.parse(result.stdout).package;
    const patch = fs.readFileSync(prepared.diff, "utf8");
    expect(patch.match(/\+new source/g)).toHaveLength(1);
    expect(patch).toContain("-gone");
    expect(
      fs.readFileSync(
        path.join(prepared.directory, "baseline/nested/gone.ts"),
        "utf8",
      ),
    ).toBe("gone\n");
  }, 15_000);

  it("audits project-relative report sources from a nested working directory", () => {
    const f = fixture();
    const nested = path.join(f.root, "module");
    fs.mkdirSync(nested);
    const hash = createHash("sha256")
      .update(fs.readFileSync(path.join(f.root, "application.ts")))
      .digest("hex");
    const report = path.join(f.directory, "actual-review.md");
    fs.writeFileSync(
      report,
      `DONE\n## Review Identity\n| Field | Value |\n|---|---|\n| Role | independent-reviewer |\n| Dispatch | session:fixture/dispatch |\n| Return | session:fixture/return |\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n| application.ts | ${hash} |\n## Findings\nNone\n## Concerns\nNone\n`,
    );
    const result = f.runFrom(
      nested,
      "--report",
      report,
      "--path",
      "application.ts",
      "--json",
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).report.eligibleForTriage).toBe(true);
  }, 15_000);
  it("normalizes explicit ./ source paths before snapshot lookup and deduplication", () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, "application.ts"), "after\n");
    const result = f.run(
      "--prepare",
      path.join(f.directory, "review"),
      "--path",
      "./application.ts",
      "application.ts",
      "--json",
    );
    expect(result.status, result.stderr).toBe(0);
    const prepared = JSON.parse(result.stdout).package;
    expect(prepared.files).toEqual(["application.ts"]);
    expect(
      fs.readFileSync(
        path.join(prepared.directory, "baseline/application.ts"),
        "utf8",
      ),
    ).toContain("value = 1");
    expect(
      fs.readFileSync(prepared.diff, "utf8").match(/\+after/g),
    ).toHaveLength(1);
  }, 15_000);

  it("treats selected paths literally instead of including glob-matched undeclared source", () => {
    const f = fixture();
    for (const name of ["[a].ts", "a.ts"])
      fs.writeFileSync(path.join(f.root, name), "before\n");
    f.git("add", ".");
    f.git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "literal baseline",
    );
    fs.writeFileSync(path.join(f.root, "[a].ts"), "literal-only\n");
    fs.writeFileSync(path.join(f.root, "a.ts"), "unselected\n");
    const result = f.run(
      "--prepare",
      path.join(f.directory, "review"),
      "--path",
      "[a].ts",
      "--json",
    );
    expect(result.status, result.stderr).toBe(0);
    const prepared = JSON.parse(result.stdout).package;
    const patch = fs.readFileSync(prepared.diff, "utf8");
    expect(prepared.files).toEqual(["[a].ts"]);
    expect(patch).toContain("+literal-only");
    expect(patch).not.toContain("+unselected");
  }, 15_000);

  it.each(["file-to-directory", "directory-to-file"])(
    "captures %s as real deletion and addition",
    (direction) => {
      const f = fixture();
      if (direction === "file-to-directory") {
        fs.rmSync(path.join(f.root, "removed.ts"));
        fs.mkdirSync(path.join(f.root, "removed.ts"));
        fs.writeFileSync(
          path.join(f.root, "removed.ts/child.ts"),
          "replacement\n",
        );
      } else {
        fs.mkdirSync(path.join(f.root, "nested"));
        fs.writeFileSync(path.join(f.root, "nested/child.ts"), "old source\n");
        f.git("add", ".");
        f.git(
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "commit",
          "-qm",
          "directory baseline",
        );
        fs.rmSync(path.join(f.root, "nested"), { recursive: true });
        fs.writeFileSync(path.join(f.root, "nested"), "replacement\n");
      }
      const result = f.run(
        "--prepare",
        path.join(f.directory, "review"),
        "--json",
      );
      expect(result.status, result.stderr).toBe(0);
      const patch = fs.readFileSync(
        JSON.parse(result.stdout).package.diff,
        "utf8",
      );
      expect(patch).toContain("-old source");
      expect(patch).toContain("+replacement");
    },
    15_000,
  );
  it("rejects a replaced-file selection that Git expands to undeclared staged descendants", () => {
    const f = fixture();
    fs.rmSync(path.join(f.root, "removed.ts"));
    fs.mkdirSync(path.join(f.root, "removed.ts"));
    fs.writeFileSync(path.join(f.root, "removed.ts/child.ts"), "replacement\n");
    f.git("add", "-A");
    const directory = path.join(f.directory, "review");
    const result = f.run(
      "--prepare",
      directory,
      "--path",
      "removed.ts",
      "--json",
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/undeclared.*removed.ts\/child.ts/);
    expect(fs.existsSync(directory)).toBe(false);
  }, 15_000);
});
