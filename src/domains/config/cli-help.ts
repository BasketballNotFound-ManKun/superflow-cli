import type { Language } from "../../types.js";
import { normalizeLanguage } from "./i18n.js";
import { loadState } from "../state.js";
import { stateFile } from "../../platform/paths.js";

export interface CliHelpText {
  programDescription: string;
  initDescription: string;
  scanDescription: string;
  clarifyDescription: string;
  requirementReviewDescription: string;
  docsDescription: string;
  designDescription: string;
  implementDescription: string;
  pipelineDescription: string;
  verifyDescription: string;
  archiveDescription: string;
  statusDescription: string;
  mcpDescription: string;
  evalDescription: string;
  updateDescription: string;
  doctorDescription: string;
  uninstallDescription: string;
  dryRun: string;
  agentOption: string;
  scopeOption: string;
  updateScopeOption: string;
  commandScopeOption: string;
  languageOption: string;
  yesOption: string;
  jsonOption: string;
  summaryOption: string;
  resumeOption: string;
  skipExistingOption: string;
  overwriteOption: string;
  noHooksOption: string;
  noOpenspecInitOption: string;
  noScanOption: string;
  forceOption: string;
  noHooksUpdateOption: string;
  withPackageOption: string;
  uninstallForceOption: string;
  withDepsOption: string;
  managedOption: string;
  manualOption: string;
  managedProjectOption: string;
  managedProfileOption: string;
  managedSupervisorOption: string;
  managedSubmitHostReviewOption: string;
  managedSubmitManualDeliveryOption: string;
  managedExecutorOption: string;
  managedAddDirOption: string;
  managedResumeOption: string;
  managedReopenDeliveryOption: string;
  managedReplaceExecutorSessionOption: string;
  managedResetExecutorSessionOption: string;
  managedRetryBlockedExecutorOption: string;
  managedProviderSwitchedOption: string;
  managedInfrastructureCreditsOption: string;
  managedMaxExecutorInvocationsOption: string;
  managedMaxReviewRoundsOption: string;
  managedMaxTotalAgentInvocationsOption: string;
  managedBudgetOverrideReasonOption: string;
  managedUnlimitedAgentBudgetOption: string;
  managedAdditionalExecutorInvocationsOption: string;
  checkDescription: string;
  checkLevelOption: string;
}

