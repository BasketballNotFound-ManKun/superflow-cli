import { existsSync, readFileSync, unlinkSync } from "fs";
import path from "path";
import { managedTaskDir } from "./paths.js";
import { writeJsonAtomic } from "./storage.js";
import type { ManagedTaskContract } from "./types.js";

export interface ManagedControlSignal {
  pauseRequested: boolean;
  reason: string;
  actor: string;
  requestedAt: string;
}

function signalPath(contract: ManagedTaskContract): string {
  return path.join(
    managedTaskDir(contract.projectRoot, contract.taskId),
    "control-signal.json",
  );
}

export function requestManagedPause(
  contract: ManagedTaskContract,
  reason: string,
  actor = "user",
): ManagedControlSignal {
  const signal: ManagedControlSignal = {
    pauseRequested: true,
    reason: reason.trim() || "User requested pause",
    actor: actor.trim() || "user",
    requestedAt: new Date().toISOString(),
  };
  writeJsonAtomic(signalPath(contract), signal);
  return signal;
}

export function readManagedControlSignal(
  contract: ManagedTaskContract,
): ManagedControlSignal | null {
  const file = signalPath(contract);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as ManagedControlSignal;
  } catch {
    return null;
  }
}

export function clearManagedControlSignal(contract: ManagedTaskContract): void {
  const file = signalPath(contract);
  if (existsSync(file)) unlinkSync(file);
}
