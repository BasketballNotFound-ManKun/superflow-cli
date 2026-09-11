import { existsSync, readFileSync, unlinkSync } from "fs";
import path from "path";
import spawn from "cross-spawn";
import type {
  AgentInvocation,
  AgentInvocationResult,
  AgentInvoker,
  AgentRuntimeTelemetry,
  AgentUsage,
  ManagedAgent,
  UnresumableSessionFailureReason,
  ManagedReasoningEffort,
} from "../domains/managed-work/types.js";
import { managedText } from "../domains/managed-work/i18n.js";
import type { Language } from "../types.js";
import { resolveExecutableShim } from "./executable.js";
import { stopProcessTree } from "./process-tree.js";

const HOST_SUPERVISION_INTERVAL_MS = 10 * 60_000;
const CLAUDE_MANAGED_AUTO_COMPACT_WINDOW = "200000";
const CLAUDE_MANAGED_AUTO_COMPACT_PERCENT = "70";

/**
 * GUI-launched MCP servers do not reliably inherit an interactive shell PATH.
 * Supplement it only with standard executable locations, never a user's home
 * directory or a tool-specific private shim.
 */
export function managedExecutablePath(
  basePath: string | undefined,
  platform: NodeJS.Platform = process.platform,
  directoryExists: (candidate: string) => boolean = existsSync,
): string {
  const delimiter = platform === "win32" ? ";" : ":";
  const standardDirectories =
    platform === "darwin"
      ? ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]
      : platform === "win32"
        ? []
        : ["/usr/local/bin", "/usr/bin", "/bin"];
  const existing = (basePath ?? "").split(delimiter).filter(Boolean);
  const known = new Set(existing);
  for (const directory of standardDirectories) {
    if (directoryExists(directory) && !known.has(directory)) {
      existing.push(directory);
      known.add(directory);
    }
  }
  return existing.join(delimiter);
}

export class LocalAgentInvoker implements AgentInvoker {
  async invoke<T>(
    invocation: AgentInvocation,
  ): Promise<AgentInvocationResult<T>> {
    return runAgentProcess<T>(invocation);
  }
}

export class AgentInvocationFailure extends Error {
  constructor(
    message: string,
    readonly stdout: string,
    readonly stderr: string,
    readonly sessionId: string | null,
    readonly usage?: AgentUsage,
    readonly telemetry?: AgentRuntimeTelemetry,
  ) {
    super(message);
    this.name = "AgentInvocationFailure";
  }
}

export function classifyUnresumableSessionFailure(input: {
  message: string;
}): UnresumableSessionFailureReason | null {
  const evidence = input.message.toLowerCase();
  const resumeFailure =
    /\b(?:failed|failure|error|rejected|unable|cannot|can't)\b.{0,80}\b(?:resume|resuming)\b/.test(
      evidence,
    ) ||
    /\b(?:resume|resuming)\b.{0,80}\b(?:failed|failure|error|rejected|unable|cannot|can't|history exceeds)\b/.test(
      evidence,
    );
  if (!resumeFailure) return null;
  if (
    /(?:(?:session|conversation)(?:\s+id)?\s+(?:not found|does not exist|expired)|unknown\s+(?:session|conversation))/.test(
      evidence,
    )
  ) {
    return "session_not_found";
  }
  if (
    /(?:(?:invalid|malformed)\s+(?:session|conversation)(?:\s+id)?|(?:session|conversation)\s+id\s+is\s+invalid)/.test(
      evidence,
    )
  ) {
    return "session_invalid";
  }
  if (
    /context window|context limit|too large|too long/.test(
      evidence,
    )
  ) {
    return "resume_context_limit";
  }
  return null;
}

export function buildAgentCommand(invocation: AgentInvocation): {
  command: string;
  args: string[];
  outputFile: string | null;
  initialSessionId: string | null;
} {
  if (invocation.agent === "codex") return buildCodexCommand(invocation);
  return invocation.agent === "claude"
    ? buildClaudeCommand(invocation)
    : buildCodexCommand(invocation);
}

