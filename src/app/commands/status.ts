import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "fs";
import path from "path";
import { t } from "../../domains/config/i18n.js";
import { resolveRuntimeLanguage } from "../../domains/config/cli-help.js";
import { managedText } from "../../domains/managed-work/i18n.js";
import { readServiceState } from "../../domains/managed-work/service.js";
import { managedRunDir } from "../../domains/managed-work/paths.js";
import {
  loadManagedRun,
  loadRegistry,
} from "../../domains/managed-work/storage.js";
import {
  effectiveExecutorInvocations,
  effectiveTotalAgentInvocations,
} from "../../domains/managed-work/state.js";
import { collectCheck } from "./check.js";
import type { Language } from "../../types.js";
import { isProcessAlive } from "../../platform/process-liveness.js";

export interface ChangeStatus {
  name: string;
  path: string;
  workflow: string;
  phase: string;
  buildMode: string;
  reviewMode: string;
  autoTransition: string;
  verifyMode: string;
  verifyResult: string;
  tasksCompleted: number;
  tasksTotal: number;
  taskFrontier: string[];
  taskDependencyIssues: string[];
  nextCommand: string | null;
  nextReason: string;
  risks: Array<{
    level: "info" | "warning" | "error";
    code: string;
    message: string;
  }>;
  docGaps: number;
}

export interface StatusResult {
  projectPath: string;
  changes: ChangeStatus[];
  managedTasks: ManagedTaskStatus[];
  managedService: { pid: number; running: boolean } | null;
}

export interface ManagedTaskStatus {
  taskId: string;
  profile: string;
  status: string;
  currentStep: string;
  reviewRound: number;
  maxReviewRounds: number;
  executorInvocations: number;
  physicalExecutorInvocations: number;
  executorInvocationCredits: number;
  maxExecutorInvocations: number;
  totalAgentInvocations: number;
  physicalTotalAgentInvocations: number;
  totalAgentInvocationCredits: number;
  connectivityRetryCount: number;
  maxTotalAgentInvocations: number;
  supervisorSession: string;
  executorSession: string;
  blocker: string | null;
  taskPrompt: string | null;
  hostReviewPrompt: string | null;
  progressPath: string;
  reportPath: string;
  updatedAt: string;
  deliveryProgress: string;
  runtimePhase: string;
  executorStage: string;
  executorMilestone: string;
  runtimeModel: string;
  runtimeReasoningEffort: string;
  executorConfig: string;
  runtimeTools: string;
  invocationElapsedSeconds: number | null;
  sinceProgressSeconds: number | null;
  executorTokens: string;
  hostTokens: string;
}

export async function statusCommand(
  targetPath = ".",
  options: { json?: boolean; language?: unknown } = {},
): Promise<void> {
  const language = resolveRuntimeLanguage(options.language);
  const result = await collectStatus(targetPath, language);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  printStatus(result, language);
}

export async function collectStatus(
  targetPath = ".",
  language: Language = "zh",
): Promise<StatusResult> {
  const projectPath = path.resolve(targetPath);
  const changesRoot = path.join(projectPath, "openspec", "changes");
  const changes: ChangeStatus[] = [];
  const managedTasks = collectManagedTasks(projectPath, language);
  const service = readServiceState();
  const managedService = service
    ? { pid: service.pid, running: isProcessAlive(service.pid) }
    : null;

  if (!existsSync(changesRoot))
    return { projectPath, changes, managedTasks, managedService };

  for (const entry of readdirSync(changesRoot).sort()) {
    const changeDir = path.join(changesRoot, entry);
    if (!statSync(changeDir).isDirectory()) continue;
    const statePath = path.join(changeDir, ".sdd", "state.yaml");
    if (!existsSync(statePath)) continue;

    const state = parseSimpleYaml(readFileSync(statePath, "utf-8"));
    if (state.archived === "true" || state.phase === "done") continue;
    const tasks = readTasks(path.join(changeDir, "tasks.md"), language);

    const docCheck = collectCheck(changeDir, entry);

    changes.push({
      name: entry,
      path: path.relative(projectPath, changeDir),
      workflow: state.workflow ?? "full",
      phase: state.phase ?? "unknown",
      buildMode: state.build_mode ?? "null",
      reviewMode: state.review_mode ?? "null",
      autoTransition: state.auto_transition ?? "true",
      verifyMode: state.verify_mode ?? "null",
      verifyResult: state.verify_result ?? "pending",
      tasksCompleted: tasks.done,
      tasksTotal: tasks.total,
      taskFrontier: state.phase === "implement" ? tasks.frontier : [],
      taskDependencyIssues: tasks.issues,
      nextCommand: nextCommand(entry, state.phase),
      nextReason: nextReason(state.phase, tasks, state.verify_result, language),
      risks: buildRisks(changeDir, state, tasks, language),
      docGaps: docCheck.failed,
    });
  }

  return { projectPath, changes, managedTasks, managedService };
}

