import path from "path";
import { managedRunDir } from "./paths.js";
import { loadManagedRun } from "./storage.js";
import type { ManagedRunState, ManagedTaskStatus } from "./types.js";

const TERMINAL_STATUSES = new Set<ManagedTaskStatus>([
  "waiting_for_human",
  "review_exhausted",
  "budget_exhausted",
  "deadline_exhausted",
  "awaiting_git_approval",
  "completed",
  "failed",
  "cancelled",
]);

export interface WaitManagedTaskOptions {
  pollMilliseconds?: number;
  serviceCheckMilliseconds?: number;
  ensureService?: () => unknown;
  onProgress?: (state: ManagedRunState) => void;
}

export async function waitForManagedTask(
  projectRoot: string,
  taskId: string,
  runId: string,
  options: WaitManagedTaskOptions = {},
): Promise<ManagedRunState> {
  const pollMilliseconds = options.pollMilliseconds ?? 1_000;
  const serviceCheckMilliseconds = options.serviceCheckMilliseconds ?? 10_000;
  let lastUpdate = "";
  let lastServiceCheck = Date.now();

  while (true) {
    const state = loadManagedRun(projectRoot, taskId, runId);
    if (state.updatedAt !== lastUpdate) {
      lastUpdate = state.updatedAt;
      options.onProgress?.(state);
    }
    if (TERMINAL_STATUSES.has(state.status)) return state;
    if (Date.now() - lastServiceCheck >= serviceCheckMilliseconds) {
      options.ensureService?.();
      lastServiceCheck = Date.now();
    }
    await delay(pollMilliseconds);
  }
}

export function managedTaskReportPath(state: ManagedRunState): string {
  return path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    "task-report.md",
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