export function wrapWithSleepPrevention(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  caffeinateAvailable = existsSync("/usr/bin/caffeinate"),
): { command: string; args: string[] } {
  if (platform !== "darwin" || !caffeinateAvailable) return { command, args };
  return {
    command: "/usr/bin/caffeinate",
    args: ["-im", command, ...args],
  };
}

async function runAgentProcess<T>(
  invocation: AgentInvocation,
): Promise<AgentInvocationResult<T>> {
  const command = buildAgentCommand(invocation);
  const environment = buildAgentEnvironment(invocation);
  const executable = resolveExecutableShim(command.command, environment);
  const processCommand = wrapWithSleepPrevention(executable, command.args);
  if (command.outputFile && existsSync(command.outputFile))
    unlinkSync(command.outputFile);

  return new Promise((resolve, reject) => {
    const child = spawn(processCommand.command, processCommand.args, {
      cwd: invocation.projectRoot,
      env: environment,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let lineBuffer = "";
    let sessionId = invocation.sessionId;
    let lastOutputAt = Date.now();
    let lastClockCheckAt = lastOutputAt;
    let activeInvocationMs = 0;
    let finished = false;
    let telemetry = initialTelemetry();
    let usage = emptyUsage();
    invocation.onTelemetry?.(telemetry);
    invocation.onProcess?.(child.pid ?? null);

    const warningTimer = setTimeout(() => {
      if (finished) return;
      accountClockGap();
      invocation.onProgress?.(
        managedText(
          invocation.language,
          "连续一段时间没有新进展，后台仍在观察进程",
          "No new progress for a while; the background service is still observing the process",
        ),
      );
    }, invocation.timeout.warningMs);
    const heartbeatTimer = setInterval(() => {
      if (finished) return;
      accountClockGap();
      const elapsed = Date.now() - lastOutputAt;
      invocation.onProgress?.(
        managedText(
          invocation.language,
          `Agent 心跳：阶段 ${telemetry.phase}，距最近输出 ${Math.round(elapsed / 1_000)} 秒，最近进展原因 ${telemetry.lastProgressReason}`,
          `Agent heartbeat: phase ${telemetry.phase}, ${Math.round(elapsed / 1_000)} seconds since output, last progress reason ${telemetry.lastProgressReason}`,
        ),
      );
    }, 60_000);
    const supervisionTimer = setInterval(() => {
      if (finished) return;
      accountClockGap();
      invocation.onProgress?.(
        `superflow-supervision:${JSON.stringify({
          phase: telemetry.phase,
          lastProgressAt: telemetry.lastProgressAt,
          lastProgressReason: telemetry.lastProgressReason,
          secondsSinceOutput: Math.round((Date.now() - lastOutputAt) / 1_000),
        })}`,
      );
    }, HOST_SUPERVISION_INTERVAL_MS);
    let stalledTimer = setTimeout(onStalled, invocation.timeout.stalledMs);
    const hardTimer = setInterval(() => {
      if (finished) return;
      accountClockGap();
      if (activeInvocationMs < invocation.timeout.hardMs) return;
      stopChild(child.pid);
      finishError(
        new Error(
          managedText(
            invocation.language,
            `单次 Agent 调用超过 ${invocation.timeout.hardMs}ms`,
            `Single Agent invocation exceeded ${invocation.timeout.hardMs}ms`,
          ),
        ),
      );
    }, 250);
    if (invocation.sessionId) invocation.onSession?.(invocation.sessionId);

    child.stdout?.on("data", (chunk) => {
      if (finished) return;
      accountClockGap();
      const text = chunk.toString();
      stdout += text;
      lastOutputAt = Date.now();
      clearTimeout(stalledTimer);
      stalledTimer = setTimeout(onStalled, invocation.timeout.stalledMs);
      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const event = safeJson(line);
        if (event) {
          telemetry = updateTelemetry(telemetry, event);
          usage = updateAgentUsage(usage, event);
          invocation.onTelemetry?.(telemetry);
        }
        if (invocation.agent === "claude" && shouldStopClaudeRetry(event)) {
          stopChild(child.pid);
          finishError(
            new Error(
              managedText(
                invocation.language,
                "Claude 底层模型连续出现 3 次临时 429/529/overloaded，已熔断本次调用",
                "Claude's provider returned 3 consecutive transient 429/529/overloaded retries; this invocation was stopped",
              ),
            ),
          );
          return;
        }
        const discoveredSession = extractSessionId(event);
        if (!sessionId && discoveredSession) {
          sessionId = discoveredSession;
          invocation.onSession?.(discoveredSession);
        }
        const progress = extractProgress(event);
        if (progress) invocation.onProgress?.(progress);
      }
    });
    child.stderr?.on("data", (chunk) => {
      if (finished) return;
      accountClockGap();
      stderr += chunk.toString();
      lastOutputAt = Date.now();
    });
    child.on("error", finishError);
    child.on("close", (code) => {
      if (finished) return;
      cleanupTimers();
      finished = true;
      if ((code ?? 1) !== 0) {
        reject(
          new AgentInvocationFailure(
            formatAgentFailure(
              invocation.agent,
              code,
              stdout,
              stderr,
              invocation.language,
            ),
            stdout,
            stderr,
            sessionId,
            usage,
            telemetry,
          ),
        );
        return;
      }
      try {
        const output = extractStructuredOutput<T>(
          invocation.agent,
          stdout,
          command.outputFile,
          invocation.language,
        );
        const resolvedSession =
          sessionId ??
          extractSessionFromLines(stdout) ??
          command.initialSessionId;
        if (!resolvedSession)
          throw new Error(
            managedText(
              invocation.language,
              "Agent 输出中缺少可恢复 session ID",
              "Agent output is missing a resumable session ID",
            ),
          );
        resolve({
          sessionId: resolvedSession,
          output,
          stdout,
          stderr,
          exitCode: code ?? 0,
          usage,
          telemetry,
        });
      } catch (error) {
        reject(
          new AgentInvocationFailure(
            (error as Error).message,
            stdout,
            stderr,
            sessionId,
            usage,
            telemetry,
          ),
        );
      }
    });
    child.stdin?.end(agentProcessInput(invocation));

    function onStalled(): void {
      if (finished) return;
      const slept = accountClockGap();
      if (slept) {
        clearTimeout(stalledTimer);
        stalledTimer = setTimeout(onStalled, invocation.timeout.stalledMs);
        return;
      }
      if (Date.now() - lastOutputAt < invocation.timeout.stalledMs) return;
      stopChild(child.pid);
      finishError(
        new Error(
          managedText(
            invocation.language,
            "Agent 长时间没有输出，已保存现场并中断",
            "Agent produced no output for too long; state was preserved and the process was interrupted",
          ),
        ),
      );
    }

    function finishError(error: Error): void {
      if (finished) return;
      finished = true;
      cleanupTimers();
      reject(
        error instanceof AgentInvocationFailure
          ? error
          : new AgentInvocationFailure(
              error.message,
              stdout,
              stderr,
              sessionId,
              usage,
              telemetry,
            ),
      );
    }

    function cleanupTimers(): void {
      clearTimeout(warningTimer);
      clearTimeout(stalledTimer);
      clearInterval(hardTimer);
      clearInterval(heartbeatTimer);
      clearInterval(supervisionTimer);
      invocation.onProcess?.(null);
    }

    function accountClockGap(): boolean {
      const now = Date.now();
      const delta = Math.max(0, now - lastClockCheckAt);
      lastClockCheckAt = now;
      const slept = delta > 5_000;
      if (slept) {
        lastOutputAt += delta;
        return true;
      }
      activeInvocationMs += delta;
      return false;
    }
  });
}

export function buildAgentEnvironment(
  invocation: AgentInvocation,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    PATH: managedExecutablePath(baseEnv.PATH),
    SUPERFLOW_MANAGED_TASK_ID: invocation.taskId,
    SUPERFLOW_MANAGED_RUN_ID: invocation.runId,
    SUPERFLOW_MANAGED_ROLE: invocation.role,
    SUPERFLOW_MANAGED_PROJECT_ROOT: invocation.projectRoot,
    SUPERFLOW_MANAGED_CONTEXT_MANIFEST: path.join(
      invocation.projectRoot,
      ".superflow",
      "tasks",
      invocation.taskId,
      "context-manifest.json",
    ),
    ...(invocation.agent === "claude" && invocation.role === "executor"
      ? {
          CLAUDE_CODE_AUTO_COMPACT_WINDOW:
            baseEnv.CLAUDE_CODE_AUTO_COMPACT_WINDOW ??
            CLAUDE_MANAGED_AUTO_COMPACT_WINDOW,
          CLAUDE_AUTOCOMPACT_PCT_OVERRIDE:
            baseEnv.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE ??
            CLAUDE_MANAGED_AUTO_COMPACT_PERCENT,
        }
      : {}),
  };
}

