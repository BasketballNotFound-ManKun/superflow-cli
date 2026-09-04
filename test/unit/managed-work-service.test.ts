import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  runManagedService,
  runtimeFingerprintForCli,
} from "../../src/domains/managed-work/service.js";
import {
  loadRegistry,
  saveRegistry,
  createManagedTaskFiles,
} from "../../src/domains/managed-work/storage.js";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";

describe("managed work service", () => {
  it("changes the runtime fingerprint when the CLI bundle changes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-service-cli-"));
    const cli = path.join(root, "cli.js");
    fs.writeFileSync(cli, "console.log('v1');\n");
    const first = runtimeFingerprintForCli(cli);

    fs.writeFileSync(cli, "console.log('v2');\n");

    expect(runtimeFingerprintForCli(cli)).not.toBe(first);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("changes the runtime fingerprint when an imported runtime file changes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-service-dist-"));
    const cli = path.join(root, "dist", "app", "cli.js");
    const runner = path.join(root, "dist", "domains", "runner.js");
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.mkdirSync(path.dirname(runner), { recursive: true });
    fs.writeFileSync(cli, "import '../domains/runner.js';\n");
    fs.writeFileSync(runner, "export const version = 1;\n");
    const first = runtimeFingerprintForCli(cli);

    fs.writeFileSync(runner, "export const version = 2;\n");

    expect(runtimeFingerprintForCli(cli)).not.toBe(first);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("ignores unrelated JavaScript files outside the runtime dependency graph", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-service-scope-"));
    const cli = path.join(root, "dist", "app", "cli.js");
    const unrelated = path.join(root, "dist", "domains", "evaluation.js");
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.mkdirSync(path.dirname(unrelated), { recursive: true });
    fs.writeFileSync(cli, "console.log('stable');\n");
    fs.writeFileSync(unrelated, "export const version = 1;\n");
    const first = runtimeFingerprintForCli(cli);

    fs.writeFileSync(unrelated, "export const version = 2;\n");

    expect(runtimeFingerprintForCli(cli)).toBe(first);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("follows a global bin symlink to fingerprint the real runtime", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-service-link-"));
    const cli = path.join(root, "lib", "dist", "app", "cli.js");
    const runner = path.join(root, "lib", "runner.js");
    const link = path.join(root, "bin", "superflow");
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.writeFileSync(cli, "import '../../runner.js';\n");
    fs.writeFileSync(runner, "export const version = 1;\n");
    fs.symlinkSync(path.relative(path.dirname(link), cli), link);
    const first = runtimeFingerprintForCli(link);

    fs.writeFileSync(runner, "export const version = 2;\n");

    expect(runtimeFingerprintForCli(link)).not.toBe(first);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("isolates a broken task and records evidence instead of crashing", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-service-"));
    const home = path.join(root, "home");
    const env = {
      ...process.env,
      SUPERFLOW_HOME: home,
      SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1",
    };
    saveRegistry(
      {
        schemaVersion: 1,
        tasks: [
          {
            taskId: "task-broken",
            projectRoot: root,
            status: "queued",
            profile: "quick",
            activeRunId: "run-missing",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            servicePid: null,
          },
        ],
      },
      env,
    );

    await runManagedService({ once: true }, env);

    expect(loadRegistry(env).tasks[0].status).toBe("waiting_for_human");
    const errors = fs.readFileSync(
      path.join(home, "managed", "service-errors.jsonl"),
      "utf-8",
    );
    expect(errors).toContain("task-broken");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("never lets the background service pick up a human-directed delivery", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-service-human-"));
    const home = path.join(root, "home");
    const env = {
      ...process.env,
      SUPERFLOW_HOME: home,
      SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1",
    };
    const contract = createManagedTaskContract({
      request: "人工执行后提交结构化交付",
      projectRoot: root,
      executionMode: "human_directed",
    });
    createManagedTaskFiles(contract, initManagedRunState(contract), env);

    await runManagedService({ once: true }, env);

    expect(loadRegistry(env).tasks[0].status).toBe("waiting_for_human");
    fs.rmSync(root, { recursive: true, force: true });
  });
});
