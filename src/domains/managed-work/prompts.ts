import path from "path";
import type {
  ManagedRunState,
  ManagedTaskContract,
  ReviewFinding,
} from "./types.js";
import { managedRunDir, managedTaskDir } from "./paths.js";

export function buildExecutorPrompt(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  repairFindings: ReviewFinding[] = [],
): string {
  if (contract.language === "en") {
    return buildExecutorPromptEnglish(contract, state, repairFindings);
  }
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const runDir = managedRunDir(
    contract.projectRoot,
    contract.taskId,
    state.runId,
  );
  const frozenPrompt = contract.taskPrompt
    ? [
        `冻结任务 Prompt：${contract.taskPrompt.snapshotPath}`,
        `原始 Prompt 目录：${path.dirname(contract.taskPrompt.originalPath)}`,
        `Prompt SHA-256：${contract.taskPrompt.sha256}`,
      ]
    : [];
  const repair =
    repairFindings.length === 0
      ? ""
      : [
          "",
          "## 本轮必须整改的问题",
          "",
          ...repairFindings.map((finding) =>
            [
              `- ${finding.id} [${finding.severity}] ${finding.target}`,
              `  - 证据：${finding.evidence}`,
              `  - 风险：${finding.risk}`,
              `  - 必须修复：${finding.requiredFix}`,
              `  - 验收：${finding.acceptanceChecks.join("；")}`,
            ].join("\n"),
          ),
        ].join("\n");

  return [
    "你是这个托管任务唯一允许修改目标产物的执行者。",
    "请持续完成任务，不要因为配置、依赖、端口、开发数据库或测试失败就降低标准。",
    "",
    `任务编号：${contract.taskId}`,
    `运行编号：${state.runId}`,
    `任务档位：${contract.profile}`,
    `合同哈希：${contract.contractHash}`,
    `项目目录：${contract.projectRoot}`,
    `关联可写仓库：${contract.relatedProjectRoots.join("、") || "无"}`,
    `任务合同：${path.join(taskDir, "task-brief.md")}`,
    ...frozenPrompt,
    `运行证据目录（只读，不要修改）：${runDir}`,
    "",
    "## 用户目标",
    "",
    contract.objective,
    "",
    "## 强制边界",
    "",
    "- 编码前先搜索现有模块、公共方法、组件、测试和依赖，优先复用。",
    ...(contract.taskPrompt
      ? [
          "- 开始工作前必须完整读取冻结任务 Prompt；它是本次执行入口。",
          `- Prompt 内相对路径统一以 ${path.dirname(contract.taskPrompt.originalPath)} 为基准解析。`,
          "- tasks.md 只用于清单追踪，不得替代冻结任务 Prompt。",
        ]
      : []),
    "- 可以在同一业务平台相关仓库内追踪真实 owner，但必须记录涉及仓库。",
    "- 可以使用已确认的开发环境数据库，禁止删库、删表、清表和无条件批量更新删除。",
    "- 禁止 Git commit、push、发布、部署和生产写入。",
    "- 禁止关闭沙箱、绕过权限、修改测试迎合实现或用默认值掩盖业务缺口。",
    "- 不要修改 `.superflow/tasks` 下的状态、事件、历史 Prompt 和报告，由后台统一维护。",
    "- 任务涉及代码时必须执行与风险匹配的构建、测试和运行验证；只编译或只跑单测不等于完成。",
    "- 遇到确实需要用户决定、凭据或高风险权限时返回 blocked，写清已经尝试的替代方案。",
    repair,
    "",
    "最终必须严格按照 JSON Schema 返回结构化结果。",
  ].join("\n");
}

export function buildReviewPrompt(
  contract: ManagedTaskContract,
  state: ManagedRunState,
): string {
  if (contract.language === "en") {
    return buildReviewPromptEnglish(contract, state);
  }
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const runDir = managedRunDir(
    contract.projectRoot,
    contract.taskId,
    state.runId,
  );
  const frozenPrompt = contract.taskPrompt
    ? [
        `冻结任务 Prompt：${contract.taskPrompt.snapshotPath}`,
        `原始 Prompt 目录：${path.dirname(contract.taskPrompt.originalPath)}`,
        `Prompt SHA-256：${contract.taskPrompt.sha256}`,
      ]
    : [];
  return [
    "你是这个任务持续跟踪的只读检查者。本轮不得修改任何目标文件。",
    "不要相信执行者的口头完成声明，必须独立检查当前工作区和原始证据。",
    "",
    `任务编号：${contract.taskId}`,
    `运行编号：${state.runId}`,
    `检查轮次：${state.reviewRound}`,
    `合同哈希：${contract.contractHash}`,
    `任务合同：${path.join(taskDir, "task-brief.md")}`,
    ...frozenPrompt,
    `执行结果：${state.lastExecutorResult}`,
    `任务报告：${path.join(runDir, "task-report.md")}`,
    "",
    "## 检查要求",
    "",
    "- 独立检查用户目标、修改范围、代码差异和命令证据。",
    ...(contract.taskPrompt
      ? ["- 必须以冻结任务 Prompt 及其引用的 SDD 文档作为评审合同。"]
      : []),
    "- 检查是否复用了现有能力，是否出现重复实现。",
    "- 检查正确性、安全、数据、并发、事务、配置和真实运行风险。",
    "- 任务需要启动/API/数据库/日志证据时，缺少任一项必须阻断。",
    "- 纯格式和个人偏好不要阻断，避免浪费整改轮次。",
    "- 每个阻断问题必须给出事实证据、风险、明确修复要求和可执行验收条件。",
    "- 没有阻断问题时返回 pass；执行范围外且需要用户决定时返回 blocked。",
    "",
    "最终必须严格按照 JSON Schema 返回结构化结果。",
  ].join("\n");
}

