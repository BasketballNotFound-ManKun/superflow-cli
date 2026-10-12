import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";

const roots: string[] = [];
const source = fs.readFileSync("scripts/ensure-bin-modes.js", "utf8");
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-build-info-"));
  roots.push(root);
  const env = fixtureProcessEnv(root);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
  fs.writeFileSync(path.join(root, ".gitignore"), "dist/\n");
  return { root, env, git };
}

function build(root: string, env: NodeJS.ProcessEnv) {
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts/ensure-bin-modes.js"), source);
  fs.mkdirSync(path.join(root, "dist/app"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist/app/cli.js"), "// built cli\n");
  execFileSync(
    process.execPath,
    [path.join(root, "scripts/ensure-bin-modes.js")],
    {
      cwd: os.tmpdir(),
      env,
    },
  );
  const metadata = path.join(root, "dist/build-info.json");
  expect(fs.existsSync(metadata)).toBe(true);
  return JSON.parse(fs.readFileSync(metadata, "utf8"));
}

function committedFixture() {
  const f = fixture();
  fs.mkdirSync(path.join(f.root, "scripts"));
  fs.writeFileSync(path.join(f.root, "scripts/ensure-bin-modes.js"), source);
  f.git("init", "-q");
  f.git("add", ".");
  f.git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture",
  );
  return f;
}

describe("build commit metadata", () => {
  it("records full HEAD only for its own clean Git root", () => {
    const { root, env, git } = committedFixture();
    expect(build(root, env).buildCommit).toBe(git("rev-parse", "HEAD"));
    if (process.platform !== "win32") {
      expect(fs.statSync(path.join(root, "dist/app/cli.js")).mode & 0o777).toBe(
        0o755,
      );
    }
  });

  it("records unknown for a dirty source tree", () => {
    const { root, env } = committedFixture();
    fs.writeFileSync(path.join(root, "local-change.txt"), "uncommitted");
    expect(build(root, env).buildCommit).toBeNull();
  });

  it("records unknown for a package nested inside another repository", () => {
    const { root, env, git } = committedFixture();
    const child = path.join(root, "nested");
    fs.mkdirSync(child);
    fs.writeFileSync(path.join(child, "package.json"), '{"type":"module"}');
    fs.mkdirSync(path.join(child, "scripts"));
    fs.writeFileSync(path.join(child, "scripts/ensure-bin-modes.js"), source);
    git("add", "nested");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "nested fixture",
    );
    expect(git("status", "--porcelain")).toBe("");
    expect(build(child, env).buildCommit).toBeNull();
  });

  it("records unknown for malformed Git HEAD", () => {
    const { root, env } = committedFixture();
    fs.writeFileSync(path.join(root, ".git/HEAD"), "not a commit\n");
    expect(build(root, env).buildCommit).toBeNull();
  });

  it("records unknown without Git", () => {
    const { root, env } = fixture();
    expect(build(root, env).buildCommit).toBeNull();
  });
});