export function initialTelemetry(): AgentRuntimeTelemetry {
  const now = new Date().toISOString();
  return {
    phase: "model_waiting",
    model: null,
    reasoningEffort: null,
    tools: [],
    toolUses: [],
    plugins: [],
    lastOutputAt: now,
    lastProgressAt: now,
    lastProgressReason: "invocation_started",
    permissionDenials: 0,
  };
}

function emptyUsage(): AgentUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    costUsd: null,
  };
}

export function updateTelemetry(
  current: AgentRuntimeTelemetry,
  event: Record<string, unknown>,
): AgentRuntimeTelemetry {
  const now = new Date().toISOString();
  const next = { ...current, lastOutputAt: now };
  if (Array.isArray(event.permission_denials)) {
    next.permissionDenials = Math.max(
      next.permissionDenials ?? 0,
      event.permission_denials.length,
    );
  }
  if (event.type === "system" && event.subtype === "init") {
    next.model = stringValue(event.model) ?? next.model;
    const effort =
      stringValue(event.reasoning_effort) ??
      stringValue(event.model_reasoning_effort) ??
      stringValue(event.effort);
    if (
      effort &&
      ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(effort)
    ) {
      next.reasoningEffort = effort as ManagedReasoningEffort;
    }
    next.tools = stringArray(event.tools);
    next.plugins = stringArray(event.plugins);
    next.lastProgressAt = now;
    next.lastProgressReason = "system_init";
  }
  const toolNames = extractToolNames(event);
  if (event.type === "result") {
    next.phase = "model_waiting";
    next.lastProgressAt = now;
    next.lastProgressReason = "agent_result";
  } else if (toolNames.length > 0) {
    next.toolUses = [...new Set([...next.toolUses, ...toolNames])];
    next.phase = toolNames.some((name) =>
      /^(write|edit|apply_patch)$/i.test(name),
    )
      ? "workspace_writing"
      : "tool_running";
    next.lastProgressAt = now;
    next.lastProgressReason = `tool_use:${toolNames.join(",")}`;
  } else if (/permission|approval/i.test(`${event.type} ${event.subtype}`)) {
    next.phase = "awaiting_local_approval";
    next.lastProgressReason = "local_approval";
  } else if (event.type === "assistant" || event.type === "message") {
    next.phase = "model_waiting";
    next.lastProgressAt = now;
    next.lastProgressReason = "model_output";
  }
  return next;
}

