import type { WorkflowProfile } from './workflow-state.js';

/**
 * 意图路由 — 根据用户请求自动识别工作流类型。
 */

export type Intent = 'full' | 'hotfix' | 'tweak' | 'resume' | 'ambiguous';

export interface IntentResult {
  intent: Intent;
  profile: WorkflowProfile;
  reason: string;
}

/** 触发 hotfix 的关键词（中文 + 英文） */
const HOTFIX_SIGNALS = [
  '修复', '修', 'fix', 'hotfix', 'bug', '缺陷', '补丁', 'patch',
  '紧急', 'urgent', '崩溃', 'crash', '报错', 'error',
];

/** 触发 tweak 的关键词（纯文档/配置类改动） */
const TWEAK_SIGNALS = [
  '文档', 'doc', 'readme', '注释', 'comment', '文案', 'copy',
  '配置', 'config', '格式', 'format', 'lint', '排版',
  'changelog', 'news',
];

/** 触发 resume 的关键词 */
const RESUME_SIGNALS = [
  '继续', '恢复', 'resume', '接着', '往下', '下一步', 'next',
];

/**
 * 基于用户输入文本检测意图。
 * 规则优先级：hotfix > tweak > resume > full
 */
export function detectIntent(input: string): IntentResult {
  const lower = input.toLowerCase();

  // 1. hotfix 信号
  const hotfixHit = HOTFIX_SIGNALS.filter((s) => lower.includes(s.toLowerCase()));
  if (hotfixHit.length >= 2 || (hotfixHit.length >= 1 && lower.length < 40)) {
    return { intent: 'hotfix', profile: 'hotfix', reason: `检测到修复信号: ${hotfixHit.join(', ')}` };
  }

  // 2. tweak 信号
  const tweakHit = TWEAK_SIGNALS.filter((s) => lower.includes(s.toLowerCase()));
  if (tweakHit.length >= 2 && !containsCodeSignals(lower)) {
    return { intent: 'tweak', profile: 'tweak', reason: `检测到轻量改动信号: ${tweakHit.join(', ')}` };
  }

  // 3. resume 信号
  const resumeHit = RESUME_SIGNALS.filter((s) => lower.includes(s.toLowerCase()));
  if (resumeHit.length >= 1 && lower.length < 60) {
    return { intent: 'resume', profile: 'full', reason: '检测到恢复信号，尝试继续上次中断的任务' };
  }

  // 4. ambiguous：太短无法判断
  if (lower.length < 10) {
    return { intent: 'ambiguous', profile: 'full', reason: '输入过短，无法自动判断意图' };
  }

  // 5. 默认 full
  return { intent: 'full', profile: 'full', reason: '默认为完整工作流' };
}

/** 检查是否包含代码改动信号 */
function containsCodeSignals(input: string): boolean {
  const codeWords = [
    '函数', 'function', '类', 'class', '接口', 'interface',
    '模块', 'module', '组件', 'component', 'api', 'sql',
    '数据库', 'database', '实现', 'implement', '开发',
    '添加', '新增', 'add', 'feature', 'feat',
  ];
  return codeWords.some((w) => input.includes(w));
}

/** 获取意图对应的工作流阶段列表 */
export function phasesForIntent(intent: Intent): string[] {
  switch (intent) {
    case 'full':
      return ['docs', 'design', 'implement', 'verify', 'archive'];
    case 'hotfix':
      return ['implement', 'verify', 'archive'];
    case 'tweak':
      return ['implement', 'verify'];
    case 'resume':
      return []; // 从 run-state 恢复，不预设阶段
    case 'ambiguous':
      return [];
  }
}
