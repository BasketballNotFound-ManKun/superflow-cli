import { createHash } from "crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";
import { readCompletionTasks } from "./completion-policy.js";
import {
  ensureManagedContextManifest,
  managedContextManifestPath,
} from "./context-manifest.js";
import { managedRunDir } from "./paths.js";
import { redactManagedLog } from "./redaction.js";
import { snapshotChangedWorkspaceFiles } from "./state.js";
import { writeJsonAtomic } from "./storage.js";
import { categoriesForCommand } from "./verification-categories.js";
import { canonicalEvidencePath } from "./evidence-path.js";
import { isAcceptedEvidenceCommand } from "./execution-contract.js";
import type {
  ExecutorResult,
  ManagedRunState,
  ManagedTaskContract,
  VerificationCategory,
} from "./types.js";

export interface ManagedReviewFacts {
  schemaVersion: 1;
  taskId: string;
  runId: string;
  reviewRound: number;
  contextManifest: { path: string; sha256: string };
  workspace: {
    roots: string[];
    /** Cumulative task diff retained for traceability. */
    changedFiles: string[];
    /** Diff since the previous Host review, used to focus this round. */
    roundChangedFiles: string[];
  };
  tasks: {
    total: number;
    completed: number;
    pendingLocal: string[];
    pendingExternal: string[];
  };
  commands: {
    total: number;
    successful: number;
    categories: VerificationCategory[];
    items: Array<{
      command: string;
      exitCode: number;
      assertion: "positive" | "negative";
      categories: VerificationCategory[];
    }>;
  };
  evidence: Array<{
    path: string;
    kind: "file" | "directory";
    exists: boolean;
    bytes: number | null;
    sha256: string | null;
  }>;
  executorObstacles: {
    /** Rejections found inside the inspected window; not a whole-history total. */
    guardedRejectionCount: number;
    recentRejections: string[];
    lastInvocationFailure: string | null;
    inspection: {
      /** Recent stderr logs actually inspected (newest first). */
      inspectedLogs: string[];
      inspectedLogCount: number;
      totalStderrLogCount: number;
      /** Per-log read budget; older bytes stay in task evidence. */
      tailBytesPerLog: number;
    };
  };
}

export function writeManagedReviewFacts(
  contract: ManagedTaskContract,
  state: ManagedRunState,
): {
  jsonPath: string;
  markdownPath: string;
  facts: ManagedReviewFacts;
  workspaceSnapshot: Record<string, string>;
} {
  const runDir = managedRunDir(state.projectRoot, state.taskId, state.runId);
  const result = state.lastExecutorResult
    ? (JSON.parse(
        readFileSync(state.lastExecutorResult, "utf-8"),
      ) as ExecutorResult)
    : emptyResult();
  const manifest = ensureManagedContextManifest(contract);
  const tasks = readCompletionTasks(contract, result);
  const commands = result.commands ?? [];
  const categories = [
    ...new Set(commands.flatMap(categoriesForCommand)),
  ].sort() as VerificationCategory[];
  const roots = [contract.projectRoot, ...contract.relatedProjectRoots];
  const workspaceSnapshot = snapshotChangedWorkspaceFiles(roots);
  const roundBaseline =
    state.lastReviewedWorkspaceFiles ?? state.baselineWorkspaceFiles ?? {};
  const facts: ManagedReviewFacts = {
    schemaVersion: 1,
    taskId: state.taskId,
    runId: state.runId,
    reviewRound: state.reviewRound,
    contextManifest: {
      path: managedContextManifestPath(contract),
      sha256: manifest.manifestHash,
    },
    workspace: {
      roots,
      changedFiles: [...new Set(result.changedFiles ?? [])].sort(),
      roundChangedFiles: changedFilesBetween(
        workspaceSnapshot,
        roundBaseline,
        contract.projectRoot,
      ),
    },
    tasks: {
      total: tasks.length,
      completed: tasks.filter((task) => task.completed).length,
      pendingLocal: tasks
        .filter((task) => !task.completed && task.category === "local_required")
        .map((task) => task.taskId),
      pendingExternal: tasks
        .filter((task) => !task.completed && task.category !== "local_required")
        .map((task) => task.taskId),
    },
    commands: {
      total: commands.length,
      successful: commands.filter(isAcceptedEvidenceCommand).length,
      categories,
      items: commands.map((command) => ({
        command: command.command,
        exitCode: command.exitCode,
        assertion: command.assertion ?? "positive",
        categories: categoriesForCommand(command),
      })),
    },
    evidence: evidencePaths(result)
      .sort()
      .map((entry) => evidenceFact(entry, contract, runDir)),
    executorObstacles: collectExecutorObstacles(runDir, state.blocker ?? null),
  };
  const jsonPath = path.join(runDir, `review-facts-${state.reviewRound}.json`);
  const markdownPath = path.join(
    runDir,
    `review-facts-${state.reviewRound}.md`,
  );
  writeJsonAtomic(jsonPath, facts);
  writeFileSync(
    markdownPath,
    renderReviewFacts(facts, contract.language),
    "utf-8",
  );
  return { jsonPath, markdownPath, facts, workspaceSnapshot };
}