function extractToolNames(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const names: string[] = [];
  if (
    (object.type === "tool_use" || object.type === "tool_call") &&
    typeof object.name === "string"
  ) {
    names.push(object.name);
  }
  for (const child of Object.values(object)) {
    if (Array.isArray(child)) {
      for (const item of child) names.push(...extractToolNames(item));
    } else if (child && typeof child === "object") {
      names.push(...extractToolNames(child));
    }
  }
  return names;
}

function extractUsage(event: Record<string, unknown>): Partial<AgentUsage> {
  const usage =
    event.usage && typeof event.usage === "object"
      ? (event.usage as Record<string, unknown>)
      : {};
  return {
    inputTokens: numberValue(usage.input_tokens ?? usage.inputTokens),
    outputTokens: numberValue(usage.output_tokens ?? usage.outputTokens),
    cacheReadTokens: numberValue(
      usage.cache_read_input_tokens ?? usage.cacheReadTokens,
    ),
    cacheWriteTokens: numberValue(
      usage.cache_creation_input_tokens ?? usage.cacheWriteTokens,
    ),
    costUsd: numberValue(event.total_cost_usd ?? event.cost_usd),
  };
}

export function updateAgentUsage(
  current: AgentUsage,
  event: Record<string, unknown>,
): AgentUsage {
  return mergeUsage(current, extractUsage(event));
}

