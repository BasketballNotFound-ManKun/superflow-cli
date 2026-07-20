#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const [projectArg = '.', taskId, mode] = process.argv.slice(2);
const beforeReadyEvent = mode === '--before-ready-event';
if (!taskId) {
  console.error('用法: superflow-managed-work-check.mjs <project-root> <task-id>');
  process.exit(2);
}

const projectRoot = path.resolve(projectArg);
const taskDir = path.join(projectRoot, '.superflow', 'tasks', taskId);
const taskFile = path.join(taskDir, 'task.json');
if (!fs.existsSync(taskFile)) fail(`缺少任务状态: ${taskFile}`);
const task = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
verifyContract(task);
const runsDir = path.join(taskDir, 'runs');
const runs = fs.existsSync(runsDir)
  ? fs.readdirSync(runsDir).filter((entry) => fs.statSync(path.join(runsDir, entry)).isDirectory())
  : [];
if (runs.length !== 1) fail(`首版要求一个活动 run，实际 ${runs.length}`);

const runDir = path.join(runsDir, runs[0]);
const stateFile = path.join(runDir, 'run-state.json');
const journalFile = path.join(runDir, 'progress.jsonl');
const reportFile = path.join(runDir, 'task-report.md');
for (const file of [stateFile, journalFile, reportFile]) {
  if (!fs.existsSync(file)) fail(`缺少必备运行产物: ${file}`);
}
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

assertMax('reviewRound', state.reviewRound, 5);
assertMax('executorInvocations', state.executorInvocations, 7);
assertMax('totalAgentInvocations', state.totalAgentInvocations, 12);
assertMax('reviewInvocations', state.reviewInvocations, 5);
if (state.contractHash !== task.contractHash) fail('任务合同哈希与运行状态不一致');
if (state.status !== task.status) fail('任务合同状态与运行状态不一致');
if (state.executorInvocations > 0 && !state.executorSession?.sessionId) {
  fail('已有执行调用但缺少执行会话编号');
}
if (state.reviewInvocations > 0 && !state.supervisorSession?.sessionId) {
  fail('已有正式检查但缺少监督会话编号');
}
const events = verifyJournal(journalFile);

if (state.status === 'awaiting_git_approval') {
  if (!state.lastExecutorResult || !fs.existsSync(state.lastExecutorResult)) {
    fail('等待 Git 批准状态缺少最终执行结果');
  }
  if (!state.lastReviewResult || !fs.existsSync(state.lastReviewResult)) {
    fail('等待 Git 批准状态缺少最终检查结果');
  }
  assertInsideRun(state.lastExecutorResult, runDir, '最终执行结果');
  assertInsideRun(state.lastReviewResult, runDir, '最终检查结果');
  const executor = JSON.parse(fs.readFileSync(state.lastExecutorResult, 'utf8'));
  verifyExecutorEvidence(task, executor);
  const review = JSON.parse(fs.readFileSync(state.lastReviewResult, 'utf8'));
  if (review.result !== 'pass' || review.findings?.some((item) => item.blocking)) {
    fail('等待 Git 批准状态与最终检查结论不一致');
  }
  const readyEvents = events.filter((event) => event.eventType === 'run.delivery_ready');
  const expectedReadyEvents = beforeReadyEvent ? 0 : 1;
  if (readyEvents.length !== expectedReadyEvents) {
    fail(`交付就绪事件数量应为 ${expectedReadyEvents}，实际 ${readyEvents.length}`);
  }
}

console.log(`OK 托管任务状态完整: ${taskId} (${state.status})`);

function assertMax(name, value, max) {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    fail(`${name}=${value} 超出范围 0..${max}`);
  }
}

