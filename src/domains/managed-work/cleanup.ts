import {
  appendFileSync,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
} from "fs";
import path from "path";
import { managedTaskDir } from "./paths.js";
import { validateManagedWorkspaceBinding } from "./workspace-binding.js";
import type {
  ManagedRetention,
  ManagedRunState,
  ManagedTaskContract,
} from "./types.js";

const TASK_ID = /^task-[A-Za-z0-9][A-Za-z0-9-]*$/;
const ACTIVE = new Set([
  "queued",
  "running",
  "waiting_for_connectivity",
  "waiting_for_provider_change",
  "waiting_for_host_review",
  "paused",
]);
const STOPPED = new Set([
  "waiting_for_human",
  "review_exhausted",
  "budget_exhausted",
  "deadline_exhausted",
  "repair_pending",
  "local_delivery_ready",
  "environment_validation_blocked",
  "release_ready",
  "awaiting_git_approval",
  "completed",
  "failed",
  "cancelled",
]);

export interface ManagedCleanupAction {
  path: string;
  bytes: number;
  reason: string;
}

export interface ManagedCleanupPlan {
  taskId: string;
  projectRoot: string;
  retention: ManagedRetention;
  actions: ManagedCleanupAction[];
  retained: Array<{ path: string; reason: string }>;
  totalBytes: number;
}

export interface ManagedCleanupResult extends ManagedCleanupPlan {
  deletedFiles: number;
  releasedBytes: number;
  dryRun: boolean;
}

/**
 * Plans process-artifact deletion from a verified task directory. This is a
 * deterministic storage policy: it never asks an Agent to decide evidence value.
 */
export function planManagedTaskCleanup(
  projectRoot: string,
  taskId: string,
  retention?: ManagedRetention,
): ManagedCleanupPlan {
  const context = verifyCleanupContext(projectRoot, taskId);
  const policy = retention ?? context.contract.retention ?? "compact";
  if (!["full", "compact", "none"].includes(policy)) {
    throw new Error("留存策略只允许 full、compact 或 none");
  }
  const actions: ManagedCleanupAction[] = [];
  const retained: Array<{ path: string; reason: string }> = [];
  for (const run of context.runs) {
    planRunCleanup(
      context.projectRoot,
      run.directory,
      policy,
      actions,
      retained,
    );
  }
  return {
    taskId,
    projectRoot: context.projectRoot,
    retention: policy,
    actions: actions.sort((left, right) => left.path.localeCompare(right.path)),
    retained: retained.sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
    totalBytes: actions.reduce((total, action) => total + action.bytes, 0),
  };
}

export function executeManagedTaskCleanup(
  plan: ManagedCleanupPlan,
  dryRun = false,
): ManagedCleanupResult {
  const current = planManagedTaskCleanup(
    plan.projectRoot,
    plan.taskId,
    plan.retention,
  );
  if (!sameActions(plan.actions, current.actions)) {
    throw new Error("清理清单已变化，请重新执行 dry-run 后再删除");
  }
  if (dryRun) {
    return {
      ...current,
      deletedFiles: 0,
      releasedBytes: 0,
      dryRun: true,
    };
  }
  let deletedFiles = 0;
  let releasedBytes = 0;
  for (const action of current.actions) {
    const target = path.resolve(current.projectRoot, action.path);
    assertTaskOwnedFile(target, current.projectRoot, current.taskId);
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`拒绝删除非普通任务文件：${action.path}`);
    }
    unlinkSync(target);
    deletedFiles += 1;
    releasedBytes += stat.size;
  }
  writeRetentionSummaries(current, deletedFiles, releasedBytes);
  return { ...current, deletedFiles, releasedBytes, dryRun: false };
}

