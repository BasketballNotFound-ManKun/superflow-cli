import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import path from "path";
import { createHash } from "crypto";
import type {
  ManagedRegistry,
  ManagedRegistryEntry,
  ManagedRunState,
  ManagedTaskContract,
} from "./types.js";
import { managedRegistryPath, managedRunDir, managedTaskDir } from "./paths.js";
import { managedList, managedText } from "./i18n.js";
import { writeManagedContextManifest } from "./context-manifest.js";
import {
  artifactLevelFor,
  writeManagedExecutionContract,
} from "./execution-contract.js";
import { generatedStandardPromptContent } from "./contract.js";
import { writeManagedWorkspaceBinding } from "./workspace-binding.js";
import { managedAcceptanceContractHash } from "./acceptance-contract.js";

export function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  renameSync(temp, file);
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf-8")) as T;
}

export function createManagedTaskFiles(
  contract: ManagedTaskContract,
  runState: ManagedRunState,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const runDir = managedRunDir(
    contract.projectRoot,
    contract.taskId,
    runState.runId,
  );
  try {
    mkdirSync(runDir, { recursive: true });
    writeTaskPromptSnapshot(contract);
    writeAcceptanceContractSnapshot(contract);
    writeFileSync(
      path.join(taskDir, "request.md"),
      buildRequestMarkdown(contract),
      "utf-8",
    );
    writeFileSync(
      path.join(taskDir, "task-brief.md"),
      buildTaskBrief(contract),
      "utf-8",
    );
    writeJsonAtomic(path.join(taskDir, "task.json"), contract);
    writeManagedWorkspaceBinding(contract);
    writeManagedExecutionContract(contract);
    writeManagedContextManifest(contract);
    writeJsonAtomic(path.join(runDir, "run-state.json"), runState);
    writeFileSync(path.join(runDir, "progress.jsonl"), "", "utf-8");
    writeFileSync(
      path.join(runDir, "progress.md"),
      managedText(
        contract.language,
        "# 托管任务进度\n\n状态：已创建\n",
        "# Managed Task Progress\n\nStatus: created\n",
      ),
      "utf-8",
    );
    writeFileSync(
      path.join(runDir, "task-report.md"),
      managedText(
        contract.language,
        "# 托管任务报告\n\n状态：执行中\n",
        "# Managed Task Report\n\nStatus: running\n",
      ),
      "utf-8",
    );
    upsertRegistryEntry(
      {
        taskId: contract.taskId,
        projectRoot: contract.projectRoot,
        status: contract.status,
        profile: contract.profile,
        language: contract.language,
        activeRunId: runState.runId,
        createdAt: contract.createdAt,
        updatedAt: contract.updatedAt,
        servicePid: null,
      },
      env,
    );
  } catch (error) {
    rmSync(taskDir, { recursive: true, force: true });
    throw error;
  }
}

export function loadManagedTask(
  projectRoot: string,
  taskId: string,
): ManagedTaskContract {
  return readJson(path.join(managedTaskDir(projectRoot, taskId), "task.json"));
}

export function saveManagedTask(contract: ManagedTaskContract): void {
  writeJsonAtomic(
    path.join(
      managedTaskDir(contract.projectRoot, contract.taskId),
      "task.json",
    ),
    { ...contract, updatedAt: new Date().toISOString() },
  );
}

export function loadManagedRun(
  projectRoot: string,
  taskId: string,
  runId: string,
): ManagedRunState {
  return readJson(
    path.join(managedRunDir(projectRoot, taskId, runId), "run-state.json"),
  );
}

export function saveManagedRun(state: ManagedRunState): void {
  writeJsonAtomic(
    path.join(
      managedRunDir(state.projectRoot, state.taskId, state.runId),
      "run-state.json",
    ),
    { ...state, updatedAt: new Date().toISOString() },
  );
}

export function loadRegistry(
  env: NodeJS.ProcessEnv = process.env,
): ManagedRegistry {
  const file = managedRegistryPath(env);
  if (!existsSync(file)) return { schemaVersion: 1, tasks: [] };
  return readJson<ManagedRegistry>(file);
}

export function saveRegistry(
  registry: ManagedRegistry,
  env: NodeJS.ProcessEnv = process.env,
): void {
  writeJsonAtomic(managedRegistryPath(env), registry);
}

