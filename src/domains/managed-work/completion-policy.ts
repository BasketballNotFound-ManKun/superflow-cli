import { existsSync, readFileSync } from "fs";
import path from "path";
import type {
  ExecutorResult,
  ManagedDeliveryProgress,
  ManagedTaskCategory,
  ManagedTaskContract,
  ManagedTaskEvidence,
} from "./types.js";
import {
  deriveExecutionTaskCompletion,
  isAcceptedEvidenceCommand,
  readManagedExecutionContract,
} from "./execution-contract.js";
import { canonicalEvidencePath } from "./evidence-path.js";

export interface CompletionTask {
  taskId: string;
  text: string;
  category: ManagedTaskCategory;
  completed: boolean;
}

export interface CompletionDecision {
  localReady: boolean;
  environmentReady: boolean;
  releaseReady: boolean;
  progress: ManagedDeliveryProgress;
  tasks: CompletionTask[];
  localGaps: string[];
  environmentGaps: string[];
  releaseGaps: string[];
}

export function evaluateCompletion(
  contract: ManagedTaskContract,
  result?: ExecutorResult | null,
): CompletionDecision {
  const tasks = readCompletionTasks(contract, result);
  const usesCanonicalTasks = Boolean(findOpenSpecTasksFile(contract));
  const evidence = new Map(
    (result?.taskEvidence ?? []).map((item) => [item.taskId, item]),
  );
  const localGaps: string[] = [];
  const environmentGaps: string[] = [];
  const releaseGaps: string[] = [];

  for (const task of tasks) {
    const gaps = gapsFor(task.category, {
      localGaps,
      environmentGaps,
      releaseGaps,
    });
    if (!task.completed) {
      gaps.push(`${task.taskId}: ${task.text}`);
      continue;
    }
    if (usesCanonicalTasks && task.category === "local_required") {
      const taskEvidence = evidence.get(task.taskId);
      if (!validLocalEvidence(taskEvidence, contract, result)) {
        gaps.push(`${task.taskId}: 已勾选但缺少结构化证据、验证命令或源码文件`);
      }
    }
  }
  if (
    (result?.releasePrerequisites.length ?? 0) > 0 &&
    environmentGaps.length === 0 &&
    releaseGaps.length === 0
  ) {
    releaseGaps.push(...(result?.releasePrerequisites ?? []));
  }

  return {
    localReady: localGaps.length === 0,
    environmentReady: environmentGaps.length === 0,
    releaseReady: releaseGaps.length === 0,
    progress: {
      source: progressFor(tasks, "local_required"),
      environment: progressFor(tasks, "environment_required"),
      release: progressFor(tasks, "release_required"),
    },
    tasks,
    localGaps,
    environmentGaps,
    releaseGaps,
  };
}

export function readCompletionTasks(
  contract: ManagedTaskContract,
  result?: ExecutorResult | null,
): CompletionTask[] {
  const tasksFile = findOpenSpecTasksFile(contract);
  if (!tasksFile) {
    return readManagedExecutionContract(contract).tasks.map((task) => ({
      taskId: task.taskId,
      text: task.text,
      category: "local_required",
      completed: deriveExecutionTaskCompletion(task, result),
    }));
  }
  return readFileSync(tasksFile, "utf-8")
    .split(/\r?\n/)
    .filter((line) => /^\s*- \[[ xX]\]/.test(line))
    .map((line, index) => parseTask(line, index));
}

function parseTask(line: string, index: number): CompletionTask {
  const completed = /^\s*- \[[xX]\]/.test(line);
  const text = line.replace(/^\s*- \[[ xX]\]\s*/, "").trim();
  const explicitId = text.match(/^([A-Za-z]*\d+(?:\.\d+)*|[A-Z][A-Z0-9_-]+)\b/);
  return {
    taskId: explicitId?.[1] ?? `task-${index + 1}`,
    text,
    category: categoryFromExactTag(text),
    completed,
  };
}

function categoryFromExactTag(text: string): ManagedTaskCategory {
  if (/\[environment_required\]/i.test(text)) return "environment_required";
  if (/\[release_required\]/i.test(text)) return "release_required";
  return "local_required";
}