function evidencePaths(result: ExecutorResult): string[] {
  const structured = (result.taskEvidence ?? []).flatMap(
    (item) => item.evidencePaths,
  );
  const paths = structured.length > 0 ? structured : (result.evidence ?? []);
  return [...new Set(paths.map(canonicalEvidencePath))];
}

const GUARDED_REJECTION_PATTERN =
  /Command blocked by PreToolUse hook[^\r\n]*/g;
const STDERR_LOG_PATTERN = /^executor-\d+(?:-invalid|-failed)?-stderr(?:-part-\d+)?\.log$/;
/** Deterministic read budget: only the most recent logs, tail bytes each. */
const MAX_INSPECTED_STDERR_LOGS = 3;
const STDERR_TAIL_BYTES = 64 * 1024;
const MAX_REJECTION_SAMPLES = 5;

function invocationOrder(name: string): number {
  const match = /^executor-(\d+)/.exec(name);
  return match ? Number(match[1]) : 0;
}

/** Reads at most the trailing {@link bytes} of a file; older bytes stay untouched. */
function readTail(file: string, bytes: number): string {
  const stat = statSync(file);
  const start = Math.max(0, stat.size - bytes);
  const length = stat.size - start;
  const handle = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    readSync(handle, buffer, 0, length, start);
    return buffer.toString("utf-8");
  } finally {
    closeSync(handle);
  }
}

/**
 * Surfaces deterministic executor-side obstacles (hook rejections, invocation
 * failures) so the Host can diagnose tooling problems in one review round
 * instead of reconstructing them from raw session logs.
 *
 * Reads are bounded: only the most recent {@link MAX_INSPECTED_STDERR_LOGS}
 * stderr logs are inspected, and only the trailing {@link STDERR_TAIL_BYTES}
 * bytes of each. Counts therefore describe the inspected window; full raw
 * logs remain in task evidence for manual inspection.
 */
export function collectExecutorObstacles(
  runDir: string,
  lastInvocationFailure: string | null,
): ManagedReviewFacts["executorObstacles"] {
  const stderrLogs = existsSync(runDir)
    ? readdirSync(runDir)
        .filter((name) => STDERR_LOG_PATTERN.test(name))
        .sort()
    : [];
  const inspected = [...stderrLogs]
    .sort((a, b) => invocationOrder(b) - invocationOrder(a))
    .slice(0, MAX_INSPECTED_STDERR_LOGS);
  const recentRejections: string[] = [];
  let guardedRejectionCount = 0;
  for (const name of inspected) {
    const content = readTail(path.join(runDir, name), STDERR_TAIL_BYTES);
    for (const match of content.matchAll(GUARDED_REJECTION_PATTERN)) {
      guardedRejectionCount += 1;
      if (recentRejections.length < MAX_REJECTION_SAMPLES) {
        recentRejections.push(redactManagedLog(match[0].slice(0, 240)));
      }
    }
  }
  return {
    guardedRejectionCount,
    recentRejections,
    lastInvocationFailure: lastInvocationFailure
      ? redactManagedLog(lastInvocationFailure.slice(0, 240))
      : null,
    inspection: {
      inspectedLogs: inspected,
      inspectedLogCount: inspected.length,
      totalStderrLogCount: stderrLogs.length,
      tailBytesPerLog: STDERR_TAIL_BYTES,
    },
  };
}

function changedFilesBetween(
  current: Record<string, string>,
  baseline: Record<string, string>,
  primaryRoot: string,
): string[] {
  const keys = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  return [...keys]
    .filter((key) => current[key] !== baseline[key])
    .map((key) => {
      const separator = key.indexOf("::");
      const root = key.slice(0, separator);
      const relative = key.slice(separator + 2).replaceAll("\\", "/");
      return path.resolve(root) === path.resolve(primaryRoot)
        ? relative
        : path.join(root, relative).replaceAll("\\", "/");
    })
    .sort();
}

