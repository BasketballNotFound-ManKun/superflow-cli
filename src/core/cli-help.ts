import type { Language } from '../types.js';
import { normalizeLanguage } from './i18n.js';

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
}

const CLI_TEXT: Record<Language, CliHelpText> = {
  en: {
    programDescription: 'SuperBridge Flow - SDD/TDD workflow CLI',
    initDescription: 'Install and configure SuperBridge Flow',
    scanDescription: 'Rerun project context scaffolding and understand-anything check',
    clarifyDescription: 'Check SuperBridge Flow clarify skill deployment',
    docsDescription: 'Check SuperBridge Flow docs skill deployment',
    designDescription: 'Check SuperBridge Flow design skill deployment',
    implementDescription: 'Check SuperBridge Flow implement skill deployment',
    pipelineDescription: 'Check SuperBridge Flow pipeline skill deployment',
    verifyDescription: 'Check SuperBridge Flow verify skill deployment',
    archiveDescription: 'Check SuperBridge Flow archive skill deployment',
    statusDescription: 'Show active SuperBridge Flow changes and next commands',
    updateDescription: 'Update installed SuperBridge Flow skills, scripts, and hooks',
    doctorDescription: 'Diagnose SuperBridge Flow installation health',
    uninstallDescription: 'Uninstall skills, scripts, and hooks managed by SuperBridge Flow',
    dryRun: 'Print the plan without writing files',
    agentOption: 'Install/check target: claude | codex | both',
    scopeOption: 'Install scope: global | project',
    updateScopeOption: 'Update scope: auto | global | project',
    commandScopeOption: 'Scope: auto | global | project',
    languageOption: 'Language: en | zh',
    yesOption: 'Run non-interactively with defaults',
    jsonOption: 'Output JSON',
    resumeOption: 'Resume from the failed step',
    skipExistingOption: 'Keep existing skills/scripts unchanged',
    overwriteOption: 'Overwrite existing skills without creating backups',
    noHooksOption: 'Install skills and scripts only; skip hook registration',
    noOpenspecInitOption: 'Skip native OpenSpec initialization for this project',
    noScanOption: 'Skip project context scaffolding and scan hints',
    forceOption: 'Overwrite existing docs/sdd-context files',
    noHooksUpdateOption: 'Skip hook re-registration',
    withPackageOption: 'Also run npm update for @chenmk/superflow',
    uninstallForceOption: 'Skip confirmation prompt',
    withDepsOption: 'Also uninstall OpenSpec, Superpowers, and Understand dependencies',
  },
  zh: {
    programDescription: 'SuperBridge Flow - SDD/TDD 工作流 CLI',
    initDescription: '一站式安装 SuperBridge Flow（detect / deps / skills / scripts / hooks / 项目扫描）',
    scanDescription: '单独重跑项目扫描（脚手架 docs/sdd-context/ + understand-anything）',
    clarifyDescription: '校验 SuperBridge Flow clarify 阶段技能部署状态',
    docsDescription: '校验 SuperBridge Flow docs 阶段技能部署状态',
    designDescription: '校验 SuperBridge Flow design 阶段技能部署状态',
    implementDescription: '校验 SuperBridge Flow implement 阶段技能部署状态',
    pipelineDescription: '校验 SuperBridge Flow pipeline 阶段技能部署状态',
    verifyDescription: '校验 SuperBridge Flow verify 阶段技能部署状态',
    archiveDescription: '校验 SuperBridge Flow archive 阶段技能部署状态',
    statusDescription: '查看当前项目 active SuperBridge Flow changes 和下一步 superflow 命令',
    updateDescription: '更新已安装的 SuperBridge Flow skills、scripts 和 hooks',
    doctorDescription: '诊断 SuperBridge Flow 安装健康',
    uninstallDescription: '卸载 SuperBridge Flow 管理的技能、脚本和 hook 注册',
    dryRun: '只打印计划不执行',
    agentOption: '安装/校验目标：claude | codex | both',
    scopeOption: '安装作用域：global | project',
    updateScopeOption: '更新作用域：auto | global | project',
    commandScopeOption: '作用域：auto | global | project',
    languageOption: '语言：en | zh',
    yesOption: '非交互确认安装（默认参数）',
    jsonOption: '输出 JSON',
    resumeOption: '从失败步骤继续',
    skipExistingOption: '已存在的 skill/script 保持不动',
    overwriteOption: '已存在的 skill 直接覆盖，不额外生成 backup',
    noHooksOption: '只装技能 + 脚本，跳过 hook 注册（hook 手工配）',
    noOpenspecInitOption: '跳过当前项目 OpenSpec 原生初始化',
    noScanOption: '跳过项目上下文脚手架和扫描提示',
    forceOption: '覆盖现有 docs/sdd-context 文件',
    noHooksUpdateOption: '跳过 hook 重新注册',
    withPackageOption: '同时执行 npm update 更新 @chenmk/superflow 包',
    uninstallForceOption: '跳过确认提示',
    withDepsOption: '同时卸载 OpenSpec、Superpowers、Understand 依赖',
  },
};

export function cliText(language: Language): CliHelpText {
  return CLI_TEXT[language];
}

export function resolveCliLanguage(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env
): Language {
  const fromArg = languageFromArgv(argv);
  if (fromArg) return fromArg;
  return normalizeLanguage(env.SUPERFLOW_LANG) ?? 'zh';
}

function languageFromArgv(argv: string[]): Language | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--language' || arg === '--lang') {
      return normalizeLanguage(argv[i + 1]);
    }
    if (arg.startsWith('--language=')) {
      return normalizeLanguage(arg.slice('--language='.length));
    }
    if (arg.startsWith('--lang=')) {
      return normalizeLanguage(arg.slice('--lang='.length));
    }
  }
  return null;
}
