import {
  checkSkillDeployment,
  type SkillCheckOptions,
} from "../../domains/skill/check.js";
import { createManagedTaskContract } from "../../domains/managed-work/contract.js";
import { appendManagedEvent } from "../../domains/managed-work/journal.js";
import { ensureManagedService } from "../../domains/managed-work/service.js";
import {
  createManagedTaskFiles,
  loadManagedRun,
  loadManagedTask,
  loadRegistry,
  saveManagedRun,
  saveManagedTask,
  upsertRegistryEntry,
} from "../../domains/managed-work/storage.js";
import { initManagedRunState } from "../../domains/managed-work/state.js";
import { resolveManagedInput } from "../../domains/managed-work/input.js";
import {
  managedTaskReportPath,
  waitForManagedTask,
} from "../../domains/managed-work/wait.js";
import type {
  ManagedAgent,
  ManagedProfile,
} from "../../domains/managed-work/types.js";
import path from "path";
import { existsSync, realpathSync } from "fs";

const SKILL_NAME = "superflow-pipeline";

export interface PipelineCommandOptions extends SkillCheckOptions {
  managed?: boolean;
  project?: string;
  profile?: ManagedProfile | "auto";
  supervisor?: ManagedAgent;
  executor?: ManagedAgent;
  addDir?: string[];
  dryRun?: boolean;
  resumeTask?: string;
}

export async function pipelineCommand(
  request?: string,
  options: PipelineCommandOptions = {},
): Promise<void> {
  if (options.resumeTask) {
    await resumeManagedTask(options.resumeTask, options);
    return;
  }
  if (options.managed) {
    await submitManagedTask(request, options);
    return;
  }
  checkSkillDeployment(SKILL_NAME, options);
}

async function submitManagedTask(
  request: string | undefined,
  options: PipelineCommandOptions,
): Promise<void> {
  if (!request?.trim()) {
    throw new Error("使用 --managed 时必须提供任务内容");
  }
  const input = resolveManagedInput(request, {
    projectRoot: options.project,
    relatedProjectRoots: options.addDir,
    profile: options.profile,
  });
  const contract = createManagedTaskContract({
    request: input.request,
    projectRoot: input.projectRoot,
    relatedProjectRoots: input.relatedProjectRoots,
    profile: input.profile,
    supervisorAgent: options.supervisor,
    executorAgent: options.executor,
    source: input.source,
    taskPromptPath: input.taskPromptPath,
  });
  const state = initManagedRunState(contract);
  if (options.dryRun) {
    console.log(JSON.stringify({ contract, run: state }, null, 2));
    return;
  }

  createManagedTaskFiles(contract, state);
  appendManagedEvent(state, {
    eventType: "run.created",
    actor: "superflow-pipeline",
    role: "runner",
    summary: "已创建托管任务并冻结最小任务合同",
  });
  console.log(`已创建托管任务：${contract.taskId}`);
  console.log(
    `任务目录：${contract.projectRoot}/.superflow/tasks/${contract.taskId}`,
  );

  const service = ensureManagedService();
  console.log(`后台服务已接收任务，PID：${service.pid}`);
  await waitAndReport(contract.projectRoot, contract.taskId, state.runId);
}

async function resumeManagedTask(
  taskId: string,
  options: PipelineCommandOptions,
): Promise<void> {
  const registry = loadRegistry();
  const entry = registry.tasks.find((item) => item.taskId === taskId);
  if (!entry) throw new Error(`找不到托管任务：${taskId}`);
  if (
    options.project &&
    canonicalPath(options.project) !== canonicalPath(entry.projectRoot)
  ) {
    throw new Error("指定项目目录与任务登记目录不一致");
  }
  const contract = loadManagedTask(entry.projectRoot, taskId);
  const state = loadManagedRun(entry.projectRoot, taskId, entry.activeRunId);
  const resumable = [
    "waiting_for_human",
    "waiting_for_connectivity",
    "paused",
    "running",
  ];
  if (!resumable.includes(state.status)) {
    throw new Error(`任务当前状态 ${state.status} 不允许恢复`);
  }
  state.status = "queued";
  state.currentStep = "recovering";
  state.blocker = null;
  state.activeSince = null;
  contract.status = "queued";
  saveManagedRun(state);
  saveManagedTask(contract);
  upsertRegistryEntry({
    ...entry,
    status: "queued",
    updatedAt: new Date().toISOString(),
  });
  appendManagedEvent(state, {
    eventType: "recovery.started",
    actor: "superflow-pipeline",
    role: "runner",
    summary: "已请求从现有任务记录和原会话恢复",
  });
  const service = ensureManagedService();
  console.log(`已恢复托管任务：${taskId}，后台服务 PID：${service.pid}`);
  await waitAndReport(entry.projectRoot, taskId, state.runId);
}

function canonicalPath(value: string): string {
  const resolved = path.resolve(value);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

async function waitAndReport(
  projectRoot: string,
  taskId: string,
  runId: string,
): Promise<void> {
  const result = await waitForManagedTask(projectRoot, taskId, runId, {
    ensureService: () => ensureManagedService(),
    onProgress: (state) => {
      console.log(
        `[${state.status}] ${state.currentStep} | ` +
          `检查 ${state.reviewRound} | 总调用 ${state.totalAgentInvocations}`,
      );
    },
  });
  console.log(`任务状态：${result.status}`);
  if (result.blocker) console.log(`阻塞：${result.blocker}`);
  console.log(`任务报告：${managedTaskReportPath(result)}`);
}
