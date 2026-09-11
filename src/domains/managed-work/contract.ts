import { createHash, randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import type { Language } from "../../types.js";
import type {
  ManagedAgent,
  ManagedAcceptanceContract,
  ManagedBudgets,
  ManagedExecutionMode,
  ManagedProfile,
  ManagedTaskContract,
  ManagedRetention,
  ManagedTaskKind,
  ManagedExecutorConfig,
} from "./types.js";
import { managedText } from "./i18n.js";
import { validateManagedAcceptanceContract } from "./acceptance-contract.js";
import {
  DEFAULT_MANAGED_BUDGETS,
  HARD_MAX_ACTIVE_RUN_HOURS,
  HARD_MAX_EXECUTOR_INVOCATIONS,
  HARD_MAX_EXECUTOR_TOKEN_UNITS,
  HARD_MAX_EXECUTOR_COST_USD,
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
  mandatoryEngineeringRules?: string[];
  externalModelDataDisclosure?: {
    approved: boolean;
    approvedBy?: string;
    approvedAt?: string;
  };
  executionMode?: ManagedExecutionMode;
  retention?: ManagedRetention;
  taskKind?: ManagedTaskKind;
  acceptanceContract?: ManagedAcceptanceContract;
  executorConfig?: ManagedExecutorConfig;
}

export function createManagedTaskContract(
  input: CreateManagedTaskInput,
): ManagedTaskContract {
  const request = input.request.trim();
  if (!request) {
    throw new Error(
      managedText(
        input.language,
        "托管任务内容不能为空",
        "Managed task cannot be empty",
      ),
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
  const source = input.source ?? "direct_prompt";
  const budgets = resolveBudgets(input.budgets, input.language);
  const taskPrompt = input.taskPromptPath
    ? buildTaskPrompt(projectRoot, taskId, input.taskPromptPath)
    : shouldGenerateStandardPrompt(source, profile)
      ? buildGeneratedStandardPrompt(
          projectRoot,
          taskId,
          request,
          profile,
          input.language,
        )
      : null;
  const contract = {
    schemaVersion: 1,
    taskId,
    request,
    source,
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
    mandatoryEngineeringRules: normalizeMandatoryRules(
      input.mandatoryEngineeringRules,
    ),
    taskPrompt,
    supervisorAgent,
    executorAgent,
    executorConfig: input.executorConfig,
    supervisorExecution: "external_host",
    executionMode: input.executionMode ?? "delegated",
    retention: input.retention ?? "compact",
    taskKind:
      input.taskKind ?? classifyManagedTaskKind(source, profile, request),
    acceptanceContract: input.acceptanceContract,
    contractHash: "",
    permissions: {
      autonomy: "maximum_within_safe_scope",
      gitCommit: false,
      gitPush: false,
      productionWrites: false,
      bypassSandbox: false,
      externalModelDataDisclosure: {
        approved: input.externalModelDataDisclosure?.approved !== false,
        approvedBy:
          input.externalModelDataDisclosure?.approved === false
            ? null
            : (input.externalModelDataDisclosure?.approvedBy ??
              "legacy_cli_user"),
        approvedAt:
          input.externalModelDataDisclosure?.approved !== false
            ? (input.externalModelDataDisclosure?.approvedAt ?? now)
            : null,
        scope: [projectRoot, ...relatedProjectRoots],
      },
    },
    budgets,
    createdAt: now,
    updatedAt: now,
    status:
      input.executionMode === "human_directed" ? "waiting_for_human" : "queued",
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
  if (
    contract.supervisorExecution !== undefined &&
    !["managed_cli", "external_host"].includes(
      contract.supervisorExecution as string,
    )
  ) {
    throw new Error(
      message(
        "监督执行模式只允许 external_host",
        "Supervisor execution only supports external_host",
      ),
    );
  }
  if (contract.acceptanceContract) {
    validateManagedAcceptanceContract(
      contract.acceptanceContract,
      contract.language,
    );
  }
  const disclosure = contract.permissions.externalModelDataDisclosure;
  if (
    !disclosure ||
    !Array.isArray(disclosure.scope) ||
    disclosure.scope.some(
      (root) =>
        ![contract.projectRoot, ...contract.relatedProjectRoots].includes(root),
    )
  ) {
    throw new Error(
      message(
        "外部研发 Agent 数据披露授权缺失或作用域非法",
        "External executor data-disclosure approval is missing or has an invalid scope",
      ),
    );
  }
  validateManagedBudgets(contract.budgets, contract.language);
  if (
    contract.retention &&
    !["full", "compact", "none"].includes(contract.retention)
  ) {
    throw new Error(
      message("托管产物留存策略非法", "Managed retention policy is invalid"),
    );
  }
  if (
    contract.taskKind &&
    !["code", "docs-only", "review-only"].includes(contract.taskKind)
  ) {
    throw new Error(
      message("托管任务类型非法", "Managed task kind is invalid"),
    );
  }
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
    ...(contract.mandatoryEngineeringRules?.length
      ? { mandatoryEngineeringRules: contract.mandatoryEngineeringRules }
      : {}),
    taskPrompt: contract.taskPrompt,
    supervisorAgent: contract.supervisorAgent,
    executorAgent: contract.executorAgent,
    ...(contract.executorConfig
      ? { executorConfig: contract.executorConfig }
      : {}),
    ...(contract.supervisorExecution
      ? { supervisorExecution: contract.supervisorExecution }
      : {}),
    ...(contract.executionMode
      ? { executionMode: contract.executionMode }
      : {}),
    ...(contract.retention ? { retention: contract.retention } : {}),
    ...(contract.taskKind ? { taskKind: contract.taskKind } : {}),
    ...(contract.acceptanceContract
      ? { acceptanceContract: contract.acceptanceContract }
      : {}),
    permissions: contract.permissions,
    budgets: contract.budgets,
  };
  return createHash("sha256").update(JSON.stringify(immutable)).digest("hex");
}

function normalizeMandatoryRules(rules?: string[]): string[] {
  return [...new Set((rules ?? []).map((rule) => rule.trim()).filter(Boolean))];
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
    origin: "user" as const,
  };
}

function shouldGenerateStandardPrompt(
  source: ManagedTaskContract["source"],
  profile: ManagedProfile,
): boolean {
  return source === "direct_prompt" && ["engineering", "sdd"].includes(profile);
}

function buildGeneratedStandardPrompt(
  projectRoot: string,
  taskId: string,
  request: string,
  profile: ManagedProfile,
  language?: Language,
) {
  const snapshotPath = path.join(
    projectRoot,
    ".superflow",
    "tasks",
    taskId,
    "source-prompt.md",
  );
  const content = generatedStandardPromptContent(request, profile, language);
  return {
    originalPath: snapshotPath,
    snapshotPath,
    sha256: sha256(content),
    origin: "generated_standard" as const,
  };
}

/**
 * A direct engineering request still needs a frozen executable contract.
 * This deliberately supplies process boundaries only; API, DB and test
 * details remain owned by the project documents or by Host clarification.
 */
export function generatedStandardPromptContent(
  request: string,
  profile: ManagedProfile,
  language?: Language,
): string {
  const runtimeAcceptance = requiresGeneratedRuntimeAcceptance(request);
  const concurrency = requiresGeneratedConcurrencyContract(request);
  if (language === "en") {
    const lines = [
      "# Generated Standard Execution Contract",
      "",
      "This contract was generated from a direct request. It freezes execution boundaries, not invented product decisions.",
      "",
      "## User request",
      "",
      request,
      "",
      "## Required preparation in the same executor call",
      "",
      "- Read the task contract, selected project rules, and current source before editing.",
      "- Identify the existing capability to reuse, exact files to change, task-owned resources, and the affected verification scope.",
      "- For application, API, database, browser, container, or integration work, define one repository-local acceptance entry before claiming completion: preflight, setup, build, startup, real invocation, assertions, cleanup, and durable evidence paths.",
      "- If an unresolved business or architecture choice would change API, data, transaction, concurrency, or acceptance behaviour, return blocked to Host; do not invent a second design.",
      "- Before delivery, synchronize any task-level design, tests, and report that this task creates or changes with the actual source and evidence.",
    ];
    if (runtimeAcceptance) {
      lines.push(
        "",
        "## Runtime acceptance integrity",
        "",
        "- The acceptance entry must be portable: discover tools from PATH, project-relative paths, or explicit environment variables; never embed personal absolute paths or credentials.",
        "- The entry must leave task-owned processes, ports, temporary data, and logs clean even after a representative setup or assertion failure.",
        "- Do not use broad classpath scanning, generic bean replacement, or unrelated service stubs merely to force an application to start. Keep every isolation item named, directly evidenced, and scoped to the task; otherwise return a real blocker to Host.",
      );
    }
    if (concurrency) {
      lines.push(
        "",
        "## Concurrency acceptance integrity",
        "",
        "- Preserve the requested concurrent semantics in the real acceptance. A business conflict must be a deterministic non-5xx response with a stable error contract; never accept a server error as a successful conflict proof.",
        "- Prove the requested state transition occurs exactly once with database or equivalent durable-state evidence.",
      );
    }
    lines.push("", `Profile: ${profile}`, "");
    return lines.join("\n");
  }
  const lines = [
    "# 自动生成的标准执行合同",
    "",
    "本合同由直述需求生成，只冻结执行边界，不凭空编造产品方案。",
    "",
    "## 用户需求",
    "",
    request,
    "",
    "## 同一次研发调用内必须完成的准备",
    "",
    "- 编码前读取任务合同、适用项目规则和当前源码。",
    "- 明确可复用的现有能力、精确修改文件、任务自有资源及受影响验证范围。",
    "- 涉及应用、接口、数据库、浏览器、容器或集成时，在声称完成前定义一个仓库内验收入口：预检查、setup、构建、启动、真实调用、断言、清理和可持久读取的证据路径。",
    "- 若未解决的业务或架构选择会改变 API、数据、事务、并发或验收行为，返回 Host 阻塞；不得发明第二套设计。",
    "- 交付前将本任务新建或修改的任务级设计、测试和报告与实际源码、证据同步。",
  ];
  if (runtimeAcceptance) {
    lines.push(
      "",
      "## 真实验收完整性",
      "",
      "- 验收入口必须可移植：只可通过 PATH、项目相对路径或显式环境变量发现工具；不得写入个人绝对路径或凭据。",
      "- 即使出现代表性的 setup 或断言失败，验收入口也必须清理任务自有进程、端口、临时数据和日志。",
      "- 不得为了强行启动应用而引入全包类路径扫描、通用 Bean 替换或无关服务桩；每项隔离必须具名、直接有启动失败证据且只服务于当前任务，否则如实向 Host 返回阻塞。",
    );
  }
  if (concurrency) {
    lines.push(
      "",
      "## 并发验收完整性",
      "",
      "- 必须在真实验收中保留需求指定的并发语义。业务冲突必须返回确定性的非 5xx 响应和稳定错误合同；不得把服务端错误当作冲突成功。",
      "- 必须使用数据库或等价持久状态证据证明需求指定的状态转换恰好发生一次。",
    );
  }
  lines.push("", `任务档位：${profile}`, "");
  return lines.join("\n");
}

function requiresGeneratedRuntimeAcceptance(request: string): boolean {
  return /(?:\bapi\b|\bhttp\b|\be2e\b|\bsql\b|\bmysql\b|\bdatabase\b|\bdocker\b|\bbrowser\b|\bfrontend\b|\bbackend\b|\bserver\b|\bservice\b|\bstartup\b|\bintegration\b|接口|启动|数据库|浏览器|前端|后端|服务|容器|端到端|集成测试)/i.test(
    request,
  );
}

function requiresGeneratedConcurrencyContract(request: string): boolean {
  return /(?:\bcas\b|expectedversion|optimistic|concurren(?:cy|t)|race|版本冲突|乐观锁|并发|竞争)/i.test(
    request,
  );
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

function classifyManagedTaskKind(
  source: ManagedTaskContract["source"],
  profile: ManagedProfile,
  request: string,
): ManagedTaskKind {
  if (source === "sdd" || profile === "engineering" || profile === "sdd") {
    return "code";
  }
  if (
    /\b(?:docs?|document|documentation)\b|文档|说明书|README/i.test(request)
  ) {
    return "docs-only";
  }
  if (/\b(?:review|audit|inspect|评审|审查|检查|复盘)\b/i.test(request)) {
    return "review-only";
  }
  return "code";
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
  if (budgets.maxExecutorTokenUnits !== undefined) {
    assertIntegerRange(
      "maxExecutorTokenUnits",
      budgets.maxExecutorTokenUnits,
      HARD_MAX_EXECUTOR_TOKEN_UNITS,
      language,
    );
  }
  if (budgets.maxExecutorCostUsd !== undefined) {
    assertRange(
      "maxExecutorCostUsd",
      budgets.maxExecutorCostUsd,
      HARD_MAX_EXECUTOR_COST_USD,
      language,
    );
  }
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
  if (
    budgets.executorPhysicalStopAt !== undefined &&
    (!Number.isInteger(budgets.executorPhysicalStopAt) ||
      budgets.executorPhysicalStopAt <= 0)
  ) {
    throw new Error(
      managedText(
        language,
        "Claude 物理调用停止点必须是正整数",
        "The Claude physical invocation stop point must be a positive integer",
      ),
    );
  }
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
      managedText(
        language,
        `${field} 必须是整数`,
        `${field} must be an integer`,
      ),
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
  const common =
    language === "en"
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
