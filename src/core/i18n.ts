import type { Language } from '../types.js';

export type TranslationKey =
  | 'agentPrompt'
  | 'agentClaude'
  | 'agentCodex'
  | 'agentBoth'
  | 'agentAnswer'
  | 'agentInvalid'
  | 'languagePrompt'
  | 'languageEnglish'
  | 'languageChinese'
  | 'languageInvalid'
  | 'stepDetect'
  | 'stepDeps'
  | 'stepSkills'
  | 'stepScriptsHooks'
  | 'stepPrompts'
  | 'stepRules'
  | 'stepScan'
  | 'summaryTitle'
  | 'stateLabel'
  | 'initComplete'
  | 'runResume'
  | 'noActiveChanges'
  | 'statusHeader'
  | 'nextDocs'
  | 'nextDesign'
  | 'nextImplementDone'
  | 'nextVerifyFailed'
  | 'nextVerify'
  | 'nextArchive'
  | 'nextUnknown'
  | 'riskUnknownPhase'
  | 'riskTasksMissing'
  | 'riskReviewMissing'
  | 'riskVerifyFailed'
  | 'riskTestReportMissing'
  | 'updateTitle'
  | 'packageLabel'
  | 'skillsLabel'
  | 'rulesLabel'
  | 'scriptsLabel'
  | 'hooksLabel';

const TRANSLATIONS: Record<Language, Record<TranslationKey, string>> = {
  en: {
    agentPrompt: 'Select agent tools to initialize (multi-select):',
    agentClaude: 'Claude Code',
    agentCodex: 'Codex',
    agentBoth: 'Install both (default)',
    agentAnswer: 'Enter 1,2 / 2 / a:',
    agentInvalid: 'Invalid input. Enter 1, 2, 1,2, claude, codex, or a.',
    languagePrompt: 'Select SuperBridge Flow language:',
    languageEnglish: 'English',
    languageChinese: 'Chinese',
    languageInvalid: 'Invalid input. Enter en, zh, 1, or 2.',
    stepDetect: 'Detect platform',
    stepDeps: 'Install dependencies and initialize OpenSpec',
    stepSkills: 'Deploy SuperBridge Flow/OpenSpec skills',
    stepScriptsHooks: 'Deploy scripts and register hooks',
    stepPrompts: 'Deploy Codex prompt aliases',
    stepRules: 'Deploy SuperBridge Flow anti-drift rules',
    stepScan: 'Scaffold docs/sdd-context and check understand-anything',
    summaryTitle: 'superflow init summary',
    stateLabel: 'State',
    initComplete: 'superflow init complete',
    runResume: "Run 'superflow init --resume' to continue from this step.",
    noActiveChanges: 'No active SuperBridge Flow changes.',
    statusHeader: 'Active SuperBridge Flow changes',
    nextDocs: 'Current phase is docs. Continue OpenSpec/SDD contract documents.',
    nextDesign: 'Current phase is design. Continue Superpowers source-level technical design.',
    nextImplementDone: 'Implementation tasks are complete. Run pre-verify checks.',
    nextVerifyFailed: 'The last verify failed. Fix failures from the verification report first.',
    nextVerify: 'Current phase is verify. Add real evidence and run verification gates.',
    nextArchive: 'Verify passed; archive is waiting for explicit confirmation.',
    nextUnknown: 'Current phase is unknown. Inspect .sdd/state.yaml first.',
    riskUnknownPhase: 'phase is missing or unknown.',
    riskTasksMissing: 'tasks.md is missing or empty.',
    riskReviewMissing: 'full workflow has not selected review_mode.',
    riskVerifyFailed: 'The last verify failed.',
    riskTestReportMissing: 'verify phase is missing test-report.md.',
    updateTitle: 'SuperBridge Flow update',
    packageLabel: 'packages',
    skillsLabel: 'skills',
    rulesLabel: 'rules',
    scriptsLabel: 'scripts',
    hooksLabel: 'hooks',
  },
  zh: {
    agentPrompt: '请选择要初始化的 agent 工具（可多选）：',
    agentClaude: 'Claude Code',
    agentCodex: 'Codex',
    agentBoth: '两者都安装（默认）',
    agentAnswer: '输入序号，例如 1,2 / 2 / a：',
    agentInvalid: '输入无效，请输入 1、2、1,2、claude、codex 或 a。',
    languagePrompt: '请选择 SuperBridge Flow 语言：',
    languageEnglish: '英文',
    languageChinese: '中文',
    languageInvalid: '输入无效，请输入 en、zh、1 或 2。',
    stepDetect: '检测平台',
    stepDeps: '安装第三方依赖并初始化 OpenSpec',
    stepSkills: '部署 SuperBridge Flow/OpenSpec 技能',
    stepScriptsHooks: '部署脚本 + 注册 hook',
    stepPrompts: '部署 Codex prompt alias',
    stepRules: '部署 SuperBridge Flow 防漂移规则',
    stepScan: '脚手架 docs/sdd-context/ + understand-anything 扫描 + 软提示',
    summaryTitle: 'superflow init summary',
    stateLabel: 'State',
    initComplete: 'superflow init complete',
    runResume: "Run 'superflow init --resume' to continue from this step.",
    noActiveChanges: 'No active SuperBridge Flow changes.',
    statusHeader: 'Active SuperBridge Flow changes',
    nextDocs: '当前处于 docs 阶段，继续生成或补齐 OpenSpec/SDD 合同文档。',
    nextDesign: '当前处于 design 阶段，继续生成 Superpowers 源码级技术详设。',
    nextImplementDone: 'implement 任务已完成，可以进入 verify 前检查。',
    nextVerifyFailed: '最近一次 verify 失败，先修复验证报告中的失败项。',
    nextVerify: '当前处于 verify 阶段，补齐真实验证证据并运行验收门禁。',
    nextArchive: 'verify 已通过后进入 archive，等待明确归档确认。',
    nextUnknown: '当前 phase 未知，先检查 .sdd/state.yaml。',
    riskUnknownPhase: 'phase 缺失或未知。',
    riskTasksMissing: '缺少 tasks.md 或任务清单为空。',
    riskReviewMissing: 'full workflow 尚未选择 review_mode。',
    riskVerifyFailed: '最近一次 verify 失败。',
    riskTestReportMissing: 'verify 阶段缺少 test-report.md。',
    updateTitle: 'SuperBridge Flow update',
    packageLabel: 'packages',
    skillsLabel: 'skills',
    rulesLabel: 'rules',
    scriptsLabel: 'scripts',
    hooksLabel: 'hooks',
  },
};

export function normalizeLanguage(value: unknown): Language | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'en' || normalized === 'english' || normalized === '1') return 'en';
  if (normalized === 'zh' || normalized === 'cn' || normalized === 'chinese' || normalized === '2') {
    return 'zh';
  }
  return null;
}

export function t(language: Language, key: TranslationKey): string {
  return TRANSLATIONS[language][key];
}
