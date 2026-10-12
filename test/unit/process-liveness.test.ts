import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isProcessAlive,
  readProcessIdentity,
} from "../../src/platform/process-liveness.js";
import { acquireManagedLock } from "../../src/domains/managed-work/lock.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("process liveness", () => {
  it("reads its own verifiable process creation and command identity", () => {
    const identity = readProcessIdentity(process.pid);
    expect(identity?.startedAt).toBeTruthy();
    expect(identity?.command).toBeTruthy();
    expect(readProcessIdentity(process.pid)).toEqual(identity);
  });

  it("normalizes Unix ps identity and fails closed on probe errors", () => {
    const execute = vi
      .fn()
      .mockReturnValue(
        "Mon Oct 12 16:00:00 2026 node cli.js managed-service\n",
      );
    expect(readProcessIdentity(123, { platform: "darwin", execute })).toEqual({
      startedAt: "Mon Oct 12 16:00:00 2026",
      command: "node cli.js managed-service",
    });
    execute.mockImplementation(() => {
      throw new Error("access denied");
    });
    expect(readProcessIdentity(123, { platform: "linux", execute })).toBeNull();
  });

  it("reads Windows process creation time and command without a shell", () => {
    const execute = vi
      .fn()
      .mockReturnValue(
        JSON.stringify({
          startedAt: "2026-10-12T08:00:00.0000000Z",
          command: '"node.exe" cli.js managed-service',
        }),
      );
    expect(readProcessIdentity(123, { platform: "win32", execute })).toEqual({
      startedAt: "2026-10-12T08:00:00.0000000Z",
      command: '"node.exe" cli.js managed-service',
    });
    expect(execute.mock.calls[0][0]).toBe("powershell.exe");
    expect(execute.mock.calls[0][2]).toMatchObject({ shell: false });
    execute.mockReturnValue('{"startedAt":"now","command":null}');
    expect(readProcessIdentity(123, { platform: "win32", execute })).toBeNull();
    expect(readProcessIdentity(-1, { execute })).toBeNull();
  });
  it("treats EPERM as an existing process", () => {
    const error = Object.assign(new Error("not permitted"), { code: "EPERM" });
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw error;
    });

    expect(isProcessAlive(123)).toBe(true);
  });

  it("treats ESRCH as a missing process", () => {
    const error = Object.assign(new Error("missing"), { code: "ESRCH" });
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw error;
    });

    expect(isProcessAlive(123)).toBe(false);
  });

  it("keeps an active lock when process probing returns EPERM", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-lock-"));
    const lockFile = path.join(root, "run.lock");
    fs.writeFileSync(
      lockFile,
      JSON.stringify({ pid: 123, token: "owner", createdAt: "now" }),
    );
    const error = Object.assign(new Error("not permitted"), { code: "EPERM" });
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw error;
    });

    expect(() => acquireManagedLock(lockFile, "other")).toThrow("正在由进程");
    expect(fs.existsSync(lockFile)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
