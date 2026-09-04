import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import path from "path";
import type {
  ExecutorResult,
  ManagedTaskContract,
  VerificationCategory,
} from "./types.js";
import { managedTaskDir } from "./paths.js";
import { categoriesForCommand } from "./verification-categories.js";

export type ManagedArtifactLevel = "minimal" | "standard" | "full";

export interface ManagedExecutionTask {
  taskId: string;
  text: string;
  requiredCategories: VerificationCategory[];
  requiresChangedFiles: boolean;
}

export interface ManagedExecutionContract {
  schemaVersion: 1;
  taskId: string;
  artifactLevel: ManagedArtifactLevel;
  canonicalTasksPath: string | null;
  tasks: ManagedExecutionTask[];
}

export function artifactLevelFor(
  contract: ManagedTaskContract,
): ManagedArtifactLevel {
  if (
    (contract.taskPrompt && contract.taskPrompt.origin !== "generated_standard") ||
    contract.source !== "direct_prompt"
  ) {
    return "full";
  }
  if (["engineering", "sdd"].includes(contract.profile)) return "standard";
  return "minimal";
}

export function writeManagedExecutionContract(
  contract: ManagedTaskContract,
): ManagedExecutionContract {
  const artifactLevel = artifactLevelFor(contract);
  const canonicalTasksPath = findCanonicalTasks(contract);
  const execution = {
    schemaVersion: 1,
    taskId: contract.taskId,
    artifactLevel,
    canonicalTasksPath,
    tasks: canonicalTasksPath ? [] : defaultTasks(contract, artifactLevel),
  } satisfies ManagedExecutionContract;
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  writeJsonAtomic(path.join(taskDir, "execution-contract.json"), execution);
  writeFileSync(
    path.join(taskDir, "execution-contract.md"),
    renderExecutionContract(execution, contract),
    "utf-8",
  );
  return execution;
}

export function readManagedExecutionContract(
  contract: ManagedTaskContract,
): ManagedExecutionContract {
  const file = path.join(
    managedTaskDir(contract.projectRoot, contract.taskId),
    "execution-contract.json",
  );
  if (!existsSync(file)) return writeManagedExecutionContract(contract);
  return JSON.parse(readFileSync(file, "utf-8")) as ManagedExecutionContract;
}

export function deriveExecutionTaskCompletion(
  task: ManagedExecutionTask,
  result?: ExecutorResult | null,
): boolean {
  if (!result) return false;
  if (task.requiresChangedFiles && result.changedFiles.length === 0)
    return false;
  const successful = result.commands.filter(isAcceptedEvidenceCommand);
  const categories = new Set(
    successful.flatMap(categoriesForCommand),
  );
  return task.requiredCategories.every((category) => categories.has(category));
}

/**
 * Accept deterministic command evidence only.  A non-zero inspection is valid
 * when it unambiguously proves absence; it is not a general expected-failure
 * escape hatch for build, test, or business commands.
 */
export function isAcceptedEvidenceCommand(
  command: ExecutorResult["commands"][number],
): boolean {
  if (command.exitCode === 0) return true;
  if (command.exitCode !== 1 && command.exitCode !== 2) return false;
  const inspection =
    /^(?:\s*)(?:grep|rg|pgrep|lsof|ss|netstat|find|git\s+(?:status|diff)\b|ps\b[^|]*(?:\|\s*(?:grep|rg)\b)?|ls\b[^|]*(?:\|\s*(?:grep|rg)\b|$))/i;
  if (!inspection.test(command.command)) return false;
  return /(?:none|empty|no\b.{0,48}\b(?:orphan(?:s)?|process(?:es)?|listener(?:s)?|container(?:s)?|residue|match(?:es)?|output|change(?:s)?)|no[- ]?residue|not found|does not exist|无匹配|无残留|未发现|没有|不存在|空)/i.test(
    command.result,
  );
}