function validLocalEvidence(
  evidence: ManagedTaskEvidence | undefined,
  contract: ManagedTaskContract,
  result: ExecutorResult | null | undefined,
): boolean {
  const successfulCommands = new Set(
    result?.commands
      .filter(isAcceptedEvidenceCommand)
      .map((item) => item.command) ?? [],
  );
  const declaredFiles = new Set(result?.changedFiles ?? []);
  const hasDerivedBaseline = Boolean(
    result &&
    successfulCommands.size > 0 &&
    defaultEvidencePaths(contract, result).length > 0,
  );
  if (hasDerivedBaseline) return true;
  if (!evidence) return false;
  return Boolean(
    evidence.category === "local_required" &&
    evidence.owner === "executor" &&
    evidence.evidencePaths.length > 0 &&
    evidence.verificationCommands.length > 0 &&
    evidence.evidencePaths.every((item) =>
      evidencePathExists(contract, item),
    ) &&
    evidence.verificationCommands.every(
      (item) =>
        successfulCommands.has(item) ||
        result?.commands.some(
          (actual) =>
            isAcceptedEvidenceCommand(actual) &&
            verificationCommandCovered(item, actual.command),
        ),
    ) &&
    evidence.changedFiles.every((item) => declaredFiles.has(item)),
  );
}

function verificationCommandCovered(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  const expectedTests = mavenTestSelectors(expected);
  const actualTests = mavenTestSelectors(actual);
  return (
    expectedTests.length > 0 &&
    actualTests.length > 0 &&
    expectedTests.every((test) => actualTests.includes(test))
  );
}

function mavenTestSelectors(command: string): string[] {
  if (!/(?:^|\s)(?:\.\/)?mvn(?:\s|$)/.test(command)) return [];
  const match = command.match(/-Dtest=([^\s]+)/);
  return match?.[1].split(",").filter(Boolean) ?? [];
}

function defaultEvidencePaths(
  contract: ManagedTaskContract,
  result: ExecutorResult,
): string[] {
  const candidates = [...result.evidence];
  const tasksFile = findOpenSpecTasksFile(contract);
  if (tasksFile) {
    candidates.push(tasksFile);
    candidates.push(path.join(path.dirname(tasksFile), "test-report.md"));
  }
  return candidates.filter((item) => evidencePathExists(contract, item));
}

function evidencePathExists(
  contract: ManagedTaskContract,
  evidencePath: string,
): boolean {
  const canonicalPath = canonicalEvidencePath(evidencePath);
  if (path.isAbsolute(canonicalPath)) return existsSync(canonicalPath);
  const bases = [
    ...(findOpenSpecTasksFile(contract)
      ? [path.dirname(findOpenSpecTasksFile(contract) as string)]
      : []),
    ...(contract.taskPrompt
      ? [path.dirname(contract.taskPrompt.originalPath)]
      : []),
    contract.projectRoot,
    ...contract.relatedProjectRoots,
  ];
  return bases.some((base) => existsSync(path.resolve(base, canonicalPath)));
}

function progressFor(
  tasks: CompletionTask[],
  category: ManagedTaskCategory,
): { completed: number; total: number } {
  const selected = tasks.filter((task) => task.category === category);
  return {
    completed: selected.filter((task) => task.completed).length,
    total: selected.length,
  };
}

function gapsFor(
  category: ManagedTaskCategory,
  gaps: {
    localGaps: string[];
    environmentGaps: string[];
    releaseGaps: string[];
  },
): string[] {
  if (category === "environment_required") return gaps.environmentGaps;
  if (category === "release_required") return gaps.releaseGaps;
  return gaps.localGaps;
}

function findOpenSpecTasksFile(contract: ManagedTaskContract): string | null {
  if (!contract.taskPrompt?.originalPath) return null;
  let current = path.dirname(path.resolve(contract.taskPrompt.originalPath));
  const roots = [contract.projectRoot, ...contract.relatedProjectRoots].map(
    (root) => path.resolve(root),
  );
  while (roots.some((root) => current.startsWith(root))) {
    const file = path.join(current, "tasks.md");
    if (existsSync(file)) return file;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}
