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
  ? fs.readdirSync(runsDir).filter((entry) => {
      const candidate = path.join(runsDir, entry);
      return (
        entry.startsWith('run-') &&
        fs.statSync(candidate).isDirectory() &&
        fs.existsSync(path.join(candidate, 'run-state.json'))
      );
    })
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

if (task.budgets?.unlimitedAgentInvocations !== true) {
  assertMax('reviewRound', state.reviewRound, 10);
  assertMax(
    'executorInvocations',
    state.executorInvocations,
    20 + (state.executorInvocationCredits ?? 0),
  );
  assertMax(
    'totalAgentInvocations',
    state.totalAgentInvocations,
    30 + (state.totalAgentInvocationCredits ?? 0),
  );
  assertMax('reviewInvocations', state.reviewInvocations, 10);
}
if (state.contractHash !== task.contractHash) fail('任务合同哈希与运行状态不一致');
if (state.status !== task.status) fail('任务合同状态与运行状态不一致');
if (state.executorInvocations > 0 && !state.executorSession?.sessionId) {
  fail('已有执行调用但缺少执行会话编号');
}
const events = verifyJournal(journalFile);

const deliveryStatuses = new Set([
  'local_delivery_ready',
  'environment_validation_blocked',
  'release_ready',
]);
if (deliveryStatuses.has(state.status)) {
  if (!state.lastExecutorResult || !fs.existsSync(state.lastExecutorResult)) {
    fail('交付状态缺少最终执行结果');
  }
  if (!state.lastReviewResult || !fs.existsSync(state.lastReviewResult)) {
    fail('交付状态缺少最终检查结果');
  }
  assertInsideRun(state.lastExecutorResult, runDir, '最终执行结果');
  assertInsideRun(state.lastReviewResult, runDir, '最终检查结果');
  const executor = JSON.parse(fs.readFileSync(state.lastExecutorResult, 'utf8'));
  const review = JSON.parse(fs.readFileSync(state.lastReviewResult, 'utf8'));
  const completion = verifyOpenSpecTasksComplete(task, executor);
  verifyDeliveryStatus(state.status, completion);
  if (
    task.source === 'sdd' &&
    !review.verificationCommands?.some(
      (item) =>
        item.exitCode === 0 &&
        /openspec\s+instructions\s+apply/i.test(item.command),
    )
  ) {
    fail('SDD 最终评审缺少 openspec instructions apply 命令证据');
  }
  if (review.result !== 'pass' || review.findings?.some((item) => item.blocking)) {
    fail('交付状态与最终检查结论不一致');
  }
  verifyExecutorEvidence(task, executor, review, runDir);
  const readyEvents = events.filter((event) => event.eventType === 'run.delivery_ready');
  const reopenedEvents = events.filter(
    (event) => event.eventType === 'run.delivery_reopened',
  );
  const expectedReadyEvents = beforeReadyEvent ? 0 : 1;
  if (readyEvents.length !== reopenedEvents.length + expectedReadyEvents) {
    fail(
      `交付就绪事件应比重新打开事件多 ${expectedReadyEvents} 条，实际就绪 ${readyEvents.length}、重新打开 ${reopenedEvents.length}`,
    );
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
  if (
    budgets.executorPhysicalStopAt !== undefined &&
    (!Number.isInteger(budgets.executorPhysicalStopAt) ||
      budgets.executorPhysicalStopAt <= 0)
  ) {
    fail('executorPhysicalStopAt 必须是正整数');
  }
  assertPositiveMax('maxReviewRounds', budgets.maxReviewRounds, 10, true);
  assertPositiveMax('maxExecutorInvocations', budgets.maxExecutorInvocations, 20, true);
  assertPositiveMax('maxTotalAgentInvocations', budgets.maxTotalAgentInvocations, 30, true);
  assertPositiveMax('maxActiveRunHours', budgets.maxActiveRunHours, 24, false);
  assertPositiveMax('maxSingleInvocationHours', budgets.maxSingleInvocationHours, 3, false);
  if (contract.supervisorAgent === contract.executorAgent) {
    fail('监督 Agent 和执行 Agent 不能相同');
  }
  if (contract.supervisorExecution !== 'external_host') {
    fail('监督执行模式只允许 external_host');
  }
  const permissions = contract.permissions ?? {};
  for (const key of ['gitCommit', 'gitPush', 'productionWrites', 'bypassSandbox']) {
    if (permissions[key] !== false) fail(`不可覆盖的权限边界被放宽: ${key}`);
  }
  const disclosure = permissions.externalModelDataDisclosure;
  if (!disclosure?.approved || !disclosure.approvedBy || !disclosure.approvedAt) {
    fail('缺少任务级外部研发 Agent 源码披露授权');
  }
  if (!Array.isArray(disclosure.scope) || disclosure.scope.length === 0) {
    fail('外部研发 Agent 源码披露授权缺少仓库作用域');
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
    ...(contract.mandatoryEngineeringRules?.length
      ? { mandatoryEngineeringRules: contract.mandatoryEngineeringRules }
      : {}),
    taskPrompt: contract.taskPrompt,
    supervisorAgent: contract.supervisorAgent,
    executorAgent: contract.executorAgent,
    ...(contract.supervisorExecution
      ? { supervisorExecution: contract.supervisorExecution }
      : {}),
    ...(contract.executionMode ? { executionMode: contract.executionMode } : {}),
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

function verifyOpenSpecTasksComplete(task, executor) {
  if (task.source !== 'sdd' || !task.taskPrompt?.originalPath) {
    return { localPending: [], environmentPending: [], releasePending: [] };
  }
  let current = path.dirname(path.resolve(task.taskPrompt.originalPath));
  const projectRoot = path.resolve(task.projectRoot);
  while (current.startsWith(projectRoot)) {
    const tasksFile = path.join(current, 'tasks.md');
    if (fs.existsSync(tasksFile)) {
      const tasks = fs.readFileSync(tasksFile, 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^\s*- \[[ xX]\]/.test(line))
        .map((line, index) => parseCompletionTask(line, index));
      const localPending = tasks.filter(
        (item) => !item.completed && item.category === 'local_required',
      );
      const environmentPending = tasks.filter(
        (item) => !item.completed && item.category === 'environment_required',
      );
      const releasePending = tasks.filter(
        (item) => !item.completed && item.category === 'release_required',
      );
      if (localPending.length > 0) {
        fail(`OpenSpec tasks.md 仍有 ${localPending.length} 个本地可执行任务未完成`);
      }
      const evidence = new Map(
        (executor.taskEvidence ?? []).map((item) => [item.taskId, item]),
      );
      const successfulCommands = (executor.commands ?? []).filter(
        isAcceptedEvidenceCommand,
      );
      const derivedEvidencePaths = [
        ...(executor.evidence ?? []),
        tasksFile,
        path.join(current, 'test-report.md'),
      ].filter((item) => taskEvidencePathExists(task, item));
      for (const item of tasks.filter(
        (taskItem) =>
          taskItem.completed && taskItem.category === 'local_required',
      )) {
        const proof = evidence.get(item.taskId);
        if (successfulCommands.length > 0 && derivedEvidencePaths.length > 0) {
          continue;
        }
        if (!proof) {
          fail(`已勾选本地任务 ${item.taskId} 缺少可推导的真实交付证据`);
        }
        if (
          proof.owner !== 'executor' ||
          !proof.evidencePaths?.length ||
          !proof.verificationCommands?.length ||
          !proof.evidencePaths.every((item) => taskEvidencePathExists(task, item)) ||
          !proof.verificationCommands.every((command) =>
            executor.commands?.some(
              (item) =>
                isAcceptedEvidenceCommand(item) &&
                verificationCommandCovered(command, item.command),
            ),
          ) ||
          !proof.changedFiles.every((file) => executor.changedFiles?.includes(file))
        ) {
          fail(`已勾选本地任务 ${item.taskId} 缺少结构化交付证据`);
        }
      }
      if (
        environmentPending.length + releasePending.length > 0 &&
        (!Array.isArray(executor.releasePrerequisites) ||
          executor.releasePrerequisites.length === 0)
      ) {
        fail(
          `OpenSpec tasks.md 有 ${environmentPending.length + releasePending.length} 个环境/发布前置，但执行结果未记录 releasePrerequisites`,
        );
      }
      return { localPending, environmentPending, releasePending };
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  fail('SDD 托管任务未找到 OpenSpec tasks.md');
}

function isAcceptedEvidenceCommand(command) {
  if (command.exitCode === 0) return true;
  if (command.exitCode !== 1 && command.exitCode !== 2) return false;
  return (
    /^(?:\s*)(?:grep|rg|pgrep|lsof|ls|ss|netstat|git\s+(?:status|diff)|find)\b/i.test(
      command.command,
    ) &&
    /(?:none|empty|no\s+(?:match|orphan|process|change|listener|such\s+file)|not found|does not exist|无匹配|无残留|未发现|没有|不存在|空)/i.test(
      command.result,
    )
  );
}

function verificationCommandCovered(expected, actual) {
  if (expected === actual) return true;
  const expectedTests = mavenTestSelectors(expected);
  const actualTests = mavenTestSelectors(actual);
  return (
    expectedTests.length > 0 &&
    actualTests.length > 0 &&
    expectedTests.every((test) => actualTests.includes(test))
  );
}

function mavenTestSelectors(command) {
  if (!/(?:^|\s)(?:\.\/)?mvn(?:\s|$)/.test(command)) return [];
  const match = command.match(/-Dtest=([^\s]+)/);
  return match?.[1].split(',').filter(Boolean) ?? [];
}

function taskEvidencePathExists(task, evidencePath) {
  if (path.isAbsolute(evidencePath)) return fs.existsSync(evidencePath);
  const bases = [
    ...(findTaskDirectory(task) ? [findTaskDirectory(task)] : []),
    ...(task.taskPrompt?.originalPath
      ? [path.dirname(task.taskPrompt.originalPath)]
      : []),
    task.projectRoot,
    ...(task.relatedProjectRoots ?? []),
  ];
  return bases.some((base) => fs.existsSync(path.resolve(base, evidencePath)));
}

function findTaskDirectory(task) {
  if (!task.taskPrompt?.originalPath) return null;
  let current = path.dirname(path.resolve(task.taskPrompt.originalPath));
  const roots = [task.projectRoot, ...(task.relatedProjectRoots ?? [])].map(
    (root) => path.resolve(root),
  );
  while (roots.some((root) => current.startsWith(root))) {
    if (fs.existsSync(path.join(current, 'tasks.md'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function parseCompletionTask(line, index) {
  const completed = /^\s*- \[[xX]\]/.test(line);
  const text = line.replace(/^\s*- \[[ xX]\]\s*/, '').trim();
  const match = text.match(/^([A-Za-z]*\d+(?:\.\d+)*|[A-Z][A-Z0-9_-]+)\b/);
  const category = /\[environment_required\]/i.test(text)
    ? 'environment_required'
    : /\[release_required\]/i.test(text)
      ? 'release_required'
      : 'local_required';
  return { taskId: match?.[1] ?? `task-${index + 1}`, completed, category };
}

function verifyDeliveryStatus(status, completion) {
  if (status === 'environment_validation_blocked' && completion.environmentPending.length === 0) {
    fail('environment_validation_blocked 状态没有待完成环境验收');
  }
  if (status === 'local_delivery_ready' && completion.environmentPending.length > 0) {
    fail('local_delivery_ready 状态仍有环境验收未完成');
  }
  if (
    status === 'release_ready' &&
    completion.environmentPending.length + completion.releasePending.length > 0
  ) {
    fail('release_ready 状态仍有环境或发布任务未完成');
  }
}

function verifyExecutorEvidence(task, result, review, runDir) {
  if (!['ready_for_review', 'blocked'].includes(result.status)) {
    fail('最终执行结果既不可检查也不是诚实阻塞状态');
  }
  if (!Array.isArray(result.commands)) fail('最终执行结果缺少命令证据');
  if (result.status === 'blocked' && review.result !== 'pass') {
    fail('执行者阻塞结果未经监督者判定为非阻断发布前置');
  }
  if (result.status === 'ready_for_review' && result.blockers?.length > 0) {
    fail('可检查执行结果仍含阻塞项');
  }
  if (task.profile === 'engineering' || task.profile === 'sdd') {
    const successful = loadExecutorCommands(runDir)
      .filter((item) => item.exitCode === 0);
    const categories = new Set(
      successful.flatMap((item) => verificationCategories(item.command)),
    );
    const required = requiredVerificationCategories(projectRoot);
    if (categories.size < required) fail('工程任务缺少至少两类成功验证证据');
  }
}

function requiredVerificationCategories(root) {
  const packageFile = path.join(root, 'package.json');
  if (!fs.existsSync(packageFile)) return 2;
  try {
    const scripts = JSON.parse(fs.readFileSync(packageFile, 'utf8')).scripts ?? {};
    const hasTest = typeof scripts.test === 'string';
    const hasRunnableTarget = ['build', 'start', 'dev', 'serve']
      .some((name) => typeof scripts[name] === 'string');
    return hasTest && !hasRunnableTarget ? 1 : 2;
  } catch {
    return 2;
  }
}

function loadExecutorCommands(runDir) {
  return fs.readdirSync(runDir)
    .filter((entry) => /^executor-result-\d+\.json$/.test(entry))
    .flatMap((entry) => {
      const result = JSON.parse(
        fs.readFileSync(path.join(runDir, entry), 'utf8'),
      );
      return Array.isArray(result.commands) ? result.commands : [];
    });
}

function verificationCategories(command = '') {
  const value = command.toLowerCase();
  const categories = [];
  if (/(^|\s)(test|vitest|jest|pytest|phpunit|go\s+test|cargo\s+test)(\s|$)/.test(value)
      || /(?:npm|pnpm|yarn)\s+(?:run\s+)?test/.test(value)
      || /mvn(?:\s+[^\s]+)*\s+test/.test(value)
      || /gradle\w*\s+test/.test(value)) categories.push('test');
  if (/(?:npm|pnpm|yarn)\s+(?:run\s+)?build/.test(value)
      || /(?:^|[\s/])(?:vite|vue-cli-service)\s+build(?:\s|$)/.test(value)
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
