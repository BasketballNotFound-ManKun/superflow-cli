import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import { isProcessAlive } from "../../platform/process-liveness.js";

interface LockOwner {
  pid: number;
  token: string;
  createdAt: string;
}

export interface ManagedLock {
  file: string;
  owner: LockOwner;
  release(): void;
}

export function acquireManagedLock(file: string, token: string): ManagedLock {
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file)) {
    const owner = readOwner(file);
    if (owner && isProcessAlive(owner.pid)) {
      throw new Error(`任务正在由进程 ${owner.pid} 执行`);
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
