import spawn from "cross-spawn";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import type { Language } from "../../types.js";
import { resolveRuntimeLanguage } from "../../domains/config/cli-help.js";
import { managedText } from "../../domains/managed-work/i18n.js";

type McpAction = "install" | "remove" | "status";
type McpAgent = "codex" | "claude";
const spawnSync = spawn.sync;

export interface McpCommandOptions {
  agent?: string;
  dryRun?: boolean;
  json?: boolean;
  language?: string;
}

export interface McpCommandResult {
  action: McpAction;
  serverPath: string;
  agents: Array<{
    agent: McpAgent;
    configuredBefore: boolean;
    configuredAfter: boolean;
    changed: boolean;
    commands: string[][];
  }>;
}

export async function mcpCommand(
  rawAction: string,
  options: McpCommandOptions = {},
): Promise<void> {
  const language = resolveRuntimeLanguage(options.language);
  const action = parseAction(rawAction, language);
  const result = manageMcpIntegration(action, options, language);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  for (const item of result.agents) {
    const status = item.configuredAfter
      ? managedText(language, "已配置", "configured")
      : managedText(language, "未配置", "not configured");
    const suffix = item.changed
      ? managedText(language, "（已更新）", " (updated)")
      : "";
    console.log(`${item.agent}: ${status}${suffix}`);
  }
  console.log(
    managedText(
      language,
      `MCP Server：${result.serverPath}`,
      `MCP server: ${result.serverPath}`,
    ),
  );
}

export function manageMcpIntegration(
  action: McpAction,
  options: McpCommandOptions = {},
  language: Language = "zh",
): McpCommandResult {
  const agents = parseMcpAgents(options.agent, language);
  const serverPath = resolveMcpServerPath();
  const dryRun = Boolean(options.dryRun);
  if (action === "install" && !dryRun) {
    if (!existsSync(serverPath)) {
      throw new Error(
        managedText(
          language,
          `MCP Server 不存在，请先执行 npm run build：${serverPath}`,
          `MCP server is missing; run npm run build first: ${serverPath}`,
        ),
      );
    }
    for (const agent of agents) assertAgentAvailable(agent, language);
  }
  return {
    action,
    serverPath,
    agents: agents.map((agent) =>
      manageAgent(agent, action, serverPath, dryRun, language),
    ),
  };
}

function manageAgent(
  agent: McpAgent,
  action: McpAction,
  serverPath: string,
  dryRun: boolean,
  language: Language,
): McpCommandResult["agents"][number] {
  const commands: string[][] = [];
  const configured = mcpConfigured(agent);
  if (action === "status") {
    return {
      agent,
      configuredBefore: configured,
      configuredAfter: configured,
      changed: false,
      commands,
    };
  }
  if (action === "remove") {
    if (configured) {
      const command = buildMcpRemoveCommand(agent);
      commands.push(command);
      if (!dryRun) runAgentCommand(agent, command, language);
    }
    return {
      agent,
      configuredBefore: configured,
      configuredAfter: false,
      changed: configured,
      commands,
    };
  }
  if (configured) {
    const command = buildMcpRemoveCommand(agent);
    commands.push(command);
    if (!dryRun) runAgentCommand(agent, command, language);
  }
  const command = buildMcpAddCommand(agent, serverPath);
  commands.push(command);
  if (!dryRun) runAgentCommand(agent, command, language);
  return {
    agent,
    configuredBefore: configured,
    configuredAfter: true,
    changed: true,
    commands,
  };
}

function assertAgentAvailable(agent: McpAgent, language: Language): void {
  const result = spawnSync(agent, ["--version"], {
    stdio: "ignore",
    shell: false,
  });
  if (result.status === 0) return;
  throw new Error(
    managedText(
      language,
      `${agent} CLI 不可用，未修改现有 MCP 配置`,
      `${agent} CLI is unavailable; existing MCP configuration was not changed`,
    ),
  );
}

function mcpConfigured(agent: McpAgent): boolean {
  const command =
    agent === "codex"
      ? ["mcp", "get", "superflow"]
      : ["mcp", "get", "superflow"];
  return (
    spawnSync(agent, command, {
      stdio: "ignore",
      shell: false,
    }).status === 0
  );
}

export function buildMcpAddCommand(
  agent: McpAgent,
  serverPath: string,
  nodePath = resolveMcpNodePath(),
): string[] {
  if (agent === "codex") {
    return ["mcp", "add", "superflow", "--", nodePath, serverPath];
  }
  return [
    "mcp",
    "add",
    "--scope",
    "user",
    "superflow",
    "--",
    nodePath,
    serverPath,
  ];
}

export function resolveMcpNodePath(
  executable = process.execPath,
  pathExists: (candidate: string) => boolean = existsSync,
): string {
  const homebrew = executable.match(
    /^(.*)\/Cellar\/node(?:@[^/]+)?\/[^/]+\/bin\/node$/,
  );
  if (!homebrew) return executable;
  const stable = `${homebrew[1]}/bin/node`;
  return pathExists(stable) ? stable : executable;
}

export function buildMcpRemoveCommand(agent: McpAgent): string[] {
  return agent === "codex"
    ? ["mcp", "remove", "superflow"]
    : ["mcp", "remove", "--scope", "user", "superflow"];
}

function runAgentCommand(
  agent: McpAgent,
  args: string[],
  language: Language,
): void {
  const result = spawnSync(agent, args, {
    encoding: "utf-8",
    shell: false,
  });
  if (result.status === 0) return;
  const details = [result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n")
    .trim();
  throw new Error(
    managedText(
      language,
      `${agent} MCP 配置失败：${details || `exit ${result.status}`}`,
      `${agent} MCP configuration failed: ${details || `exit ${result.status}`}`,
    ),
  );
}

function parseAction(value: string, language: Language): McpAction {
  if (["install", "remove", "status"].includes(value)) {
    return value as McpAction;
  }
  throw new Error(
    managedText(
      language,
      "MCP 操作必须是 install、remove 或 status",
      "MCP action must be install, remove, or status",
    ),
  );
}

export function parseMcpAgents(
  value: string | undefined,
  language: Language,
): McpAgent[] {
  const normalized = value?.trim().toLowerCase() || "both";
  if (normalized === "both") return ["codex", "claude"];
  const selected = new Set(normalized.split(/[,\s]+/).filter(Boolean));
  const supported: McpAgent[] = ["codex", "claude"];
  if (
    selected.size > 0 &&
    [...selected].every((agent) =>
      supported.includes(agent as McpAgent),
    )
  ) {
    return supported.filter((agent) => selected.has(agent));
  }
  throw new Error(
    managedText(
      language,
      "MCP 支持 codex、claude 或 both",
      "MCP supports codex, claude, or both",
    ),
  );
}

export function resolveMcpServerPath(): string {
  return fileURLToPath(new URL("../../mcp/server.js", import.meta.url));
}
