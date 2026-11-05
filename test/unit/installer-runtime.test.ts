import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function installer(
  version: string,
  availableNode = true,
  existing = false,
  bootstrap = false,
  args: string[] = [],
) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "superflow installer runtime ")),
  );
  roots.push(root);
  const bin = path.join(root, "selected", "bin");
  const other = path.join(root, "other", "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(other, { recursive: true });
  const node = path.join(bin, "node");
  const npm = path.join(
    root,
    "selected",
    "lib",
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  fs.writeFileSync(node, "selected node", { mode: 0o755 });
  fs.mkdirSync(path.dirname(npm), { recursive: true });
  fs.writeFileSync(npm, "// selected npm");
  fs.writeFileSync(path.join(other, "npm"), "foreign npm", { mode: 0o755 });
  const privateRoot = path.join(
    root,
    ".local/share/superflow/node/node-v24.0.0-test",
  );
  const privateNode = path.join(privateRoot, "bin/node");
  if (bootstrap) {
    fs.mkdirSync(path.dirname(privateNode), { recursive: true });
    fs.mkdirSync(path.join(privateRoot, "lib/node_modules/npm/bin"), {
      recursive: true,
    });
    fs.writeFileSync(privateNode, "bootstrapped node", { mode: 0o755 });
    fs.writeFileSync(
      path.join(privateRoot, "lib/node_modules/npm/bin/npm-cli.js"),
      "// bootstrapped npm",
    );
  }
  const existingPrefix = path.join(root, "existing");
  const existingNode = path.join(existingPrefix, "bin/node");
  const existingNpm = path.join(
    existingPrefix,
    "lib/node_modules/npm/bin/npm-cli.js",
  );
  if (existing) {
    const packageRoot = path.join(
      existingPrefix,
      "lib/node_modules/@chenmk/superflow",
    );
    const cli = path.join(packageRoot, "dist/app/cli.js");
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.mkdirSync(path.dirname(existingNode), { recursive: true });
    fs.mkdirSync(path.dirname(existingNpm), { recursive: true });
    fs.writeFileSync(cli, "// existing CLI");
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ name: "@chenmk/superflow", version: "0.6.2" }),
    );
    fs.writeFileSync(existingNode, "existing node", { mode: 0o755 });
    fs.writeFileSync(existingNpm, "// existing npm");
    fs.symlinkSync(cli, path.join(other, "superflow"));
  }
  const config = path.join(root, ".npmrc");
  fs.writeFileSync(
    config,
    "prefix=/custom/prefix\nregistry=https://example.invalid\n",
  );
  const calls: { command: string; args: string[] }[] = [];
  const errors: string[] = [];
  const entry = path.resolve("installer/bin/superflow-installer.cjs");
  const nativeRequire = createRequire(entry);
  const mod = { exports: {} };
  const fakeRequire = Object.assign(
    (name: string) => {
      if (name === "child_process" || name === "node:child_process")
        return {
          spawnSync(command: string, args: string[]) {
            calls.push({ command, args });
            if (bootstrap && command === "bash")
              return { status: 0, stdout: privateNode + "\n", stderr: "" };
            if (args[0] === "--version")
              return {
                status: availableNode || command === privateNode ? 0 : 1,
                stdout:
                  availableNode || command === privateNode ? "v24.0.0\n" : "",
                stderr: "",
              };
            return { status: 0, stdout: "", stderr: "" };
          },
        };
      return nativeRequire(name);
    },
    { main: mod },
  );
  vm.runInNewContext(fs.readFileSync(entry, "utf8"), {
    require: fakeRequire,
    module: mod,
    __dirname: path.dirname(entry),
    process: {
      version,
      versions: { node: version.replace(/^v/, "") },
      execPath: node,
      platform: "darwin",
      argv: [node, entry, ...(bootstrap ? ["--yes"] : []), ...args],
      env: { HOME: root, PATH: `${other}:${bin}`, SUPERFLOW_LANG: "en" },
      exitCode: 0,
    },
    console: {
      log() {},
      error(message: string) {
        errors.push(message);
      },
    },
  });
  return {
    node,
    npm,
    config,
    calls,
    errors,
    existingPrefix,
    existingNode,
    existingNpm,
    privateNode,
    privateRoot,
  };
}

describe("installer runtime ownership", () => {
  it("uses the npm paired with its selected Node even when another npm leads PATH", () => {
    const f = installer("v24.0.0");
    const install = f.calls.find(({ args }) => args.includes("install"));
    expect(install?.command).toBe(f.node);
    expect(install?.args[0]).toBe(f.npm);
    expect(f.calls.some(({ command }) => command === "npm")).toBe(false);
  });

  it("never downloads Node or edits npm configuration when no supported runtime exists", () => {
    const f = installer("v18.0.0", false);
    expect(
      f.calls.some(({ command }) =>
        ["bash", "curl", "winget", "nvm"].includes(command),
      ),
    ).toBe(false);
    expect(fs.readFileSync(f.config, "utf8")).toBe(
      "prefix=/custom/prefix\nregistry=https://example.invalid\n",
    );
    expect(f.errors.join(" ")).toMatch(/Node.js 20/);
    expect(f.calls.some(({ args }) => args.includes("install"))).toBe(false);
  });
  it("reuses the visible global installation instead of installing into a second Node prefix", () => {
    const f = installer("v24.0.0", true, true);
    const install = f.calls.find(({ args }) => args.includes("install"));
    expect(install?.command).toBe(f.existingNode);
    expect(install?.args[0]).toBe(f.existingNpm);
    expect(install?.args).toEqual(
      expect.arrayContaining(["--prefix", f.existingPrefix]),
    );
  });
  it("hands a consented bootstrap runtime to npm without changing npm defaults", () => {
    const f = installer("v18.0.0", false, false, true);
    const bootstrap = f.calls.find(({ command }) => command === "bash");
    expect(bootstrap?.args).toEqual(expect.arrayContaining(["--yes"]));
    const install = f.calls.find(({ args }) => args.includes("install"));
    expect(install?.command).toBe(f.privateNode);
    expect(install?.args).toEqual(
      expect.arrayContaining(["--prefix", f.privateRoot]),
    );
    expect(fs.readFileSync(f.config, "utf8")).toBe(
      "prefix=/custom/prefix\nregistry=https://example.invalid\n",
    );
  });
  it("does not start installation when only help is requested", () => {
    const f = installer("v24.0.0", true, false, false, ["--help"]);
    expect(f.calls).toEqual([]);
  });
});
