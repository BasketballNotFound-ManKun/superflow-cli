import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";
import { afterEach, describe, expect, it } from "vitest";
import { isNewerVersion } from "../../src/platform/version-check.js";

describe("version update comparison", () => {
  it("does not report an older registry version as an update", () => {
    expect(isNewerVersion("0.3.0", "0.3.1")).toBe(false);
  });

  it("reports greater patch, minor, and major versions", () => {
    expect(isNewerVersion("0.3.2", "0.3.1")).toBe(true);
    expect(isNewerVersion("0.4.0", "0.3.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
  });

  it("treats a stable version as newer than the matching prerelease", () => {
    expect(isNewerVersion("1.0.0", "1.0.0-beta.1")).toBe(true);
    expect(isNewerVersion("1.0.0-beta.2", "1.0.0")).toBe(false);
  });
});

const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function updateFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "superflow-update-probe-"),
  );
  temporaryRoots.push(root);
  const marker = path.join(root, "npm-view.ndjson");
  const pathMarker = path.join(root, "path-npm.txt");
  const entry = path.join(root, "npm-cli.cjs");
  const driver = path.join(root, "check.mjs");
  fs.writeFileSync(
    entry,
    `
    const fs = require('node:fs');
    fs.appendFileSync(process.env.UPDATE_PROBE, JSON.stringify(process.argv.slice(2)) + '\\n');
    if (process.env.UPDATE_MODE === 'fail') process.exit(1);
    if (process.env.UPDATE_MODE === 'hang') setInterval(() => {}, 1000);
    else setTimeout(() => console.log(process.env.UPDATE_LATEST || '99.0.0'), Number(process.env.UPDATE_DELAY || 0));
  `,
  );
  fs.writeFileSync(
    driver,
    `
    import { checkForUpdates } from ${JSON.stringify(pathToFileURL(path.resolve(__dirname, "../../src/platform/version-check.ts")).href)};
    await checkForUpdates(process.env.UPDATE_CURRENT || '0.0.1');
  `,
  );
  const env: NodeJS.ProcessEnv = {
    ...fixtureProcessEnv(root),
    CI: "",
    NO_UPDATE_NOTIFIER: "",
    npm_execpath: entry,
    npm_node_execpath: process.execPath,
    npm_config_registry: "https://registry.invalid",
    UPDATE_PROBE: marker,
  };
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, process.platform === "win32" ? "npm.cmd" : "npm"),
    process.platform === "win32"
      ? `@echo used>"${pathMarker}"\r\n@"${process.execPath}" "${entry}" %*\r\n`
      : `#!${process.execPath}\nrequire("node:fs").appendFileSync(${JSON.stringify(pathMarker)}, "used"); require(${JSON.stringify(entry)});\n`,
    { mode: 0o755 },
  );
  env.PATH = bin + path.delimiter + (process.env.PATH ?? "");
  const state = path.join(env.XDG_STATE_HOME!, "superflow");
  const args = (cli: boolean, tail: string[]) => [
    "--import",
    createRequire(import.meta.url).resolve("tsx/esm"),
    cli ? path.resolve(__dirname, "../../src/app/cli.ts") : driver,
    ...tail,
  ];
  function run(
    overrides: NodeJS.ProcessEnv = {},
    cli = false,
    tail: string[] = [],
    node = process.execPath,
    cwd = root,
  ) {
    const started = Date.now();
    const result = spawnSync(node, args(cli, tail), {
      cwd,
      env: { ...env, ...overrides },
      encoding: "utf8",
      timeout: 10000,
    });
    expect(result.status, result.stderr || String(result.error ?? "")).toBe(0);
    return { ...result, elapsed: Date.now() - started };
  }
  function runAsync(overrides: NodeJS.ProcessEnv = {}) {
    const started = Date.now();
    return new Promise<{ elapsed: number; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(process.execPath, args(false, []), {
          cwd: root,
          env: { ...env, ...overrides },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0
            ? resolve({ elapsed: Date.now() - started, stderr })
            : reject(new Error(stderr)),
        );
      },
    );
  }
  const calls = () =>
    fs.existsSync(marker)
      ? fs
          .readFileSync(marker, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
  const files = () => (fs.existsSync(state) ? fs.readdirSync(state) : []);
  const cache = () =>
    path.join(state, files().find((file) => file.endsWith(".json"))!);
  return {
    root,
    marker,
    pathMarker,
    entry,
    env,
    state,
    run,
    runAsync,
    calls,
    files,
    cache,
  };
}

