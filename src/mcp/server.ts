#!/usr/bin/env node
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  addManagedHumanGuidance,
  authorizeManagedExecutor,
  getManagedTaskSnapshot,
  listManagedTaskSnapshots,
  pauseManagedTask,
  resumeManagedTaskFromHost,
  recordManagedValidation,
  startManagedTaskFromHost,
  confirmManagedExecutor,
  submitManagedHostReview,
  waitForManagedTaskChange,
  type ManagedControlRuntime,
} from "../domains/managed-work/control.js";
import type { ReviewResult } from "../domains/managed-work/types.js";
import {
  assertMcpRuntimeCurrent,
  createMcpRuntimeIdentity,
  type McpRuntimeIdentity,
} from "./runtime-identity.js";

export const DEFAULT_MCP_WAIT_TIMEOUT_SECONDS = 240;

const moduleFile = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(moduleFile), "..", "..");
const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, "package.json"), "utf-8"),
) as { version: string };

const reviewFindingSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
  blocking: z.boolean(),
  category: z.string().min(1),
  target: z.string().min(1),
  evidence: z.string().min(1),
  risk: z.string().min(1),
  requiredFix: z.string().min(1),
  acceptanceChecks: z.array(z.string().min(1)),
  acceptanceContractRefs: z.array(z.string().min(1)).optional(),
});

const reviewResultSchema = z.object({
  result: z.enum(["pass", "needs_fix", "blocked"]),
  summary: z.string().min(1),
  findings: z.array(reviewFindingSchema),
  verificationCommands: z
    .array(
      z.object({
        command: z.string().min(1),
        exitCode: z.number().int(),
        result: z.string().min(1),
      }),
    )
    .optional()
    .default([]),
  acceptanceCoverage: z
    .object({ reviewed: z.array(z.string().min(1)) })
    .optional(),
});

const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  cacheReadTokens: z.number().int().nonnegative().nullable(),
  cacheWriteTokens: z.number().int().nonnegative().nullable(),
  costUsd: z.number().nonnegative().nullable(),
});