function verifyCleanupContext(
  projectRoot: string,
  taskId: string,
): {
  projectRoot: string;
  contract: ManagedTaskContract;
  runs: Array<{ directory: string; state: ManagedRunState }>;
} {
  if (!TASK_ID.test(taskId)) throw new Error("任务编号格式非法");
  const root = realpathSync(path.resolve(projectRoot));
  const tasks = path.join(root, ".superflow", "tasks");
  if (!existsSync(tasks) || lstatSync(tasks).isSymbolicLink()) {
    throw new Error("托管任务根目录不存在或不是安全目录");
  }
  const taskDir = managedTaskDir(root, taskId);
  if (!existsSync(taskDir) || lstatSync(taskDir).isSymbolicLink()) {
    throw new Error("托管任务目录不存在或不是安全目录");
  }
  const realTasks = realpathSync(tasks);
  const realTask = realpathSync(taskDir);
  if (
    path.dirname(realTask) !== realTasks ||
    path.basename(realTask) !== taskId
  ) {
    throw new Error("任务目录未绑定到指定项目，拒绝清理");
  }
  const contract = readJson<ManagedTaskContract>(
    path.join(realTask, "task.json"),
  );
  if (
    contract.taskId !== taskId ||
    realpathSync(path.resolve(contract.projectRoot)) !== root
  ) {
    throw new Error("任务合同与项目绑定不一致，拒绝清理");
  }
  const binding = readJson<
    Parameters<typeof validateManagedWorkspaceBinding>[0]
  >(path.join(realTask, "workspace-binding.json"));
  try {
    validateManagedWorkspaceBinding(binding, contract);
  } catch (error) {
    throw new Error(`工作区绑定无效，拒绝清理：${(error as Error).message}`);
  }
  const runsDir = path.join(realTask, "runs");
  if (!existsSync(runsDir) || lstatSync(runsDir).isSymbolicLink()) {
    throw new Error("任务运行目录缺失或不安全，拒绝清理");
  }
  const runs = readdirSync(runsDir)
    .filter((name) => name.startsWith("run-"))
    .sort()
    .map((name) => {
      const directory = path.join(runsDir, name);
      if (lstatSync(directory).isSymbolicLink()) {
        throw new Error("运行目录包含符号链接，拒绝清理");
      }
      const statePath = path.join(directory, "run-state.json");
      if (!existsSync(statePath)) throw new Error("运行状态缺失，拒绝清理");
      const state = readJson<ManagedRunState>(statePath);
      if (
        state.taskId !== taskId ||
        realpathSync(path.resolve(state.projectRoot)) !== root
      ) {
        throw new Error("运行状态与任务绑定不一致，拒绝清理");
      }
      if (ACTIVE.has(state.status) || state.runningAgentPid) {
        throw new Error("任务仍在运行或等待 Host 评审，拒绝清理");
      }
      if (!STOPPED.has(state.status)) {
        throw new Error("任务状态未知或损坏，拒绝清理");
      }
      return { directory, state };
    });
  if (runs.length === 0) throw new Error("任务没有可验证的运行状态，拒绝清理");
  return { projectRoot: root, contract, runs };
}

function planRunCleanup(
  projectRoot: string,
  runDir: string,
  retention: ManagedRetention,
  actions: ManagedCleanupAction[],
  retained: Array<{ path: string; reason: string }>,
): void {
  const names = readdirSync(runDir).sort();
  const protectedReferences = readProtectedReferences(runDir, names);
  const latestHandoff = latestNumber(
    names,
    /^executor-handoff-(\d+)\.(?:json|md)$/,
  );
  const latestRepair = latestNumber(names, /^repair-(\d+)\.md$/);
  for (const name of names) {
    const file = path.join(runDir, name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) {
      throw new Error(`运行目录包含符号链接，拒绝清理：${name}`);
    }
    if (!stat.isFile()) continue;
    const relative = path.relative(projectRoot, file);
    const reason = cleanupReason(name, latestHandoff, latestRepair, retention);
    if (!reason) {
      retained.push({ path: relative, reason: "恢复、交付或审计证据" });
      continue;
    }
    if (retention === "full") {
      retained.push({ path: relative, reason: "full 策略完整留存" });
      continue;
    }
    if (protectedReferences.has(name)) {
      retained.push({ path: relative, reason: "仍被有效证据引用" });
      continue;
    }
    actions.push({ path: relative, bytes: stat.size, reason });
  }
}