function evidenceFact(
  entry: string,
  contract: ManagedTaskContract,
  runDir: string,
): ManagedReviewFacts["evidence"][number] {
  const evidencePath = canonicalEvidencePath(entry);
  const candidates = path.isAbsolute(evidencePath)
    ? [evidencePath]
    : [
        path.resolve(contract.projectRoot, evidencePath),
        path.resolve(runDir, evidencePath),
      ];
  const file = candidates.find(existsSync) ?? candidates[0];
  if (!existsSync(file)) {
    return {
      path: file,
      kind: "file",
      exists: false,
      bytes: null,
      sha256: null,
    };
  }
  const stat = statSync(file);
  if (stat.isDirectory()) {
    return {
      path: file,
      kind: "directory",
      exists: true,
      bytes: stat.size,
      sha256: null,
    };
  }
  return {
    path: file,
    kind: "file",
    exists: true,
    bytes: stat.size,
    sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
  };
}

function renderReviewFacts(
  facts: ManagedReviewFacts,
  language: ManagedTaskContract["language"],
): string {
  const title = language === "en" ? "# Host Review Facts" : "# Host 评审事实包";
  const labels =
    language === "en"
      ? {
          warning:
            "Runner facts are deterministic inputs, not semantic conclusions.",
          changed: "Task changed files",
          roundChanged: "Changed since previous Host review",
          tasks: "Tasks",
          commands: "Commands",
          evidence: "Evidence",
          obstacles: "Executor obstacles (guard rejections / invocation failures)",
        }
      : {
          warning: "Runner 事实仅作为确定性输入，不代表语义结论。",
          changed: "任务累计变更文件",
          roundChanged: "相对上次 Host 评审的变更文件",
          tasks: "任务",
          commands: "命令",
          evidence: "证据",
          obstacles: "执行障碍（守卫拦截 / 调用失败）",
        };
  return [
    title,
    "",
    labels.warning,
    "",
    `## ${labels.changed} (${facts.workspace.changedFiles.length})`,
    ...facts.workspace.changedFiles.map((file) => `- ${file}`),
    "",
    `## ${labels.roundChanged} (${facts.workspace.roundChangedFiles.length})`,
    ...(facts.workspace.roundChangedFiles.length > 0
      ? facts.workspace.roundChangedFiles.map((file) => `- ${file}`)
      : [language === "en" ? "- none" : "- 无"]),
    "",
    `## ${labels.tasks} (${facts.tasks.completed}/${facts.tasks.total})`,
    `- pending local: ${facts.tasks.pendingLocal.join(", ") || "none"}`,
    `- pending external: ${facts.tasks.pendingExternal.join(", ") || "none"}`,
    "",
    `## ${labels.commands} (${facts.commands.successful}/${facts.commands.total})`,
    `- categories: ${facts.commands.categories.join(", ") || "none"}`,
    "",
    `## ${labels.evidence} (${facts.evidence.length})`,
    ...facts.evidence.map(
      (item) => `- ${item.exists ? "PASS" : "MISSING"} ${item.path}`,
    ),
    "",
    `## ${labels.obstacles} (${facts.executorObstacles.guardedRejectionCount})`,
    language === "en"
      ? `- scope: ${facts.executorObstacles.inspection.inspectedLogCount} of ${facts.executorObstacles.inspection.totalStderrLogCount} stderr logs, trailing ${facts.executorObstacles.inspection.tailBytesPerLog} bytes each; full logs stay in task evidence`
      : `- 口径：共 ${facts.executorObstacles.inspection.totalStderrLogCount} 个 stderr 日志，仅检查最近 ${facts.executorObstacles.inspection.inspectedLogCount} 个的末尾 ${facts.executorObstacles.inspection.tailBytesPerLog} 字节；完整日志仍在任务证据中`,
    ...facts.executorObstacles.recentRejections.map((line) => `- ${line}`),
    ...(facts.executorObstacles.lastInvocationFailure
      ? [`- ${facts.executorObstacles.lastInvocationFailure}`]
      : facts.executorObstacles.guardedRejectionCount === 0
        ? [language === "en" ? "- none" : "- 无"]
        : []),
    "",
  ].join("\n");
}

function emptyResult(): ExecutorResult {
  return {
    status: "ready_for_review",
    summary: "",
    changedFiles: [],
    commands: [],
    evidence: [],
    releasePrerequisites: [],
    blockers: [],
  };
}