function mergeUsage(
  current: AgentUsage,
  next: Partial<AgentUsage>,
): AgentUsage {
  return {
    inputTokens: next.inputTokens ?? current.inputTokens,
    outputTokens: next.outputTokens ?? current.outputTokens,
    cacheReadTokens: next.cacheReadTokens ?? current.cacheReadTokens,
    cacheWriteTokens: next.cacheWriteTokens ?? current.cacheWriteTokens,
    costUsd: next.costUsd ?? current.costUsd,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function formatAgentFailure(
  agent: ManagedAgent,
  code: number | null,
  stdout: string,
  stderr: string,
  language?: Language,
): string {
  const details = [stderr.trim(), extractFailureFromEvents(stdout)]
    .filter(Boolean)
    .join("\n")
    .slice(-2_000);
  return managedText(
    language,
    `${agent} 调用失败，退出码 ${code ?? 1}: ${redactFailure(details) || "未返回错误详情"}`,
    `${agent} invocation failed with exit code ${code ?? 1}: ${redactFailure(details) || "no error details returned"}`,
  );
}

function extractFailureFromEvents(stdout: string): string {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  const messages: string[] = [];
  for (
    let index = lines.length - 1;
    index >= 0 && messages.length < 4;
    index--
  ) {
    const event = safeJson(lines[index]);
    if (!event) continue;
    for (const key of [
      "error",
      "message",
      "result",
      "reason",
      "terminal_reason",
      "subtype",
      "stop_reason",
    ]) {
      const value = event[key];
      if (typeof value === "string" && value.trim())
        messages.push(value.trim());
    }
    if (Array.isArray(event.errors)) {
      for (const value of event.errors) {
        if (typeof value === "string" && value.trim()) {
          messages.push(value.trim());
        }
      }
    }
  }
  return messages.join("\n");
}

function redactFailure(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi, "$1<redacted>")
    .replace(
      /(["']?(?:token|password|secret|cookie|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
      "$1<redacted>",
    );
}

function buildCodexCommand(invocation: AgentInvocation) {
  const outputFile = path.join(
    path.dirname(invocation.schemaPath),
    `${invocation.role}-last.json`,
  );
  if (invocation.sessionId) {
    return {
      command: "codex",
      args: [
        "exec",
        "resume",
        ...(invocation.role === "executor" ? ["--disable", "memories"] : []),
        ...(invocation.model ? ["--model", invocation.model] : []),
        ...(invocation.reasoningEffort
          ? ["-c", `model_reasoning_effort=${invocation.reasoningEffort}`]
          : []),
        invocation.sessionId,
        "--json",
        "--output-schema",
        invocation.schemaPath,
        "-o",
        outputFile,
        "-",
      ],
      outputFile,
      initialSessionId: invocation.sessionId,
    };
  }
  const additionalRoots = invocation.writableRoots.flatMap((root) => [
    "--add-dir",
    root,
  ]);
  return {
    command: "codex",
    args: [
      "exec",
      ...(invocation.role === "executor" ? ["--disable", "memories"] : []),
      ...(invocation.model ? ["--model", invocation.model] : []),
      ...(invocation.reasoningEffort
        ? ["-c", `model_reasoning_effort=${invocation.reasoningEffort}`]
        : []),
      "-C",
      invocation.projectRoot,
      "--sandbox",
      invocation.role === "supervisor" ? "read-only" : "workspace-write",
      ...additionalRoots,
      "--json",
      "--output-schema",
      invocation.schemaPath,
      "-o",
      outputFile,
      "-",
    ],
    outputFile,
    initialSessionId: null,
  };
}

function buildClaudeCommand(invocation: AgentInvocation) {
  const schema = readFileSync(invocation.schemaPath, "utf-8");
  const args = ["--bare", "-p"];
  if (invocation.model) args.push("--model", invocation.model);
  if (invocation.reasoningEffort) {
    args.push("--effort", invocation.reasoningEffort);
  }
  let initialSessionId = invocation.sessionId;
  if (invocation.sessionId) args.push("--resume", invocation.sessionId);
  else {
    initialSessionId = cryptoRandomUuid();
    args.push("--session-id", initialSessionId);
  }
  args.push(
    ...(invocation.systemPromptPath
      ? ["--append-system-prompt-file", invocation.systemPromptPath]
      : []),
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--json-schema",
    schema,
    "--tools",
    claudeTools(invocation.role),
  );
  if (invocation.role === "executor") {
    args.push("--dangerously-skip-permissions");
  } else {
    args.push(
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      ...claudeAllowedTools(invocation.role),
    );
  }
  if (invocation.role === "supervisor") {
    args.push("--max-turns", "20");
  }
  for (const root of invocation.writableRoots) args.push("--add-dir", root);
  return { command: "claude", args, outputFile: null, initialSessionId };
}

export function agentProcessInput(invocation: AgentInvocation): string {
  if (invocation.agent === "codex") return invocation.prompt;
  if (invocation.agent === "claude" && invocation.promptPath) {
    return `Read ${invocation.promptPath} completely and execute it.`;
  }
  return invocation.prompt;
}

function claudeTools(role: AgentInvocation["role"]): string {
  return role === "supervisor"
    ? "Read,Grep,Glob,Bash"
    : "Read,Write,Edit,Grep,Glob,Bash";
}

function claudeAllowedTools(role: AgentInvocation["role"]): string[] {
  const readOnly = [
    "Read",
    "Grep",
    "Glob",
    "Bash(git diff *)",
    "Bash(git status *)",
    "Bash(git log *)",
    "Bash(git show *)",
    "Bash(xmllint *)",
  ];
  if (role === "supervisor") return readOnly;
  return [
    ...readOnly,
    "Write",
    "Edit",
    "Bash(mvn *)",
    "Bash(JAVA_HOME=* mvn *)",
    "Bash(JAVA_HOME=* */mvn *)",
    "Bash(java *)",
    "Bash(JAVA_HOME=* java *)",
    "Bash(/usr/libexec/java_home *)",
    "Bash(command -v java*)",
    "Bash(command -v mvn*)",
    "Bash(which java*)",
    "Bash(which mvn*)",
    "Bash(npm *)",
    "Bash(npx *)",
    "Bash(pnpm *)",
    "Bash(yarn *)",
    "Bash(gradle *)",
    "Bash(./gradlew *)",
    "Bash(openspec *)",
    "Bash(bash .claude/scripts/superflow-*.sh)",
    "Bash(bash .claude/scripts/superflow-*.sh *)",
    "Bash(python3 .claude/scripts/superflow-*.py)",
    "Bash(python3 .claude/scripts/superflow-*.py *)",
    "Bash(node .claude/scripts/superflow-*.mjs)",
    "Bash(node .claude/scripts/superflow-*.mjs *)",
    "Bash(PORT=* npm *)",
    "Bash(node --version*)",
    "Bash(npm --version*)",
    "Bash(curl --version*)",
    "Bash(which curl*)",
    "Bash(command -v curl*)",
    "Bash(curl http://localhost*)",
    "Bash(curl http://127.0.0.1*)",
    "Bash(lsof *)",
    "Bash(ps *)",
    "Bash(kill *)",
  ];
}

export function shouldStopClaudeRetry(
  event: Record<string, unknown> | null,
): boolean {
  if (
    event?.type !== "system" ||
    event.subtype !== "api_retry" ||
    typeof event.attempt !== "number" ||
    event.attempt < 3
  ) {
    return false;
  }
  const detail = `${String(event.error_status ?? "")} ${String(event.error ?? "")}`;
  return /\b(?:429|529)\b|overloaded|rate.?limit|访问量过大|暂时.*限流/i.test(
    detail,
  );
}

function extractStructuredOutput<T>(
  agent: ManagedAgent,
  stdout: string,
  outputFile: string | null,
  language?: Language,
): T {
  if (agent === "codex" && outputFile && existsSync(outputFile)) {
    return parseStructuredValue<T>(readFileSync(outputFile, "utf-8"), language);
  }
  const events = stdout.split(/\r?\n/).map(safeJson).filter(Boolean) as Record<
    string,
    unknown
  >[];
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    for (const key of ["structured_output", "structuredOutput", "result"]) {
      if (event[key] !== undefined)
        return parseStructuredValue<T>(event[key], language);
    }
    const text = extractEventText(event);
    if (text) {
      try {
        return parseStructuredValue<T>(text, language);
      } catch {
        // Continue to earlier events before falling back to the whole stream.
      }
    }
  }
  return parseStructuredValue<T>(stdout, language);
}

function extractEventText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  if (typeof object.text === "string" && object.text.trim()) return object.text;
  for (const child of Object.values(object)) {
    if (Array.isArray(child)) {
      for (let index = child.length - 1; index >= 0; index--) {
        const text = extractEventText(child[index]);
        if (text) return text;
      }
    } else if (child && typeof child === "object") {
      const text = extractEventText(child);
      if (text) return text;
    }
  }
  return null;
}

function parseStructuredValue<T>(value: unknown, language?: Language): T {
  if (typeof value === "object" && value !== null) return value as T;
  if (typeof value !== "string") {
    throw new Error(
      managedText(
        language,
        "Agent 未返回结构化结果",
        "Agent did not return structured output",
      ),
    );
  }
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(
        managedText(
          language,
          "Agent 最终输出不是 JSON",
          "Agent final output is not JSON",
        ),
      );
    }
    return JSON.parse(match[0]) as T;
  }
}

