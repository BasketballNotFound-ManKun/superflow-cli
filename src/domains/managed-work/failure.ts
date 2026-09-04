import type {
  ManagedFailure,
  ManagedFailureReason,
  ManagedTaskContract,
} from "./types.js";

export class ManagedWorkspaceClaimError extends Error {
  constructor(
    readonly reason:
      | "workspace_busy_timeout"
      | "workspace_ownership_unverified",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Marks failures before an Executor process is dispatched.  Runner uses this
 * typed boundary instead of inferring local-environment failures from arbitrary
 * Agent stdout/stderr.
 */
export class ManagedEnvironmentPreparationError extends Error {
  constructor(
    message: string,
    readonly stage = "unknown",
  ) {
    super(message);
  }
}

export function classifyManagedFailure(
  contract: ManagedTaskContract,
  error: unknown,
): ManagedFailure | null {
  const summary = error instanceof Error ? error.message : String(error);
  const reason = failureReason(summary, error);
  if (!reason) return null;
  return {
    reason,
    summary,
    remediation: remediation(contract, reason),
    recordedAt: new Date().toISOString(),
  };
}

function failureReason(
  _summary: string,
  error: unknown,
): ManagedFailureReason | null {
  if (error instanceof ManagedWorkspaceClaimError) return error.reason;
  if (error instanceof ManagedEnvironmentPreparationError) {
    return "environment_prepare_failed";
  }
  if (/Executor (?:final )?delivery|执行结果.*(?:校验|协议)|preflight failed/i.test(_summary)) {
    return "executor_delivery_invalid";
  }
  return null;
}

function remediation(
  contract: ManagedTaskContract,
  reason: ManagedFailureReason,
): string {
  const zh = contract.language !== "en";
  const messages: Record<ManagedFailureReason, [string, string]> = {
    environment_prepare_failed: [
      "检查工作区目录、磁盘空间、权限和本地 CLI/MCP 配置后重试；不要把此问题归因到模型供应商。",
      "Check workspace path, disk space, permissions, and local CLI/MCP configuration before retrying; do not attribute it to the model provider.",
    ],
    workspace_busy_timeout: [
      "等待另一项托管任务结束，或暂停/取消其任务后再恢复；系统没有启动第二个写入者。",
      "Wait for the other managed task to finish, or pause/cancel it before resuming; no second writer was started.",
    ],
    workspace_ownership_unverified: [
      "不要删除该 claim 文件；核对任务目录和 workspace binding 后，由任务 owner 人工处理。",
      "Do not delete the claim file; verify the task directory and workspace binding, then let the task owner resolve it.",
    ],
    executor_delivery_invalid: [
      "检查交付 JSON、证据路径和最终门禁输出后重新提交；不应通过修改状态文件绕过校验。",
      "Check delivery JSON, evidence paths, and final-gate output before resubmitting; do not bypass validation by editing state files.",
    ],
  };
  return messages[reason][zh ? 0 : 1];
}
