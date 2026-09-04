import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { resolveExecutableShim } from "../../src/platform/executable.js";
import {
  processTreeStopPlan,
  stopProcessTree,
} from "../../src/platform/process-tree.js";

describe("portable Agent process launch", () => {
  it("resolves a Windows command shim from PATH and PATHEXT", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-shim-"));
    const shim = path.join(root, "claude.CMD");
    fs.writeFileSync(shim, "@echo off\r\n");
    expect(
      resolveExecutableShim(
        "claude",
        { Path: root, PATHEXT: ".EXE;.CMD" },
        "win32",
      ),
    ).toBe(shim);
    expect(resolveExecutableShim("claude", { PATH: root }, "linux")).toBe(
      "claude",
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("builds and executes a whole-tree Windows stop", () => {
    expect(processTreeStopPlan(42, "win32")).toEqual({
      kind: "windows_tree",
      pid: 42,
      command: "taskkill.exe",
      args: ["/PID", "42", "/T", "/F"],
    });
    const taskkill = vi.fn(() => ({ status: 0 })) as never;
    const kill = vi.fn() as never;
    stopProcessTree(42, { platform: "win32", taskkill, kill });
    expect(taskkill).toHaveBeenCalledWith(
      "taskkill.exe",
      ["/PID", "42", "/T", "/F"],
      expect.objectContaining({ shell: false, windowsHide: true }),
    );
    expect(kill).not.toHaveBeenCalled();
  });

  it("uses the detached process group on Unix", () => {
    const kill = vi.fn() as never;
    stopProcessTree(42, { platform: "linux", kill });
    expect(kill).toHaveBeenCalledWith(-42, "SIGTERM");
  });
});
