import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "superflow launcher 'quoted' ")),
  );
  roots.push(root);
  const packageRoot = path.join(root, "package");
  const cli = path.join(packageRoot, "dist/app/cli.js");
  const launcher = path.join(root, "bin/superflow");
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.mkdirSync(path.dirname(launcher));
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ name: "@chenmk/superflow" }),
  );
  fs.writeFileSync(
    cli,
    "console.log(JSON.stringify({args:process.argv.slice(2),node:process.execPath}))",
  );
  return { root, packageRoot, cli, launcher };
}
function install(f: ReturnType<typeof fixture>) {
  return spawnSync(
    process.execPath,
    [
      "-e",
      `
    const r=require(process.argv[1]); r.writeLauncher(process.argv[2],process.argv[3],process.argv[4]);
  `,
      path.resolve("installer/launchers.cjs"),
      f.launcher,
      process.execPath,
      f.cli,
    ],
    {
      encoding: "utf8",
      env: fixtureProcessEnv(f.root),
    },
  );
}
describe("runtime-bound command launchers", () => {
  it("runs with its bound Node and preserves literal arguments when PATH has no Node", () => {
    const f = fixture();
    const built = install(f);
    expect(built.status, built.stderr).toBe(0);
    const result = spawnSync(
      f.launcher,
      ["space value", "$literal", "'quote'"],
      {
        encoding: "utf8",
        env: { ...fixtureProcessEnv(f.root), PATH: path.dirname(f.launcher) },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      args: ["space value", "$literal", "'quote'"],
      node: process.execPath,
    });
    const again = install(f);
    expect(again.status, again.stderr).toBe(0);
    expect(fs.readdirSync(path.dirname(f.launcher))).toEqual(["superflow"]);
  });
  it("replaces an owned npm symlink without overwriting the actual CLI file", () => {
    const f = fixture();
    const original = fs.readFileSync(f.cli, "utf8");
    fs.symlinkSync(f.cli, f.launcher);
    const result = install(f);
    expect(result.status, result.stderr).toBe(0);
    expect(fs.lstatSync(f.launcher).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(f.cli, "utf8")).toBe(original);
    expect(
      fs
        .readdirSync(path.dirname(f.launcher))
        .filter((n) => n.includes("backup")),
    ).toHaveLength(1);
  });
  it("preserves a custom user entry instead of replacing it", () => {
    const f = fixture();
    fs.writeFileSync(f.launcher, "#!/bin/sh\necho custom\n");
    expect(install(f).status).not.toBe(0);
    expect(fs.readFileSync(f.launcher, "utf8")).toBe(
      "#!/bin/sh\necho custom\n",
    );
    expect(fs.readdirSync(path.dirname(f.launcher))).toEqual(["superflow"]);
  });
  it("preserves a Windows custom command even if it mentions an npm package path", () => {
    const f = fixture();
    const command = f.launcher + ".cmd";
    const content =
      "@echo off\r\nREM node_modules/@chenmk/superflow/dist/app/cli.js\r\necho custom\r\n";
    fs.writeFileSync(command, content);
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        'require(process.argv[1]).installLaunchers(process.argv[2],process.argv[3],process.execPath,"win32")',
        path.resolve("installer/launchers.cjs"),
        path.dirname(f.launcher),
        f.packageRoot,
      ],
      { encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(command, "utf8")).toBe(content);
  });
  it("preserves user modifications to a generated launcher", () => {
    const f = fixture();
    expect(install(f).status).toBe(0);
    fs.appendFileSync(f.launcher, "# user modification\n");
    const before = fs.readFileSync(f.launcher, "utf8");
    expect(install(f).status).not.toBe(0);
    expect(fs.readFileSync(f.launcher, "utf8")).toBe(before);
  });
  it("repairs an owned visible alias to the selected global package before verification", () => {
    const f = fixture();
    fs.symlinkSync(f.cli, f.launcher);
    const selected = path.join(
      f.root,
      "selected/lib/node_modules/@chenmk/superflow",
    );
    fs.mkdirSync(path.join(selected, "dist/app"), { recursive: true });
    fs.mkdirSync(path.join(selected, "dist/mcp"), { recursive: true });
    fs.writeFileSync(
      path.join(selected, "package.json"),
      JSON.stringify({ name: "@chenmk/superflow" }),
    );
    for (const file of ["dist/app/cli.js", "dist/mcp/server.js"])
      fs.writeFileSync(
        path.join(selected, file),
        'console.log("selected-package")',
      );
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        "require(process.argv[1]).repairGlobalLaunchers(process.argv[2],process.execPath,process.env)",
        path.resolve("scripts/npm-runtime.cjs"),
        selected,
      ],
      {
        encoding: "utf8",
        env: { ...fixtureProcessEnv(f.root), PATH: path.dirname(f.launcher) },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    const invoked = spawnSync(f.launcher, [], {
      encoding: "utf8",
      env: { ...fixtureProcessEnv(f.root), PATH: "" },
    });
    expect(invoked.status, invoked.stderr).toBe(0);
    expect(invoked.stdout.trim()).toBe("selected-package");
  });
});
