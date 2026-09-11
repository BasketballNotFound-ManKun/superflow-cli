import { createHash, randomUUID } from "crypto";
import { execFileSync } from "child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
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
    retention: contract.retention ?? "compact",
    language: contract.language,
    status: contract.status,
    currentStep:
      contract.executionMode === "human_directed"
        ? "waiting_for_manual_delivery"
        : "queued",
    executorStage: null,
    executorActiveStage: null,
    reviewRound: 0,
    executorInvocations: 0,
    executorInvocationCredits: 0,
    consecutiveTransientProviderFailures: 0,
    connectivityRetryCount: 0,
    reviewInvocations: 0,
    totalAgentInvocations: 0,
    totalAgentInvocationCredits: 0,
    activeRunMilliseconds: 0,
    activeSince: null,
    supervisorSession: pendingSession(contract.supervisorAgent),
    executorSession: pendingSession(contract.executorAgent),
    baseCommit: gitOutput(contract.projectRoot, ["rev-parse", "HEAD"]),
    workspaceFingerprint: computeWorkspaceFingerprintForRoots([
      contract.projectRoot,
      ...contract.relatedProjectRoots,
    ]),
    baselineWorkspaceFiles: snapshotChangedWorkspaceFiles([
      contract.projectRoot,
      ...contract.relatedProjectRoots,
    ]),
    baselineCapturedAt: null,
    contractHash: contract.contractHash,
    lastExecutorResult: null,
    lastReviewResult: null,
    lastRepairPrompt: null,
    servicePid: null,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    blocker: null,
    failure: null,
    pendingExternalReview: null,
    deliveryProgress: {
      source: { completed: 0, total: 0 },
      environment: { completed: 0, total: 0 },
      release: { completed: 0, total: 0 },
    },
    runtimeTelemetry: null,
    executorUsage: {
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      costUsd: null,
    },
    hostUsage: {
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      costUsd: null,
    },
    runningAgentPid: null,
    executorSelfRepairCount: 0,
    executorRejectionCounts: {},
  };
}

export function effectiveExecutorInvocations(state: ManagedRunState): number {
  return Math.max(
    0,
    state.executorInvocations - (state.executorInvocationCredits ?? 0),
  );
}

export function effectiveTotalAgentInvocations(state: ManagedRunState): number {
  return Math.max(
    0,
    state.totalAgentInvocations - (state.totalAgentInvocationCredits ?? 0),
  );
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
    .filter((line) => !shouldIgnoreStatusLine(line))
    .join("\n");
  const diffPathspec = [
    "--",
    ".",
    ":(exclude).superflow/tasks/**",
    ":(exclude).superflow/managed-project.lock",
  ];
  const workingDiff =
    gitOutput(projectRoot, [
      "diff",
      "--binary",
      "--no-ext-diff",
      ...diffPathspec,
    ]) ?? "";
  const stagedDiff =
    gitOutput(projectRoot, [
      "diff",
      "--cached",
      "--binary",
      "--no-ext-diff",
      ...diffPathspec,
    ]) ?? "";
  const untracked = untrackedContentFingerprint(projectRoot);
  return createHash("sha256")
    .update(`${head}\n${status}\n${workingDiff}\n${stagedDiff}\n${untracked}`)
    .digest("hex");
}

function untrackedContentFingerprint(projectRoot: string): string {
  const files = (
    gitOutput(projectRoot, ["ls-files", "--others", "--exclude-standard"]) ?? ""
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !isManagedRuntimePath(file))
    .filter((file) => !isGeneratedWorkspacePath(file))
    .sort();
  return files
    .map((file) => {
      try {
        const hash = createHash("sha256")
          .update(readFileSync(path.join(projectRoot, file)))
          .digest("hex");
        return `${file}:${hash}`;
      } catch {
        return `${file}:unreadable`;
      }
    })
    .join("\n");
}

export function computeWorkspaceFingerprintForRoots(roots: string[]): string {
  const normalized = [...new Set(roots)].sort();
  const value = normalized
    .map((root) => `${root}:${computeWorkspaceFingerprint(root)}`)
    .join("\n");
  return createHash("sha256").update(value).digest("hex");
}

export function computeScopedWorkspaceFingerprint(
  roots: string[],
  files: string[],
): string {
  const normalizedRoots = [...new Set(roots.map((root) => path.resolve(root)))];
  const entries = [...new Set(files)]
    .sort()
    .flatMap((file) => scopedCandidates(normalizedRoots, file))
    .map((file) => {
      try {
        return `${file}:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
      } catch {
        return `${file}:missing`;
      }
    });
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

export function snapshotChangedWorkspaceFiles(
  roots: string[],
): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const root of [...new Set(roots.map((item) => path.resolve(item)))]) {
    const status = gitOutput(root, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);
    if (status === null) {
      for (const file of walkWorkspaceFiles(root)) {
        snapshot[`${root}::${path.relative(root, file)}`] = createHash("sha256")
          .update(readFileSync(file))
          .digest("hex");
      }
      continue;
    }
    for (const line of status?.split(/\r?\n/).filter(Boolean) ?? []) {
      const relative = line.slice(3).replace(/^.* -> /, "");
      if (shouldIgnoreStatusLine(line)) continue;
      const key = `${root}::${relative}`;
      try {
        snapshot[key] = createHash("sha256")
          .update(readFileSync(path.join(root, relative)))
          .digest("hex");
      } catch {
        snapshot[key] = "missing";
      }
    }
  }
  return snapshot;
}

function walkWorkspaceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const relative = path.relative(root, path.join(directory, entry));
      if (
        [".git", ".superflow"].includes(entry) ||
        isGeneratedWorkspacePath(relative)
      ) {
        continue;
      }
      const file = path.join(directory, entry);
      if (existsSync(path.join(file, "managed", "registry.json"))) continue;
      const stat = statSync(file);
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) files.push(file);
    }
  };
  visit(root);
  return files;
}

function scopedCandidates(roots: string[], file: string): string[] {
  if (path.isAbsolute(file)) {
    const resolved = path.resolve(file);
    return roots.some(
      (root) => resolved === root || resolved.startsWith(`${root}${path.sep}`),
    )
      ? [resolved]
      : [];
  }
  const candidates = roots.map((root) => path.resolve(root, file));
  const existing = candidates.filter((candidate) => {
    try {
      readFileSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
  return existing.length > 0 ? existing : [candidates[0]];
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
    previousSessionIds: [],
    resumingSessionId: null,
    retiredSessions: [],
  };
}

function gitOutput(projectRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trimEnd();
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

function shouldIgnoreStatusLine(line: string): boolean {
  const relative = line.slice(3).replace(/^.* -> /, "");
  return (
    isManagedRuntimePath(relative) ||
    (line.startsWith("?? ") && isGeneratedWorkspacePath(relative))
  );
}

function isGeneratedWorkspacePath(value: string): boolean {
  const normalized = value.trim().replaceAll("\\", "/");
  return /(^|\/)(?:target|node_modules|dist|test-results|coverage)(?:\/|$)/.test(
    normalized,
  );
}
