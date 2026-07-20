import { createHash, randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import type { Language } from "../../types.js";
import type {
  ManagedAgent,
  ManagedBudgets,
  ManagedProfile,
  ManagedTaskContract,
} from "./types.js";
import { managedText } from "./i18n.js";
import {
  DEFAULT_MANAGED_BUDGETS,
  HARD_MAX_ACTIVE_RUN_HOURS,
  HARD_MAX_EXECUTOR_INVOCATIONS,
  HARD_MAX_REVIEW_ROUNDS,
  HARD_MAX_SINGLE_INVOCATION_HOURS,
  HARD_MAX_TOTAL_AGENT_INVOCATIONS,
} from "./types.js";

export interface CreateManagedTaskInput {
  request: string;
  projectRoot: string;
  relatedProjectRoots?: string[];
  profile?: ManagedProfile | "auto";
  supervisorAgent?: ManagedAgent;
  executorAgent?: ManagedAgent;
  budgets?: Partial<ManagedBudgets>;
  source?: ManagedTaskContract["source"];
  taskPromptPath?: string;
  language?: Language;
}

export function createManagedTaskContract(
  input: CreateManagedTaskInput,
): ManagedTaskContract {
  const request = input.request.trim();
  if (!request) {
    throw new Error(
      managedText(input.language, "托管任务内容不能为空", "Managed task cannot be empty"),
    );
  }

  const projectRoot = path.resolve(input.projectRoot);
  const relatedProjectRoots = [
    ...new Set(
      (input.relatedProjectRoots ?? [])
        .map((root) => path.resolve(root))
        .filter((root) => root !== projectRoot),
    ),
  ].sort();
  const supervisorAgent = input.supervisorAgent ?? "codex";
  const executorAgent = input.executorAgent ?? oppositeAgent(supervisorAgent);
  if (supervisorAgent === executorAgent) {
    throw new Error(
      managedText(
        input.language,
        "监督 Agent 和执行 Agent 不能相同",
        "Supervisor and executor agents must be different",
      ),
    );
  }

  const taskId = buildTaskId();
  const now = new Date().toISOString();
  const profile =
    input.profile && input.profile !== "auto"
      ? input.profile
      : classifyManagedProfile(request);
  const budgets = resolveBudgets(input.budgets, input.language);
  const taskPrompt = input.taskPromptPath
    ? buildTaskPrompt(projectRoot, taskId, input.taskPromptPath)
    : null;
  const contract = {
    schemaVersion: 1,
    taskId,
    request,
    source: input.source ?? "direct_prompt",
    projectRoot,
    relatedProjectRoots,
    profile,
    language: input.language ?? "zh",
    objective: taskPrompt
      ? managedText(
          input.language,
          `严格执行冻结的 Superflow 任务 Prompt：${taskPrompt.snapshotPath}`,
          `Execute the frozen Superflow task prompt exactly: ${taskPrompt.snapshotPath}`,
        )
      : request,
    doneCriteria: defaultDoneCriteria(profile, input.language),
    taskPrompt,
    supervisorAgent,
    executorAgent,
    contractHash: "",
    permissions: {
      autonomy: "maximum_within_safe_scope",
      gitCommit: false,
      gitPush: false,
      productionWrites: false,
      bypassSandbox: false,
    },
    budgets,
    createdAt: now,
    updatedAt: now,
    status: "queued",
  } satisfies ManagedTaskContract;
  contract.contractHash = calculateManagedContractHash(contract);
  return contract;
}

export function validateManagedTaskContract(
  contract: ManagedTaskContract,
): void {
  const message = (zh: string, en: string) =>
    managedText(contract.language, zh, en);
  if (contract.schemaVersion !== 1) {
    throw new Error(
      message(
        `不支持的托管任务合同版本：${contract.schemaVersion}`,
        `Unsupported managed task contract version: ${contract.schemaVersion}`,
      ),
    );
  }
  if (contract.supervisorAgent === contract.executorAgent) {
    throw new Error(
      message(
        "监督 Agent 和执行 Agent 不能相同",
        "Supervisor and executor agents must be different",
      ),
    );
  }
  validateManagedBudgets(contract.budgets, contract.language);
  validateTaskPromptMetadata(contract);
  if (
    contract.permissions.gitCommit ||
    contract.permissions.gitPush ||
    contract.permissions.productionWrites ||
    contract.permissions.bypassSandbox
  ) {
    throw new Error(
      message(
        "托管任务合同试图放宽不可覆盖的安全边界",
        "Managed task contract attempts to relax non-overridable safety boundaries",
      ),
    );
  }
  if (contract.contractHash !== calculateManagedContractHash(contract)) {
    throw new Error(
      message(
        "托管任务合同哈希校验失败，拒绝继续",
        "Managed task contract hash verification failed; refusing to continue",
      ),
    );
  }
}

export function calculateManagedContractHash(
  contract: ManagedTaskContract,
): string {
  const immutable = {
    schemaVersion: contract.schemaVersion,
    taskId: contract.taskId,
    request: contract.request,
    source: contract.source,
    projectRoot: path.resolve(contract.projectRoot),
    relatedProjectRoots: contract.relatedProjectRoots.map((root) =>
      path.resolve(root),
    ),
    profile: contract.profile,
    ...(contract.language ? { language: contract.language } : {}),
    objective: contract.objective,
    doneCriteria: contract.doneCriteria,
    taskPrompt: contract.taskPrompt,
    supervisorAgent: contract.supervisorAgent,
    executorAgent: contract.executorAgent,
    permissions: contract.permissions,
    budgets: contract.budgets,
  };
  return createHash("sha256").update(JSON.stringify(immutable)).digest("hex");
}

export function validateManagedTaskPromptSnapshot(
  contract: ManagedTaskContract,
): void {
  if (!contract.taskPrompt) return;
  let content: string;
  try {
    content = readFileSync(contract.taskPrompt.snapshotPath, "utf-8");
  } catch {
    throw new Error(
      managedText(
        contract.language,
        "冻结的任务 Prompt 快照不存在，拒绝继续",
        "Frozen task prompt snapshot is missing; refusing to continue",
      ),
    );
  }
  if (sha256(content) !== contract.taskPrompt.sha256) {
    throw new Error(
      managedText(
        contract.language,
        "冻结的任务 Prompt 快照哈希校验失败，拒绝继续",
        "Frozen task prompt snapshot hash verification failed; refusing to continue",
      ),
    );
  }
}

function buildTaskPrompt(
  projectRoot: string,
  taskId: string,
  inputPath: string,
) {
  const originalPath = path.resolve(inputPath);
  const content = readFileSync(originalPath, "utf-8");
  return {
    originalPath,
    snapshotPath: path.join(
      projectRoot,
      ".superflow",
      "tasks",
      taskId,
      "source-prompt.md",
    ),
    sha256: sha256(content),
  };
}

function validateTaskPromptMetadata(contract: ManagedTaskContract): void {
  if (!contract.taskPrompt) return;
  if (!/^[a-f0-9]{64}$/.test(contract.taskPrompt.sha256)) {
    throw new Error(
      managedText(
        contract.language,
        "任务 Prompt 哈希格式非法",
        "Task prompt hash format is invalid",
      ),
    );
  }
  const expectedSnapshot = path.join(
    contract.projectRoot,
    ".superflow",
    "tasks",
    contract.taskId,
    "source-prompt.md",
  );
  if (path.resolve(contract.taskPrompt.snapshotPath) !== expectedSnapshot) {
    throw new Error(
      managedText(
        contract.language,
        "任务 Prompt 快照路径不属于当前托管任务",
        "Task prompt snapshot path does not belong to this managed task",
      ),
    );
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function classifyManagedProfile(request: string): ManagedProfile {
  const normalized = request.toLowerCase();
  if (/(等待|监控|观察|轮询|watch|monitor|日志持续)/i.test(normalized)) {
    return "monitor";
  }
  if (
    /(openspec|sdd|数据库|database|sql|mapper|跨仓|cross[- ]?repo|支付|payment|退款|refund|消息队列|message queue|mq|api|接口|状态机|state machine|生产|production)/i.test(
      normalized,
    )
  ) {
    return "sdd";
  }
  if (
    /(修复|fix|开发|develop|实现|implement|代码|code|测试|test|bug|build|compile|启动应用|start (?:the )?app|重构|refactor)/i.test(
      normalized,
    )
  ) {
    return "engineering";
  }
  return "quick";
}

function resolveBudgets(
  overrides: Partial<ManagedBudgets> = {},
  language?: Language,
): ManagedBudgets {
  const budgets = { ...DEFAULT_MANAGED_BUDGETS, ...overrides };
  validateManagedBudgets(budgets, language);
  return budgets;
}

function validateManagedBudgets(
  budgets: ManagedBudgets,
  language?: Language,
): void {
  assertIntegerRange(
    "maxReviewRounds",
    budgets.maxReviewRounds,
    HARD_MAX_REVIEW_ROUNDS,
    language,
  );
  assertIntegerRange(
    "maxExecutorInvocations",
    budgets.maxExecutorInvocations,
    HARD_MAX_EXECUTOR_INVOCATIONS,
    language,
  );
  assertIntegerRange(
    "maxTotalAgentInvocations",
    budgets.maxTotalAgentInvocations,
    HARD_MAX_TOTAL_AGENT_INVOCATIONS,
    language,
  );
  assertRange(
    "maxActiveRunHours",
    budgets.maxActiveRunHours,
    HARD_MAX_ACTIVE_RUN_HOURS,
    language,
  );
  assertRange(
    "maxSingleInvocationHours",
    budgets.maxSingleInvocationHours,
    HARD_MAX_SINGLE_INVOCATION_HOURS,
    language,
  );
  if (budgets.stalledTimeoutMinutes <= budgets.noProgressWarningMinutes) {
    throw new Error(
      managedText(
        language,
        "卡死判定时间必须大于无进展告警时间",
        "Stalled timeout must be greater than the no-progress warning time",
      ),
    );
  }
  if (
    !Number.isFinite(budgets.activeRunWarningHours) ||
    budgets.activeRunWarningHours <= 0 ||
    budgets.activeRunWarningHours >= budgets.maxActiveRunHours
  ) {
    throw new Error(
      managedText(
        language,
        "运行告警时间必须大于 0 且小于实际工作时间硬上限",
        "Active-run warning time must be greater than 0 and below the hard active-run limit",
      ),
    );
  }
  if (
    !Number.isFinite(budgets.noProgressWarningMinutes) ||
    budgets.noProgressWarningMinutes <= 0 ||
    !Number.isFinite(budgets.stalledTimeoutMinutes)
  ) {
    throw new Error(
      managedText(
        language,
        "无进展和卡死判定时间必须是正数",
        "No-progress warning and stalled timeout must be positive numbers",
      ),
    );
  }
}

function assertRange(
  field: string,
  value: number,
  max: number,
  language?: Language,
): void {
  if (!Number.isFinite(value) || value <= 0 || value > max) {
    throw new Error(
      managedText(
        language,
        `${field} 必须大于 0 且不能超过硬上限 ${max}`,
        `${field} must be greater than 0 and cannot exceed the hard limit ${max}`,
      ),
    );
  }
}

function assertIntegerRange(
  field: string,
  value: number,
  max: number,
  language?: Language,
): void {
  assertRange(field, value, max, language);
  if (!Number.isInteger(value)) {
    throw new Error(
      managedText(language, `${field} 必须是整数`, `${field} must be an integer`),
    );
  }
}

function oppositeAgent(agent: ManagedAgent): ManagedAgent {
  return agent === "codex" ? "claude" : "codex";
}

function buildTaskId(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  return `task-${stamp}-${randomUUID().slice(0, 8)}`;
}

function defaultDoneCriteria(
  profile: ManagedProfile,
  language?: Language,
): string[] {
  const common = language === "en"
    ? [
        "Complete the user goal without silently expanding scope",
        "Provide reviewable deliverables and verification evidence",
        "Record residual issues, blockers, and unexecuted checks",
        "After final acceptance, wait for user approval; never commit or push Git automatically",
      ]
    : [
        "完成用户目标且不静默扩大业务范围",
        "提供可复核的目标产物和验证证据",
        "记录遗留问题、阻塞和未执行项",
        "最终验收后等待用户批准，禁止自动 Git 提交或推送",
      ];
  if (profile === "engineering" || profile === "sdd") {
    common.splice(
      2,
      0,
      managedText(
        language,
        "执行与风险匹配的构建、测试和运行验证",
        "Run build, test, and runtime verification proportionate to risk",
      ),
    );
  }
  return common;
}
