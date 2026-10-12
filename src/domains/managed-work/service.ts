import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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
import {
  isProcessAlive,
  readProcessIdentity,
  type ProcessIdentity,
} from "../../platform/process-liveness.js";
import { managedText } from "./i18n.js";
import type { Language } from "../../types.js";
import { stopProcessTree } from "../../platform/process-tree.js";
import { classifyManagedFailure } from "./failure.js";

export interface ManagedServiceState {
  pid: number;
  startedAt: string;
  cliPath: string;
  runtimeFingerprint?: string;
  processIdentity?: ProcessIdentity;
  startupToken?: string;
  readyAt?: string;
  stoppedAt?: string;
}

export async function runManagedService(
  options: { once?: boolean; pollMilliseconds?: number } = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const serviceFile = managedServicePath(env);
  const processIdentity = readProcessIdentity(process.pid);
  if (!processIdentity) throw serviceIdentityError(process.pid);
  await awaitServiceStartupAuthorization(processIdentity, env);
  const serviceLock = acquireManagedLock(
    path.join(managedHome(env), "managed", "service.lock"),
    randomUUID(),
  );
  const pollMilliseconds = options.pollMilliseconds ?? 2_000;
  try {
    const invoker = new LocalAgentInvoker();
    writeJsonAtomic(serviceFile, {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      cliPath: process.argv[1],
      runtimeFingerprint: runtimeFingerprintForCli(process.argv[1]),
      processIdentity,
      readyAt: new Date().toISOString(),
      ...(env.SUPERFLOW_SERVICE_STARTUP_TOKEN
        ? { startupToken: env.SUPERFLOW_SERVICE_STARTUP_TOKEN }
        : {}),
    } satisfies ManagedServiceState);
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
    try {
      const current = readServiceState(env);
      if (current?.pid === process.pid) {
        writeJsonAtomic(serviceFile, {
          ...current,
          stoppedAt: new Date().toISOString(),
        });
      }
    } finally {
      serviceLock.release();
    }
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
    assertServiceIdentity(current, language);
    if (!current.readyAt || current.stoppedAt) {
      throw serviceStartupError(current.pid, language);
    }
    if (
      current.cliPath === resolvedCliPath &&
      current.runtimeFingerprint === runtimeFingerprint
    ) {
      return current;
    }
    stopOutdatedManagedService(current, env, language);
  }

  const startupToken = randomUUID();
  const child = spawn(process.execPath, [resolvedCliPath, "managed-service"], {
    detached: process.platform !== "win32",
    stdio: "ignore",
    env: { ...env, SUPERFLOW_SERVICE_STARTUP_TOKEN: startupToken },
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
  const processIdentity = readProcessIdentity(child.pid);
  const state: ManagedServiceState = {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    cliPath: resolvedCliPath,
    runtimeFingerprint,
    ...(processIdentity ? { processIdentity } : {}),
    startupToken,
  };
  if (!processIdentity) {
    // Preserve the only known PID before failing the startup handshake. A retry
    // must not create another child while this unverified process is alive.
    try {
      writeJsonAtomic(managedServicePath(env), state);
    } finally {
      // This is the ChildProcess handle returned by our own spawn, not a PID
      // obtained from persisted state. Startup is gated, so it owns no work yet.
      child.kill("SIGTERM");
    }
    throw serviceIdentityError(child.pid, language);
  }
  try {
    writeJsonAtomic(managedServicePath(env), state);
    return awaitServiceReady(state, env, language);
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
}

function awaitServiceReady(
  expected: ManagedServiceState,
  env: NodeJS.ProcessEnv,
  language?: Language,
): ManagedServiceState {
  const deadline = Date.now() + 5000;
  do {
    const current = readServiceState(env);
    const live = readProcessIdentity(expected.pid);
    if (
      !live ||
      live.startedAt !== expected.processIdentity?.startedAt ||
      live.command !== expected.processIdentity?.command
    )
      break;
    if (
      current?.pid === expected.pid &&
      current.startupToken === expected.startupToken &&
      current.processIdentity?.startedAt === live.startedAt &&
      current.processIdentity?.command === live.command &&
      current.runtimeFingerprint === expected.runtimeFingerprint &&
      current.readyAt &&
      !current.stoppedAt
    )
      return current;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  } while (Date.now() < deadline);
  throw serviceStartupError(expected.pid, language);
}

function serviceStartupError(pid: number, language?: Language): Error {
  return new Error(
    managedText(
      language,
      `Superflow 后台服务启动握手未完成（PID ${pid}）；未创建任务。请检查服务入口和 service.lock；确认失败进程已退出后重试。`,
      `The Superflow service startup handshake did not complete (PID ${pid}); no task was created. Inspect the service entry point and service.lock, then retry after the failed process exits.`,
    ),
  );
}

async function awaitServiceStartupAuthorization(
  identity: ProcessIdentity,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const token = env.SUPERFLOW_SERVICE_STARTUP_TOKEN;
  if (!token) return;
  const deadline = Date.now() + 3000;
  do {
    const current = readServiceState(env);
    if (
      current?.pid === process.pid &&
      current.startupToken === token &&
      current.processIdentity?.startedAt === identity.startedAt &&
      current.processIdentity?.command === identity.command
    )
      return;
    await delay(50);
  } while (Date.now() < deadline);
  throw new Error(
    managedText(
      undefined,
      "Superflow 后台服务启动握手未获父进程确认，拒绝领取任务；请重启 Host 后重试。",
      "The parent did not authorize the Superflow service startup handshake; refusing to claim tasks. Restart the Host and retry.",
    ),
  );
}

export function runtimeFingerprintForCli(cliPath: string): string {
  const resolved = realpathSync(path.resolve(cliPath));
  const files = runtimeJavaScriptDependencies(resolved);
  const packageRoot = runtimePackageRoot(resolved);
  if (packageRoot) {
    files.push(path.join(packageRoot, "package.json"));
    collectRuntimeAssets(path.join(packageRoot, "assets"), files);
  }
  return createHash("sha256")
    .update(
      files
        .sort()
        .map((file) => `${file}\n${readFileSync(file).toString("base64")}`)
        .join("\n"),
    )
    .digest("hex");
}

function runtimePackageRoot(entryFile: string): string | null {
  const root = path.resolve(path.dirname(entryFile), "../..");
  const relative = path.relative(root, entryFile).replaceAll("\\", "/");
  if (!["dist/app/cli.js", "dist/mcp/server.js"].includes(relative))
    return null;
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    );
    return pkg?.name === "@chenmk/superflow" ? root : null;
  } catch {
    return null;
  }
}

function collectRuntimeAssets(directory: string, files: string[]): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collectRuntimeAssets(file, files);
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(file);
  }
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
  assertServiceIdentity(current, language);
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