function verifyContract(contract) {
  const budgets = contract.budgets ?? {};
  assertPositiveMax('maxReviewRounds', budgets.maxReviewRounds, 5, true);
  assertPositiveMax('maxExecutorInvocations', budgets.maxExecutorInvocations, 7, true);
  assertPositiveMax('maxTotalAgentInvocations', budgets.maxTotalAgentInvocations, 12, true);
  assertPositiveMax('maxActiveRunHours', budgets.maxActiveRunHours, 24, false);
  assertPositiveMax('maxSingleInvocationHours', budgets.maxSingleInvocationHours, 3, false);
  if (contract.supervisorAgent === contract.executorAgent) {
    fail('监督 Agent 和执行 Agent 不能相同');
  }
  const permissions = contract.permissions ?? {};
  for (const key of ['gitCommit', 'gitPush', 'productionWrites', 'bypassSandbox']) {
    if (permissions[key] !== false) fail(`不可覆盖的权限边界被放宽: ${key}`);
  }
  if (contract.taskPrompt) {
    const expectedSnapshot = path.join(
      path.resolve(contract.projectRoot),
      '.superflow',
      'tasks',
      contract.taskId,
      'source-prompt.md',
    );
    if (path.resolve(contract.taskPrompt.snapshotPath) !== expectedSnapshot) {
      fail('冻结 Prompt 快照路径不属于当前托管任务');
    }
    if (!fs.existsSync(expectedSnapshot)) fail('冻结 Prompt 快照不存在');
    const promptHash = crypto.createHash('sha256')
      .update(fs.readFileSync(expectedSnapshot, 'utf8'))
      .digest('hex');
    if (promptHash !== contract.taskPrompt.sha256) fail('冻结 Prompt 快照哈希不一致');
  }
  const immutable = {
    schemaVersion: contract.schemaVersion,
    taskId: contract.taskId,
    request: contract.request,
    source: contract.source,
    projectRoot: path.resolve(contract.projectRoot),
    relatedProjectRoots: contract.relatedProjectRoots.map((root) => path.resolve(root)),
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
  const actual = crypto.createHash('sha256').update(JSON.stringify(immutable)).digest('hex');
  if (actual !== contract.contractHash) fail('任务合同内容与冻结哈希不一致');
}

function assertPositiveMax(name, value, max, integer) {
  if (!Number.isFinite(value) || value <= 0 || value > max || (integer && !Number.isInteger(value))) {
    fail(`${name}=${value} 超出硬上限或格式非法`);
  }
}

function verifyExecutorEvidence(task, result) {
  if (result.status !== 'ready_for_review') fail('最终执行结果不是可检查状态');
  if (!Array.isArray(result.commands) || result.commands.some((item) => item.exitCode !== 0)) {
    fail('最终执行结果缺少成功命令证据或仍含失败命令');
  }
  if (Array.isArray(result.blockers) && result.blockers.length > 0) {
    fail('最终执行结果仍含阻塞项');
  }
  if (task.profile === 'engineering' || task.profile === 'sdd') {
    const categories = new Set(result.commands.flatMap((item) => verificationCategories(item.command)));
    if (categories.size < 2) fail('工程任务缺少至少两类成功验证证据');
  }
}

function verificationCategories(command = '') {
  const value = command.toLowerCase();
  const categories = [];
  if (/(^|\s)(test|vitest|jest|pytest|phpunit|go\s+test|cargo\s+test)(\s|$)/.test(value)
      || /(?:npm|pnpm|yarn)\s+(?:run\s+)?test/.test(value)
      || /mvn(?:\s+[^\s]+)*\s+test/.test(value)
      || /gradle\w*\s+test/.test(value)) categories.push('test');
  if (/(?:npm|pnpm|yarn)\s+(?:run\s+)?build/.test(value)
      || /(^|\s)(tsc|make|cmake|compile)(\s|$)/.test(value)
      || /mvn(?:\s+[^\s]+)*\s+(?:compile|package|verify)/.test(value)
      || /gradle\w*\s+(?:build|assemble)/.test(value)
      || /cargo\s+build|go\s+build/.test(value)) categories.push('build');
  if (/(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:start|dev|serve)/.test(value)
      || /spring-boot:run|docker\s+compose\s+up|(^|\s)(curl|wget)(\s|$)/.test(value)
      || /health(?:check)?|integration|e2e/.test(value)) categories.push('runtime');
  return categories;
}

function assertInsideRun(file, runDir, label) {
  const relative = path.relative(path.resolve(runDir), path.resolve(file));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(`${label}不在当前运行目录内`);
  }
}

function verifyJournal(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  let previous = null;
  const events = lines.map((line, index) => {
    const event = JSON.parse(line);
    const { eventHash, ...base } = event;
    const expected = crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex');
    if (event.sequence !== index + 1) fail(`事件序号断裂: ${event.sequence}`);
    if (event.previousEventHash !== previous) fail(`事件前序哈希不一致: ${event.sequence}`);
    if (eventHash !== expected) fail(`事件哈希不一致: ${event.sequence}`);
    previous = eventHash;
    return event;
  });
  return events;
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}
