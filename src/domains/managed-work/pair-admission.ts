import { existsSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import type { ManagedAgent, ManagedProfile } from "./types.js";
import { getPlatformPaths } from "../../platform/paths.js";
import {
  ALL_RULES,
  ALL_SKILLS,
  CODEX_PROMPTS,
  hookScriptsForAgent,
  scriptsForAgent,
} from "../skill/assets.js";

export interface ManagedPairAdmissionRuntime {
  executable?: (agent: ManagedAgent) => boolean;
  exists?: (file: string) => boolean;
  readFile?: (file: string) => string;
  run?: (
    agent: ManagedAgent,
    args: string[],
  ) => {
    status: number | null;
    stdout: string;
    stderr: string;
  };
  mcpServerPath?: string;
}

/**
 * Legacy contracts require both managed installations. Native tasks depend only
 * on the executor CLI; the active external host already owns its capabilities.
 */
export function assertManagedAgentPair(
  supervisor: ManagedAgent,
  executor: ManagedAgent,
  runtime: ManagedPairAdmissionRuntime = {},
  options: { profile?: ManagedProfile } = {},
): void {
  if (options.profile === "native") {
    assertAgentExecutable(executor, runtime);
    return;
  }
  if (supervisor === executor) {
    throw new Error("监工和实现者必须使用不同的智能体");
  }
  for (const agent of [supervisor, executor]) {
    assertAgentInstallation(agent, runtime);
  }
}

function assertAgentInstallation(
  agent: ManagedAgent,
  runtime: ManagedPairAdmissionRuntime,
): void {
  const exists = runtime.exists ?? existsSync;
  const readFile =
    runtime.readFile ?? ((file: string) => readFileSync(file, "utf8"));
  assertAgentExecutable(agent, runtime);

  const platform = getPlatformPaths(agent, "global");
  const required = [
    ...ALL_SKILLS.map((name) =>
      path.join(platform.skillsDir, name, "SKILL.md"),
    ),
    ...ALL_RULES.map((name) => path.join(platform.rulesDir, name)),
    ...scriptsForAgent(agent).map((name) =>
      path.join(platform.scriptsDir, name),
    ),
    ...(agent === "codex"
      ? CODEX_PROMPTS.map((name) => path.join(platform.promptsDir, name))
      : []),
  ];
  const missing = required.find((file) => !exists(file));
  if (missing) {
    throw new Error(
      `${agent} 缺少 Superflow 资产：${missing}；请运行 superflow update --agent ${agent} --scope global 并重启`,
    );
  }
  if (!exists(platform.settingsFile)) {
    throw new Error(
      `${agent} 缺少 Hook 配置：${platform.settingsFile}；请运行 superflow update --agent ${agent} --scope global`,
    );
  }
  let hookCount = 0;
  try {
    hookCount = countManagedHooks(readFile(platform.settingsFile), agent);
  } catch {
    throw new Error(
      `${agent} Hook 配置无法解析；请修复配置后运行 superflow update --agent ${agent} --scope global`,
    );
  }
  if (hookCount < hookScriptsForAgent(agent).length) {
    throw new Error(
      `${agent} 的 Superflow Hook 未完整注册；请运行 superflow update --agent ${agent} --scope global 并重启`,
    );
  }
  assertManagedMcp(agent, runtime);
}

function assertAgentExecutable(
  agent: ManagedAgent,
  runtime: ManagedPairAdmissionRuntime,
): void {
  if (!(runtime.executable ?? canRunAgent)(agent)) {
    throw new Error(`${agent} 命令行不可用；请安装并重启 ${agent}`);
  }
}

function canRunAgent(agent: ManagedAgent): boolean {
  return (
    spawnSync(agent, ["--version"], {
      stdio: "ignore",
      shell: false,
      timeout: 8_000,
    }).status === 0
  );
}

function assertManagedMcp(
  agent: ManagedAgent,
  runtime: ManagedPairAdmissionRuntime,
): void {
  const run = runtime.run ?? runAgentCommand;
  const result = run(agent, ["mcp", "get", "superflow"]);
  const output = `${result.stdout}\n${result.stderr}`.replaceAll("\\\\", "/");
  const expected = (runtime.mcpServerPath ?? managedMcpServerPath()).replaceAll(
    "\\\\",
    "/",
  );
  if (result.status !== 0 || !/superflow/i.test(output)) {
    throw new Error(
      `${agent} 未注册 Superflow MCP；请运行 superflow mcp install --agent ${agent}，然后重启 ${agent}`,
    );
  }
  if (!output.includes(expected)) {
    throw new Error(
      `${agent} 的 Superflow MCP 未指向当前运行时；请运行 superflow update --agent ${agent} --scope global，随后重启 ${agent}`,
    );
  }
}

function runAgentCommand(
  agent: ManagedAgent,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(agent, args, {
    encoding: "utf-8",
    shell: false,
    timeout: 8_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function managedMcpServerPath(): string {
  return fileURLToPath(new URL("../../mcp/server.js", import.meta.url));
}

function countManagedHooks(content: string, agent: ManagedAgent): number {
  const settings = JSON.parse(content) as { hooks?: Record<string, unknown[]> };
  const directory = agent === "claude" ? "/scripts/" : "/hooks/";
  let count = 0;
  for (const entries of Object.values(settings.hooks ?? {})) {
    for (const entry of entries) {
      const hooks =
        (entry as { hooks?: Array<{ command?: string }> }).hooks ?? [];
      for (const hook of hooks) {
        if (
          hook.command?.includes(`${directory}superflow-`) ||
          hook.command?.includes(`${directory}sdd-`) ||
          hook.command?.includes(`${directory}${agent}-auto-backup`)
        ) {
          count += 1;
        }
      }
    }
  }
  return count;
}
