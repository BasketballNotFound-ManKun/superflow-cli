import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "fs";
import path from "path";
import { createHash } from "crypto";
import spawn from "cross-spawn";
import { LocalAgentInvoker } from "../../platform/agent-process.js";
import { managedHome, managedServicePath } from "./paths.js";
import { runManagedTask } from "./runner.js";
import {
  loadRegistry,
  loadManagedTask,
  readJson,
  upsertRegistryEntry,
  writeJsonAtomic,
} from "./storage.js";
import { notifyManagedTask } from "./notifications.js";
import { acquireManagedLock } from "./lock.js";
import { randomUUID } from "crypto";
import { isProcessAlive } from "../../platform/process-liveness.js";
import { managedText } from "./i18n.js";
import type { Language } from "../../types.js";
import { stopProcessTree } from "../../platform/process-tree.js";
import { classifyManagedFailure } from "./failure.js";

export interface ManagedServiceState {
  pid: number;
  startedAt: string;
  cliPath: string;
  runtimeFingerprint?: string;
}

export async function runManagedService(
  options: { once?: boolean; pollMilliseconds?: number } = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const serviceFile = managedServicePath(env);
  const serviceLock = acquireManagedLock(
    path.join(managedHome(env), "managed", "service.lock"),
    randomUUID(),
  );
  writeJsonAtomic(serviceFile, {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    cliPath: process.argv[1],
    runtimeFingerprint: runtimeFingerprintForCli(process.argv[1]),
  } satisfies ManagedServiceState);

  const invoker = new LocalAgentInvoker();
  const pollMilliseconds = options.pollMilliseconds ?? 2_000;
  try {
    do {
      const registry = loadRegistry(env);
      const runnable = registry.tasks.find((entry) => isRunnable(entry));
      if (runnable) {
        try {
          await runManagedTask(
            runnable.projectRoot,
            runnable.taskId,
            invoker,
            env,
          );
        } catch (error) {
          recordServiceFailure(runnable.taskId, error, env);
          upsertRegistryEntry(
            {
              ...runnable,
              status: "waiting_for_human",
              updatedAt: new Date().toISOString(),
              servicePid: process.pid,
            },
            env,
          );
        }
        continue;
      }
      if (!options.once) await delay(pollMilliseconds);
    } while (!options.once);
  } finally {
    const current = readServiceState(env);
    if (current?.pid === process.pid) {
      writeJsonAtomic(serviceFile, {
        ...current,
        stoppedAt: new Date().toISOString(),
      });
    }
    serviceLock.release();
  }
}

function recordServiceFailure(
  taskId: string,
  error: unknown,
  env: NodeJS.ProcessEnv,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const registry = loadRegistry(env);
  const entry = registry.tasks.find((item) => item.taskId === taskId);
  let language;
  let failure = null;
  try {
    const contract = entry
      ? loadManagedTask(entry.projectRoot, taskId)
      : undefined;
    language = contract?.language;
    failure = contract ? classifyManagedFailure(contract, error) : null;
  } catch {
    language = undefined;
  }
  const file = path.join(managedHome(env), "managed", "service-errors.jsonl");
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(
    file,
      `${JSON.stringify({ taskId, timestamp: new Date().toISOString(), message, failure })}\n`,
    "utf-8",
  );
  notifyManagedTask(
    {
      taskId,
      type: "service_failed",
      title: managedText(
        language,
        "Superflow 后台任务异常",
        "Superflow background task failure",
      ),
      message: `${taskId}: ${message}`,
    },
    env,
  );
}

export function ensureManagedService(
  cliPath = process.argv[1],
  env: NodeJS.ProcessEnv = process.env,
  language?: Language,
): ManagedServiceState {
  const current = readServiceState(env);
  const resolvedCliPath = path.resolve(cliPath);
  const runtimeFingerprint = runtimeFingerprintForCli(resolvedCliPath);
  if (current && isProcessAlive(current.pid)) {
    if (
      current.cliPath === resolvedCliPath &&
      current.runtimeFingerprint === runtimeFingerprint
    ) {
      return current;
    }
    stopOutdatedManagedService(current, env, language);
  }

  const child = spawn(process.execPath, [resolvedCliPath, "managed-service"], {
    detached: process.platform !== "win32",
    stdio: "ignore",
    env,
    shell: false,
  });
  if (!child.pid) {
    throw new Error(
      managedText(
        language,
        "无法启动 Superflow 后台托管服务",
        "Unable to start the Superflow managed background service",
      ),
    );
  }
  child.unref();
  const state: ManagedServiceState = {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    cliPath: resolvedCliPath,
    runtimeFingerprint,
  };
  return state;
}

export function runtimeFingerprintForCli(cliPath: string): string {
  const resolved = realpathSync(path.resolve(cliPath));
  const files = runtimeJavaScriptDependencies(resolved);
  return createHash("sha256")
    .update(
      files
        .map(
          (file) =>
            `${file}\n${readFileSync(file).toString("base64")}`,
        )
        .join("\n"),
    )
    .digest("hex");
}

function runtimeJavaScriptDependencies(entryFile: string): string[] {
  const visited = new Set<string>();
  const visit = (file: string): void => {
    const resolved = realpathSync(file);
    if (visited.has(resolved)) return;
    visited.add(resolved);
    const source = readFileSync(resolved, "utf-8");
    const imports = source.matchAll(
      /(?:from\s*|import\s*(?:\(\s*)?)["'](\.{1,2}\/[^"']+)["']/g,
    );
    for (const match of imports) {
      const dependency = path.resolve(path.dirname(resolved), match[1]);
      if (existsSync(dependency) && statSync(dependency).isFile()) {
        visit(dependency);
      }
    }
  };
  visit(entryFile);
  return [...visited].sort();
}

function stopOutdatedManagedService(
  current: ManagedServiceState,
  env: NodeJS.ProcessEnv,
  language?: Language,
): void {
  const running = loadRegistry(env).tasks.some(
    (entry) => entry.status === "running",
  );
  if (running) {
    throw new Error(
      managedText(
        language,
        "Superflow 后台服务版本已变化，但仍有任务运行；请等待当前 Agent 调用结束后再恢复",
        "The Superflow background service changed while a task is still running; wait for the current Agent invocation to finish before resuming",
      ),
    );
  }
  stopProcessTree(current.pid);
  const deadline = Date.now() + 2_000;
  while (isProcessAlive(current.pid) && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  if (isProcessAlive(current.pid)) {
    throw new Error(
      managedText(
        language,
        "旧 Superflow 后台服务未在 2 秒内退出，拒绝并行启动新版本",
        "The previous Superflow background service did not exit within 2 seconds; refusing to start another version in parallel",
      ),
    );
  }
}

export function readServiceState(
  env: NodeJS.ProcessEnv = process.env,
): ManagedServiceState | null {
  const file = managedServicePath(env);
  if (!existsSync(file)) return null;
  try {
    return readJson<ManagedServiceState>(file);
  } catch {
    return null;
  }
}

function isRunnable(entry: { taskId: string; projectRoot: string; status: string; updatedAt: string }): boolean {
  if (isHumanDirectedTask(entry)) return false;
  const { status, updatedAt } = entry;
  if (status === "queued" || status === "running") return true;
  if (status !== "waiting_for_connectivity") return false;
  return Date.now() - Date.parse(updatedAt) >= 60_000;
}

function isHumanDirectedTask(entry: {
  taskId: string;
  projectRoot: string;
}): boolean {
  try {
    return loadManagedTask(entry.projectRoot, entry.taskId).executionMode === "human_directed";
  } catch {
    return false;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
