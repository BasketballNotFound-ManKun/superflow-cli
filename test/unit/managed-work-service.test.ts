import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  runManagedService,
  runtimeFingerprintForCli,
  ensureManagedService,
} from "../../src/domains/managed-work/service.js";
import { readProcessIdentity } from "../../src/platform/process-liveness.js";
import {
  loadRegistry,
  saveRegistry,
  createManagedTaskFiles,
} from "../../src/domains/managed-work/storage.js";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import { startManagedTaskFromHost } from "../../src/domains/managed-work/control.js";
import { isProcessAlive } from "../../src/platform/process-liveness.js";
import { stopProcessTree } from "../../src/platform/process-tree.js";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";

async function stopFixtureService(root: string) {
  const file = path.join(root, "home/managed/service.json");
  if (fs.existsSync(file)) {
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    const identity = readProcessIdentity(state.pid);
    if (
      identity &&
      JSON.stringify(identity) === JSON.stringify(state.processIdentity)
    )
      stopProcessTree(state.pid);
    for (let i = 0; i < 100 && isProcessAlive(state.pid); i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
  }
  fs.rmSync(root, { recursive: true, force: true });
}

function startupFixture(broken: boolean) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-service-ready-"));
  const cli = path.join(root, "cli.mjs");
  const env = {
    ...fixtureProcessEnv(root),
    SUPERFLOW_HOME: path.join(root, "home"),
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import tsx`,
  };
  const service = pathToFileURL(
    path.resolve("src/domains/managed-work/service.ts"),
  ).href;
  fs.writeFileSync(
    cli,
    broken
      ? "setTimeout(()=>process.exit(17),200);\n"
      : `import { runManagedService } from ${JSON.stringify(service)}; await runManagedService();\n`,
  );
  return { root, cli, env };
}

describe("managed work service", () => {
  it("starts independent workspaces together and awaits the whole once batch", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-parallel-"));
    const env = { ...process.env, SUPERFLOW_HOME: path.join(root, "home") };
    const started: string[] = [];
    const releases: Array<() => void> = [];
    try {
      for (const name of ["one", "two"]) {
        const projectRoot = path.join(root, name);
        fs.mkdirSync(projectRoot);
        const task = createManagedTaskContract({
          request: "fixture",
          projectRoot,
        });
        createManagedTaskFiles(task, initManagedRunState(task), env);
      }
      let finished = false;
      const service = runManagedService({ once: true }, env, {
        runTask: async (_root, taskId) => {
          started.push(taskId);
          await new Promise<void>((resolve) => releases.push(resolve));
          if (taskId === started[0])
            throw new Error("isolated fixture failure");
          const registry = loadRegistry(env);
          registry.tasks.find((entry) => entry.taskId === taskId)!.status =
            "completed";
          saveRegistry(registry, env);
          return undefined as never;
        },
      }).then(() => {
        finished = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(started).toHaveLength(2);
      expect(finished).toBe(false);
      releases[0]();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(finished).toBe(false);
      releases[1]();
      await service;
      expect(loadRegistry(env).tasks.map((item) => item.status)).toEqual([
        "waiting_for_human",
        "completed",
      ]);
    } finally {
      releases.forEach((release) => release());
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(["nested", "symlink", "related", "host-review"])(
    "reserves overlapping workspaces: %s",
    async (kind) => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "managed-reservation-"),
      );
      const env = { ...process.env, SUPERFLOW_HOME: path.join(root, "home") };
      try {
        const firstRoot = path.join(root, "workspace");
        fs.mkdirSync(firstRoot);
        let secondRoot = path.join(firstRoot, "nested");
        if (kind === "symlink") {
          secondRoot = path.join(root, "alias");
          fs.symlinkSync(firstRoot, secondRoot);
        } else fs.mkdirSync(secondRoot);
        if (kind === "related") {
          secondRoot = path.join(root, "independent");
          fs.mkdirSync(secondRoot);
        }
        for (const projectRoot of [firstRoot, secondRoot]) {
          const task = createManagedTaskContract({
            request: "fixture",
            projectRoot,
          });
          if (kind === "related" && projectRoot === firstRoot)
            task.relatedProjectRoots = [secondRoot];
          createManagedTaskFiles(task, initManagedRunState(task), env);
        }
        if (kind === "host-review") {
          const registry = loadRegistry(env);
          registry.tasks[0].status = "waiting_for_host_review";
          saveRegistry(registry, env);
        }
        const started: string[] = [];
        await runManagedService({ once: true }, env, {
          runTask: async (_root, taskId) => {
            started.push(taskId);
            return undefined as never;
          },
        });
        expect(started).toHaveLength(kind === "host-review" ? 0 : 1);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it.each([
    "local_delivery_ready",
    "release_ready",
    "environment_validation_blocked",
    "awaiting_git_approval",
    "missing-stopped",
    "missing-running",
    "host-review",
    "paused",
  ])(
    "allows new work only after the previous workspace owner releases: %s",
    async (status) => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "managed-owner-release-"),
      );
      const env = {
        ...process.env,
        SUPERFLOW_HOME: path.join(root, "home"),
        SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1",
      };
      try {
        for (const name of ["previous", "next"]) {
          const contract = createManagedTaskContract({
            request: name,
            projectRoot: root,
          });
          createManagedTaskFiles(contract, initManagedRunState(contract), env);
        }
        const registry = loadRegistry(env);
        registry.tasks[0].status = (
          status === "missing-stopped"
            ? "waiting_for_human"
            : status === "missing-running"
              ? "running"
              : status === "host-review"
                ? "waiting_for_host_review"
                : status
        ) as (typeof registry.tasks)[0]["status"];
        saveRegistry(registry, env);
        if (status.startsWith("missing-"))
          fs.rmSync(
            path.join(root, ".superflow/tasks", registry.tasks[0].taskId),
            { recursive: true },
          );
        const started: string[] = [];
        await runManagedService({ once: true }, env, {
          runTask: async (_root, taskId) => {
            started.push(taskId);
            return undefined as never;
          },
        });
        expect(started).toEqual(
          ["missing-running", "host-review", "paused"].includes(status)
            ? []
            : [registry.tasks[1].taskId],
        );
        if (status === "missing-stopped")
          expect(
            fs.readFileSync(
              path.join(root, "home/managed/service-errors.jsonl"),
              "utf8",
            ),
          ).toContain(registry.tasks[0].taskId);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("releases its service lock when ready-state persistence fails", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "managed-ready-write-failure-"),
    );
    const env = { ...process.env, SUPERFLOW_HOME: root };
    try {
      fs.mkdirSync(path.join(root, "managed/service.json"), {
        recursive: true,
      });
      await expect(runManagedService({ once: true }, env)).rejects.toThrow();
      expect(fs.existsSync(path.join(root, "managed/service.lock"))).toBe(
        false,
      );
      expect(loadRegistry(env).tasks).toHaveLength(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it("times out an owned live child that never confirms startup", async () => {
    const f = startupFixture(true);
    fs.writeFileSync(f.cli, "setInterval(()=>{},1000);\n");
    try {
      expect(() => ensureManagedService(f.cli, f.env)).toThrow(
        /启动握手|startup handshake/,
      );
      const state = JSON.parse(
        fs.readFileSync(path.join(f.root, "home/managed/service.json"), "utf8"),
      );
      expect(state.readyAt).toBeUndefined();
      expect(loadRegistry(f.env).tasks).toHaveLength(0);
    } finally {
      await stopFixtureService(f.root);
    }
  }, 10000);
  it("rejects a child that exits before confirming readiness without creating a task", async () => {
    const f = startupFixture(true);
    try {
      expect(() =>
        startManagedTaskFromHost(
          {
            request: "更新简单函数并执行受影响验证",
            projectRoot: f.root,
            profile: "quick",
            supervisorAgent: "codex",
            executorAgent: "claude",
            executorModel: "fixture",
            executorReasoningEffort: "low",
          },
          { env: f.env, cliPath: f.cli, assertManagedAgentPair: () => {} },
        ),
      ).toThrow(/启动握手|startup handshake/);
      expect(loadRegistry(f.env).tasks).toHaveLength(0);
      expect(fs.existsSync(path.join(f.root, ".superflow/tasks"))).toBe(false);
    } finally {
      await stopFixtureService(f.root);
    }
  });
  it("rejects a child whose real service lock is held by another live owner", async () => {
    const f = startupFixture(false);
    try {
      fs.mkdirSync(path.join(f.root, "home/managed"), { recursive: true });
      const lock = path.join(f.root, "home/managed/service.lock");
      fs.writeFileSync(
        lock,
        JSON.stringify({
          pid: process.pid,
          token: "other-owner",
          createdAt: "now",
        }),
      );
      expect(() => ensureManagedService(f.cli, f.env)).toThrow(
        /启动握手|startup handshake/,
      );
      expect(JSON.parse(fs.readFileSync(lock, "utf8")).token).toBe(
        "other-owner",
      );
      expect(loadRegistry(f.env).tasks).toHaveLength(0);
    } finally {
      await stopFixtureService(f.root);
    }
  });
  it("returns only after a real child owns its lock and confirms matching readiness", async () => {
    const f = startupFixture(false);
    try {
      const state = ensureManagedService(f.cli, f.env);
      expect(state.readyAt).toBeTruthy();
      const ready = JSON.parse(
        fs.readFileSync(path.join(f.root, "home/managed/service.json"), "utf8"),
      );
      expect(ready.startupToken).toBe(state.startupToken);
      expect(ready.pid).toBe(state.pid);
      const lock = JSON.parse(
        fs.readFileSync(path.join(f.root, "home/managed/service.lock"), "utf8"),
      );
      expect(lock.pid).toBe(state.pid);
      expect(isProcessAlive(state.pid)).toBe(true);
    } finally {
      await stopFixtureService(f.root);
    }
  });
  it("reuses an isolated real Node process with the recorded OS identity", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "managed-real-identity-"),
    );
    const env = { ...process.env, SUPERFLOW_HOME: root };
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      stdio: "ignore",
    });
    try {
      await once(child, "spawn");
      const identity = readProcessIdentity(child.pid!);
      expect(identity).not.toBeNull();
      const cli = path.join(root, "fixture-cli.js");
      fs.writeFileSync(cli, "// isolated service fixture\n");
      fs.mkdirSync(path.join(root, "managed"));
      fs.writeFileSync(
        path.join(root, "managed/service.json"),
        JSON.stringify({
          pid: child.pid,
          cliPath: cli,
          startedAt: "recorded",
          runtimeFingerprint: runtimeFingerprintForCli(cli),
          processIdentity: identity,
          readyAt: "fixture-ready",
        }),
      );
      expect(ensureManagedService(cli, env).pid).toBe(child.pid);
      expect(readProcessIdentity(child.pid!)).toEqual(identity);
    } finally {
      const exit = once(child, "exit");
      child.kill("SIGTERM");
      await exit;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
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
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "managed-service-dist-"),
    );
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
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "managed-service-scope-"),
    );
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
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "managed-service-link-"),
    );
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
    const service = JSON.parse(
      fs.readFileSync(path.join(home, "managed", "service.json"), "utf8"),
    );
    expect(service.processIdentity.startedAt).toBeTruthy();
    expect(service.processIdentity.command).toBeTruthy();
    const errors = fs.readFileSync(
      path.join(home, "managed", "service-errors.jsonl"),
      "utf-8",
    );
    expect(errors).toContain("task-broken");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("never lets the background service pick up a human-directed delivery", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "managed-service-human-"),
    );
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

  it("does not claim registry work before its parent authorizes startup", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "managed-service-handshake-"),
    );
    const env = {
      ...process.env,
      SUPERFLOW_HOME: root,
      SUPERFLOW_SERVICE_STARTUP_TOKEN: "unapproved",
      SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1",
    };
    try {
      saveRegistry(
        {
          schemaVersion: 1,
          tasks: [
            {
              taskId: "not-yet-owned",
              projectRoot: root,
              status: "queued",
              profile: "quick",
              activeRunId: "run-not-started",
              createdAt: "now",
              updatedAt: "now",
              servicePid: null,
            },
          ],
        },
        env,
      );
      await expect(runManagedService({ once: true }, env)).rejects.toThrow(
        /握手|handshake/,
      );
      expect(loadRegistry(env).tasks[0].status).toBe("queued");
      expect(
        fs.existsSync(path.join(root, "managed/service-errors.jsonl")),
      ).toBe(false);
      expect(fs.existsSync(path.join(root, "managed/service.lock"))).toBe(
        false,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it("accepts startup only with the parent's matching token and OS identity", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "managed-service-approved-"),
    );
    const env = {
      ...process.env,
      SUPERFLOW_HOME: root,
      SUPERFLOW_SERVICE_STARTUP_TOKEN: "approved",
    };
    try {
      fs.mkdirSync(path.join(root, "managed"));
      fs.writeFileSync(
        path.join(root, "managed/service.json"),
        JSON.stringify({
          pid: process.pid,
          startupToken: "approved",
          processIdentity: readProcessIdentity(process.pid),
        }),
      );
      await runManagedService({ once: true }, env);
      const state = JSON.parse(
        fs.readFileSync(path.join(root, "managed/service.json"), "utf8"),
      );
      expect(state.startupToken).toBe("approved");
      expect(state.stoppedAt).toBeTruthy();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
