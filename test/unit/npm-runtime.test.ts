import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";

const runtime = createRequire(import.meta.url)("../../scripts/npm-runtime.cjs");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "superflow npm runtime ")),
  );
  roots.push(root);
  const bin = path.join(root, "bin");
  const node = path.join(bin, "node");
  const npm = path.join(root, "lib/node_modules/npm/bin/npm-cli.js");
  fs.mkdirSync(bin);
  fs.mkdirSync(path.dirname(npm), { recursive: true });
  fs.writeFileSync(node, "selected runtime");
  fs.writeFileSync(
    npm,
    "console.log(JSON.stringify({args:process.argv.slice(2),node:process.execPath}))",
  );
  return { root, node, npm };
}

describe("shared npm runtime", () => {
  it("executes a global query with the installed package prefix despite an unrelated npm prefix", () => {
    const f = fixture();
    const script = path.join(
      f.root,
      "lib/node_modules/@chenmk/superflow/scripts/npm-runtime.cjs",
    );
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.copyFileSync(path.resolve("scripts/npm-runtime.cjs"), script);
    const result = spawnSync(process.execPath, [script, "root", "-g"], {
      encoding: "utf8",
      env: {
        ...fixtureProcessEnv(f.root),
        npm_execpath: f.npm,
        npm_node_execpath: process.execPath,
        npm_config_prefix: path.join(f.root, "unrelated"),
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      args: ["root", "-g", "--prefix", f.root],
      node: process.execPath,
    });
    expect(fs.existsSync(path.join(f.root, "unrelated"))).toBe(false);
  });

  it("ignores npm lifecycle metadata inherited from another Node runtime", () => {
    const f = fixture();
    const otherNode = path.join(f.root, "other-node");
    const otherNpm = path.join(f.root, "other-npm.js");
    fs.writeFileSync(otherNode, "another runtime");
    fs.writeFileSync(otherNpm, "another npm");
    expect(
      runtime.resolveNpmInvocation({
        nodePath: f.node,
        npmExecPath: otherNpm,
        npmNodeExecPath: otherNode,
      }),
    ).toEqual({ executable: f.node, argumentPrefix: [f.npm] });
  });

  it("does not fall back to an unrelated npm on PATH when its own npm is unavailable", () => {
    const f = fixture();
    fs.unlinkSync(f.npm);
    const other = path.join(f.root, "foreign");
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, "npm"), "unrelated npm");
    expect(() =>
      runtime.resolveNpmInvocation({
        nodePath: f.node,
        npmExecPath: "",
        pathValue: other,
      }),
    ).toThrow(/npm/);
  });

  it("resolves the npm JavaScript entry on Windows without executing npm.cmd", () => {
    const f = fixture();
    const npm = path.join(
      path.dirname(f.node),
      "node_modules/npm/bin/npm-cli.js",
    );
    fs.mkdirSync(path.dirname(npm), { recursive: true });
    fs.writeFileSync(npm, "// Windows npm");
    fs.writeFileSync(path.join(path.dirname(f.node), "npm.cmd"), "exit 97");
    expect(
      runtime.resolveNpmInvocation({
        nodePath: f.node,
        platform: "win32",
        npmExecPath: "",
      }),
    ).toEqual({ executable: f.node, argumentPrefix: [npm] });
  });

  it("removes transient npm execution shims from user-visible command verification", () => {
    expect(
      runtime.userCommandPath({
        PATH: [
          "/cache/node_modules/.bin",
          "/selected/bin",
          "/npm/node-gyp-bin",
          "/usr/bin",
        ].join(path.delimiter),
      }),
    ).toBe(["/selected/bin", "/usr/bin"].join(path.delimiter));
  });
  it("does not let a bootstrap-only Node path hide the original user command path", () => {
    const f = fixture();
    expect(
      runtime.userCommandPath({
        HOME: f.root,
        SHELL: "/bin/bash",
        PATH: ["/temporary-runtime/bin", "/user/commands"].join(path.delimiter),
        SUPERFLOW_INSTALL_USER_PATH: "/user/commands",
      }),
    ).toBe("/user/commands");
  });
  it("projects an approved CLI path addition after the original user path", () => {
    const f = fixture();
    for (const name of [".bashrc", ".profile"])
      fs.writeFileSync(
        path.join(f.root, name),
        '# >>> Superflow CLI path >>>\nexport PATH="$PATH:$HOME/.local/bin"\n',
      );
    expect(
      runtime.userCommandPath({
        HOME: f.root,
        SHELL: "/bin/bash",
        PATH: "/temporary-runtime/bin",
        SUPERFLOW_INSTALL_USER_PATH: "/user/commands",
      }),
    ).toBe(
      ["/user/commands", path.join(f.root, ".local/bin")].join(path.delimiter),
    );
  });

  it("keeps project-local package installation out of global npm prefix binding", () => {
    const f = fixture();
    expect(
      runtime.npmArguments(
        ["install", "dependency"],
        path.join(f.root, "node_modules/@chenmk/superflow"),
      ),
    ).toEqual(["install", "dependency"]);
  });

  it("does not treat a declared project dependency as a Windows global npm prefix", () => {
    const f = fixture();
    fs.writeFileSync(
      path.join(f.root, "package.json"),
      JSON.stringify({
        private: true,
        devDependencies: { "@chenmk/superflow": "0.6.2" },
      }),
    );
    expect(
      runtime.npmArguments(
        ["install", "-g", "dependency"],
        path.join(f.root, "node_modules/@chenmk/superflow"),
        "win32",
      ),
    ).toEqual(["install", "-g", "dependency"]);
  });
  it("keeps source-install global dependencies in the dedicated runtime prefix", () => {
    const f = fixture();
    const prefix = path.join(f.root, "data/superflow/node/release");
    const nodePath = path.join(
      prefix,
      process.platform === "win32" ? "node.exe" : "bin/node",
    );
    fs.mkdirSync(path.dirname(nodePath), { recursive: true });
    fs.writeFileSync(nodePath, "runtime");
    expect(
      runtime.npmArguments(
        ["install", "-g", "dependency"],
        path.join(f.root, "source"),
        process.platform,
        {
          nodePath,
          env: {
            HOME: f.root,
            XDG_DATA_HOME: path.join(f.root, "data"),
            LOCALAPPDATA: path.join(f.root, "data"),
          },
        },
      ),
    ).toEqual(["install", "-g", "dependency", "--prefix", prefix]);
  });
  it("resolves the installed workflow dependency without relying on a PATH Node", () => {
    const f = fixture();
    const core = path.join(f.root, "lib/node_modules/@chenmk/superflow");
    const dependency = path.join(
      f.root,
      "lib/node_modules/@fission-ai/openspec",
    );
    fs.mkdirSync(path.join(dependency, "bin"), { recursive: true });
    fs.writeFileSync(
      path.join(dependency, "package.json"),
      JSON.stringify({
        name: "@fission-ai/openspec",
        bin: { openspec: "bin/cli.js" },
      }),
    );
    fs.writeFileSync(
      path.join(dependency, "bin/cli.js"),
      "console.log(JSON.stringify(process.argv.slice(2)))",
    );
    const invocation = runtime.resolveManagedNodeTool(
      "openspec",
      core,
      process.execPath,
      { HOME: f.root },
    );
    const result = spawnSync(
      invocation.executable,
      [...invocation.argumentPrefix, "--version"],
      {
        encoding: "utf8",
        env: { ...fixtureProcessEnv(f.root), PATH: "" },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(["--version"]);
  });
});