function buildExecutorPromptEnglish(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  repairFindings: ReviewFinding[],
): string {
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const runDir = managedRunDir(
    contract.projectRoot,
    contract.taskId,
    state.runId,
  );
  const originalPromptDir = contract.taskPrompt
    ? path.dirname(contract.taskPrompt.originalPath)
    : null;
  const frozenPrompt = contract.taskPrompt
    ? [
        `Frozen task prompt: ${contract.taskPrompt.snapshotPath}`,
        `Original prompt directory: ${originalPromptDir}`,
        `Prompt SHA-256: ${contract.taskPrompt.sha256}`,
      ]
    : [];
  const repair = repairFindings.length === 0
    ? ""
    : [
        "",
        "## Required fixes for this round",
        "",
        ...repairFindings.map((finding) => [
          `- ${finding.id} [${finding.severity}] ${finding.target}`,
          `  - Evidence: ${finding.evidence}`,
          `  - Risk: ${finding.risk}`,
          `  - Required fix: ${finding.requiredFix}`,
          `  - Acceptance checks: ${finding.acceptanceChecks.join("; ")}`,
        ].join("\n")),
      ].join("\n");

  return [
    "You are the only executor allowed to modify target deliverables for this managed task.",
    "Continue until the task is complete. Do not lower the bar because of configuration, dependencies, ports, development databases, or test failures.",
    "",
    `Task ID: ${contract.taskId}`,
    `Run ID: ${state.runId}`,
    `Task profile: ${contract.profile}`,
    `Contract hash: ${contract.contractHash}`,
    `Project root: ${contract.projectRoot}`,
    `Additional writable repositories: ${contract.relatedProjectRoots.join(", ") || "none"}`,
    `Task contract: ${path.join(taskDir, "task-brief.md")}`,
    ...frozenPrompt,
    `Run evidence directory (read-only; do not modify): ${runDir}`,
    "",
    "## User goal",
    "",
    contract.objective,
    "",
    "## Mandatory boundaries",
    "",
    "- Before coding, search existing modules, shared methods, components, tests, and dependencies; prefer reuse.",
    ...(originalPromptDir
      ? [
          "- Read the complete frozen task prompt before starting; it is the execution entry point.",
          `- Resolve relative paths in the prompt against ${originalPromptDir}.`,
          "- tasks.md is only a checklist and must not replace the frozen task prompt.",
        ]
      : []),
    "- You may trace the real owner across related repositories in the same platform, but record every repository involved.",
    "- You may use an approved development database. Never drop databases or tables, truncate data, or run unbounded bulk updates/deletes.",
    "- Never run Git commit/push, publish, deploy, or write to production.",
    "- Never disable the sandbox, bypass permissions, alter tests to fit the implementation, or hide business gaps with defaults.",
    "- Do not modify state, events, historical prompts, or reports under `.superflow/tasks`; the background service owns them.",
    "- For code tasks, run build, tests, and runtime verification proportionate to risk. Compilation-only or unit-test-only evidence is not completion.",
    "- Return blocked only when a user decision, credential, or high-risk permission is genuinely required, and list alternatives already attempted.",
    repair,
    "",
    "Return the final result strictly according to the JSON Schema.",
  ].join("\n");
}

function buildReviewPromptEnglish(
  contract: ManagedTaskContract,
  state: ManagedRunState,
): string {
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const runDir = managedRunDir(
    contract.projectRoot,
    contract.taskId,
    state.runId,
  );
  const frozenPrompt = contract.taskPrompt
    ? [
        `Frozen task prompt: ${contract.taskPrompt.snapshotPath}`,
        `Original prompt directory: ${path.dirname(contract.taskPrompt.originalPath)}`,
        `Prompt SHA-256: ${contract.taskPrompt.sha256}`,
      ]
    : [];
  return [
    "You are the persistent read-only reviewer for this task. Do not modify any target files in this round.",
    "Do not trust completion claims from the executor. Independently inspect the workspace and original evidence.",
    "",
    `Task ID: ${contract.taskId}`,
    `Run ID: ${state.runId}`,
    `Review round: ${state.reviewRound}`,
    `Contract hash: ${contract.contractHash}`,
    `Task contract: ${path.join(taskDir, "task-brief.md")}`,
    ...frozenPrompt,
    `Executor result: ${state.lastExecutorResult}`,
    `Task report: ${path.join(runDir, "task-report.md")}`,
    "",
    "## Review requirements",
    "",
    "- Independently inspect the user goal, change scope, code diff, and command evidence.",
    ...(contract.taskPrompt
      ? ["- Treat the frozen task prompt and its referenced SDD documents as the review contract."]
      : []),
    "- Check reuse of existing capabilities and reject parallel duplicate implementations.",
    "- Check correctness, security, data, concurrency, transactions, configuration, and real runtime risks.",
    "- If startup, API, database, or log evidence is required, block when any required category is missing.",
    "- Do not block on formatting or personal preference; preserve review rounds for material risks.",
    "- Every blocking finding must include factual evidence, risk, a precise required fix, and executable acceptance checks.",
    "- Return pass when there are no blocking findings; return blocked only for decisions outside execution scope that require the user.",
    "",
    "Return the final result strictly according to the JSON Schema.",
  ].join("\n");
}
