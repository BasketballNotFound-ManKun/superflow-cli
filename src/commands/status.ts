import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { normalizeLanguage, t } from '../core/i18n.js';
import type { Language } from '../types.js';

export interface ChangeStatus {
  name: string;
  path: string;
  workflow: string;
  phase: string;
  buildMode: string;
  reviewMode: string;
  verifyMode: string;
  verifyResult: string;
  tasksCompleted: number;
  tasksTotal: number;
  nextCommand: string | null;
  nextReason: string;
  risks: Array<{ level: 'info' | 'warning' | 'error'; code: string; message: string }>;
}

export interface StatusResult {
  projectPath: string;
  changes: ChangeStatus[];
}

export async function statusCommand(
  targetPath = '.',
  options: { json?: boolean } = {}
): Promise<void> {
  const result = await collectStatus(targetPath);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  printStatus(result, resolveLanguage());
}

export async function collectStatus(targetPath = '.'): Promise<StatusResult> {
  const projectPath = path.resolve(targetPath);
  const changesRoot = path.join(projectPath, 'openspec', 'changes');
  const changes: ChangeStatus[] = [];

  if (!existsSync(changesRoot)) return { projectPath, changes };

  for (const entry of readdirSync(changesRoot).sort()) {
    const changeDir = path.join(changesRoot, entry);
    if (!statSync(changeDir).isDirectory()) continue;
    const statePath = path.join(changeDir, '.sdd', 'state.yaml');
    if (!existsSync(statePath)) continue;

    const state = parseSimpleYaml(readFileSync(statePath, 'utf-8'));
    if (state.archived === 'true' || state.phase === 'done') continue;
    const tasks = countTasks(path.join(changeDir, 'tasks.md'));

    changes.push({
      name: entry,
      path: path.relative(projectPath, changeDir),
      workflow: state.workflow ?? 'full',
      phase: state.phase ?? 'unknown',
      buildMode: state.build_mode ?? 'null',
      reviewMode: state.review_mode ?? 'null',
      verifyMode: state.verify_mode ?? 'null',
      verifyResult: state.verify_result ?? 'pending',
      tasksCompleted: tasks.done,
      tasksTotal: tasks.total,
      nextCommand: nextCommand(entry, state.phase),
      nextReason: nextReason(state.phase, tasks, state.verify_result, resolveLanguage()),
      risks: buildRisks(changeDir, state, tasks, resolveLanguage()),
    });
  }

  return { projectPath, changes };
}

function fileExists(changeDir: string, file: string): boolean {
  return existsSync(path.join(changeDir, file));
}

function parseSimpleYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (/^\s/.test(line)) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}

function countTasks(tasksPath: string): { done: number; total: number } {
  if (!existsSync(tasksPath)) return { done: 0, total: 0 };
  const lines = readFileSync(tasksPath, 'utf-8').split(/\r?\n/);
  return {
    done: lines.filter((line) => /^\s*-\s*\[[xX]\]/.test(line)).length,
    total: lines.filter((line) => /^\s*-\s*\[[ xX]\]/.test(line)).length,
  };
}

function nextCommand(change: string, phase: string | undefined): string | null {
  switch (phase) {
    case 'docs':
      return `superflow docs ${change}`;
    case 'design':
      return `superflow design ${change}`;
    case 'implement':
      return `superflow implement ${change}`;
    case 'verify':
      return `superflow verify ${change}`;
    case 'archive':
      return `superflow archive ${change}`;
    default:
      return null;
  }
}

function nextReason(
  phase: string | undefined,
  tasks: { done: number; total: number },
  verifyResult: string | undefined,
  language: Language
): string {
  if (verifyResult === 'fail') return t(language, 'nextVerifyFailed');
  switch (phase) {
    case 'docs':
      return t(language, 'nextDocs');
    case 'design':
      return t(language, 'nextDesign');
    case 'implement': {
      const remaining = tasks.total - tasks.done;
      if (remaining > 0) {
        return language === 'en'
          ? `Current phase is implement. ${remaining} task(s) remain.`
          : `当前处于 implement 阶段，还有 ${remaining} 个任务未完成。`;
      }
      return t(language, 'nextImplementDone');
    }
    case 'verify':
      return t(language, 'nextVerify');
    case 'archive':
      return t(language, 'nextArchive');
    default:
      return t(language, 'nextUnknown');
  }
}

function buildRisks(
  changeDir: string,
  state: Record<string, string>,
  tasks: { done: number; total: number },
  language: Language
): ChangeStatus['risks'] {
  const risks: ChangeStatus['risks'] = [];
  const phase = state.phase ?? 'unknown';

  if (phase === 'unknown') {
    risks.push({ level: 'warning', code: 'UNKNOWN_PHASE', message: t(language, 'riskUnknownPhase') });
  }
  if (tasks.total === 0 || !fileExists(changeDir, 'tasks.md')) {
    risks.push({ level: 'warning', code: 'TASKS_MISSING', message: t(language, 'riskTasksMissing') });
  } else if (phase === 'implement' && tasks.done < tasks.total) {
    const remaining = tasks.total - tasks.done;
    risks.push({
      level: 'warning',
      code: 'TASKS_INCOMPLETE',
      message: language === 'en' ? `${remaining} task(s) remain.` : `仍有 ${remaining} 个任务未完成。`,
    });
  }
  if ((state.workflow ?? 'full') === 'full' && (state.review_mode ?? 'null') === 'null') {
    risks.push({ level: 'warning', code: 'REVIEW_MODE_MISSING', message: t(language, 'riskReviewMissing') });
  }
  if (state.verify_result === 'fail') {
    risks.push({ level: 'error', code: 'VERIFY_FAILED', message: t(language, 'riskVerifyFailed') });
  } else if (phase === 'verify' && !fileExists(changeDir, 'test-report.md')) {
    risks.push({ level: 'warning', code: 'TEST_REPORT_MISSING', message: t(language, 'riskTestReportMissing') });
  }
  for (const artifact of ['proposal.md', 'design.md', 'tests.md'] as const) {
    if (!fileExists(changeDir, artifact)) {
      risks.push({
        level: 'info',
        code: 'ARTIFACT_MISSING',
        message: language === 'en' ? `Missing ${artifact}.` : `缺少 ${artifact}。`,
      });
    }
  }
  return risks;
}

function printStatus(result: StatusResult, language: Language): void {
  if (result.changes.length === 0) {
    console.log(t(language, 'noActiveChanges'));
    return;
  }

  console.log(`${t(language, 'statusHeader')} (${result.projectPath}):\n`);
  for (const change of result.changes) {
    const tasks = change.tasksTotal > 0
      ? ` | tasks ${change.tasksCompleted}/${change.tasksTotal}`
      : '';
    console.log(
      `- ${change.name}: phase=${change.phase}, workflow=${change.workflow}, review_mode=${change.reviewMode}${tasks}`
    );
    console.log(`  path: ${change.path}`);
    if (change.nextCommand) console.log(`  next: ${change.nextCommand}`);
    console.log(`  reason: ${change.nextReason}`);
    for (const risk of change.risks) {
      console.log(`  ${risk.level.toUpperCase()} ${risk.code}: ${risk.message}`);
    }
  }
}

function resolveLanguage(): Language {
  return normalizeLanguage(process.env.SUPERFLOW_LANGUAGE) ?? 'zh';
}