const CLI_TEXT: Record<Language, CliHelpText> = {
  en: {
    programDescription:
      "SuperBridge Flow - SDD/TDD and managed-work workflow CLI",
    initDescription: "Install and configure SuperBridge Flow",
    scanDescription:
      "Rerun project context scaffolding and understand-anything check",
    clarifyDescription: "Check SuperBridge Flow clarify skill deployment",
    requirementReviewDescription:
      "Check SuperBridge Flow requirement review skill deployment",
    docsDescription: "Run the docs gate and check the docs skill deployment",
    designDescription: "Check SuperBridge Flow design skill deployment",
    implementDescription:
      "Require a Coding Ready receipt before implementation",
    pipelineDescription:
      "Route SDD phases or manage an implementation prompt to terminal delivery",
    verifyDescription: "Check SuperBridge Flow verify skill deployment",
    archiveDescription: "Check SuperBridge Flow archive skill deployment",
    statusDescription:
      "Show active managed tasks, SDD changes, and next commands",
    mcpDescription:
      "Install, remove, or inspect the Superflow managed MCP integration",
    evalDescription: "Evaluate a managed task offline from persisted evidence",
    updateDescription:
      "Update installed SuperBridge Flow skills, scripts, and hooks",
    doctorDescription: "Diagnose SuperBridge Flow installation health",
    uninstallDescription:
      "Uninstall skills, scripts, and hooks managed by SuperBridge Flow",
    dryRun: "Print the plan without writing files",
    agentOption: "Install/check target: claude | codex | both",
    scopeOption: "Install scope: global | project",
    updateScopeOption: "Update scope: auto | global | project",
    commandScopeOption: "Scope: auto | global | project",
    languageOption: "Language: en | zh",
    yesOption: "Run non-interactively with defaults",
    jsonOption: "Output JSON",
    summaryOption:
      "Aggregate the supplied comparable task runs into a baseline",
    resumeOption: "Resume from the failed step",
    skipExistingOption: "Keep existing skills/scripts unchanged",
    overwriteOption: "Overwrite existing skills without creating backups",
    noHooksOption: "Install skills and scripts only; skip hook registration",
    noOpenspecInitOption:
      "Skip native OpenSpec initialization for this project",
    noScanOption: "Skip project context scaffolding and scan hints",
    forceOption: "Overwrite existing docs/sdd-context files",
    noHooksUpdateOption: "Skip hook re-registration",
    withPackageOption: "Also run npm update for @chenmk/superflow",
    uninstallForceOption: "Skip confirmation prompt",
    withDepsOption:
      "Also uninstall OpenSpec, Superpowers, and Understand dependencies",
    managedOption:
      "Manage an implementation prompt, change directory, or direct task and wait for terminal delivery",
    manualOption:
      "Create a controlled manual-execution task without starting an executor",
    managedProjectOption: "Managed task project directory",
    managedProfileOption:
      "Task profile: auto | quick | engineering | sdd | monitor",
    managedSupervisorOption: "Supervisor: current | peer | codex | claude",
    managedSubmitHostReviewOption:
      "Submit the current Codex host review JSON and resume the task",
    managedSubmitManualDeliveryOption:
      "Submit a structured delivery JSON from a manual executor",
    managedExecutorOption: "Executor: peer | current | codex | claude",
    managedAddDirOption:
      "Additional writable repositories in the same platform",
    managedResumeOption:
      "Attach safely to a running task or recover from recorded checkpoints",
    managedReopenDeliveryOption:
      "Reopen a rejected delivery with an auditable correction reason",
    managedReplaceExecutorSessionOption:
      "Replace an incompatible executor session during explicit recovery",
    managedResetExecutorSessionOption:
      "Discard an unhealthy executor session with an audit reason and create a fresh one during recovery",
    managedRetryBlockedExecutorOption:
      "Retry a blocked executor with an auditable human recovery reason",
    managedProviderSwitchedOption:
      "Confirm a provider switch with an audit reason and resume in a fresh executor session",
    managedInfrastructureCreditsOption:
      "Credit non-development executor calls caused by infrastructure failures",
    managedMaxExecutorInvocationsOption:
      "Increase this task's executor invocation limit",
    managedMaxReviewRoundsOption: "Increase this task's formal review limit",
    managedMaxTotalAgentInvocationsOption:
      "Increase this task's total Agent invocation limit",
    managedBudgetOverrideReasonOption:
      "Audit reason required when increasing managed task budgets",
    managedUnlimitedAgentBudgetOption:
      "Temporarily remove Agent invocation limits for this task",
    managedAdditionalExecutorInvocationsOption:
      "Set a temporary window of additional executor invocations",
    checkDescription:
      "Check an SDD change at file, document-delivery, or coding-ready level",
    checkLevelOption: "Check level: files | docs | coding-ready",
  },
  zh: {
    programDescription: "SuperBridge Flow - SDD/TDD 与双 Agent 托管工作流 CLI",
    initDescription:
      "一站式安装 SuperBridge Flow（detect / deps / skills / scripts / hooks / 项目扫描）",
    scanDescription:
      "单独重跑项目扫描（脚手架 docs/sdd-context/ + understand-anything）",
    clarifyDescription: "校验 SuperBridge Flow clarify 阶段技能部署状态",
    requirementReviewDescription:
      "校验 SuperBridge Flow 需求反向评审技能部署状态",
    docsDescription: "执行 docs 门禁并校验 SuperBridge Flow docs 技能",
    designDescription: "校验 SuperBridge Flow design 阶段技能部署状态",
    implementDescription: "通过 Coding Ready 门禁后进入实现阶段",
    pipelineDescription:
      "路由 SDD 阶段，或托管实现 Prompt 直到双 Agent 交付终态",
    verifyDescription: "校验 SuperBridge Flow verify 阶段技能部署状态",
    archiveDescription: "校验 SuperBridge Flow archive 阶段技能部署状态",
    statusDescription: "查看当前项目的托管任务、SDD changes 和下一步命令",
    mcpDescription: "安装、移除或检查 Superflow 托管 MCP 集成",
    evalDescription: "根据落盘证据离线评估托管任务的质量、效率与成本",
    updateDescription: "更新已安装的 SuperBridge Flow skills、scripts 和 hooks",
    doctorDescription: "诊断 SuperBridge Flow 安装健康",
    uninstallDescription: "卸载 SuperBridge Flow 管理的技能、脚本和 hook 注册",
    dryRun: "只打印计划不执行",
    agentOption: "安装/校验目标：claude | codex | both",
    scopeOption: "安装作用域：global | project",
    updateScopeOption: "更新作用域：auto | global | project",
    commandScopeOption: "作用域：auto | global | project",
    languageOption: "语言：en | zh",
    yesOption: "非交互确认安装（默认参数）",
    jsonOption: "输出 JSON",
    summaryOption: "汇总传入且可比较的任务 Run，形成评估基线",
    resumeOption: "从失败步骤继续",
    skipExistingOption: "已存在的 skill/script 保持不动",
    overwriteOption: "已存在的 skill 直接覆盖，不额外生成 backup",
    noHooksOption: "只装技能 + 脚本，跳过 hook 注册（hook 手工配）",
    noOpenspecInitOption: "跳过当前项目 OpenSpec 原生初始化",
    noScanOption: "跳过项目上下文脚手架和扫描提示",
    forceOption: "覆盖现有 docs/sdd-context 文件",
    noHooksUpdateOption: "跳过 hook 重新注册",
    withPackageOption: "同时执行 npm update 更新 @chenmk/superflow 包",
    uninstallForceOption: "跳过确认提示",
    withDepsOption: "同时卸载 OpenSpec、Superpowers、Understand 依赖",
    managedOption:
      "托管 implementation prompt、change 目录或自然语言任务，并等待终态回传",
    manualOption: "创建受控人工执行任务，不自动启动实现者",
    managedProjectOption: "托管任务项目目录",
    managedProfileOption:
      "任务档位：auto | quick | engineering | sdd | monitor",
    managedSupervisorOption: "监督 Agent：current | peer | codex | claude",
    managedSubmitHostReviewOption:
      "提交当前 Host Codex 的结构化评审 JSON 并恢复任务",
    managedSubmitManualDeliveryOption: "提交人工执行者的结构化交付 JSON",
    managedExecutorOption: "执行 Agent：peer | current | codex | claude",
    managedAddDirOption: "同一业务平台需要联动修改的其他仓库",
    managedResumeOption: "安全接入运行中任务，或从已登记检查点恢复托管任务",
    managedReopenDeliveryOption: "用可审计的整改原因重新打开被用户驳回的交付",
    managedReplaceExecutorSessionOption:
      "人工恢复时替换不兼容的执行会话，并保留审计记录",
    managedResetExecutorSessionOption:
      "提供审计原因并放弃异常执行会话，下次调用创建全新会话",
    managedRetryBlockedExecutorOption:
      "提供可审计的人工恢复原因，让被阻塞的执行者继续完成可执行工作",
    managedProviderSwitchedOption:
      "确认已切换底层供应商并提供原因，使用全新执行会话原地恢复",
    managedInfrastructureCreditsOption:
      "抵扣由网络、供应商或恢复环境导致的非开发执行调用",
    managedMaxExecutorInvocationsOption: "提高本任务的执行 Agent 调用上限",
    managedMaxReviewRoundsOption: "提高本任务的正式评审轮次上限",
    managedMaxTotalAgentInvocationsOption: "提高本任务的总 Agent 调用上限",
    managedBudgetOverrideReasonOption: "提高托管预算时必填的审计原因",
    managedUnlimitedAgentBudgetOption: "临时取消当前任务的 Agent 调用次数限制",
    managedAdditionalExecutorInvocationsOption:
      "设置当前任务临时新增的执行 Agent 调用窗口",
    checkDescription: "按文件、文档交付或可编码等级检查 SDD change",
    checkLevelOption: "检查等级：files | docs | coding-ready",
  },
};

export function cliText(language: Language): CliHelpText {
  return CLI_TEXT[language];
}

export function resolveCliLanguage(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): Language {
  const fromArg = languageFromArgv(argv);
  if (fromArg) return fromArg;
  return resolveRuntimeLanguage(undefined, env);
}

export function resolveRuntimeLanguage(
  value?: unknown,
  env: NodeJS.ProcessEnv = process.env,
  installedStateFile = stateFile,
): Language {
  const explicit = normalizeLanguage(value);
  if (explicit) return explicit;
  const fromEnvironment = normalizeLanguage(env.SUPERFLOW_LANG);
  if (fromEnvironment) return fromEnvironment;
  try {
    return loadState(installedStateFile)?.language ?? "zh";
  } catch {
    return "zh";
  }
}

function languageFromArgv(argv: string[]): Language | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--language" || arg === "--lang") {
      return normalizeLanguage(argv[i + 1]);
    }
    if (arg.startsWith("--language=")) {
      return normalizeLanguage(arg.slice("--language=".length));
    }
    if (arg.startsWith("--lang=")) {
      return normalizeLanguage(arg.slice("--lang=".length));
    }
  }
  return null;
}
