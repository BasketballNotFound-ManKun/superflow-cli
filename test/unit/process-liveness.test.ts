import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isProcessAlive } from "../../src/platform/process-liveness.js";
import { acquireManagedLock } from "../../src/domains/managed-work/lock.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("process liveness", () => {
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
