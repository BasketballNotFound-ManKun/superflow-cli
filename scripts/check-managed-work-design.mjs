#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

const requirements = new Map([
  [
    "AGENTS.md",
    ["docs/managed-work-design-principles.md", "修改托管功能的强制回归清单"],
  ],
  [
    "docs/managed-work-design-principles.md",
    [
      "脚本与 Agent 裁决矩阵",
      "superflow.handoff.v2",
      "superflow.executor.v2",
      "superflow.review.v2",
      "修改托管功能的强制回归清单",
      "不得启动完整 Executor 修 JSON",
      "不得无条件重置为源码检索",
      "合同哈希的不可变字段投影必须只有一个事实源",
      "单命令、可重复、失败安全、可移植",
      "强制规则不得只依赖 Prompt 上下文",
      "Hook、preflight 或最终门禁",
      "预期失败和失败注入必须由父级验收命令",
      "禁止为删除或改写 JSON 启动完整 Executor",
      "控制面原子性与注册表容错",
      "启动失败、响应丢失和安全重试",
      "单个陈旧 registry locator",
      "CLI `pipeline --managed` 与 MCP 使用同一原子语义",
      "MCP 进程必须暴露启动时运行时指纹",
      "详细构建和运行日志写入任务证据文件",
      "Host usage",
      "executor.stage_rework",
      "owner 确定事实模板",
      "正常 cleanup 删除 nonce/运行目录后仍须可读",
      "系统休眠不消耗执行预算",
      "正常 cleanup 删除 nonce/运行目录后仍须可读",
      "默认覆盖",
      "三级验证模型",
      "受影响验证",
      "任务级真实验收",
      "框架认证",
      "不得为每个业务任务重复",
      "历史有效证据",
      "正在运行的任务只允许安全接入",
      "progress notification",
      "连续两个无有效里程碑",
      "验证类别歧义",
      "所有网络或模型连接失败共享同一个连续计数",
      "只有一次完整 Agent 返回才重置连续计数",
      "状态码必须按独立 token 边界匹配",
      "空白 `blockers`",
      "不消耗 Agent 调用",
      "一键源码安装必须同时完成",
      "Codex/Claude",
      "Hook 自动升级必须复用同一完整部署闭环",
      "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
      "240 秒兼容传输窗口",
      "统一执行上下文清单",
      "紧凑事实包",
      "三级执行合同",
      "收敛门禁",
      "worktree",
      "superflow doctor",
      "taskkill /T /F",
      "托管层保持轻量",
      "Executor Prompt 只继承，不重新设计",
      "完整 Superflow 任务必须是低自由度交付",
      "Host 的持续目标机制可以包住一次 Superflow Task/Run",
      "入口与资产保护同样遵守以下长期原则",
      "protected-contracts",
    ],
  ],
  [
    "docs/managed-work-design-principles.en.md",
    [
      "Script-versus-Agent decision matrix",
      "superflow.handoff.v2",
      "superflow.executor.v2",
      "superflow.review.v2",
      "Mandatory change review",
      "never launch a full Executor invocation merely to repair JSON",
      "instead of resetting every fresh session to source discovery",
      "Immutable contract-hash projection has one source of truth",
      "one-command, repeatable",
      "Mandatory rules never rely on prompt context alone",
      "hook, preflight, or final gate",
      "Expected-failure and fault-injection checks use a parent acceptance command",
      "launching a full Executor to delete or rewrite JSON",
      "Control-plane atomicity and registry fault isolation",
      "Start failure, lost-response retry, and stale-registry isolation",
      "CLI `pipeline --managed` has the same atomic contract",
      "MCP process exposes its startup runtime fingerprint",
      "Verbose build/runtime logs go to task evidence files",
      "Host review records real `hostUsage`",
      "executor.stage_rework",
      "deterministic owner template",
      "remain readable after normal cleanup",
      "system sleep consumes no execution budget",
      "remain readable after normal cleanup",
      "overwrites Superflow Skills",
      "Three verification levels",
      "Change-scoped checks",
      "Task-level real acceptance",
      "Framework certification",
      "must not rerun",
      "historical evidence",
      "running task may only be safely attached",
      "MCP progress notification",
      "two consecutive checkpoints without an effective milestone",
      "verification-category ambiguity",
      "All network and model-connectivity failures share one consecutive counter",
      "Only a complete Agent response",
      "status codes require",
      "blank `blockers`",
      "without an Agent call",
      "One-command source installation includes",
      "Codex/Claude",
      "Hook auto-apply share one complete deployment closure",
      "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
      "240-second transport window",
      "execution context manifest",
      "compact fact packet",
      "execution contracts",
      "convergence gate",
      "worktree",
      "superflow doctor",
      "taskkill /T /F",
      "Managed orchestration stays lightweight",
      "Executor prompts inherit rather than redesign",
      "complete Superflow task is a low-freedom delivery contract",
      "Host-native persistent goal may wrap one Superflow Task/Run",
      "Entry and asset protection follow these additional long-term principles",
      "protected-contracts",
    ],
  ],
  [
    "src/domains/managed-work/context-manifest.ts",
    [
      "manifestHash",
      "validateManagedContextManifest",
      "sha256",
      "referencedLocalFiles",
      "ManagedContextProtection",
      'protection: "retain"',
    ],
  ],
  [
    "src/domains/managed-work/review-facts.ts",
    ["writeManagedReviewFacts", "changedFiles", "exitCode", "sha256"],
  ],
  [
    "src/domains/managed-work/evidence-path.ts",
    ["canonicalEvidencePath", "trailing description"],
  ],
  [
    "src/domains/managed-work/execution-contract.ts",
    ["minimal", "standard", "full", "defaultTasks", "canonicalTasksPath"],
  ],
  [
    "src/domains/managed-work/review-convergence.ts",
    ["MAX_STAGNANT_TRANSITIONS", "resolvedAny", "shouldContinue"],
  ],
  [
    "src/domains/managed-work/workspace-binding.ts",
    ["repositoryIdentity", "worktreeIdentity", "taskLocator", "branch"],
  ],
  [
    "src/platform/process-tree.ts",
    ["windows_tree", "taskkill.exe", "process_group"],
  ],
  [
    "assets/skills/superflow-pipeline/references/managed-work.md",
    [
      "设计宪章门禁",
      "docs/managed-work-design-principles.md",
      "验证固定分三级",
      "不得为每个业务任务重复",
      "共享连续失败计数",
      "结构化数组中的空白项",
      "安全接入",
      "progress notification",
      "连续两个无有效里程碑",
      "验证类别歧义",
      "Coding Ready",
      "protected-contracts",
    ],
  ],
  [
    "assets/skills-en/superflow-pipeline/references/managed-work.md",
    [
      "Design-constitution gate",
      "docs/managed-work-design-principles.en.md",
      "Verification has three levels",
      "must not rerun",
      "consecutive-failure counter",
      "blank structured-array entries",
      "safe attach",
      "progress notifications",
      "two consecutive checkpoints without an effective milestone",
      "verification-category ambiguity",
      "docs-only work stops",
      "protected-contracts",
    ],
  ],
  [
    "assets/scripts/superflow-managed-owner-verification.sh",
    ["通过可配置路径 source", "禁止复制后分叉维护"],
  ],
  [
    "src/domains/managed-work/prompts.ts",
    [
      "docs/managed-work-design-principles.md",
      "docs/managed-work-design-principles.en.md",
      "进程启动指纹",
      "验证分三级",
      "不得为每个业务任务重复",
      "process-start fingerprint",
      "Verification has three levels",
      "must not rerun for every business task",
      "workspace-temporary",
      "Never use pkill",
    ],
  ],
  [
    "docs/managed-agent-protocol.md",
    [
      "强制规则不能只存在于 Prompt",
      "hook/preflight/final gate",
      "在持久化前完成运行时握手",
      "单个陈旧条目不得让全局任务列表失败",
      "运行时指纹",
      "hostUsageUnavailableReason",
      "不能复用旧裸 PID",
      "休眠不计入",
      "不能复用旧裸 PID",
      "验证固定分三级",
      "不得为每个业务任务重复",
      "共享同一个连续失败计数",
      "确定性清洗空白字符串元数据",
      "安全接入",
      "MCP progress notification",
      "连续两个监督点没有有效里程碑",
      "验证类别歧义",
      "纯文档入口",
      "immutable",
      "delivery-artifacts",
    ],
  ],
  [
    "docs/managed-agent-protocol.en.md",
    [
      "mandatory rule never exists only in prompt context",
      "Host semantic review",
      "completes its runtime handshake before persistence",
      "one stale entry never fails the global task list",
      "runtime fingerprint",
      "hostUsageUnavailableReason",
      "never reused blindly",
      "exclude system sleep",
      "never reused blindly",
      "Verification has three levels",
      "must not rerun per business task",
      "consecutive-failure counter",
      "removes blank string metadata",
      "safe attach",
      "MCP progress notifications",
      "Two consecutive",
      "Verification-category ambiguity",
      "docs-only entry",
      "immutable",
      "delivery artifacts",
    ],
  ],
  [
    "assets/scripts/superflow-managed-command-guard.py",
    [
      "SUPERFLOW_MANAGED_CONTEXT_MANIFEST",
      "superflow_signal_owner",
      "superflow_runtime_remove_verified",
      "pkill",
    ],
  ],
]);

