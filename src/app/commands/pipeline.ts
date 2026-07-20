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
import type { Language } from "../../types.js";
import { resolveRuntimeLanguage } from "../../domains/config/cli-help.js";
import { managedText } from "../../domains/managed-work/i18n.js";

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
  language?: string;
}

export async function pipelineCommand(
  request?: string,
  options: PipelineCommandOptions = {},
): Promise<void> {
  const language = resolveRuntimeLanguage(options.language);
  if (options.resumeTask) {
    await resumeManagedTask(options.resumeTask, options, language);
    return;
  }
  if (options.managed) {
    await submitManagedTask(request, options, language);
    return;
  }
  checkSkillDeployment(SKILL_NAME, options);
}

async function submitManagedTask(
  request: string | undefined,
  options: PipelineCommandOptions,
  language: Language,
): Promise<void> {
  if (!request?.trim()) {
    throw new Error(
      managedText(
        language,
        "使用 --managed 时必须提供任务内容",
        "A task is required when using --managed",
      ),
    );
  }
  const input = resolveManagedInput(request, {
    projectRoot: options.project,
    relatedProjectRoots: options.addDir,
    profile: options.profile,
    language,
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
    language,
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
    summary: managedText(
      language,
      "已创建托管任务并冻结最小任务合同",
      "Created managed task and froze the minimal task contract",
    ),
  });
  console.log(
    managedText(
      language,
      `已创建托管任务：${contract.taskId}`,
      `Managed task created: ${contract.taskId}`,
    ),
  );
  console.log(
    managedText(
      language,
      `任务目录：${contract.projectRoot}/.superflow/tasks/${contract.taskId}`,
      `Task directory: ${contract.projectRoot}/.superflow/tasks/${contract.taskId}`,
    ),
  );

  const service = ensureManagedService();
  console.log(
    managedText(
      language,
      `后台服务已接收任务，PID：${service.pid}`,
      `Background service accepted the task, PID: ${service.pid}`,
    ),
  );
  await waitAndReport(
    contract.projectRoot,
    contract.taskId,
    state.runId,
    language,
  );
}

async function resumeManagedTask(
  taskId: string,
  options: PipelineCommandOptions,
  requestedLanguage: Language,
): Promise<void> {
  const registry = loadRegistry();
  const entry = registry.tasks.find((item) => item.taskId === taskId);
  if (!entry) {
    throw new Error(
      managedText(
        requestedLanguage,
        `找不到托管任务：${taskId}`,
        `Managed task not found: ${taskId}`,
      ),
    );
  }
  if (
    options.project &&
    canonicalPath(options.project) !== canonicalPath(entry.projectRoot)
  ) {
    throw new Error(
      managedText(
        requestedLanguage,
        "指定项目目录与任务登记目录不一致",
        "Specified project directory does not match the registered task directory",
      ),
    );
  }
  const contract = loadManagedTask(entry.projectRoot, taskId);
  const language = contract.language ?? requestedLanguage;
  const state = loadManagedRun(entry.projectRoot, taskId, entry.activeRunId);
  const resumable = [
    "waiting_for_human",
    "waiting_for_connectivity",
    "paused",
    "running",
  ];
  if (!resumable.includes(state.status)) {
    throw new Error(
      managedText(
        language,
        `任务当前状态 ${state.status} 不允许恢复`,
        `Task status ${state.status} cannot be resumed`,
      ),
    );
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
    summary: managedText(
      language,
      "已请求从现有任务记录和原会话恢复",
      "Requested recovery from existing task records and sessions",
    ),
  });
  const service = ensureManagedService();
  console.log(
    managedText(
      language,
      `已恢复托管任务：${taskId}，后台服务 PID：${service.pid}`,
      `Managed task resumed: ${taskId}; background service PID: ${service.pid}`,
    ),
  );
  await waitAndReport(entry.projectRoot, taskId, state.runId, language);
}

function canonicalPath(value: string): string {
  const resolved = path.resolve(value);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

async function waitAndReport(
  projectRoot: string,
  taskId: string,
  runId: string,
  language: Language,
): Promise<void> {
  const result = await waitForManagedTask(projectRoot, taskId, runId, {
    ensureService: () => ensureManagedService(),
    onProgress: (state) => {
      console.log(
        managedText(
          language,
          `[${state.status}] ${state.currentStep} | 检查 ${state.reviewRound} | 总调用 ${state.totalAgentInvocations}`,
          `[${state.status}] ${state.currentStep} | review ${state.reviewRound} | total calls ${state.totalAgentInvocations}`,
        ),
      );
    },
  });
  console.log(
    managedText(language, `任务状态：${result.status}`, `Task status: ${result.status}`),
  );
  if (result.blocker) {
    console.log(
      managedText(language, `阻塞：${result.blocker}`, `Blocker: ${result.blocker}`),
    );
  }
  console.log(
    managedText(
      language,
      `任务报告：${managedTaskReportPath(result)}`,
      `Task report: ${managedTaskReportPath(result)}`,
    ),
  );
}
