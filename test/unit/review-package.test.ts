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
function fixture(language = "en") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "review-package-"));
  temporary.push(directory);
  const root = path.join(directory, "project");
  fs.mkdirSync(root);
  const env = fixtureProcessEnv(path.join(directory, "home"), {
    ...process.env,
    NO_UPDATE_NOTIFIER: "1",
    SUPERFLOW_LANG: language,
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
  it.each(["en", "zh"])(
    "dispatches the exact canonical template in %s and exposes unselected dirty files",
    (language) => {
      const f = fixture(language);
      fs.writeFileSync(path.join(f.root, "application.ts"), "changed\n");
      fs.writeFileSync(
        path.join(f.root, "local.config"),
        "pre-existing local value\n",
      );
      const result = f.run(
        "--prepare",
        path.join(f.directory, "review"),
        "--path",
        "application.ts",
        "--json",
      );
      expect(result.status, result.stderr).toBe(0);
      const prepared = JSON.parse(result.stdout).package;
      expect(prepared.unselectedChanges).toEqual(["local.config"]);
      const dispatch = fs.readFileSync(prepared.dispatchInstructions, "utf8");
      expect(dispatch).toContain(prepared.reportTemplate);
      expect(dispatch).toContain(prepared.sourceManifest);
      expect(dispatch).toContain(
        language === "en"
          ? "Use this exact report template"
          : "直接使用此报告模板",
      );
      const template = fs.readFileSync(prepared.reportTemplate, "utf8");
      for (const axis of [
        "security",
        "performance",
        "correctness",
        "maintainability",
        "architecture",
      ])
        expect(template).toContain(`| ${axis} | BLOCKED |`);
      expect(template).toContain("[F-001]");
      expect(template).toContain("<actual-read-range");
      expect(fs.readFileSync(prepared.sourceManifest, "utf8")).toContain(
        "local.config",
      );
      const promoted = path.join(f.directory, "promoted.md");
      fs.writeFileSync(promoted, template.replace(/^NEEDS_CONTEXT/, "DONE"));
      expect(
        f.run("--report", promoted, "--path", "application.ts", "--json")
          .status,
      ).toBe(1);
    },
    15_000,
  );

  it.each(["DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT"])(
    "prepares Owner response and actual recheck from a %s original without rebinding source or verdicts",
    (state) => {
      const f = fixture();
      const hash = (text: string) =>
        createHash("sha256").update(text).digest("hex");
      const original = `${state}\n## Review Identity\n| Field | Value |\n|---|---|\n| Role | independent-reviewer |\n| Dispatch | session:original/dispatch |\n| Return | session:original/return |\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n| application.ts | ${hash("export const value = 1;\n")} |\n## Findings\n- [F-001] application.ts:1 [correctness][HIGH] missing guard\n- [F-002] application.ts:1 [architecture][MEDIUM] missing caller\n## Concerns\nF-001 and F-002 remain unresolved.\n`;
      fs.writeFileSync(path.join(f.root, "original.md"), original);
      const originalAudit = f.run(
        "--report",
        "original.md",
        "--path",
        "application.ts",
        "--json",
      );
      expect(originalAudit.status).toBe(1);
      const originalFacts = JSON.parse(originalAudit.stdout).report;
      expect(originalFacts.state).toBe(state);
      expect(originalFacts.issues).toEqual([]);
      expect(originalFacts.eligibleForTriage).toBe(false);
      fs.writeFileSync(path.join(f.root, "application.ts"), "after repair\n");
      const responseResult = f.run(
        "--prepare",
        path.join(f.directory, "response"),
        "--original-review",
        "original.md",
        "--path",
        "application.ts",
        "--json",
      );
      expect(responseResult.status, responseResult.stderr).toBe(0);
      const responsePackage = JSON.parse(responseResult.stdout).package;
      const responseTemplate = fs.readFileSync(
        responsePackage.ownerResponseTemplate,
        "utf8",
      );
      expect(responsePackage.reportTemplate).toBeUndefined();
      expect(responseTemplate).toMatch(/^NEEDS_CONTEXT\n/);
      expect(responseTemplate).toContain("| F-001 | <disposition> |");
      expect(responseTemplate).toContain("| F-002 | <disposition> |");
      expect(responseTemplate).toContain(
        "fixed, mitigated, deferred, dismissed",
      );
      const owner =
        "## Finding Dispositions\n| ID | Disposition | Evidence |\n|---|---|---|\n| F-001 | deferred | authorization:pending; still open |\n| F-002 | fixed | test:caller |\n";
      fs.writeFileSync(path.join(f.root, "owner.md"), owner);
      const nested = path.join(f.root, "nested");
      fs.mkdirSync(nested);
      const rereview = f.runFrom(
        nested,
        "--prepare",
        path.join(f.directory, "recheck"),
        "--original-review",
        "original.md",
        "--owner-response",
        "owner.md",
        "--path",
        "application.ts",
        "--json",
      );
      expect(rereview.status, rereview.stderr).toBe(0);
      const prepared = JSON.parse(rereview.stdout).package;
      const template = fs.readFileSync(prepared.reportTemplate, "utf8");
      expect(template).toMatch(/^NEEDS_CONTEXT\n/);
      const templateAudit = f.run(
        "--report",
        prepared.reportTemplate,
        "--path",
        "application.ts",
        "--json",
      );
      expect(templateAudit.status).toBe(1);
      expect(JSON.parse(templateAudit.stdout).report.eligibleForTriage).toBe(
        false,
      );
      expect(template).toContain(
        `| original | original.md | ${hash(original)} |`,
      );
      expect(template).toContain(
        `| owner-response | owner.md | ${hash(owner)} |`,
      );
      expect(template).toContain("| F-001 | <result> |");
      expect(template).toContain("| F-002 | <result> |");
      expect(template).not.toContain("| F-001 | resolved |");
      const inputs = fs.readFileSync(prepared.reviewInputs, "utf8");
      expect(inputs).toContain("F-001 and F-002 remain unresolved.");
      expect(inputs).toContain("deferred");
      expect(fs.readFileSync(path.join(f.root, "original.md"), "utf8")).toBe(
        original,
      );
      expect(fs.readFileSync(path.join(f.root, "owner.md"), "utf8")).toBe(
        owner,
      );
      expect(
        fs.readFileSync(
          path.join(prepared.directory, "inputs/original.md"),
          "utf8",
        ),
      ).toBe(original);
      expect(
        fs.statSync(path.join(prepared.directory, "inputs/original.md")).mode &
          0o222,
      ).toBe(0);
      expect(inputs).toContain("[F-001] application.ts:1");
      const completed = template
        .replace(/^NEEDS_CONTEXT/, "DONE")
        .replace("<actual-dispatch-reference>", "session:recheck/dispatch")
        .replace("<actual-return-reference>", "session:recheck/return")
        .replace(
          /## Findings\n[\s\S]*?(?=\n## Concerns)/,
          "## Findings\nNone\n",
        )
        .replace(/## Concerns\n[\s\S]*?(?=\n## )/, "## Concerns\nNone\n")
        .replaceAll("<result>", "resolved")
        .replaceAll(
          "<actual-independent-recheck-evidence>",
          "source:current/1; test:actual-rerun",
        );
      const completedFile = path.join(f.directory, "completed.md");
      fs.writeFileSync(completedFile, completed);
      const completedAudit = f.run(
        "--report",
        completedFile,
        "--path",
        "application.ts",
        "--json",
      );
      expect(completedAudit.status, completedAudit.stderr).toBe(0);
      expect(JSON.parse(completedAudit.stdout).report.dependencies).toEqual([
        "original.md",
        "owner.md",
      ]);
      fs.writeFileSync(
        path.join(f.root, "owner.md"),
        owner + "\nChanged after binding.\n",
      );
      const drifted = f.run(
        "--report",
        completedFile,
        "--path",
        "application.ts",
        "--json",
      );
      expect(drifted.status).toBe(1);
      expect(JSON.parse(drifted.stdout).report.issues.join("\n")).toContain(
        "Review Chain invalid file/hash: owner.md",
      );
      fs.writeFileSync(path.join(f.root, "owner.md"), owner);
      expect(fs.readFileSync(path.join(f.root, "original.md"), "utf8")).toBe(
        original,
      );
      const filled = template
        .replace(/^NEEDS_CONTEXT/, "DONE")
        .replace("<actual-dispatch-reference>", "session:recheck/dispatch")
        .replace("<actual-return-reference>", "session:recheck/return")
        .replace(
          /## Findings\n[\s\S]*?(?=\n## Concerns)/,
          "## Findings\n- [F-003] application.ts:1 [correctness][HIGH] new failure\n",
        )
        .replace(
          /## Concerns\n[\s\S]*?(?=\n## )/,
          "## Concerns\nStill deferred and new failure.\n",
        )
        .replaceAll("<result>", "resolved");
      const actual = path.join(f.directory, "current.md");
      fs.writeFileSync(actual, filled);
      const audit = f.run(
        "--report",
        actual,
        "--path",
        "application.ts",
        "--json",
      );
      expect(audit.status).toBe(1);
      const parsed = JSON.parse(audit.stdout).report;
      expect(parsed.findingIds).toEqual(["F-003"]);
      expect(parsed.findingsClear).toBe(false);
    },
    15_000,
  );

  it.each([
    "incomplete-context-template",
    "no-findings",
    "missing-concerns",
    "empty-concerns",
  ])(
    "rejects %s without preparing or altering the original",
    (kind) => {
      const f = fixture();
      const sha = createHash("sha256")
        .update("export const value = 1;\n")
        .digest("hex");
      let original = `BLOCKED\n## Review Identity\n| Field | Value |\n|---|---|\n| Role | independent-reviewer |\n| Dispatch | session:fixture/dispatch |\n| Return | session:fixture/return |\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n| application.ts | ${sha} |\n## Findings\n- [F-001] application.ts:1: real blocker\n## Concerns\nF-001 remains open.\n`;
      if (kind === "incomplete-context-template")
        original = original
          .replace(/^BLOCKED/, "NEEDS_CONTEXT")
          .replace("session:fixture/dispatch", "<actual-dispatch-reference>")
          .replace("session:fixture/return", "<actual-return-reference>");
      if (kind === "no-findings")
        original = original.replace(
          "- [F-001] application.ts:1: real blocker",
          "None",
        );
      if (kind === "missing-concerns")
        original = original.replace("## Concerns\nF-001 remains open.\n", "");
      if (kind === "empty-concerns")
        original = original.replace("F-001 remains open.", "");
      fs.writeFileSync(path.join(f.root, "original.md"), original);
      const directory = path.join(f.directory, "rejected");
      const result = f.run(
        "--prepare",
        directory,
        "--original-review",
        "original.md",
        "--path",
        "application.ts",
        "--json",
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid or incomplete original review");
      expect(fs.existsSync(directory)).toBe(false);
      expect(fs.readFileSync(path.join(f.root, "original.md"), "utf8")).toBe(
        original,
      );
    },
    15_000,
  );

  it.each([
    "missing-original",
    "incomplete-original",
    "outside-original",
    "incomplete-owner",
    "wrong-owner-ids",
    "outside-owner",
    "symlink-original",
    "owner-without-original",
  ])(
    "rejects %s before creating a package",
    (kind) => {
      const f = fixture();
      const output = path.join(f.directory, "review");
      const args = ["--prepare", output, "--path", "application.ts", "--json"];
      const missing = path.join(f.root, "missing.md");
      fs.writeFileSync(
        path.join(f.root, "incomplete.md"),
        "DONE_WITH_CONCERNS\n## Findings\n- [F-001] application.ts:1: problem\n",
      );
      if (
        ["incomplete-owner", "wrong-owner-ids", "outside-owner"].includes(kind)
      ) {
        const sha = createHash("sha256")
          .update("export const value = 1;\n")
          .digest("hex");
        fs.writeFileSync(
          path.join(f.root, "valid.md"),
          `DONE_WITH_CONCERNS\n## Review Identity\n| Field | Value |\n|---|---|\n| Role | independent-reviewer |\n| Dispatch | session:fixture/dispatch |\n| Return | session:fixture/return |\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n| application.ts | ${sha} |\n## Findings\n- [F-001] application.ts:1: problem\n## Concerns\nStill open\n`,
        );
        fs.writeFileSync(
          path.join(f.root, "owner.md"),
          kind === "wrong-owner-ids"
            ? "## Finding Dispositions\n| ID | Disposition | Evidence |\n|---|---|---|\n| F-999 | fixed | test:evidence |\n"
            : "## Finding Dispositions\n",
        );
        args.push(
          "--original-review",
          "valid.md",
          "--owner-response",
          kind === "outside-owner" ? "../outside.md" : "owner.md",
        );
      } else if (kind === "symlink-original") {
        fs.writeFileSync(path.join(f.directory, "outside.md"), "private\n");
        fs.symlinkSync(
          path.join(f.directory, "outside.md"),
          path.join(f.root, "link.md"),
        );
        args.push("--original-review", "link.md");
      } else if (kind === "outside-original") {
        fs.writeFileSync(path.join(f.directory, "outside.md"), "private\n");
        args.push("--original-review", "../outside.md");
      } else if (kind === "owner-without-original") {
        args.push("--owner-response", "incomplete.md");
      } else {
        args.push(
          "--original-review",
          kind === "missing-original" ? missing : "incomplete.md",
        );
      }
      const result = f.run(...args);
      expect(result.status).not.toBe(0);
      expect(fs.existsSync(output)).toBe(false);
      expect(result.stderr).not.toMatch(/unknown option/);
      if (kind === "wrong-owner-ids") {
        expect(result.stderr).toContain("missing=[F-001]");
        expect(result.stderr).toContain("unexpected=[F-999]");
      }
      if (kind === "incomplete-owner")
        expect(result.stderr).toContain("Invalid Owner response");
    },
    15_000,
  );

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