function defaultTasks(
  contract: ManagedTaskContract,
  level: ManagedArtifactLevel,
): ManagedExecutionTask[] {
  const tasks: ManagedExecutionTask[] = [
    {
      taskId: "E01",
      text:
        contract.language === "en"
          ? "Implement the requested outcome in the approved repositories"
          : "在授权仓库内实现请求目标",
      requiredCategories: [],
      requiresChangedFiles: requiresSourceChanges(contract),
    },
    {
      taskId: "E02",
      text:
        contract.language === "en"
          ? "Run affected build or automated tests and retain evidence"
          : "执行受影响构建或自动化测试并保留证据",
      requiredCategories: ["test"],
      requiresChangedFiles: false,
    },
  ];
  if (level !== "minimal" && requiresRuntimeAcceptance(contract)) {
    const databaseOnly = requiresDatabaseRuntimeAcceptance(contract);
    tasks.push(
      {
        taskId: "E03",
        text:
          databaseOnly
            ? contract.language === "en"
              ? "Complete task-level real database acceptance"
              : "完成任务级真实数据库验收"
            : contract.language === "en"
              ? "Complete task-level real startup and invocation acceptance"
              : "完成任务级真实启动与调用验收",
        requiredCategories: databaseOnly ? ["runtime"] : ["startup", "invocation"],
        requiresChangedFiles: false,
      },
      {
        taskId: "E04",
        text:
          contract.language === "en"
            ? "Prove cleanup and final zero residue for task-owned resources"
            : "证明任务资源清理完成且最终零残留",
        requiredCategories: ["runtime"],
        requiresChangedFiles: false,
      },
    );
  }
  return tasks;
}

export function requiresRuntimeAcceptance(
  contract: ManagedTaskContract,
): boolean {
  const taskText = [contract.request, contract.objective]
    .join("\n")
    .toLowerCase();
  return /(?:\bapi\b|\bhttp\b|\be2e\b|\bsql\b|\bmysql\b|\bdatabase\b|\bdocker\b|\bbrowser\b|\bfrontend\b|\bbackend\b|\bserver\b|\bservice\b|\bstartup\b|\bintegration\b|接口|启动|数据库|浏览器|前端|后端|服务|容器|端到端|集成测试)/i.test(
    taskText,
  );
}

function requiresDatabaseRuntimeAcceptance(
  contract: ManagedTaskContract,
): boolean {
  const taskText = [contract.request, contract.objective]
    .join("\n")
    .toLowerCase();
  const database = /(?:\bsql\b|\bmysql\b|\bdatabase\b|数据库)/i.test(
    taskText,
  );
  const application =
    /(?:\bapi\b|\bhttp\b|\be2e\b|\bbrowser\b|\bfrontend\b|\bbackend\b|\bserver\b|\bservice\b|\bstartup\b|接口|启动|浏览器|前端|后端|服务|端到端)/i.test(
      taskText,
    );
  return database && !application;
}

function requiresSourceChanges(contract: ManagedTaskContract): boolean {
  if (contract.profile === "monitor") return false;
  const taskText = `${contract.request}\n${contract.objective}`.toLowerCase();
  return /(?:\bimplement\b|\badd\b|\bchange\b|\bmodify\b|\bupdate\b|\bfix\b|\brefactor\b|\bcreate\b|\bdelete\b|\bcrud\b|\bcode\b|新增|实现|修改|调整|更新|修复|重构|创建|删除|开发|代码)/i.test(
    taskText,
  );
}

function renderExecutionContract(
  execution: ManagedExecutionContract,
  contract: ManagedTaskContract,
): string {
  const title =
    contract.language === "en"
      ? "# Managed Execution Contract"
      : "# 托管执行合同";
  const level = contract.language === "en" ? "Artifact level" : "文档等级";
  const source = execution.canonicalTasksPath
    ? contract.language === "en"
      ? `Canonical tasks: ${execution.canonicalTasksPath}`
      : `权威任务清单：${execution.canonicalTasksPath}`
    : contract.language === "en"
      ? "The tasks below are a minimal machine execution plan, not invented business clarification."
      : "以下任务是最小机器执行计划，不代表凭空补充业务澄清结论。";
  return [
    title,
    "",
    `${level}: ${execution.artifactLevel}`,
    source,
    "",
    ...execution.tasks.map((task) => `- [ ] ${task.taskId} ${task.text}`),
    "",
  ].join("\n");
}

function findCanonicalTasks(contract: ManagedTaskContract): string | null {
  if (!contract.taskPrompt || contract.taskPrompt.origin === "generated_standard") {
    return null;
  }
  let current = path.dirname(contract.taskPrompt.originalPath);
  const roots = [contract.projectRoot, ...contract.relatedProjectRoots].map(
    (root) => path.resolve(root),
  );
  while (
    roots.some(
      (root) => current === root || current.startsWith(`${root}${path.sep}`),
    )
  ) {
    const file = path.join(current, "tasks.md");
    if (existsSync(file)) return file;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  renameSync(temp, file);
}