function extractSessionFromLines(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    const sessionId = extractSessionId(safeJson(line));
    if (sessionId) return sessionId;
  }
  return null;
}

function extractSessionId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  for (const key of [
    "session_id",
    "sessionId",
    "sessionID",
    "thread_id",
    "threadId",
  ]) {
    if (typeof object[key] === "string" && isUuid(object[key]))
      return object[key] as string;
  }
  for (const child of Object.values(object)) {
    const nested = extractSessionId(child);
    if (nested) return nested;
  }
  return null;
}

export function extractProgress(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const stageHint = extractToolStageHint(value);
  if (stageHint) return `superflow-stage:${stageHint}`;
  const object = value as Record<string, unknown>;
  for (const key of ["message", "summary", "text"]) {
    if (typeof object[key] === "string" && object[key].length > 0) {
      return object[key] as string;
    }
  }
  return null;
}

function extractToolStageHint(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const type = stringValue(object.type);
  const name = stringValue(object.name);
  if (
    ["tool_use", "tool_call"].includes(type ?? "") &&
    /^(?:write|edit|apply_patch)$/i.test(name ?? "")
  ) {
    return "implementation";
  }
  if (
    ["tool_use", "tool_call"].includes(type ?? "") &&
    /^(?:bash|shell|terminal)$/i.test(name ?? "")
  ) {
    const input = object.input;
    const command =
      input && typeof input === "object"
        ? stringValue((input as Record<string, unknown>).command)
        : null;
    if (command) return stageFromCommand(command);
  }
  for (const child of Object.values(object)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const stage = extractToolStageHint(item);
        if (stage) return stage;
      }
    } else if (child && typeof child === "object") {
      const stage = extractToolStageHint(child);
      if (stage) return stage;
    }
  }
  return null;
}

function stageFromCommand(command: string): string | null {
  const value = command.toLowerCase();
  if (/preflight|diff --check/.test(value)) return "delivery_self_check";
  if (/drop table|redis.*(?:del|exists)|kill|pkill|cleanup/.test(value)) {
    return "cleanup";
  }
  if (/\bcurl\b|\bwget\b|http:\/\/|https:\/\//.test(value)) {
    return "http_e2e";
  }
  if (/java -jar|spring-boot:run|bootrun|npm run (?:dev|start)/.test(value)) {
    return "application_startup";
  }
  if (/mvn.*package|gradle.*build|npm.*build/.test(value)) return "package";
  if (/mvn.*test|gradle.*test|vitest|jest|pytest/.test(value)) {
    return "unit_test";
  }
  return null;
}

function safeJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stopChild(pid: number | undefined): void {
  stopProcessTree(pid);
}

function isUuid(value: unknown): boolean {
  return (
    typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)
  );
}

function cryptoRandomUuid(): string {
  return globalThis.crypto.randomUUID();
}
