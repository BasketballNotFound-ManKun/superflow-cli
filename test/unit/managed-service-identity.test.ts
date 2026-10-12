import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureManagedService,
  runtimeFingerprintForCli,
} from "../../src/domains/managed-work/service.js";
import { managedServicePath } from "../../src/domains/managed-work/paths.js";
const probes = vi.hoisted(() => ({
  alive: vi.fn(),
  identity: vi.fn(),
  stop: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("../../src/platform/process-liveness.js", () => ({
  isProcessAlive: probes.alive,
  readProcessIdentity: probes.identity,
}));
vi.mock("../../src/platform/process-tree.js", () => ({
  stopProcessTree: probes.stop,
}));
vi.mock("cross-spawn", () => ({ default: probes.spawn }));
const roots: string[] = [];
afterEach(() => {
  vi.resetAllMocks();
  roots
    .splice(0)
    .forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});
function fixture(identity?: { startedAt: string; command: string }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "service-identity-"));
  roots.push(root);
  const cli = path.join(root, "cli.js");
  fs.writeFileSync(cli, "// fixture\n");
  const env = { ...process.env, SUPERFLOW_HOME: path.join(root, "home") };
  fs.mkdirSync(path.dirname(managedServicePath(env)), { recursive: true });
  fs.writeFileSync(
    managedServicePath(env),
    JSON.stringify({
      pid: 123,
      cliPath: cli,
      startedAt: "recorded",
      runtimeFingerprint: runtimeFingerprintForCli(cli),
      processIdentity: identity,
      readyAt: "ready",
    }),
  );
  probes.alive.mockReturnValue(true);
  return { root, cli, env };
}
const owner = {
  startedAt: "process-creation-A",
  command: "node cli.js managed-service",
};
describe("managed service process identity", () => {
  it("refuses a live legacy PID without identity instead of reusing it", () => {
    const f = fixture();
    probes.identity.mockReturnValue(owner);
    expect(() => ensureManagedService(f.cli, f.env)).toThrow(
      /进程身份|process identity/,
    );
    expect(probes.stop).not.toHaveBeenCalled();
    expect(probes.spawn).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { ...owner, startedAt: "reused-PID" },
    { ...owner, command: "unrelated process" },
  ])("refuses unverifiable or reused PID %s without stopping it", (live) => {
    const f = fixture(owner);
    probes.identity.mockReturnValue(live);
    expect(() => ensureManagedService(f.cli, f.env)).toThrow(
      /进程身份|process identity/,
    );
    expect(probes.stop).not.toHaveBeenCalled();
    expect(probes.spawn).not.toHaveBeenCalled();
  });
  it("reuses a live service only when OS identity still matches", () => {
    const f = fixture(owner);
    probes.identity.mockReturnValue(owner);
    expect(ensureManagedService(f.cli, f.env).pid).toBe(123);
    expect(probes.stop).not.toHaveBeenCalled();
    expect(probes.spawn).not.toHaveBeenCalled();
  });
  it("refuses an authorized live PID that never confirmed readiness", () => {
    const f = fixture(owner);
    const file = managedServicePath(f.env);
    const current = JSON.parse(fs.readFileSync(file, "utf8"));
    delete current.readyAt;
    current.startupToken = "parent-authorization-only";
    fs.writeFileSync(file, JSON.stringify(current));
    probes.identity.mockReturnValue(owner);
    expect(() => ensureManagedService(f.cli, f.env)).toThrow(/启动握手/);
    expect(probes.spawn).not.toHaveBeenCalled();
    expect(probes.stop).not.toHaveBeenCalled();
  });
  it("rejects readiness from another startup token and stops only its own child", () => {
    const f = fixture(owner);
    probes.alive.mockReturnValue(false);
    const kill = vi.fn();
    probes.spawn.mockReturnValue({ pid: 456, unref: vi.fn(), kill });
    let calls = 0;
    probes.identity.mockImplementation(() => {
      calls++;
      if (calls === 2) {
        const file = managedServicePath(f.env);
        const current = JSON.parse(fs.readFileSync(file, "utf8"));
        fs.writeFileSync(
          file,
          JSON.stringify({
            ...current,
            readyAt: "ready",
            startupToken: "wrong-token",
          }),
        );
      }
      return calls > 2 ? null : owner;
    });
    expect(() => ensureManagedService(f.cli, f.env)).toThrow(/启动握手/);
    expect(kill).toHaveBeenCalledWith("SIGTERM");
    expect(probes.stop).not.toHaveBeenCalled();
  });
  it("rechecks identity immediately before stopping an outdated service", () => {
    const f = fixture(owner);
    fs.writeFileSync(f.cli, "// upgraded\n");
    probes.identity
      .mockReturnValueOnce(owner)
      .mockReturnValue({ ...owner, startedAt: "reused-PID" });
    expect(() => ensureManagedService(f.cli, f.env)).toThrow(
      /进程身份|process identity/,
    );
    expect(probes.stop).not.toHaveBeenCalled();
    expect(probes.spawn).not.toHaveBeenCalled();
  });
  it("captures the newly spawned process identity before returning a service", () => {
    const f = fixture(owner);
    probes.alive.mockReturnValue(false);
    probes.spawn.mockReturnValue({ pid: 456, unref: vi.fn() });
    const nextOwner = { ...owner, startedAt: "new-service" };
    probes.identity.mockImplementation((pid) => {
      if (pid === 456) {
        const file = managedServicePath(f.env);
        const current = JSON.parse(fs.readFileSync(file, "utf8"));
        if (current.pid === 456)
          fs.writeFileSync(
            file,
            JSON.stringify({ ...current, readyAt: "child-ready" }),
          );
      }
      return nextOwner;
    });
    expect(ensureManagedService(f.cli, f.env)).toMatchObject({
      pid: 456,
      processIdentity: nextOwner,
    });
    expect(probes.stop).not.toHaveBeenCalled();
  });
  it("keeps an unverifiable startup PID so a retry cannot spawn in parallel", () => {
    const f = fixture(owner);
    probes.alive.mockReturnValueOnce(false).mockReturnValue(true);
    const kill = vi.fn();
    probes.spawn.mockReturnValue({ pid: 456, unref: vi.fn(), kill });
    probes.identity.mockReturnValue(null);
    expect(() => ensureManagedService(f.cli, f.env)).toThrow(/进程身份/);
    expect(
      JSON.parse(fs.readFileSync(managedServicePath(f.env), "utf8")).pid,
    ).toBe(456);
    expect(() => ensureManagedService(f.cli, f.env)).toThrow(/进程身份/);
    expect(probes.spawn).toHaveBeenCalledTimes(1);
    expect(probes.stop).not.toHaveBeenCalled();
    expect(kill).toHaveBeenCalledWith("SIGTERM");
  });
  it("stops a verified outdated owner and captures its replacement", () => {
    const f = fixture(owner);
    fs.writeFileSync(f.cli, "// upgraded\n");
    probes.alive.mockReturnValueOnce(true).mockReturnValue(false);
    probes.identity.mockReturnValue(owner);
    probes.identity.mockImplementation((pid) => {
      const file = managedServicePath(f.env);
      const current = JSON.parse(fs.readFileSync(file, "utf8"));
      if (pid === 456 && current.pid === 456)
        fs.writeFileSync(
          file,
          JSON.stringify({ ...current, readyAt: "child-ready" }),
        );
      return owner;
    });
    probes.spawn.mockReturnValue({ pid: 456, unref: vi.fn() });
    expect(ensureManagedService(f.cli, f.env).pid).toBe(456);
    expect(probes.stop).toHaveBeenCalledTimes(1);
    expect(probes.stop).toHaveBeenCalledWith(123);
  });
});
