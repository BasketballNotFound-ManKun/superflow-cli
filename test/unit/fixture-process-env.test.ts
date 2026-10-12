import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  fixtureProcessEnv,
  withFixtureProcessEnv,
} from "../helpers/fixture-process-env.js";

describe("fixture user directory isolation", () => {
  it("isolates Windows user paths and Git overrides without mutating the parent", () => {
    const parent = Object.freeze({
      HOME: "host-home",
      USERPROFILE: "host-profile",
      APPDATA: "host-roaming",
      LOCALAPPDATA: "host-local",
      GIT_DIR: "foreign.git",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      GIT_CONFIG_VALUE_0: "host-hooks",
      SUPERFLOW_PROJECT_SCOPE: "project",
      SUPERFLOW_USER_ENV: "retained",
      SUP_FLOW_TASK_ID: "fixture-task",
      TMP: "host-tmp",
      TEMP: "host-temp",
    });
    const home = "C:/fixture user/home";
    const env = fixtureProcessEnv(home, parent);
    expect(env.HOME).toBe(home);
    expect(env.USERPROFILE).toBe(home);
    expect(env.APPDATA).toBe(path.join(home, "AppData", "Roaming"));
    expect(env.LOCALAPPDATA).toBe(path.join(home, "AppData", "Local"));
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.GIT_CONFIG_COUNT).toBeUndefined();
    expect(env.GIT_CONFIG_KEY_0).toBeUndefined();
    expect(env.GIT_CONFIG_VALUE_0).toBeUndefined();
    expect(env.GIT_CONFIG_GLOBAL).toBe(os.devNull);
    expect(env.SUPERFLOW_PROJECT_SCOPE).toBe(parent.SUPERFLOW_PROJECT_SCOPE);
    expect(env.SUPERFLOW_USER_ENV).toBe(parent.SUPERFLOW_USER_ENV);
    expect(env.SUP_FLOW_TASK_ID).toBe(parent.SUP_FLOW_TASK_ID);
    expect(env.TMP).toBe(parent.TMP);
    expect(env.TEMP).toBe(parent.TEMP);
    expect(parent.USERPROFILE).toBe("host-profile");
  });

  it("restores the exact environment after an in-process failure", () => {
    const identity = process.env;
    vi.stubEnv("USERPROFILE", "outer-profile");
    const before = { ...process.env };
    try {
      expect(() =>
        withFixtureProcessEnv(fixtureProcessEnv("fixture home"), () => {
          expect(process.env.USERPROFILE).toBe("fixture home");
          expect(process.env.APPDATA).toBe(
            path.join("fixture home", "AppData", "Roaming"),
          );
          throw new Error("fixture failure");
        }),
      ).toThrow("fixture failure");
      expect(process.env).toBe(identity);
      expect({ ...process.env }).toEqual(before);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("writes child configuration only below an anonymous fixture home", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow anonymous "));
    const home = path.join(root, "fixture home");
    const host = path.join(root, "host home");
    fs.mkdirSync(host);
    fs.writeFileSync(path.join(host, "sentinel"), "unchanged");
    try {
      const env = fixtureProcessEnv(home, {
        ...process.env,
        HOME: host,
        USERPROFILE: host,
        APPDATA: host,
        LOCALAPPDATA: host,
      });
      const child = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `
        import fs from 'node:fs';
        import os from 'node:os';
        import path from 'node:path';
        const dirs = [os.homedir(), process.env.USERPROFILE,
          process.env.APPDATA, process.env.LOCALAPPDATA, process.env.XDG_CONFIG_HOME];
        for (const dir of dirs) {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'fixture-config.json'), '{}');
        }
        console.log(JSON.stringify(dirs));
      `,
        ],
        { env, encoding: "utf8" },
      );
      expect(child.status, child.stderr).toBe(0);
      const dirs = JSON.parse(child.stdout) as string[];
      expect(
        dirs.every(
          (dir) => dir === home || dir.startsWith(`${home}${path.sep}`),
        ),
      ).toBe(true);
      expect(fs.readdirSync(host)).toEqual(["sentinel"]);
      expect(fs.readFileSync(path.join(host, "sentinel"), "utf8")).toBe(
        "unchanged",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
