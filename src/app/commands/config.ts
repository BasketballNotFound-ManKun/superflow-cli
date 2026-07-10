import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { logReviewModeChange, logAutoTransitionToggle } from '../../domains/state-events.js';
import type { ReviewMode } from '../../domains/workflow-state.js';

export interface ConfigResult {
  change: string;
  updated: Record<string, string>;
}

/**
 * 设置 SDD change 的工作流配置字段。
 * 当前支持: review_mode, auto_transition
 */
export async function configCommand(
  changeName: string,
  options: {
    reviewMode?: string;
    autoTransition?: string;
    projectPath?: string;
    json?: boolean;
  } = {}
): Promise<void> {
  const projectPath = path.resolve(options.projectPath ?? process.cwd());
  const changeDir = path.join(projectPath, 'openspec', 'changes', changeName);
  const stateFile = path.join(changeDir, '.sdd', 'state.yaml');

  if (!existsSync(stateFile)) {
    console.error(`错误：未找到 ${changeName} 的 .sdd/state.yaml。请先运行 superflow init。`);
    process.exit(1);
  }

  const content = readFileSync(stateFile, 'utf-8');
  const updated: Record<string, string> = {};
  let newContent = content;

  if (options.reviewMode) {
    const mode = normalizeReviewMode(options.reviewMode);
    newContent = setYamlField(newContent, 'review_mode', mode);
    updated['review_mode'] = mode;
    logReviewModeChange(changeDir, extractYamlField(content, 'review_mode') ?? 'null', mode);
  }

  if (options.autoTransition !== undefined) {
    const val = normalizeBool(options.autoTransition);
    newContent = setYamlField(newContent, 'auto_transition', val);
    updated['auto_transition'] = val;
    logAutoTransitionToggle(changeDir, val === 'true');
  }

  if (Object.keys(updated).length === 0) {
    console.log('未指定要修改的字段。支持: --review-mode, --auto-transition');
    return;
  }

  const dir = path.dirname(stateFile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(stateFile, newContent, 'utf-8');

  if (options.json) {
    console.log(JSON.stringify({ change: changeName, updated }, null, 2));
  } else {
    console.log(`已更新 ${changeName} 配置:`);
    for (const [key, val] of Object.entries(updated)) {
      console.log(`  ${key}: ${val}`);
    }
  }
}

function normalizeReviewMode(value: string): string {
  const mode = value.trim().toLowerCase();
  if (mode === 'off' || mode === 'standard' || mode === 'thorough') return mode;
  throw new Error(`无效的 review_mode: "${value}"。可选: off, standard, thorough`);
}

function normalizeBool(value: string): string {
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return 'true';
  if (v === 'false' || v === '0' || v === 'no') return 'false';
  throw new Error(`无效的布尔值: "${value}"。可选: true, false`);
}

function setYamlField(content: string, key: string, value: string): string {
  const lines = content.split(/\r?\n/);
  const keyLine = lines.findIndex((line) =>
    line.trimStart().startsWith(`${key}:`)
  );
  if (keyLine >= 0) {
    const indent = lines[keyLine].match(/^(\s*)/)?.[1] ?? '';
    lines[keyLine] = `${indent}${key}: ${value}`;
  } else {
    lines.push(`${key}: ${value}`);
  }
  return lines.join('\n') + '\n';
}

function extractYamlField(content: string, key: string): string | undefined {
  for (const line of content.split(/\r?\n/)) {
    if (line.trimStart().startsWith(`${key}:`)) {
      return line.split(':')[1]?.trim();
    }
  }
  return undefined;
}

/** 读取当前 change 的 review_mode */
export function getReviewMode(changeDir: string): ReviewMode {
  const stateFile = path.join(changeDir, '.sdd', 'state.yaml');
  if (!existsSync(stateFile)) return 'standard';
  const content = readFileSync(stateFile, 'utf-8');
  const val = extractYamlField(content, 'review_mode');
  if (val === 'off' || val === 'standard' || val === 'thorough') return val;
  return 'standard';
}

/** 读取当前 change 的 auto_transition */
export function getAutoTransition(changeDir: string): boolean {
  const stateFile = path.join(changeDir, '.sdd', 'state.yaml');
  if (!existsSync(stateFile)) return true;
  const content = readFileSync(stateFile, 'utf-8');
  const val = extractYamlField(content, 'auto_transition');
  return val !== 'false';
}
