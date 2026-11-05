import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function fixture(corrupt = false) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "superflow node bootstrap ")),
  );
  roots.push(root);
  const bin = path.join(root, "tools");
  const data = path.join(root, "downloads");
  fs.mkdirSync(bin);
  fs.mkdirSync(data);
  for (const tool of [
    "awk",
    "cat",
    "chmod",
    "cp",
    "mkdir",
    "mktemp",
    "mv",
    "rm",
    "rmdir",
    "sed",
    "tar",
    "gzip",
    "ln",
    "cut",
    "shasum",
    "sha256sum",
  ]) {
    const found = spawnSync("which", [tool], { encoding: "utf8" });
    if (found.status === 0)
      fs.symlinkSync(found.stdout.trim(), path.join(bin, tool));
  }
  fs.writeFileSync(
    path.join(bin, "uname"),
    '#!/bin/sh\nif [ "$1" = "-s" ]; then echo Linux; else echo x86_64; fi\n',
    { mode: 0o755 },
  );
  const release = "node-v24.0.0-linux-x64";
  const tree = path.join(data, release);
  fs.mkdirSync(path.join(tree, "bin"), { recursive: true });
  fs.mkdirSync(path.join(tree, "lib/node_modules/npm/bin"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(tree, "bin/node"),
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo v24.0.0; else printf "%s\\n" "$0"; fi\n',
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(tree, "lib/node_modules/npm/bin/npm-cli.js"),
    "// fixture npm",
  );
  const archive = path.join(data, `${release}.tar.gz`);
  execFileSync("tar", ["-czf", archive, "-C", data, release]);
  const hash = corrupt
    ? "0".repeat(64)
    : createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  fs.writeFileSync(
    path.join(data, "SHASUMS256.txt"),
    `${hash}  ${release}.tar.gz\n`,
  );
  fs.writeFileSync(
    path.join(data, "index.tab"),
    "version\tdate\tfiles\tnpm\tv8\tuv\tzlib\topenssl\tmodules\tlts\tsecurity\nv24.0.0\t2026-01-01\tlinux-x64\t11\t1\t1\t1\t1\t1\tExample\t-\n",
  );
  const log = path.join(root, "fetch.log");
  fs.writeFileSync(
    path.join(bin, "curl"),
    `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),args=process.argv.slice(2);
const url=args.at(-1), output=args.indexOf('-o');
fs.appendFileSync(process.env.FETCH_LOG,url+'\\n');
const bytes=fs.readFileSync(path.join(process.env.FETCH_DATA,path.basename(url)));
if(output>=0)fs.writeFileSync(args[output+1],bytes);else process.stdout.write(bytes);
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(root, ".npmrc"), "prefix=/retained/prefix\n");
  const env = {
    ...fixtureProcessEnv(root),
    PATH: bin,
    SHELL: "/bin/bash",
    NVM_BIN: "",
    NVM_DIR: path.join(root, ".nvm"),
    XDG_DATA_HOME: path.join(root, "data"),
    FETCH_DATA: data,
    FETCH_LOG: log,
    SUPERFLOW_NODE_DOWNLOAD_BASE_URL: "https://example.invalid/dist",
  };
  return { root, bin, data, log, env, tree };
}
function run(f: ReturnType<typeof fixture>, args: string[] = []) {
  return spawnSync(
    "/bin/bash",
    [path.resolve("installer/bootstrap-node.sh"), ...args],
    {
      env: f.env,
      encoding: "utf8",
      timeout: 15000,
    },
  );
}

describe("consented Node bootstrap", () => {
  it("shows the installation plan and stops before downloading without explicit consent", () => {
    const f = fixture();
    const result = run(f);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/--yes/);
    expect(result.stderr).toContain(path.join(f.root, "data/superflow/node"));
    expect(fs.existsSync(f.log)).toBe(false);
  });
  it("reuses a supported runtime without downloading or modifying defaults", () => {
    const f = fixture();
    fs.symlinkSync(path.join(f.tree, "bin/node"), path.join(f.bin, "node"));
    const result = run(f);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe(path.join(f.bin, "node"));
    expect(fs.existsSync(f.log)).toBe(false);
    expect(fs.readFileSync(path.join(f.root, ".npmrc"), "utf8")).toBe(
      "prefix=/retained/prefix\n",
    );
  });
  it("installs a verified runtime only in the user directory after --yes", () => {
    const f = fixture();
    const result = run(f, ["--yes"]);
    expect(result.status, result.stderr).toBe(0);
    const node = result.stdout.trim();
    expect(node).toContain(path.join(f.root, "data/superflow/node"));
    expect(fs.existsSync(node)).toBe(true);
    expect(execFileSync(node, ["--version"], { encoding: "utf8" }).trim()).toBe(
      "v24.0.0",
    );
    expect(fs.readFileSync(f.log, "utf8")).toContain("SHASUMS256.txt");
    expect(fs.readFileSync(path.join(f.root, ".npmrc"), "utf8")).toBe(
      "prefix=/retained/prefix\n",
    );
    expect(fs.existsSync(path.join(f.root, ".zshrc"))).toBe(false);
  });
  it("rejects a corrupted download without activating a runtime", () => {
    const f = fixture(true);
    const result = run(f, ["--yes"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/SHA-256/);
    expect(
      fs.existsSync(path.join(f.root, "data/superflow/node/current")),
    ).toBe(false);
  });
  it("cancels an interactive plan without downloading", () => {
    const f = fixture();
    const python = execFileSync("which", ["python3"], {
      encoding: "utf8",
    }).trim();
    const driven = spawnSync(
      python,
      [
        path.resolve("test/fixture/terminal/drive.py"),
        JSON.stringify([
          "/bin/bash",
          path.resolve("installer/bootstrap-node.sh"),
        ]),
        JSON.stringify(["n"]),
      ],
      { encoding: "utf8", env: f.env, timeout: 15000 },
    );
    expect(driven.status, driven.stderr).toBe(0);
    const result = JSON.parse(driven.stdout);
    expect(result.code).not.toBe(0);
    expect(result.answersSent).toBe(1);
    expect(fs.existsSync(f.log)).toBe(false);
  });
  it("preserves profile content and appends only the CLI directory after consent", () => {
    const f = fixture();
    const profile = path.join(f.root, ".profile");
    fs.writeFileSync(
      profile,
      "# user settings\nexport ORIGINAL_VALUE=retained\n",
    );
    const result = run(f, ["--yes"]);
    expect(result.status, result.stderr).toBe(0);
    const content = fs.readFileSync(profile, "utf8");
    expect(content).toContain(
      "# user settings\nexport ORIGINAL_VALUE=retained\n",
    );
    expect(content).toContain("$PATH:$HOME/.local/bin");
    expect(content).not.toContain("superflow/node");
    expect(fs.readFileSync(profile + ".superflow-backup", "utf8")).toBe(
      "# user settings\nexport ORIGINAL_VALUE=retained\n",
    );
  });
  it("reuses its verified installed runtime without another download or prompt", () => {
    const f = fixture();
    const first = run(f, ["--yes"]);
    expect(first.status, first.stderr).toBe(0);
    const fetched = fs.readFileSync(f.log, "utf8");
    const again = run(f);
    expect(again.status, again.stderr).toBe(0);
    expect(fs.realpathSync(again.stdout.trim())).toBe(
      fs.realpathSync(first.stdout.trim()),
    );
    expect(fs.readFileSync(f.log, "utf8")).toBe(fetched);
    expect(
      fs.existsSync(path.join(f.root, "data/superflow/node/.install.lock")),
    ).toBe(false);
  });
  it("does not write an unrelated profile for an unsupported shell", () => {
    const f = fixture();
    f.env.SHELL = "/usr/bin/fish";
    const result = run(f, ["--yes"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(".local/bin");
    expect(fs.existsSync(path.join(f.root, ".profile"))).toBe(false);
  });
});
