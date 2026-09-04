import path from "path";
import { runtimeFingerprintForCli } from "../domains/managed-work/service.js";

export interface McpRuntimeIdentity {
  version: string;
  cliPath: string;
  fingerprint: string;
  startedAt: string;
}

export function createMcpRuntimeIdentity(
  packageRoot: string,
  version: string,
  startedAt = new Date().toISOString(),
): McpRuntimeIdentity {
  const cliPath = path.join(packageRoot, "dist", "mcp", "server.js");
  return {
    version,
    cliPath,
    fingerprint: runtimeFingerprintForCli(cliPath),
    startedAt,
  };
}

export function assertMcpRuntimeCurrent(identity: McpRuntimeIdentity): void {
  const current = runtimeFingerprintForCli(identity.cliPath);
  if (current === identity.fingerprint) return;
  throw new Error(
    "Superflow MCP 运行时已过期：本地安装内容在当前 MCP 进程启动后发生变化。"
      + "请重启 Host 应用或 Agent 会话，使其重新启动 MCP Server 后再创建任务。"
      + ` startup=${identity.fingerprint.slice(0, 12)}`
      + ` current=${current.slice(0, 12)}`,
  );
}
