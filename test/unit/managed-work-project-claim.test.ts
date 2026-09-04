import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  classifyManagedFailure,
  ManagedEnvironmentPreparationError,
} from "../../src/domains/managed-work/failure.js";
import { acquireManagedProjectClaim } from "../../src/domains/managed-work/lock.js";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";

describe("managed project claim", () => {
  it("records an auditable owner and only releases its own claim", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-claim-"));
    const file = path.join(root, ".superflow", "managed-project.lock");
    const claim = await acquireManagedProjectClaim(file, {
      taskId: "task-a",
      projectRoot: root,
      bindingFingerprint: "binding-a",
      token: "token-a",
    });

    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toMatchObject({
      taskId: "task-a",
      projectRoot: fs.realpathSync(root),
      bindingFingerprint: "binding-a",
    });
    claim.release();
    expect(fs.existsSync(file)).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rejects an unverifiable claim instead of deleting it", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-claim-"));
    const file = path.join(root, ".superflow", "managed-project.lock");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ pid: 999999, token: "old" }));

    await expect(
      acquireManagedProjectClaim(file, {
        taskId: "task-a",
        projectRoot: root,
        bindingFingerprint: "binding-a",
        token: "token-a",
        waitMilliseconds: 1,
      }),
    ).rejects.toMatchObject({ reason: "workspace_ownership_unverified" });
    expect(fs.existsSync(file)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("waits only to the configured bound for a live owner", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-claim-"));
    const file = path.join(root, ".superflow", "managed-project.lock");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        pid: process.pid,
        token: "live",
        taskId: "task-live",
        projectRoot: fs.realpathSync(root),
        bindingFingerprint: "binding-a",
      }),
    );

    await expect(
      acquireManagedProjectClaim(file, {
        taskId: "task-a",
        projectRoot: root,
        bindingFingerprint: "binding-a",
        token: "token-a",
        waitMilliseconds: 1,
      }),
    ).rejects.toMatchObject({ reason: "workspace_busy_timeout" });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("classifies only a typed preparation failure as local environment failure", () => {
    const contract = createManagedTaskContract({
      request: "验证本地失败分类",
      projectRoot: ".",
    });
    expect(
      classifyManagedFailure(
        contract,
        new ManagedEnvironmentPreparationError("ENOSPC: no space left"),
      ),
    ).toMatchObject({ reason: "environment_prepare_failed" });
    expect(
      classifyManagedFailure(contract, new Error("executor output: EACCES")),
    ).toBeNull();
    expect(classifyManagedFailure(contract, new Error("provider 429"))).toBeNull();
  });
});
