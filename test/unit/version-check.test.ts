import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";
import { describe, expect, it } from "vitest";
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

describe("CLI optional update process ownership", () => {
  async function probe(
    disabledBy?: "NO_UPDATE_NOTIFIER" | "CI",
    value = "1",
    args: string[] = [],
  ) {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow update probe "),
    );
    try {
      const bin = path.join(root, "bin");
      fs.mkdirSync(bin);
      const marker = path.join(root, "npm-view.txt");
      const shim = path.join(
        bin,
        process.platform === "win32" ? "npm.cmd" : "npm",
      );
      fs.writeFileSync(
        shim,
        process.platform === "win32"
          ? '@echo off\r\n@echo %*> "%SUPERFLOW_UPDATE_PROBE%"\r\n@echo 0.0.0\r\n'
          : '#!/bin/sh\nprintf "%s\\n" "$*" > "$SUPERFLOW_UPDATE_PROBE"\nprintf "0.0.0\\n"\n',
        { mode: 0o755 },
      );
      const env = {
        ...fixtureProcessEnv(root),
        PATH: bin + path.delimiter + (process.env.PATH ?? ""),
        CI: "",
        NO_UPDATE_NOTIFIER: "",
        SUPERFLOW_UPDATE_PROBE: marker,
      };
      if (disabledBy) env[disabledBy] = value;
      const cli = path.resolve(__dirname, "../../src/app/cli.ts");
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          createRequire(import.meta.url).resolve("tsx/esm"),
          cli,
          ...args,
        ],
        { env, encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
      // The fixture command writes once and exits immediately; observe children
      // even when Commander exits before the optional check has completed.
      await delay(100);
      return fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : "";
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  it.each([
    ["NO_UPDATE_NOTIFIER", "1"],
    ["CI", "1"],
    ["CI", "true"],
  ] as const)(
    "does not spawn npm update work with %s=%s",
    async (key, value) => {
      expect(await probe(key, value)).toBe("");
    },
  );
  it.each([["--help"], ["--version"]])(
    "does not start optional npm work before Commander exits for %s",
    async (...args) => {
      expect(await probe(undefined, "1", args)).toBe("");
    },
  );
  it("keeps optional npm version checks for ordinary interactive use", async () => {
    expect(await probe()).toContain("view @chenmk/superflow version");
  });
});