const acceptanceContractSchema = z.object({
  businessInvariants: z.array(z.string().min(1)).min(1),
  sourceCoverage: z
    .array(
      z.object({
        scope: z.string().min(1),
        targets: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
  deliverables: z.array(z.string().min(1)).min(1),
  verification: z.array(z.string().min(1)).min(1),
  exclusions: z.array(z.string().min(1)).default([]),
});

export function createSuperflowMcpServer(
  runtime: ManagedControlRuntime = defaultRuntime(),
  runtimeDependencies: {
    createIdentity?: () => McpRuntimeIdentity;
    assertCurrent?: (identity: McpRuntimeIdentity) => void;
  } = {},
): McpServer {
  const runtimeIdentity =
    runtimeDependencies.createIdentity?.() ??
    createMcpRuntimeIdentity(packageRoot, packageJson.version);
  const assertCurrent = () => {
    if (runtimeDependencies.assertCurrent) {
      return runtimeDependencies.assertCurrent(runtimeIdentity);
    }
    return assertMcpRuntimeCurrent(runtimeIdentity);
  };
  const server = new McpServer({
    name: "superflow-managed",
    version: packageJson.version,
  });

  server.registerTool(
    "superflow_managed_start",
    {
      title: "启动 Superflow 托管任务 / Start managed delivery",
      description:
        "由当前 MCP Host 作为唯一主 Agent 创建托管任务，后台只启动对端研发 Agent。固定使用 external_host，禁止嵌套 Supervisor CLI，以避免重复上下文、Token 和评审时间。The current MCP host remains the only supervisor while Superflow starts only the peer executor; nested supervisor CLIs are forbidden.",
      inputSchema: {
        request: z
          .string()
          .min(1)
          .describe(
            "任务描述、implementation prompt 路径或 OpenSpec change 目录",
          ),
        projectRoot: z.string().min(1).describe("主项目绝对路径"),
        relatedProjectRoots: z
          .array(z.string().min(1))
          .optional()
          .describe("允许研发 Agent 读写的关联仓库绝对路径"),
        profile: z
          .enum(["auto", "quick", "engineering", "sdd", "monitor"])
          .optional()
          .default("auto"),
        supervisorAgent: z
          .enum(["codex", "claude"])
          .describe("当前主 Agent 类型，必须由 Host 明确传入"),
        executorAgent: z
          .enum(["codex", "claude"])
          .optional()
          .describe("研发 Agent 类型；默认使用主 Agent 的对端"),
        executorModel: z.string().min(1).optional().describe("执行 Agent 模型；未提供时启动前展示本机配置并等待确认"),
        executorReasoningEffort: z
          .enum(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"])
          .optional()
          .describe("执行 Agent 推理深度；未提供时启动前展示本机配置并等待确认"),
        language: z.enum(["zh", "en"]).optional().default("zh"),
        mandatoryEngineeringRules: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Host 会话中存在但未落盘到项目规则文件的强制工程规则；启动时冻结进任务合同",
          ),
        acceptanceContract: acceptanceContractSchema
          .optional()
          .describe(
            "task_file/SDD 必填：Host 冻结的业务不变量、精确源码覆盖、交付、验证与排除范围",
          ),
        externalModelDataDisclosureApproved: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "用户是否明确授权对端研发 Agent 在所列本地仓库内读取、修改和验证源码；这不会绕过宿主租户 DLP",
          ),
        externalModelDataDisclosureApprovedBy: z
          .string()
          .min(1)
          .optional()
          .default("user"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      runTool(() => {
        assertCurrent();
        return startManagedTaskFromHost(
          {
            request: input.request,
            projectRoot: input.projectRoot,
            relatedProjectRoots: input.relatedProjectRoots,
            profile: input.profile,
            supervisorAgent: input.supervisorAgent,
            executorAgent: input.executorAgent,
            executorModel: input.executorModel,
            executorReasoningEffort: input.executorReasoningEffort,
            language: input.language,
            mandatoryEngineeringRules: input.mandatoryEngineeringRules,
            acceptanceContract: input.acceptanceContract,
            externalModelDataDisclosureApproved:
              input.externalModelDataDisclosureApproved,
            externalModelDataDisclosureApprovedBy:
              input.externalModelDataDisclosureApprovedBy,
          },
          runtime,
        );
      }),
  );

  server.registerTool(
    "superflow_managed_confirm_executor",
    {
      title: "确认执行 Agent 配置 / Confirm executor configuration",
      description:
        "确认启动前展示的执行 Agent 模型和推理深度；确认前不会启动 Executor。Confirm the executor model and reasoning effort shown before launch; the executor will not start until confirmed.",
      inputSchema: {
        taskId: z.string().min(1),
        approvedBy: z.string().min(1).optional().default("user"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ taskId, approvedBy }) =>
      runTool(() => confirmManagedExecutor(taskId, approvedBy, runtime)),
  );

  server.registerTool(
    "superflow_managed_runtime",
    {
      title: "读取 Superflow MCP 运行时 / Read MCP runtime",
      description:
        "返回当前 MCP 进程的版本、启动时间和运行时指纹，并判断本地安装是否已变化。Returns the MCP process version, start time, runtime fingerprint, and whether the installed runtime changed after startup.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      runTool(() => {
        assertCurrent();
        return runtimeIdentity;
      }),
  );

  server.registerTool(
    "superflow_managed_authorize_executor",
    {
      title: "授权研发 Agent 源码处理 / Authorize executor source access",
      description:
        "记录用户对冻结仓库范围的任务级知情授权并恢复任务；仅解决 Superflow 授权，不绕过宿主租户 DLP。Records task-scoped consent for the frozen repositories and resumes the task without bypassing host tenant DLP.",
      inputSchema: {
        taskId: z.string().min(1),
        approvedBy: z.string().min(1).default("user"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ taskId, approvedBy }) =>
      runTool(() => authorizeManagedExecutor(taskId, approvedBy, runtime)),
  );

  server.registerTool(
    "superflow_managed_list",
    {
      title: "列出 Superflow 托管任务 / List managed tasks",
      description:
        "列出本机托管任务及需要当前主 Agent 处理的状态。Lists local managed tasks and whether the current host must act.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => runTool(() => listManagedTaskSnapshots(runtime.env)),
  );

  server.registerTool(
    "superflow_managed_status",
    {
      title: "读取托管任务状态 / Read managed task status",
      description:
        "返回任务状态、调用计数、最近事件、执行结果和待主 Agent 评审 Prompt。Returns status, invocation counts, recent events, executor result, and pending host review prompt.",
      inputSchema: {
        taskId: z.string().min(1),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ taskId }) =>
      runTool(() => getManagedTaskSnapshot(taskId, runtime.env)),
  );

  server.registerTool(
    "superflow_managed_wait",
    {
      title: "等待托管状态变化 / Wait for managed task change",
      description:
        "在本地阻塞到需要主 Agent 处理的状态；默认使用 240 秒 Host 兼容传输窗口，窗口超时后按 latestSequence 紧凑续接。健康阶段和监督点通过 MCP progress notification 展示但不唤醒模型；连续两个监督点没有有效里程碑才返回 Host。Blocks locally until host attention with a 240-second Host-compatible transport window by default; continue compactly from latestSequence after window expiry. Healthy stages and checkpoints use MCP progress notifications without waking the model; the Host returns only after two checkpoints without an effective milestone.",
      inputSchema: {
        taskId: z.string().min(1),
        afterSequence: z.number().int().min(0).default(0),
        timeoutSeconds: z
          .number()
          .int()
          .min(1)
          .max(43_200)
          .default(DEFAULT_MCP_WAIT_TIMEOUT_SECONDS),
        wakeOnProgress: z.boolean().optional().default(false),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ taskId, afterSequence, timeoutSeconds, wakeOnProgress }, extra) =>
      runTool(() => {
        const progressToken = extra._meta?.progressToken;
        return waitForManagedTaskChange(
          taskId,
          afterSequence,
          timeoutSeconds,
          runtime,
          wakeOnProgress,
          progressToken === undefined
            ? undefined
            : async (progress) => {
                try {
                  await extra.sendNotification({
                    method: "notifications/progress",
                    params: {
                      progressToken,
                      progress: progress.sequence,
                      message: progress.message,
                    },
                  });
                } catch {
                  // MCP progress is advisory. Durable state remains authoritative,
                  // so a client that ignores or drops progress must not fail wait.
                }
              },
        );
      }),
  );

  server.registerTool(
    "superflow_managed_message",
    {
      title: "补充托管要求 / Add managed task guidance",
      description:
        "记录用户补充、环境授权或澄清；安全等待状态下自动恢复，运行中则进入下一轮短会话交接。Records user guidance; resumes safe waiting states or injects it into the next short executor handoff.",
      inputSchema: {
        taskId: z.string().min(1),
        content: z.string().min(1),
        actor: z.string().min(1).optional().default("user"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ taskId, content, actor }) =>
      runTool(() => addManagedHumanGuidance(taskId, content, runtime, actor)),
  );

  server.registerTool(
    "superflow_managed_pause",
    {
      title: "暂停托管任务 / Pause managed task",
      description:
        "请求任务在安全边界暂停；不会由主 Agent 代为终止或清理研发 Agent 的应用、构建和测试进程。Requests a pause at a safe boundary without making the host manage executor-owned processes.",
      inputSchema: {
        taskId: z.string().min(1),
        reason: z.string().min(1),
        actor: z.string().min(1).optional().default("user"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ taskId, reason, actor }) =>
      runTool(() => pauseManagedTask(taskId, reason, runtime, actor)),
  );

  server.registerTool(
    "superflow_managed_resume",
    {
      title: "恢复托管任务 / Resume managed task",
      description:
        "从落盘合同、当前工作区和短会话交接恢复已暂停任务。Resumes a paused task from persisted contracts, workspace state, and fresh short-session handoff.",
      inputSchema: {
        taskId: z.string().min(1),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ taskId }) =>
      runTool(() => resumeManagedTaskFromHost(taskId, runtime)),
  );

  server.registerTool(
    "superflow_managed_record_validation",
    {
      title: "记录环境/发布验收 / Record delivery validation",
      description:
        "在外部 owner 更新结构化 OpenSpec 任务后，记录环境或发布证据并重新计算三段交付状态；不会执行 SQL、部署或 Git。Records external validation evidence and recomputes delivery state without performing SQL, deployment, or Git actions.",
      inputSchema: {
        taskId: z.string().min(1),
        category: z.enum(["environment", "release"]),
        summary: z.string().min(1),
        evidencePaths: z.array(z.string().min(1)).default([]),
        actor: z.string().min(1).optional().default("user"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ taskId, category, summary, evidencePaths, actor }) =>
      runTool(() =>
        recordManagedValidation(
          taskId,
          category,
          summary,
          evidencePaths,
          runtime,
          actor,
        ),
      ),
  );

  server.registerTool(
    "superflow_managed_submit_review",
    {
      title: "提交主 Agent 评审 / Submit host review",
      description:
        "仅在 waiting_for_host_review 时由当前主 Agent提交一次全量结构化评审；后台据此交给研发 Agent 整改或进入 Git 批准。The current host submits one complete structured review, after which the executor repairs or delivery awaits Git approval.",
      inputSchema: {
        taskId: z.string().min(1),
        review: reviewResultSchema,
        hostUsage: usageSchema.optional(),
        hostUsageUnavailableReason: z
          .string()
          .min(1)
          .optional()
          .default("host_api_did_not_expose_usage"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ taskId, review, hostUsage, hostUsageUnavailableReason }) =>
      runTool(() =>
        submitManagedHostReview(
          taskId,
          review as ReviewResult,
          runtime,
          hostUsage,
          hostUsage ? undefined : hostUsageUnavailableReason,
        ),
      ),
  );

  server.registerPrompt(
    "superflow_managed_supervisor",
    {
      title: "Superflow 托管主 Agent",
      description:
        "让当前 Agent 直接监督 Superflow 托管任务，禁止嵌套 Supervisor CLI。",
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "你是 Superflow 托管任务的当前主 Agent。",
              "启动前先调用 superflow_managed_runtime；若提示运行时已过期，停止创建任务并要求用户重启 Host，禁止使用旧 MCP 继续验证新版本。",
              "使用 superflow_managed_start 创建 external_host 任务；不要启动嵌套 Codex/Claude Supervisor CLI。",
              "用户要求按某份任务 Prompt 文档或 OpenSpec change 执行时，request 必须传用户指定的绝对路径，禁止重新概括后替代原文；启动结果必须确认 source-prompt.md 与 SHA-256 已冻结。",
              "启动前必须向用户确认对端研发 Agent 的本地仓库范围，并把任务级源码披露授权传给 externalModelDataDisclosureApproved；该授权不能绕过宿主租户 DLP，宿主拒绝时必须停止并报告。",
              "每次 start、resume、message 或 submit_review 后，只要任务仍在 queued/running/recovering，就必须立即调用 superflow_managed_wait，并使用最新 latestSequence 继续等待。",
              "Runner 在本地高频采样，不调用模型；活动 MCP wait 通过标准 progress notification 展示阶段和健康监督点，不唤醒 Host 模型。只检查阶段、权威命令、真实 diff、重复失败和距上次有效里程碑时间，不读取完整日志、不重写任务 Prompt。",
              "普通 heartbeat、workspace.changed 和单个健康监督点不返回 Host。连续两个监督点没有阶段推进或权威命令完成时才返回 attentionRequired，由 Host 判断是否偏航并记录指导或请求安全暂停；不得把日志数量当有效进展。",
              "wait 因传输超时返回但任务仍无需人工处理时，立即使用最新 latestSequence 再次调用 wait。",
              "wait 返回 attentionRequired=true 时，根据 attentionReason 和 recommendedAction 立即处理；budget_exhausted、provider_change、human_required 或失败必须在当前会话及时通知用户。",
              "进入 waiting_for_host_review 后，读取冻结 Prompt、工作区和真实证据，完成一次全量评审，再调用 superflow_managed_submit_review。",
              "提交评审时若宿主可提供本轮 usage，填写 hostUsage；否则保留明确的 hostUsageUnavailableReason，禁止把 null 误报为零消耗。",
              "用户补充要求时调用 superflow_managed_message。",
              "用户要求暂停或继续时调用 superflow_managed_pause/resume。",
              "达到 local_delivery_ready、environment_validation_blocked 或 release_ready 后停止，不自动 commit、push、部署或生产写入，并分别报告源码、环境、发布三套进度。",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  return server;
}

function defaultRuntime(): ManagedControlRuntime {
  return {
    cliPath: path.join(packageRoot, "dist", "app", "cli.js"),
  };
}

async function runTool<T>(operation: () => T | Promise<T>) {
  try {
    const result = await operation();
    const structured = toStructured(result);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(structured, null, 2),
        },
      ],
      structuredContent: structured,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text" as const, text: message }],
    };
  }
}

function toStructured(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return { tasks: value };
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return { value };
}

async function main(): Promise<void> {
  const server = createSuperflowMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Superflow managed MCP server running on stdio");
}

if (process.argv[1] && path.resolve(process.argv[1]) === moduleFile) {
  main().catch((error) => {
    console.error("Superflow managed MCP server failed:", error);
    process.exitCode = 1;
  });
}