const failures = [];

for (const [relativePath, expectedTexts] of requirements) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: 文件不存在`);
    continue;
  }
  const content = fs.readFileSync(absolutePath, "utf8");
  for (const expectedText of expectedTexts) {
    if (!content.includes(expectedText)) {
      failures.push(`${relativePath}: 缺少 ${expectedText}`);
    }
  }
}

const control = fs.readFileSync(
  path.join(root, "src/domains/managed-work/control.ts"),
  "utf8",
);
const startFunction = control.slice(
  control.indexOf("export function startManagedTaskFromHost"),
  control.indexOf("export function listManagedTaskSnapshots"),
);
if (
  startFunction.indexOf("startService(runtime, language)") < 0 ||
  startFunction.indexOf("startService(runtime, language)") >
    startFunction.indexOf("createManagedTaskFiles(contract, state, env)")
) {
  failures.push(
    "src/domains/managed-work/control.ts: 托管启动必须先完成 service handshake 再持久化任务",
  );
}
if (!control.includes("findRetryReusableTask(")) {
  failures.push("src/domains/managed-work/control.ts: 缺少非终态启动幂等复用");
}
const listFunction = control.slice(
  control.indexOf("export function listManagedTaskSnapshots"),
  control.indexOf("export function getManagedTaskSnapshot"),
);
if (!listFunction.includes("try {") || !listFunction.includes("catch {")) {
  failures.push(
    "src/domains/managed-work/control.ts: task list 未隔离陈旧 registry locator",
  );
}

const pipeline = fs.readFileSync(
  path.join(root, "src/app/commands/pipeline.ts"),
  "utf8",
);
const cliService = pipeline.indexOf(
  "ensureManagedService(process.argv[1], process.env, language)",
);
const cliPersist = pipeline.indexOf("createManagedTaskFiles(contract, state)");
if (cliService < 0 || cliPersist < 0 || cliService > cliPersist) {
  failures.push("src/app/commands/pipeline.ts: CLI 托管启动必须先握手再持久化");
}
if (
  !pipeline.includes("shouldAttachRunningTask") ||
  !pipeline.includes("hasRunningResumeMutations")
) {
  failures.push(
    "src/app/commands/pipeline.ts: 健康运行任务缺少只读安全接入和改写参数拒绝门禁",
  );
}

const mcpServer = fs.readFileSync(path.join(root, "src/mcp/server.ts"), "utf8");
if (
  !mcpServer.includes("superflow_managed_runtime") ||
  !mcpServer.includes("assertMcpRuntimeCurrent(runtimeIdentity)")
) {
  failures.push(
    "src/mcp/server.ts: 缺少 MCP 运行时指纹查询或 start 前陈旧运行时门禁",
  );
}
if (!mcpServer.includes("hostUsageUnavailableReason")) {
  failures.push("src/mcp/server.ts: Host usage 不可用时缺少审计原因");
}
if (!mcpServer.includes('method: "notifications/progress"')) {
  failures.push(
    "src/mcp/server.ts: 健康进度缺少标准 MCP progress notification",
  );
}
if (
  !mcpServer.includes("DEFAULT_MCP_WAIT_TIMEOUT_SECONDS = 240") ||
  !mcpServer.includes(".default(DEFAULT_MCP_WAIT_TIMEOUT_SECONDS)")
) {
  failures.push("src/mcp/server.ts: MCP 默认等待未使用 240 秒兼容窗口");
}

const runner = fs.readFileSync(
  path.join(root, "src/domains/managed-work/runner.ts"),
  "utf8",
);
const executorPolicy = fs.readFileSync(
  path.join(root, "src/domains/managed-work/executor-policy.ts"),
  "utf8",
);
if (
  !executorPolicy.includes("# Compact Instructions") ||
  !executorPolicy.includes("frozen prompt path and hash") ||
  !executorPolicy.includes("stableExecutorPolicyHash")
) {
  failures.push(
    "src/domains/managed-work/executor-policy.ts: 稳定策略前缀或长会话交接指令缺失",
  );
}
const agentProcess = fs.readFileSync(
  path.join(root, "src/platform/agent-process.ts"),
  "utf8",
);
if (
  !agentProcess.includes("CLAUDE_CODE_AUTO_COMPACT_WINDOW") ||
  !agentProcess.includes("CLAUDE_AUTOCOMPACT_PCT_OVERRIDE")
) {
  failures.push(
    "src/platform/agent-process.ts: Claude Executor 缺少提前自动压缩",
  );
}
if (!runner.includes("\\b(?:429|503|529)\\b")) {
  failures.push(
    "src/domains/managed-work/runner.ts: 供应商状态码必须按 token 边界匹配，禁止命中 UUID 或路径",
  );
}
if (
  !runner.includes("executor.stage_rework") ||
  !runner.includes("MANAGED_LOG_PART_BYTES") ||
  !runner.includes("superflow-managed-owner-verification.sh") ||
  !executorPolicy.includes("Use three verification levels") ||
  !executorPolicy.includes("must not be rebuilt for every business task") ||
  !executorPolicy.includes("certified owner-verification helper")
) {
  failures.push(
    "src/domains/managed-work/runner.ts: 缺少返工事件、日志分片、三级验证或 owner 模板复用约束",
  );
}
if (
  !runner.includes("executor.supervision_checkpoint_idle") ||
  !runner.includes("executor.supervision_attention_required") ||
  !runner.includes("executor.verification_metadata_escalated_to_host") ||
  !runner.includes("executor.verification_metadata_host_promoted")
) {
  failures.push(
    "src/domains/managed-work/runner.ts: 缺少双空闲监督点 attention 或验证类别歧义的 Host 晋升审计",
  );
}
if (
  !runner.includes("runExecutorFinalPreflight") ||
  !runner.includes("ExecutorFinalPreflightError")
) {
  failures.push(
    "src/domains/managed-work/runner.ts: ready_for_review 前缺少 Runner 最终 preflight 门禁",
  );
}

const installer = fs.readFileSync(path.join(root, "install.sh"), "utf8");
const windowsInstaller = fs.readFileSync(
  path.join(root, "install.ps1"),
  "utf8",
);
const mcpCommand = fs.readFileSync(
  path.join(root, "src/app/commands/mcp.ts"),
  "utf8",
);
const updateCommand = fs.readFileSync(
  path.join(root, "src/app/commands/update.ts"),
  "utf8",
);
const dependencyUpdateHook = fs.readFileSync(
  path.join(root, "assets/scripts/superflow-dependency-update-hook.sh"),
  "utf8",
);
if (
  !installer.includes("--overwrite") ||
  !windowsInstaller.includes("--overwrite")
) {
  failures.push(
    "安装器必须在 Unix/Windows 重复部署时覆盖 Skills，避免持续生成 backup",
  );
}
if (
  !installer.includes("mcp install $AGENT_FLAG") ||
  !installer.includes("command -v codex") ||
  !windowsInstaller.includes('@("mcp", "install", "--agent", $agentValue)') ||
  !windowsInstaller.includes("Get-Command codex")
) {
  failures.push(
    "Unix/Windows 一键安装器必须检测实际 Host 并自动注册对应托管 MCP",
  );
}
if (
  !updateCommand.includes("refreshWithInstalledCli") ||
  !updateCommand.includes("manageMcpIntegration") ||
  !dependencyUpdateHook.includes("refresh_superflow_installation") ||
  !dependencyUpdateHook.includes('rm -f "$STAMP" "$GLOBAL_STAMP"')
) {
  failures.push(
    "显式更新与 Hook 自动升级必须由新 CLI 完整刷新 Agent 资产和托管 MCP，并保留失败重试资格",
  );
}
if (
  !mcpCommand.includes("resolveMcpNodePath") ||
  !mcpCommand.includes("/Cellar\\/node")
) {
  failures.push(
    "src/app/commands/mcp.ts: Homebrew MCP 注册必须使用稳定 Node 入口",
  );
}

if (failures.length > 0) {
  console.error("托管设计宪章门禁失败：");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("托管设计宪章门禁通过");
