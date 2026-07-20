import type { Language } from "../../types.js";
import { normalizeLanguage } from "./i18n.js";
import { loadState } from "../state.js";
import { stateFile } from "../../platform/paths.js";

export interface CliHelpText {
  programDescription: string;
  initDescription: string;
  scanDescription: string;
  clarifyDescription: string;
  docsDescription: string;
  designDescription: string;
  implementDescription: string;
  pipelineDescription: string;
  verifyDescription: string;
  archiveDescription: string;
  statusDescription: string;
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
  managedProjectOption: string;
  managedProfileOption: string;
  managedSupervisorOption: string;
  managedExecutorOption: string;
  managedAddDirOption: string;
  managedResumeOption: string;
}

const CLI_TEXT: Record<Language, CliHelpText> = {
  en: {
    programDescription:
      "SuperBridge Flow - SDD/TDD and managed-work workflow CLI",
    initDescription: "Install and configure SuperBridge Flow",
    scanDescription:
      "Rerun project context scaffolding and understand-anything check",
    clarifyDescription: "Check SuperBridge Flow clarify skill deployment",
    docsDescription: "Check SuperBridge Flow docs skill deployment",
    designDescription: "Check SuperBridge Flow design skill deployment",
    implementDescription: "Check SuperBridge Flow implement skill deployment",
    pipelineDescription:
      "Route SDD phases or manage an implementation prompt to terminal delivery",
    verifyDescription: "Check SuperBridge Flow verify skill deployment",
    archiveDescription: "Check SuperBridge Flow archive skill deployment",
    statusDescription:
      "Show active managed tasks, SDD changes, and next commands",
    updateDescription:
      "Update installed SuperBridge Flow skills, scripts, and hooks",
    doctorDescription: "Diagnose SuperBridge Flow installation health",
    uninstallDescription:
      "Uninstall skills, scripts, and hooks managed by SuperBridge Flow",
    dryRun: "Print the plan without writing files",
    agentOption: "Install/check target: claude | codex | opencode | both | all",
    scopeOption: "Install scope: global | project",
    updateScopeOption: "Update scope: auto | global | project",
    commandScopeOption: "Scope: auto | global | project",
    languageOption: "Language: en | zh",
    yesOption: "Run non-interactively with defaults",
    jsonOption: "Output JSON",
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
    managedProjectOption: "Managed task project directory",
    managedProfileOption:
      "Task profile: auto | quick | engineering | sdd | monitor",
    managedSupervisorOption: "Supervisor agent: codex | claude",
    managedExecutorOption: "Executor agent: codex | claude",
    managedAddDirOption: "Additional writable repositories in the same platform",
    managedResumeOption: "Resume from recorded sessions and checkpoints",
  },
  zh: {
    programDescription: "SuperBridge Flow - SDD/TDD 与双 Agent 托管工作流 CLI",
    initDescription:
      "一站式安装 SuperBridge Flow（detect / deps / skills / scripts / hooks / 项目扫描）",
    scanDescription:
      "单独重跑项目扫描（脚手架 docs/sdd-context/ + understand-anything）",
    clarifyDescription: "校验 SuperBridge Flow clarify 阶段技能部署状态",
    docsDescription: "校验 SuperBridge Flow docs 阶段技能部署状态",
    designDescription: "校验 SuperBridge Flow design 阶段技能部署状态",
    implementDescription: "校验 SuperBridge Flow implement 阶段技能部署状态",
    pipelineDescription:
      "路由 SDD 阶段，或托管实现 Prompt 直到双 Agent 交付终态",
    verifyDescription: "校验 SuperBridge Flow verify 阶段技能部署状态",
    archiveDescription: "校验 SuperBridge Flow archive 阶段技能部署状态",
    statusDescription: "查看当前项目的托管任务、SDD changes 和下一步命令",
    updateDescription: "更新已安装的 SuperBridge Flow skills、scripts 和 hooks",
    doctorDescription: "诊断 SuperBridge Flow 安装健康",
    uninstallDescription: "卸载 SuperBridge Flow 管理的技能、脚本和 hook 注册",
    dryRun: "只打印计划不执行",
    agentOption: "安装/校验目标：claude | codex | opencode | both | all",
    scopeOption: "安装作用域：global | project",
    updateScopeOption: "更新作用域：auto | global | project",
    commandScopeOption: "作用域：auto | global | project",
    languageOption: "语言：en | zh",
    yesOption: "非交互确认安装（默认参数）",
    jsonOption: "输出 JSON",
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
    managedProjectOption: "托管任务项目目录",
    managedProfileOption: "任务档位：auto | quick | engineering | sdd | monitor",
    managedSupervisorOption: "监督 Agent：codex | claude",
    managedExecutorOption: "执行 Agent：codex | claude",
    managedAddDirOption: "同一业务平台需要联动修改的其他仓库",
    managedResumeOption: "从已登记会话和检查点恢复托管任务",
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