function fileExists(changeDir: string, file: string): boolean {
  return existsSync(path.join(changeDir, file));
}

function parseSimpleYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^\s/.test(line)) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}

interface TaskProgress {
  done: number;
  total: number;
  frontier: string[];
  issues: string[];
}

const TASK_ID = /\b(?:T-\d+|P\d+|\d+(?:\.\d+)*)\b/i;
const TASK_IDS = /\b(?:T-\d+|P\d+|\d+(?:\.\d+)*)\b/gi;

function readTasks(tasksPath: string, language: Language): TaskProgress {
  if (!existsSync(tasksPath)) {
    return { done: 0, total: 0, frontier: [], issues: [] };
  }
  const lines = readFileSync(tasksPath, "utf-8").split(/\r?\n/);
  const entries: Array<{
    id: string;
    done: boolean;
    blockedBy: string[];
    declared: boolean;
  }> = [];
  let current: (typeof entries)[number] | undefined;
  let done = 0;
  let total = 0;
  let hasDependencyMetadata = false;
  for (const line of lines) {
    const checkbox = /^\s*-\s*\[([ xX])\]\s*(.*)$/.exec(line);
    if (checkbox) {
      total += 1;
      const completed = checkbox[1].toLowerCase() === "x";
      if (completed) done += 1;
      const id = TASK_ID.exec(checkbox[2])?.[0].toUpperCase() ?? "";
      current = { id, done: completed, blockedBy: [], declared: false };
      entries.push(current);
      continue;
    }
    const dependency = /^\s*-\s*(?:\*\*)?Blocked by(?:\*\*)?\s*:\s*(.*)$/i.exec(line);
    if (current && dependency) {
      hasDependencyMetadata = true;
      current.declared = true;
      current.blockedBy = [...dependency[1].matchAll(TASK_IDS)]
        .map((match) => match[0].toUpperCase());
    }
  }
  if (!hasDependencyMetadata) return { done, total, frontier: [], issues: [] };

  const issues: string[] = [];
  const byId = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    if (!entry.id) {
      issues.push(language === "en"
        ? "Task graph contains a checkbox without an ID"
        : "任务图中有未标注编号的 checkbox");
    } else if (byId.has(entry.id)) {
      issues.push(language === "en"
        ? `Duplicate task ID: ${entry.id}`
        : `任务 ID 重复: ${entry.id}`);
    } else {
      byId.set(entry.id, entry);
    }
    if (!entry.declared) {
      issues.push(language === "en"
        ? `${entry.id || "Task"} lacks Blocked by metadata`
        : `${entry.id || "任务"} 缺少 Blocked by 元数据`);
    }
  }
  for (const entry of entries) {
    for (const predecessor of entry.blockedBy) {
      if (!byId.has(predecessor)) {
        issues.push(language === "en"
          ? `${entry.id} references missing predecessor ${predecessor}`
          : `${entry.id} 引用了不存在的前置任务 ${predecessor}`);
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      issues.push(language === "en"
        ? `Task dependency cycle: ${id}`
        : `任务依赖成环: ${id}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const predecessor of byId.get(id)?.blockedBy ?? []) {
      if (byId.has(predecessor)) visit(predecessor);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  for (const entry of entries) {
    if (entry.done && entry.blockedBy.some((id) => !byId.get(id)?.done)) {
      issues.push(language === "en"
        ? `${entry.id} is complete before its predecessor`
        : `${entry.id} 已完成，但前置任务尚未完成`);
    }
  }
  const frontier = issues.length > 0 ? [] : entries
    .filter((entry) => !entry.done && entry.blockedBy.every((id) => byId.get(id)?.done))
    .map((entry) => entry.id);
  return { done, total, frontier, issues };
}

function nextCommand(change: string, phase: string | undefined): string | null {
  switch (phase) {
    case "docs":
      return `superflow docs ${change}`;
    case "design":
      return `superflow design ${change}`;
    case "implement":
      return `superflow implement ${change}`;
    case "verify":
      return `superflow verify ${change}`;
    case "archive":
      return `superflow archive ${change}`;
    default:
      return null;
  }
}

function nextReason(
  phase: string | undefined,
  tasks: TaskProgress,
  verifyResult: string | undefined,
  language: Language,
): string {
  if (verifyResult === "fail") return t(language, "nextVerifyFailed");
  switch (phase) {
    case "docs":
      return t(language, "nextDocs");
    case "design":
      return t(language, "nextDesign");
    case "implement": {
      const remaining = tasks.total - tasks.done;
      if (remaining > 0) {
        return language === "en"
          ? `Current phase is implement. ${remaining} task(s) remain.`
          : `当前处于 implement 阶段，还有 ${remaining} 个任务未完成。`;
      }
      return t(language, "nextImplementDone");
    }
    case "verify":
      return t(language, "nextVerify");
    case "archive":
      return t(language, "nextArchive");
    default:
      return t(language, "nextUnknown");
  }
}

function buildRisks(
  changeDir: string,
  state: Record<string, string>,
  tasks: TaskProgress,
  language: Language,
): ChangeStatus["risks"] {
  const risks: ChangeStatus["risks"] = [];
  const phase = state.phase ?? "unknown";

  if (phase === "unknown") {
    risks.push({
      level: "warning",
      code: "UNKNOWN_PHASE",
      message: t(language, "riskUnknownPhase"),
    });
  }
  if (tasks.total === 0 || !fileExists(changeDir, "tasks.md")) {
    risks.push({
      level: "warning",
      code: "TASKS_MISSING",
      message: t(language, "riskTasksMissing"),
    });
  } else if (phase === "implement" && tasks.done < tasks.total) {
    const remaining = tasks.total - tasks.done;
    risks.push({
      level: "warning",
      code: "TASKS_INCOMPLETE",
      message:
        language === "en"
          ? `${remaining} task(s) remain.`
          : `仍有 ${remaining} 个任务未完成。`,
    });
  }
  if (tasks.issues.length > 0) {
    risks.push({
      level: "warning",
      code: "TASK_GRAPH_INVALID",
      message: tasks.issues.join(language === "en" ? "; " : "；"),
    });
  }
  if (
    (state.workflow ?? "full") === "full" &&
    (state.review_mode ?? "null") === "null"
  ) {
    risks.push({
      level: "warning",
      code: "REVIEW_MODE_MISSING",
      message: t(language, "riskReviewMissing"),
    });
  }
  if ((state.auto_transition ?? "true") === "false") {
    risks.push({
      level: "info",
      code: "AUTO_TRANSITION_OFF",
      message:
        language === "en"
          ? "auto_transition is off; manual trigger required."
          : "auto_transition 已关闭，需手动推进阶段。",
    });
  }
  // 文档缺口检测（复用已导入的 collectCheck）
  const docCheck = collectCheck(changeDir, "");
  if (docCheck.failed > 0) {
    risks.push({
      level: "error",
      code: "DOCS_INCOMPLETE",
      message:
        language === "en"
          ? `Missing ${docCheck.failed} required SDD document(s). Run: superflow check <change>`
          : `缺失 ${docCheck.failed} 个必备 SDD 文档。执行: superflow check <change>`,
    });
  }
  if (state.verify_result === "fail") {
    risks.push({
      level: "error",
      code: "VERIFY_FAILED",
      message: t(language, "riskVerifyFailed"),
    });
  } else if (phase === "verify" && !fileExists(changeDir, "test-report.md")) {
    risks.push({
      level: "warning",
      code: "TEST_REPORT_MISSING",
      message: t(language, "riskTestReportMissing"),
    });
  }
  for (const artifact of ["proposal.md", "design.md", "tests.md"] as const) {
    if (!fileExists(changeDir, artifact)) {
      risks.push({
        level: "info",
        code: "ARTIFACT_MISSING",
        message:
          language === "en" ? `Missing ${artifact}.` : `缺少 ${artifact}。`,
      });
    }
  }
  return risks;
}

function printStatus(result: StatusResult, language: Language): void {
  if (result.changes.length === 0 && result.managedTasks.length === 0) {
    console.log(t(language, "noActiveChanges"));
    return;
  }

  if (result.managedTasks.length > 0) {
    const service = result.managedService
      ? `${managedText(language, result.managedService.running ? "运行中" : "未运行", result.managedService.running ? "running" : "stopped")} (PID ${result.managedService.pid})`
      : managedText(language, "未启动", "not started");
    console.log(
      managedText(
        language,
        `托管任务 (${result.projectPath}) | 后台服务：${service}\n`,
        `Managed tasks (${result.projectPath}) | background service: ${service}\n`,
      ),
    );
    for (const task of result.managedTasks) {
      console.log(
        `- ${task.taskId}: ${task.status} | ${task.profile} | ${task.currentStep}`,
      );
      console.log(
        managedText(
          language,
          `  交付进度：${task.deliveryProgress} | 连接重试 ${task.connectivityRetryCount}`,
          `  delivery progress: ${task.deliveryProgress} | connectivity retries ${task.connectivityRetryCount}`,
        ),
      );
      console.log(
        managedText(
          language,
          `  运行遥测：${task.runtimePhase} | 当前阶段 ${task.executorStage} | 已达里程碑 ${task.executorMilestone} | 模型 ${task.runtimeModel} | 推理深度 ${task.runtimeReasoningEffort} | 配置 ${task.executorConfig} | 工具 ${task.runtimeTools} | 调用耗时 ${task.invocationElapsedSeconds ?? "-"}s | 最近进展 ${task.sinceProgressSeconds ?? "-"}s`,
          `  runtime telemetry: ${task.runtimePhase} | active stage ${task.executorStage} | reached milestone ${task.executorMilestone} | model ${task.runtimeModel} | reasoning effort ${task.runtimeReasoningEffort} | config ${task.executorConfig} | tools ${task.runtimeTools} | invocation elapsed ${task.invocationElapsedSeconds ?? "-"}s | since progress ${task.sinceProgressSeconds ?? "-"}s`,
        ),
      );
      console.log(
        managedText(
          language,
          `  Token：研发 ${task.executorTokens} | 主 Agent ${task.hostTokens}`,
          `  tokens: executor ${task.executorTokens} | host ${task.hostTokens}`,
        ),
      );
      if (
        task.executorInvocationCredits > 0 ||
        task.totalAgentInvocationCredits > 0
      ) {
        console.log(
          managedText(
            language,
            `  物理调用：执行 ${task.physicalExecutorInvocations}、总计 ${task.physicalTotalAgentInvocations}；基础设施抵扣 ${task.executorInvocationCredits}`,
            `  physical calls: executor ${task.physicalExecutorInvocations}, total ${task.physicalTotalAgentInvocations}; infrastructure credits ${task.executorInvocationCredits}`,
          ),
        );
      }
      console.log(
        managedText(
          language,
          `  Host ${task.reviewRound}/${task.maxReviewRounds} | 有效研发 ${task.executorInvocations}/${task.maxExecutorInvocations} | 有效总调用 ${task.totalAgentInvocations}/${task.maxTotalAgentInvocations}`,
          `  Host ${task.reviewRound}/${task.maxReviewRounds} | effective executor ${task.executorInvocations}/${task.maxExecutorInvocations} | effective total ${task.totalAgentInvocations}/${task.maxTotalAgentInvocations}`,
        ),
      );
      console.log(
        managedText(
          language,
          `  会话：监督=${task.supervisorSession}，执行=${task.executorSession}`,
          `  sessions: supervisor=${task.supervisorSession}, executor=${task.executorSession}`,
        ),
      );
      if (task.blocker) {
        console.log(
          managedText(
            language,
            `  阻塞：${task.blocker}`,
            `  blocker: ${task.blocker}`,
          ),
        );
      }
      if (task.taskPrompt) {
        console.log(
          managedText(
            language,
            `  任务 Prompt：${task.taskPrompt}`,
            `  task prompt: ${task.taskPrompt}`,
          ),
        );
      }
      if (task.hostReviewPrompt) {
        console.log(
          managedText(
            language,
            `  Host 评审 Prompt：${task.hostReviewPrompt}`,
            `  host review prompt: ${task.hostReviewPrompt}`,
          ),
        );
      }
      console.log(
        managedText(
          language,
          `  进度：${task.progressPath}`,
          `  progress: ${task.progressPath}`,
        ),
      );
      console.log(
        managedText(
          language,
          `  报告：${task.reportPath}`,
          `  report: ${task.reportPath}`,
        ),
      );
    }
    if (result.changes.length > 0) console.log("");
  }

  if (result.changes.length > 0) {
    console.log(`${t(language, "statusHeader")} (${result.projectPath}):\n`);
  }
  for (const change of result.changes) {
    const tasks =
      change.tasksTotal > 0
        ? ` | tasks ${change.tasksCompleted}/${change.tasksTotal}`
        : "";
    const docGap =
      change.docGaps > 0
        ? managedText(
            language,
            ` 📋缺${change.docGaps}文档`,
            ` 📋${change.docGaps} docs missing`,
          )
        : "";
    console.log(
      `- ${change.name}: phase=${change.phase}, workflow=${change.workflow}, review=${change.reviewMode}, auto=${change.autoTransition}${tasks}${docGap}`,
    );
    console.log(`  path: ${change.path}`);
    if (change.nextCommand) console.log(`  next: ${change.nextCommand}`);
    console.log(`  reason: ${change.nextReason}`);
    if (change.taskFrontier.length > 0) {
      console.log(`  frontier: ${change.taskFrontier.join(", ")}`);
    }
    for (const risk of change.risks) {
      console.log(
        `  ${risk.level.toUpperCase()} ${risk.code}: ${risk.message}`,
      );
    }
  }
}

function collectManagedTasks(
  projectPath: string,
  language: Language,
): ManagedTaskStatus[] {
  const registry = loadRegistry();
  return registry.tasks
    .filter(
      (entry) =>
        canonicalPath(entry.projectRoot) === canonicalPath(projectPath),
    )
    .map((entry) => {
      try {
        const state = loadManagedRun(
          entry.projectRoot,
          entry.taskId,
          entry.activeRunId,
        );
        const task = JSON.parse(
          readFileSync(
            path.join(
              entry.projectRoot,
              ".superflow",
              "tasks",
              entry.taskId,
              "task.json",
            ),
            "utf-8",
          ),
        ) as {
          taskPrompt?: { originalPath: string } | null;
          executorConfig?: {
            model: string | null;
            reasoningEffort: string | null;
            confirmed: boolean;
          };
          budgets: {
            maxReviewRounds: number;
            maxExecutorInvocations: number;
            maxTotalAgentInvocations: number;
            maxSingleInvocationHours?: number;
          };
        };
        const runDir = managedRunDir(
          entry.projectRoot,
          entry.taskId,
          entry.activeRunId,
        );
        return {
          taskId: entry.taskId,
          profile: entry.profile,
          status: state.status,
          currentStep: state.currentStep,
          reviewRound: state.reviewRound,
          maxReviewRounds: task.budgets.maxReviewRounds,
          executorInvocations: effectiveExecutorInvocations(state),
          physicalExecutorInvocations: state.executorInvocations,
          executorInvocationCredits: state.executorInvocationCredits ?? 0,
          maxExecutorInvocations: task.budgets.maxExecutorInvocations,
          totalAgentInvocations: effectiveTotalAgentInvocations(state),
          physicalTotalAgentInvocations: state.totalAgentInvocations,
          totalAgentInvocationCredits: state.totalAgentInvocationCredits ?? 0,
          connectivityRetryCount: state.connectivityRetryCount ?? 0,
          maxTotalAgentInvocations: task.budgets.maxTotalAgentInvocations,
          supervisorSession: shortSession(state.supervisorSession.sessionId),
          executorSession: shortSession(state.executorSession.sessionId),
          blocker: state.blocker,
          taskPrompt: task.taskPrompt?.originalPath ?? null,
          hostReviewPrompt: state.pendingExternalReview?.promptPath ?? null,
          progressPath: path.join(runDir, "progress.md"),
          reportPath: path.join(runDir, "task-report.md"),
          updatedAt: state.updatedAt,
          deliveryProgress: deliveryProgressText(state.deliveryProgress),
          runtimePhase: state.runtimeTelemetry?.phase ?? "idle",
          executorStage:
            state.executorActiveStage ?? state.executorStage ?? "unknown",
          executorMilestone: state.executorStage ?? "unknown",
          runtimeModel: state.runtimeTelemetry?.model ?? "unknown",
          runtimeReasoningEffort:
            state.runtimeTelemetry?.reasoningEffort ?? "unknown",
          executorConfig: task.executorConfig
            ? `${task.executorConfig.model ?? "unknown"}/${task.executorConfig.reasoningEffort ?? "unknown"} (${task.executorConfig.confirmed ? "confirmed" : "pending confirmation"})`
            : "not applicable",
          runtimeTools: state.runtimeTelemetry?.tools.join(",") || "unknown",
          invocationElapsedSeconds: state.activeSince
            ? Math.round((Date.now() - Date.parse(state.activeSince)) / 1_000)
            : null,
          sinceProgressSeconds: state.runtimeTelemetry?.lastProgressAt
            ? Math.round(
                (Date.now() -
                  Date.parse(state.runtimeTelemetry.lastProgressAt)) /
                  1_000,
              )
            : null,
          executorTokens: usageText(state.executorUsage),
          hostTokens: usageText(state.hostUsage),
        };
      } catch {
        return {
          taskId: entry.taskId,
          profile: entry.profile,
          status: "state_missing",
          currentStep: "recover_required",
          reviewRound: 0,
          maxReviewRounds: 0,
          executorInvocations: 0,
          physicalExecutorInvocations: 0,
          executorInvocationCredits: 0,
          maxExecutorInvocations: 0,
          totalAgentInvocations: 0,
          physicalTotalAgentInvocations: 0,
          totalAgentInvocationCredits: 0,
          connectivityRetryCount: 0,
          maxTotalAgentInvocations: 0,
          supervisorSession: "--",
          executorSession: "--",
          blocker: managedText(
            language,
            "本地任务状态缺失，需要恢复检查",
            "Local task state is missing; recovery is required",
          ),
          taskPrompt: null,
          hostReviewPrompt: null,
          progressPath: "",
          reportPath: "",
          updatedAt: entry.updatedAt,
          deliveryProgress: "source 0/0, environment 0/0, release 0/0",
          runtimePhase: "unknown",
          executorStage: "unknown",
          executorMilestone: "unknown",
          runtimeModel: "unknown",
          runtimeReasoningEffort: "unknown",
          executorConfig: "unknown",
          runtimeTools: "unknown",
          invocationElapsedSeconds: null,
          sinceProgressSeconds: null,
          executorTokens: "unknown",
          hostTokens: "unknown",
        };
      }
    });
}

function shortSession(sessionId: string | null): string {
  return sessionId?.slice(0, 8) ?? "--";
}

function deliveryProgressText(
  progress:
    | {
        source: { completed: number; total: number };
        environment: { completed: number; total: number };
        release: { completed: number; total: number };
      }
    | undefined,
): string {
  const value = progress ?? {
    source: { completed: 0, total: 0 },
    environment: { completed: 0, total: 0 },
    release: { completed: 0, total: 0 },
  };
  return `source ${value.source.completed}/${value.source.total}, environment ${value.environment.completed}/${value.environment.total}, release ${value.release.completed}/${value.release.total}`;
}

function usageText(
  usage:
    | { inputTokens: number | null; outputTokens: number | null }
    | undefined,
): string {
  if (!usage || (usage.inputTokens == null && usage.outputTokens == null)) {
    return "unknown";
  }
  return `input ${usage.inputTokens ?? "?"}, output ${usage.outputTokens ?? "?"}`;
}

function canonicalPath(value: string): string {
  const resolved = path.resolve(value);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}
