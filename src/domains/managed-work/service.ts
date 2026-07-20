import { appendFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
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

export interface ManagedServiceState {
  pid: number;
  startedAt: string;
  cliPath: string;
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
  } satisfies ManagedServiceState);

  const invoker = new LocalAgentInvoker();
  const pollMilliseconds = options.pollMilliseconds ?? 2_000;
  try {
    do {
      const registry = loadRegistry(env);
      const runnable = registry.tasks.find((entry) =>
        isRunnable(entry.status, entry.updatedAt),
      );
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
  try {
    language = entry
      ? loadManagedTask(entry.projectRoot, taskId).language
      : undefined;
  } catch {
    language = undefined;
  }
  const file = path.join(managedHome(env), "managed", "service-errors.jsonl");
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(
    file,
    `${JSON.stringify({ taskId, timestamp: new Date().toISOString(), message })}\n`,
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
): ManagedServiceState {
  const current = readServiceState(env);
  if (current && isProcessAlive(current.pid)) return current;

  const child = spawn(
    process.execPath,
    [path.resolve(cliPath), "managed-service"],
    {
      detached: process.platform !== "win32",
      stdio: "ignore",
      env,
      shell: false,
    },
  );
  if (!child.pid) throw new Error("无法启动 Superflow 后台托管服务");
  child.unref();
  const state: ManagedServiceState = {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    cliPath: path.resolve(cliPath),
  };
  return state;
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

function isRunnable(status: string, updatedAt: string): boolean {
  if (status === "queued" || status === "running") return true;
  if (status !== "waiting_for_connectivity") return false;
  return Date.now() - Date.parse(updatedAt) >= 60_000;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