export function upsertRegistryEntry(
  entry: ManagedRegistryEntry,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const registry = loadRegistry(env);
  const index = registry.tasks.findIndex(
    (item) => item.taskId === entry.taskId,
  );
  if (index >= 0) registry.tasks[index] = entry;
  else registry.tasks.push(entry);
  saveRegistry(registry, env);
}

export function appendTaskReport(
  state: ManagedRunState,
  section: string,
): void {
  const file = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    "task-report.md",
  );
  appendFileSync(file, `\n${section.trim()}\n`, "utf-8");
}

export function updateTaskReportStatus(
  state: ManagedRunState,
  status: string,
): void {
  const file = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    "task-report.md",
  );
  const content = readFileSync(file, "utf-8");
  writeFileSync(
    file,
    content.replace(
      /^(?:状态：|Status: ).*$/m,
      managedText(state.language, `状态：${status}`, `Status: ${status}`),
    ),
    "utf-8",
  );
}

export function resolveTaskReportBlockers(state: ManagedRunState): void {
  const file = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    "task-report.md",
  );
  const content = readFileSync(file, "utf-8");
  const resolved =
    state.language === "en"
      ? content.replaceAll(
          "## Current blocker",
          "## Historical blocker (resolved)",
        )
      : content.replaceAll("## 当前阻塞", "## 历史阻塞（已解除）");
  if (resolved !== content) writeFileSync(file, resolved, "utf-8");
}

function buildRequestMarkdown(contract: ManagedTaskContract): string {
  if (contract.language === "en") {
    return [
      "# Original User Task",
      "",
      `Task ID: ${contract.taskId}`,
      `Created at: ${contract.createdAt}`,
      `Source: ${contract.source}`,
      "",
      contract.request,
      "",
    ].join("\n");
  }
  return [
    "# 用户原始任务",
    "",
    `任务编号：${contract.taskId}`,
    `创建时间：${contract.createdAt}`,
    `来源：${contract.source}`,
    "",
    contract.request,
    "",
  ].join("\n");
}

function buildTaskBrief(contract: ManagedTaskContract): string {
  const criteria = contract.doneCriteria.map((item) => `- ${item}`).join("\n");
  if (contract.language === "en") {
    return [
      "# Managed Task Contract",
      "",
      `Task ID: ${contract.taskId}`,
      `Task profile: ${contract.profile}`,
      `Artifact level: ${artifactLevelFor(contract)}`,
      `Related repositories: ${managedList(contract.language, contract.relatedProjectRoots)}`,
      `Supervisor Agent: ${contract.supervisorAgent}`,
      `Executor Agent: ${contract.executorAgent}`,
      `Contract hash: ${contract.contractHash}`,
      ...(contract.taskPrompt
        ? [
            `${contract.taskPrompt.origin === "generated_standard" ? "Generated standard execution contract" : "Original task prompt"}: ${contract.taskPrompt.originalPath}`,
            `Frozen prompt snapshot: ${contract.taskPrompt.snapshotPath}`,
            `Prompt SHA-256: ${contract.taskPrompt.sha256}`,
          ]
        : []),
      ...(contract.acceptanceContract
        ? [
            `Frozen acceptance contract: ${path.join(managedTaskDir(contract.projectRoot, contract.taskId), "acceptance-contract.md")}`,
            `Acceptance contract SHA-256: ${managedAcceptanceContractHash(contract.acceptanceContract)}`,
          ]
        : []),
      "",
      "## Goal",
      "",
      contract.objective,
      "",
      "## Completion criteria",
      "",
      criteria,
      "",
      "## Permission boundaries",
      "",
      ...(contract.mandatoryEngineeringRules?.length
        ? [
            "## Mandatory engineering rules frozen by the host",
            "",
            ...contract.mandatoryEngineeringRules.map((rule) => `- ${rule}`),
            "",
          ]
        : []),
      "- Maximum autonomy within safety boundaries.",
      "- Never commit or push Git, publish, or write to production automatically.",
      "- Never bypass sandbox or permission checks.",
      "",
    ].join("\n");
  }
  return [
    "# 托管任务合同",
    "",
    `任务编号：${contract.taskId}`,
    `任务档位：${contract.profile}`,
    `文档等级：${artifactLevelFor(contract)}`,
    `关联仓库：${contract.relatedProjectRoots.join("、") || "无"}`,
    `监督 Agent：${contract.supervisorAgent}`,
    `执行 Agent：${contract.executorAgent}`,
    `合同哈希：${contract.contractHash}`,
    ...(contract.taskPrompt
      ? [
          `${contract.taskPrompt.origin === "generated_standard" ? "自动生成的标准执行合同" : "原始任务 Prompt"}：${contract.taskPrompt.originalPath}`,
          `冻结 Prompt 快照：${contract.taskPrompt.snapshotPath}`,
          `Prompt SHA-256：${contract.taskPrompt.sha256}`,
        ]
      : []),
    ...(contract.acceptanceContract
      ? [
          `冻结验收合同：${path.join(managedTaskDir(contract.projectRoot, contract.taskId), "acceptance-contract.md")}`,
          `验收合同 SHA-256：${managedAcceptanceContractHash(contract.acceptanceContract)}`,
        ]
      : []),
    "",
    "## 目标",
    "",
    contract.objective,
    "",
    "## 完成标准",
    "",
    criteria,
    "",
    "## 权限边界",
    "",
    ...(contract.mandatoryEngineeringRules?.length
      ? [
          "## Host 冻结的强制工程规则",
          "",
          ...contract.mandatoryEngineeringRules.map((rule) => `- ${rule}`),
          "",
        ]
      : []),
    "- 安全边界内最大自治。",
    "- 禁止自动 Git 提交、推送、发布和生产写入。",
    "- 禁止跳过沙箱或权限检查。",
    "",
  ].join("\n");
}

