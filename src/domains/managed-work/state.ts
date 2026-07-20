import { createHash, randomUUID } from "crypto";
import { execFileSync } from "child_process";
import type { ManagedRunState, ManagedTaskContract } from "./types.js";

export function initManagedRunState(
  contract: ManagedTaskContract,
): ManagedRunState {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    runId: `run-${randomUUID()}`,
    taskId: contract.taskId,
    projectRoot: contract.projectRoot,
    profile: contract.profile,
    language: contract.language,
    status: "queued",
    currentStep: "queued",
    reviewRound: 0,
    executorInvocations: 0,
    reviewInvocations: 0,
    totalAgentInvocations: 0,
    activeRunMilliseconds: 0,
    activeSince: null,
    supervisorSession: pendingSession(contract.supervisorAgent),
    executorSession: pendingSession(contract.executorAgent),
    baseCommit: gitOutput(contract.projectRoot, ["rev-parse", "HEAD"]),
    workspaceFingerprint: computeWorkspaceFingerprintForRoots([
      contract.projectRoot,
      ...contract.relatedProjectRoots,
    ]),
    contractHash: contract.contractHash,
    lastExecutorResult: null,
    lastReviewResult: null,
    lastRepairPrompt: null,
    servicePid: null,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    blocker: null,
  };
}

export function computeWorkspaceFingerprint(projectRoot: string): string {
  const head = gitOutput(projectRoot, ["rev-parse", "HEAD"]) ?? "no-head";
  const rawStatus =
    gitOutput(projectRoot, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]) ?? "";
  const status = rawStatus
    .split(/\r?\n/)
    .filter((line) => !isManagedRuntimePath(line.slice(3)))
    .join("\n");
  return createHash("sha256").update(`${head}\n${status}`).digest("hex");
}

export function computeWorkspaceFingerprintForRoots(roots: string[]): string {
  const normalized = [...new Set(roots)].sort();
  const value = normalized
    .map((root) => `${root}:${computeWorkspaceFingerprint(root)}`)
    .join("\n");
  return createHash("sha256").update(value).digest("hex");
}

export function activeRunMilliseconds(
  state: ManagedRunState,
  now = Date.now(),
): number {
  if (!state.activeSince) return state.activeRunMilliseconds;
  return (
    state.activeRunMilliseconds +
    Math.max(0, now - Date.parse(state.activeSince))
  );
}

function pendingSession(agent: ManagedTaskContract["supervisorAgent"]) {
  return {
    agent,
    sessionId: null,
    createdAt: null,
    lastResumedRound: 0,
    status: "pending" as const,
  };
}

function gitOutput(projectRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function isManagedRuntimePath(value: string): boolean {
  const normalized = value.trim().replaceAll("\\", "/");
  return (
    normalized.startsWith(".superflow/tasks/") ||
    normalized === ".superflow/managed-project.lock"
  );
}
