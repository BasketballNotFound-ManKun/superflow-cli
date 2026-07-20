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
  maxExecutorInvocations: number;
  totalAgentInvocations: number;
  maxTotalAgentInvocations: number;
  supervisorSession: string;
  executorSession: string;
  blocker: string | null;
  taskPrompt: string | null;
  progressPath: string;
  reportPath: string;
  updatedAt: string;
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
    const tasks = countTasks(path.join(changeDir, "tasks.md"));

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
      nextCommand: nextCommand(entry, state.phase),
      nextReason: nextReason(
        state.phase,
        tasks,
        state.verify_result,
        language,
      ),
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

function countTasks(tasksPath: string): { done: number; total: number } {
  if (!existsSync(tasksPath)) return { done: 0, total: 0 };
  const lines = readFileSync(tasksPath, "utf-8").split(/\r?\n/);
  return {
    done: lines.filter((line) => /^\s*-\s*\[[xX]\]/.test(line)).length,
    total: lines.filter((line) => /^\s*-\s*\[[ xX]\]/.test(line)).length,
  };
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
  tasks: { done: number; total: number },
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
  tasks: { done: number; total: number },
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
          `  轮次 ${task.reviewRound}/${task.maxReviewRounds} | 执行 ${task.executorInvocations}/${task.maxExecutorInvocations} | 总调用 ${task.totalAgentInvocations}/${task.maxTotalAgentInvocations}`,
          `  reviews ${task.reviewRound}/${task.maxReviewRounds} | executor ${task.executorInvocations}/${task.maxExecutorInvocations} | total calls ${task.totalAgentInvocations}/${task.maxTotalAgentInvocations}`,
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
        console.log(managedText(language, `  阻塞：${task.blocker}`, `  blocker: ${task.blocker}`));
      }
      if (task.taskPrompt) {
        console.log(managedText(language, `  任务 Prompt：${task.taskPrompt}`, `  task prompt: ${task.taskPrompt}`));
      }
      console.log(managedText(language, `  进度：${task.progressPath}`, `  progress: ${task.progressPath}`));
      console.log(managedText(language, `  报告：${task.reportPath}`, `  report: ${task.reportPath}`));
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
    const docGap = change.docGaps > 0
      ? managedText(language, ` 📋缺${change.docGaps}文档`, ` 📋${change.docGaps} docs missing`)
      : "";
    console.log(
      `- ${change.name}: phase=${change.phase}, workflow=${change.workflow}, review=${change.reviewMode}, auto=${change.autoTransition}${tasks}${docGap}`,
    );
    console.log(`  path: ${change.path}`);
    if (change.nextCommand) console.log(`  next: ${change.nextCommand}`);
    console.log(`  reason: ${change.nextReason}`);
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
    .filter((entry) => canonicalPath(entry.projectRoot) === canonicalPath(projectPath))
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
          budgets: {
            maxReviewRounds: number;
            maxExecutorInvocations: number;
            maxTotalAgentInvocations: number;
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
          executorInvocations: state.executorInvocations,
          maxExecutorInvocations: task.budgets.maxExecutorInvocations,
          totalAgentInvocations: state.totalAgentInvocations,
          maxTotalAgentInvocations: task.budgets.maxTotalAgentInvocations,
          supervisorSession: shortSession(state.supervisorSession.sessionId),
          executorSession: shortSession(state.executorSession.sessionId),
          blocker: state.blocker,
          taskPrompt: task.taskPrompt?.originalPath ?? null,
          progressPath: path.join(runDir, "progress.md"),
          reportPath: path.join(runDir, "task-report.md"),
          updatedAt: state.updatedAt,
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
          maxExecutorInvocations: 0,
          totalAgentInvocations: 0,
          maxTotalAgentInvocations: 0,
          supervisorSession: "--",
          executorSession: "--",
          blocker: managedText(
            language,
            "本地任务状态缺失，需要恢复检查",
            "Local task state is missing; recovery is required",
          ),
          taskPrompt: null,
          progressPath: "",
          reportPath: "",
          updatedAt: entry.updatedAt,
        };
      }
    });
}

function shortSession(sessionId: string | null): string {
  return sessionId?.slice(0, 8) ?? "--";
}

function canonicalPath(value: string): string {
  const resolved = path.resolve(value);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}