function writeTaskPromptSnapshot(contract: ManagedTaskContract): void {
  if (!contract.taskPrompt) return;
  const content =
    contract.taskPrompt.origin === "generated_standard"
      ? generatedStandardPromptContent(
          contract.request,
          contract.profile,
          contract.language,
        )
      : readFileSync(contract.taskPrompt.originalPath, "utf-8");
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== contract.taskPrompt.sha256) {
    throw new Error(
      managedText(
        contract.language,
        "任务 Prompt 在创建合同后发生变化，拒绝生成快照",
        "Task prompt changed after contract creation; refusing to create snapshot",
      ),
    );
  }
  writeFileSync(contract.taskPrompt.snapshotPath, content, "utf-8");
}

function writeAcceptanceContractSnapshot(contract: ManagedTaskContract): void {
  if (!contract.acceptanceContract) return;
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const acceptanceHash = managedAcceptanceContractHash(
    contract.acceptanceContract,
  );
  writeJsonAtomic(path.join(taskDir, "acceptance-contract.json"), {
    schemaVersion: 1,
    taskId: contract.taskId,
    contractHash: contract.contractHash,
    acceptanceContractHash: acceptanceHash,
    acceptanceContract: contract.acceptanceContract,
  });
  const sections: Array<[string, string[]]> =
    contract.language === "en"
      ? [
          [
            "Business invariants",
            contract.acceptanceContract.businessInvariants,
          ],
          [
            "Source coverage",
            contract.acceptanceContract.sourceCoverage.map(
              (item) => `${item.scope}: ${item.targets.join(", ")}`,
            ),
          ],
          ["Deliverables", contract.acceptanceContract.deliverables],
          ["Verification", contract.acceptanceContract.verification],
          ["Exclusions", contract.acceptanceContract.exclusions],
        ]
      : [
          ["业务不变量", contract.acceptanceContract.businessInvariants],
          [
            "源码覆盖",
            contract.acceptanceContract.sourceCoverage.map(
              (item) => `${item.scope}：${item.targets.join("、")}`,
            ),
          ],
          ["交付物", contract.acceptanceContract.deliverables],
          ["验证", contract.acceptanceContract.verification],
          ["排除范围", contract.acceptanceContract.exclusions],
        ];
  writeFileSync(
    path.join(taskDir, "acceptance-contract.md"),
    [
      contract.language === "en"
        ? "# Frozen Acceptance Contract"
        : "# 冻结验收合同",
      "",
      `${contract.language === "en" ? "Task contract SHA-256" : "任务合同 SHA-256"}: ${contract.contractHash}`,
      `${contract.language === "en" ? "Acceptance SHA-256" : "验收合同 SHA-256"}: ${acceptanceHash}`,
      "",
      ...sections.flatMap(([title, values]) => [
        `## ${title}`,
        "",
        ...(values.length > 0
          ? values.map((value) => `- ${value}`)
          : [contract.language === "en" ? "- None" : "- 无"]),
        "",
      ]),
    ].join("\n"),
    "utf-8",
  );
}