function cleanupReason(
  name: string,
  latestHandoff: number | null,
  latestRepair: number | null,
  retention: ManagedRetention,
): string | null {
  if (/^workspace-change-\d+\.txt$/.test(name)) return "重复工作区快照";
  if (/^executor-progress-\d+\.jsonl$/.test(name)) return "已汇总的进度流";
  if (
    /^executor-\d+-(?:invalid|failed)-events(?:-part-\d+)?\.jsonl$/.test(name)
  ) {
    return "无效或失败调用的原始事件流";
  }
  if (
    /^executor-\d+(?:-(?:invalid|failed))?-stderr(?:-part-\d+)?\.log$/.test(
      name,
    )
  ) {
    return "重复执行 stderr";
  }
  if (/^executor-result-\d+-invalid\.json$/.test(name))
    return "已替代的无效交付";
  if (/^executor-self-repair-\d+\.json$/.test(name))
    return "已吸收的机械整改记录";
  const handoff = name.match(/^executor-handoff-(\d+)\.(?:json|md)$/);
  if (handoff && Number(handoff[1]) < (latestHandoff ?? 0))
    return "已被最新交接替代";
  const repair = name.match(/^repair-(\d+)\.md$/);
  if (repair && Number(repair[1]) < (latestRepair ?? 0))
    return "已被最新整改要求替代";
  if (
    retention === "none" &&
    /^executor-\d+-events(?:-part-\d+)?\.jsonl$/.test(name)
  ) {
    return "none 策略删除已被交付摘要吸收的原始事件流";
  }
  return null;
}

function readProtectedReferences(runDir: string, names: string[]): Set<string> {
  const references = new Set<string>();
  const candidates = names.filter((name) =>
    /^(?:run-state\.json|progress\.jsonl|progress\.md|task-report\.md|review-facts-\d+\.(?:json|md)|review-result-\d+\.json|host-review-\d+\.md|executor-result-\d+\.json|retention-summary\.jsonl)$/.test(
      name,
    ),
  );
  for (const name of candidates) {
    const content = readFileSync(path.join(runDir, name), "utf-8");
    for (const match of content.matchAll(
      /(?:[A-Za-z0-9_.-]+\.(?:jsonl|json|md|log|txt))/g,
    )) {
      references.add(match[1]);
    }
  }
  return references;
}

function latestNumber(names: string[], expression: RegExp): number | null {
  const values = names.flatMap((name) => {
    const match = name.match(expression);
    return match ? [Number(match[1])] : [];
  });
  return values.length === 0 ? null : Math.max(...values);
}

function assertTaskOwnedFile(
  file: string,
  projectRoot: string,
  taskId: string,
): void {
  const taskDir = path.resolve(managedTaskDir(projectRoot, taskId));
  if (!file.startsWith(`${taskDir}${path.sep}`)) {
    throw new Error("清理目标越出任务目录，拒绝操作");
  }
}

function sameActions(
  expected: ManagedCleanupAction[],
  actual: ManagedCleanupAction[],
): boolean {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function writeRetentionSummaries(
  plan: ManagedCleanupPlan,
  deletedFiles: number,
  releasedBytes: number,
): void {
  const timestamp = new Date().toISOString();
  for (const runId of new Set(
    plan.actions.map((action) => action.path.split(path.sep)[4]),
  )) {
    if (!runId) continue;
    const runDir = path.join(
      managedTaskDir(plan.projectRoot, plan.taskId),
      "runs",
      runId,
    );
    appendFileSync(
      path.join(runDir, "retention-summary.jsonl"),
      `${JSON.stringify({
        schemaVersion: 1,
        timestamp,
        retention: plan.retention,
        deletedFiles,
        releasedBytes,
        plannedFiles: plan.actions.length,
        preservedReason: "run-state、当前交接、评审、最终交付和引用证据保留",
      })}\n`,
      "utf-8",
    );
  }
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf-8")) as T;
}