describe("CLI optional update process ownership", () => {
  it.each([
    ["NO_UPDATE_NOTIFIER", "1"],
    ["CI", "1"],
    ["CI", "true"],
  ] as const)("does no npm or state work with %s=%s", (key, value) => {
    const fixture = updateFixture();
    fixture.run({ [key]: value }, true);
    expect(fixture.calls()).toEqual([]);
    expect(fixture.files()).toEqual([]);
  });

  it.each([["--help"], ["--version"]])(
    "does no optional work before Commander exits for %s",
    (...args) => {
      const fixture = updateFixture();
      fixture.run({}, true, args);
      expect(fixture.calls()).toEqual([]);
      expect(fixture.files()).toEqual([]);
    },
  );

  it("uses the bound npm only once across three independent CLI lifecycles", () => {
    const fixture = updateFixture();
    for (let index = 0; index < 3; index++) fixture.run({}, true);
    expect(fixture.calls()).toEqual([["view", "@chenmk/superflow", "version"]]);
    expect(fixture.files()).toHaveLength(1);
    expect(fs.existsSync(fixture.pathMarker)).toBe(false);
    const stored = fs.readFileSync(fixture.cache(), "utf8");
    expect(stored).not.toContain(fixture.root);
    expect(stored).not.toContain("registry.invalid");
  });

  it("backs off failed and invalid responses across independent processes", () => {
    for (const overrides of [
      { UPDATE_MODE: "fail" },
      { UPDATE_LATEST: "not-a-version" },
    ]) {
      const fixture = updateFixture();
      fixture.run(overrides);
      fixture.run(overrides);
      expect(fixture.calls()).toHaveLength(1);
    }
  });

  it("recompares the cached registry version against the running CLI", () => {
    const fixture = updateFixture();
    expect(fixture.run({ UPDATE_CURRENT: "1.0.0" }).stderr).toContain("99.0.0");
    expect(fixture.run({ UPDATE_CURRENT: "99.0.0" }).stderr).toBe("");
    expect(fixture.run({ UPDATE_CURRENT: "100.0.0" }).stderr).toBe("");
    expect(fixture.calls()).toHaveLength(1);
  });

  it("invalidates on registry, npm entrypoint, prefix and npmrc changes", () => {
    const fixture = updateFixture();
    fixture.run();
    fixture.run({ npm_config_registry: "https://other.invalid" });
    fixture.run({ npm_config_registry: "https://other.invalid" });
    const otherEntry = path.join(fixture.root, "other-npm.cjs");
    fs.copyFileSync(fixture.entry, otherEntry);
    fixture.run({ npm_execpath: otherEntry });
    fixture.run({ npm_config_prefix: path.join(fixture.root, "prefix") });
    fs.writeFileSync(
      path.join(fixture.root, ".npmrc"),
      "registry=https://private.invalid\n",
    );
    fixture.run();
    expect(fixture.calls()).toHaveLength(5);
  });

  it("shares checks across cwd without config and separates real project configs", () => {
    const fixture = updateFixture();
    const left = path.join(fixture.root, "left");
    const right = path.join(fixture.root, "right");
    fs.mkdirSync(left);
    fs.mkdirSync(right);
    fixture.run({}, false, [], process.execPath, left);
    fixture.run({}, false, [], process.execPath, right);
    expect(fixture.calls()).toHaveLength(1);
    fs.writeFileSync(
      path.join(left, ".npmrc"),
      "registry=https://left.invalid\n",
    );
    fs.writeFileSync(
      path.join(right, ".npmrc"),
      "registry=https://right.invalid\n",
    );
    fixture.run({}, false, [], process.execPath, left);
    fixture.run({}, false, [], process.execPath, right);
    expect(fixture.calls()).toHaveLength(3);
  });

  it("invalidates when the bound Node or npm entry contents change", () => {
    const fixture = updateFixture();
    fixture.run();
    fs.appendFileSync(fixture.entry, "\n// npm entry replaced\n");
    fixture.run();
    const node = path.join(
      fixture.root,
      process.platform === "win32" ? "node.exe" : "node",
    );
    fs.copyFileSync(process.execPath, node, fs.constants.COPYFILE_FICLONE);
    fixture.run({ npm_node_execpath: node }, false, [], node);
    expect(fixture.calls()).toHaveLength(3);
  });

  it("uses separate cache identities for separate installations", () => {
    const fixture = updateFixture();
    fixture.run();
    const installation = path.join(fixture.root, "installation");
    fs.mkdirSync(path.join(installation, "src/platform"), { recursive: true });
    fs.mkdirSync(path.join(installation, "scripts"));
    for (const file of [
      "version-check.ts",
      "npm-runtime.ts",
      "process.ts",
      "assets.ts",
    ])
      fs.copyFileSync(
        path.resolve(__dirname, "../../src/platform", file),
        path.join(installation, "src/platform", file),
      );
    fs.copyFileSync(
      path.resolve(__dirname, "../../scripts/npm-runtime.cjs"),
      path.join(installation, "scripts/npm-runtime.cjs"),
    );
    fs.writeFileSync(
      path.join(installation, "package.json"),
      '{"name":"fixture","version":"1.0.0","type":"module"}',
    );
    fs.symlinkSync(
      path.resolve(__dirname, "../../node_modules"),
      path.join(installation, "node_modules"),
      "junction",
    );
    const driver = path.join(fixture.root, "check.mjs");
    fs.writeFileSync(
      driver,
      `import {checkForUpdates} from ${JSON.stringify(pathToFileURL(path.join(installation, "src/platform/version-check.ts")).href)}; await checkForUpdates('1.0.0');`,
    );
    fixture.run();
    fixture.run();
    expect(fixture.calls()).toHaveLength(2);
    expect(
      fixture.files().filter((file) => file.endsWith(".json")),
    ).toHaveLength(2);
  });

  it("recovers a known abandoned lock and preserves an unknown lock", () => {
    const fixture = updateFixture();
    fixture.run();
    const cache = fixture.cache();
    const record = JSON.parse(fs.readFileSync(cache, "utf8"));
    record.checkedAt = Date.now() - 25 * 60 * 60 * 1000;
    fs.writeFileSync(cache, JSON.stringify(record));
    const lock = cache + ".lock";
    fs.mkdirSync(lock);
    fs.writeFileSync(
      path.join(lock, "abandoned-owner.json"),
      JSON.stringify({
        schemaVersion: record.schemaVersion,
        token: "abandoned-owner",
        createdAt: Date.now() - 60000,
      }),
    );
    fixture.run();
    expect(fixture.calls()).toHaveLength(2);
    expect(fs.existsSync(lock)).toBe(false);
    fs.writeFileSync(lock, "user-owned lock");
    fs.writeFileSync(cache, JSON.stringify(record));
    fixture.run();
    expect(fixture.calls()).toHaveLength(2);
    expect(fs.readFileSync(lock, "utf8")).toBe("user-owned lock");
  });

  it("merges concurrent recovery of an abandoned lock", async () => {
    const fixture = updateFixture();
    fixture.run();
    const cache = fixture.cache();
    const record = JSON.parse(fs.readFileSync(cache, "utf8"));
    record.checkedAt = Date.now() - 25 * 60 * 60 * 1000;
    fs.writeFileSync(cache, JSON.stringify(record));
    const lock = cache + ".lock";
    fs.mkdirSync(lock);
    fs.writeFileSync(
      path.join(lock, "abandoned-owner.json"),
      JSON.stringify({
        schemaVersion: record.schemaVersion,
        token: "abandoned-owner",
        createdAt: Date.now() - 60000,
      }),
    );
    await Promise.all(
      Array.from({ length: 6 }, () =>
        fixture.runAsync({ UPDATE_DELAY: "500" }),
      ),
    );
    expect(fixture.calls()).toHaveLength(2);
    expect(fs.existsSync(lock)).toBe(false);
  });

  it("does not overwrite dangling symlinks or use unreadable oversized config", () => {
    const fixture = updateFixture();
    fixture.run();
    const cache = fixture.cache();
    fs.unlinkSync(cache);
    const missing = path.join(fixture.root, "missing-user-file");
    fs.symlinkSync(missing, cache);
    fixture.run();
    expect(fs.lstatSync(cache).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(missing)).toBe(false);
    fs.writeFileSync(path.join(fixture.root, ".npmrc"), "x".repeat(65537));
    fixture.run();
    expect(fixture.calls()).toHaveLength(2);
  });

  it("expires successful and failed checks and ignores hook attempt stamps", () => {
    const fixture = updateFixture();
    fs.mkdirSync(fixture.state, { recursive: true });
    fs.writeFileSync(
      path.join(fixture.state, "dependency-update-last.stamp"),
      String(Date.now()),
    );
    fixture.run();
    const record = JSON.parse(fs.readFileSync(fixture.cache(), "utf8"));
    record.checkedAt = Date.now() - 25 * 60 * 60 * 1000;
    fs.writeFileSync(fixture.cache(), JSON.stringify(record));
    fixture.run({ UPDATE_MODE: "fail" });
    const failed = JSON.parse(fs.readFileSync(fixture.cache(), "utf8"));
    failed.checkedAt = Date.now() - 6 * 60 * 1000;
    fs.writeFileSync(fixture.cache(), JSON.stringify(failed));
    fixture.run();
    expect(fixture.calls()).toHaveLength(3);
  });

  it.each(["{bad-json", '{"schemaVersion":"foreign.v1","note":"keep"}'])(
    "preserves unknown or corrupt cache without crashing: %s",
    (contents) => {
      const fixture = updateFixture();
      fixture.run();
      fs.writeFileSync(fixture.cache(), contents);
      fixture.run();
      expect(fs.readFileSync(fixture.cache(), "utf8")).toBe(contents);
      expect(fixture.calls()).toHaveLength(2);
    },
  );

  it("bounds a hung query, skips contending processes, and releases its lock", async () => {
    const fixture = updateFixture();
    const first = fixture.runAsync({ UPDATE_MODE: "hang" });
    for (let index = 0; index < 100 && fixture.calls().length === 0; index++)
      await delay(20);
    expect(fixture.calls()).toHaveLength(1);
    const second = await fixture.runAsync({ UPDATE_MODE: "hang" });
    expect(second.elapsed).toBeLessThan(1200);
    expect((await first).elapsed).toBeLessThan(3000);
    fixture.run();
    expect(fixture.calls()).toHaveLength(1);
    expect(fixture.files().filter((file) => file.endsWith(".lock"))).toEqual(
      [],
    );
  }, 10000);

  it("merges parallel successful queries from independent processes", async () => {
    const fixture = updateFixture();
    await Promise.all(
      Array.from({ length: 3 }, () =>
        fixture.runAsync({ UPDATE_DELAY: "700" }),
      ),
    );
    expect(fixture.calls()).toHaveLength(1);
  });
});
