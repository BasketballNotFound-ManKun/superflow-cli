import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import path from "path";
import { createHash } from "crypto";
import type {
  ManagedRegistry,
  ManagedRegistryEntry,
  ManagedRunState,
  ManagedTaskContract,
} from "./types.js";
import { managedRegistryPath, managedRunDir, managedTaskDir } from "./paths.js";

export function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  renameSync(temp, file);
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf-8")) as T;
}

export function createManagedTaskFiles(
  contract: ManagedTaskContract,
  runState: ManagedRunState,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const runDir = managedRunDir(
    contract.projectRoot,
    contract.taskId,
    runState.runId,
  );
  mkdirSync(runDir, { recursive: true });
  writeTaskPromptSnapshot(contract);
  writeFileSync(
    path.join(taskDir, "request.md"),
    buildRequestMarkdown(contract),
    "utf-8",
  );
  writeFileSync(
    path.join(taskDir, "task-brief.md"),
    buildTaskBrief(contract),
    "utf-8",
  );
  writeJsonAtomic(path.join(taskDir, "task.json"), contract);
  writeJsonAtomic(path.join(runDir, "run-state.json"), runState);
  writeFileSync(path.join(runDir, "progress.jsonl"), "", "utf-8");
  writeFileSync(
    path.join(runDir, "progress.md"),
    "# 托管任务进度\n\n状态：已创建\n",
    "utf-8",
  );
  writeFileSync(
    path.join(runDir, "task-report.md"),
    "# 托管任务报告\n\n状态：执行中\n",
    "utf-8",
  );
  upsertRegistryEntry(
    {
      taskId: contract.taskId,
      projectRoot: contract.projectRoot,
      status: contract.status,
      profile: contract.profile,
      activeRunId: runState.runId,
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
      servicePid: null,
    },
    env,
  );
}

export function loadManagedTask(
  projectRoot: string,
  taskId: string,
): ManagedTaskContract {
  return readJson(path.join(managedTaskDir(projectRoot, taskId), "task.json"));
}

export function saveManagedTask(contract: ManagedTaskContract): void {
  writeJsonAtomic(
    path.join(
      managedTaskDir(contract.projectRoot, contract.taskId),
      "task.json",
    ),
    { ...contract, updatedAt: new Date().toISOString() },
  );
}

export function loadManagedRun(
  projectRoot: string,
  taskId: string,
  runId: string,
): ManagedRunState {
  return readJson(
    path.join(managedRunDir(projectRoot, taskId, runId), "run-state.json"),
  );
}

export function saveManagedRun(state: ManagedRunState): void {
  writeJsonAtomic(
    path.join(
      managedRunDir(state.projectRoot, state.taskId, state.runId),
      "run-state.json",
    ),
    { ...state, updatedAt: new Date().toISOString() },
  );
}

export function loadRegistry(
  env: NodeJS.ProcessEnv = process.env,
): ManagedRegistry {
  const file = managedRegistryPath(env);
  if (!existsSync(file)) return { schemaVersion: 1, tasks: [] };
  return readJson<ManagedRegistry>(file);
}

export function saveRegistry(
  registry: ManagedRegistry,
  env: NodeJS.ProcessEnv = process.env,
): void {
  writeJsonAtomic(managedRegistryPath(env), registry);
}

export function upsertRegistryEntry(
  entry: ManagedRegistryEntry,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const registry = loadRegistry(env);
  const index = registry.tasks.findIndex(
    (item) => item.taskId === entry.taskId,
  );
  if (index >= 0) registry.tasks[index] = entry;
  else registry.tasks.push(entry);
  saveRegistry(registry, env);
}

export function appendTaskReport(
  state: ManagedRunState,
  section: string,
): void {
  const file = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    "task-report.md",
  );
  appendFileSync(file, `\n${section.trim()}\n`, "utf-8");
}

export function updateTaskReportStatus(
  state: ManagedRunState,
  status: string,
): void {
  const file = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    "task-report.md",
  );
  const content = readFileSync(file, "utf-8");
  writeFileSync(
    file,
    content.replace(/^状态：.*$/m, `状态：${status}`),
    "utf-8",
  );
}

function buildRequestMarkdown(contract: ManagedTaskContract): string {
  return [
    "# 用户原始任务",
    "",
    `任务编号：${contract.taskId}`,
    `创建时间：${contract.createdAt}`,
    `来源：${contract.source}`,
    "",
    contract.request,
    "",
  ].join("\n");
}

function buildTaskBrief(contract: ManagedTaskContract): string {
  const criteria = contract.doneCriteria.map((item) => `- ${item}`).join("\n");
  return [
    "# 托管任务合同",
    "",
    `任务编号：${contract.taskId}`,
    `任务档位：${contract.profile}`,
    `关联仓库：${contract.relatedProjectRoots.join("、") || "无"}`,
    `监督 Agent：${contract.supervisorAgent}`,
    `执行 Agent：${contract.executorAgent}`,
    `合同哈希：${contract.contractHash}`,
    ...(contract.taskPrompt
      ? [
          `原始任务 Prompt：${contract.taskPrompt.originalPath}`,
          `冻结 Prompt 快照：${contract.taskPrompt.snapshotPath}`,
          `Prompt SHA-256：${contract.taskPrompt.sha256}`,
        ]
      : []),
    "",
    "## 目标",
    "",
    contract.objective,
    "",
    "## 完成标准",
    "",
    criteria,
    "",
    "## 权限边界",
    "",
    "- 安全边界内最大自治。",
    "- 禁止自动 Git 提交、推送、发布和生产写入。",
    "- 禁止跳过沙箱或权限检查。",
    "",
  ].join("\n");
}

function writeTaskPromptSnapshot(contract: ManagedTaskContract): void {
  if (!contract.taskPrompt) return;
  const content = readFileSync(contract.taskPrompt.originalPath, "utf-8");
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== contract.taskPrompt.sha256) {
    throw new Error("任务 Prompt 在创建合同后发生变化，拒绝生成快照");
  }
  writeFileSync(contract.taskPrompt.snapshotPath, content, "utf-8");
}