function assertServiceIdentity(
  current: ManagedServiceState,
  language?: Language,
): void {
  const recorded = current.processIdentity;
  const live = readProcessIdentity(current.pid);
  if (
    !recorded ||
    !live ||
    !recorded.startedAt ||
    !recorded.command ||
    recorded.startedAt !== live.startedAt ||
    recorded.command !== live.command
  ) {
    throw serviceIdentityError(current.pid, language);
  }
}

function serviceIdentityError(pid: number, language?: Language): Error {
  return new Error(
    managedText(
      language,
      `无法核验 Superflow 后台进程身份（PID ${pid}）；拒绝复用、停止或并行启动。请先核对该 PID 的命令和启动时间并确认任务已停，再由用户停止已确认的旧服务，最后重启 Host 并恢复任务。`,
      `Cannot verify the Superflow background process identity (PID ${pid}); refusing reuse, termination, or parallel startup. First inspect this PID's command and creation time and confirm tasks are stopped; then have the user stop the verified old service, restart the Host, and resume the task.`,
    ),
  );
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

function isRunnable(entry: {
  taskId: string;
  projectRoot: string;
  status: string;
  updatedAt: string;
}): boolean {
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
    return (
      loadManagedTask(entry.projectRoot, entry.taskId).executionMode ===
      "human_directed"
    );
  } catch {
    return false;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
