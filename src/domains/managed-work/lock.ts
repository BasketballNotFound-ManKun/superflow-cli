import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import { isProcessAlive } from "../../platform/process-liveness.js";
import type { Language } from "../../types.js";
import { managedText } from "./i18n.js";
import { ManagedWorkspaceClaimError } from "./failure.js";

interface LockOwner {
  pid: number;
  token: string;
  createdAt: string;
}

interface ProjectLockOwner extends LockOwner {
  taskId: string;
  projectRoot: string;
  bindingFingerprint: string;
}

export interface ManagedLock {
  file: string;
  owner: LockOwner;
  release(): void;
}

export function acquireManagedLock(
  file: string,
  token: string,
  language?: Language,
): ManagedLock {
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file)) {
    const owner = readOwner(file);
    if (owner && isProcessAlive(owner.pid)) {
      throw new Error(
        managedText(
          language,
          `任务正在由进程 ${owner.pid} 执行`,
          `Task is already being executed by process ${owner.pid}`,
        ),
      );
    }
    unlinkSync(file);
  }

  const owner: LockOwner = {
    pid: process.pid,
    token,
    createdAt: new Date().toISOString(),
  };
  const fd = openSync(file, "wx");
  writeFileSync(fd, JSON.stringify(owner), "utf-8");
  closeSync(fd);
  return {
    file,
    owner,
    release: () => {
      const current = readOwner(file);
      if (current?.token === token && existsSync(file)) unlinkSync(file);
    },
  };
}

function readOwner(file: string): LockOwner | null {
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as LockOwner;
  } catch {
    return null;
  }
}

export interface ManagedProjectClaim extends ManagedLock {
  owner: ProjectLockOwner;
}

/**
 * Serializes all managed writers for one project. Unlike the service lock, a
 * project claim is auditable: a stale file is only reclaimed after its root
 * and frozen workspace binding match the requesting execution.
 */
export async function acquireManagedProjectClaim(
  file: string,
  input: {
    taskId: string;
    projectRoot: string;
    bindingFingerprint: string;
    token: string;
    language?: Language;
    waitMilliseconds?: number;
  },
): Promise<ManagedProjectClaim> {
  mkdirSync(path.dirname(file), { recursive: true });
  const expectedRoot = realpathSync(input.projectRoot);
  const deadline = Date.now() + (input.waitMilliseconds ?? 15_000);
  for (;;) {
    try {
      const owner: ProjectLockOwner = {
        pid: process.pid,
        token: input.token,
        createdAt: new Date().toISOString(),
        taskId: input.taskId,
        projectRoot: expectedRoot,
        bindingFingerprint: input.bindingFingerprint,
      };
      const fd = openSync(file, "wx");
      writeFileSync(fd, JSON.stringify(owner), "utf-8");
      closeSync(fd);
      return {
        file,
        owner,
        release: () => releaseProjectClaim(file, owner),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const owner = readProjectOwner(file);
    if (!owner || owner.projectRoot !== expectedRoot || !owner.bindingFingerprint) {
      throw new ManagedWorkspaceClaimError(
        "workspace_ownership_unverified",
        managedText(
          input.language,
          "工作区 claim 身份无法核验，拒绝删除或接管",
          "Workspace claim ownership cannot be verified; refusing to remove or take over",
        ),
      );
    }
    if (!isProcessAlive(owner.pid)) {
      unlinkSync(file);
      continue;
    }
    if (Date.now() >= deadline) {
      throw new ManagedWorkspaceClaimError(
        "workspace_busy_timeout",
        managedText(
          input.language,
          `工作区仍由任务 ${owner.taskId} 占用，已等待 15 秒`,
          `Workspace is still claimed by task ${owner.taskId} after 15 seconds`,
        ),
      );
    }
    await delay(100);
  }
}

function readProjectOwner(file: string): ProjectLockOwner | null {
  const owner = readOwner(file) as Partial<ProjectLockOwner> | null;
  if (!owner || typeof owner.taskId !== "string" || typeof owner.projectRoot !== "string" || typeof owner.bindingFingerprint !== "string") return null;
  return owner as ProjectLockOwner;
}

function releaseProjectClaim(file: string, expected: ProjectLockOwner): void {
  const current = readProjectOwner(file);
  if (
    current?.token === expected.token &&
    current.taskId === expected.taskId &&
    current.projectRoot === expected.projectRoot &&
    current.bindingFingerprint === expected.bindingFingerprint &&
    existsSync(file)
  ) {
    unlinkSync(file);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
