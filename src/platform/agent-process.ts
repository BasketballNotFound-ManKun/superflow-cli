import { existsSync, readFileSync, unlinkSync } from "fs";
import path from "path";
import spawn from "cross-spawn";
import type {
  AgentInvocation,
  AgentInvocationResult,
  AgentInvoker,
  ManagedAgent,
} from "../domains/managed-work/types.js";

export class LocalAgentInvoker implements AgentInvoker {
  async invoke<T>(
    invocation: AgentInvocation,
  ): Promise<AgentInvocationResult<T>> {
    return runAgentProcess<T>(invocation);
  }
}

export function buildAgentCommand(invocation: AgentInvocation): {
  command: string;
  args: string[];
  outputFile: string | null;
  initialSessionId: string | null;
} {
  if (invocation.agent === "codex") return buildCodexCommand(invocation);
  return buildClaudeCommand(invocation);
}

async function runAgentProcess<T>(
  invocation: AgentInvocation,
): Promise<AgentInvocationResult<T>> {
  const command = buildAgentCommand(invocation);
  if (command.outputFile && existsSync(command.outputFile))
    unlinkSync(command.outputFile);

  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: invocation.projectRoot,
      env: {
        ...process.env,
        SUPERFLOW_MANAGED_TASK_ID: invocation.taskId,
        SUPERFLOW_MANAGED_RUN_ID: invocation.runId,
        SUPERFLOW_MANAGED_ROLE: invocation.role,
        SUPERFLOW_MANAGED_PROJECT_ROOT: invocation.projectRoot,
      },
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let lineBuffer = "";
    let sessionId = invocation.sessionId;
    let lastOutputAt = Date.now();
    let finished = false;

    const warningTimer = setTimeout(() => {
      invocation.onProgress?.("连续一段时间没有新进展，后台仍在观察进程");
    }, invocation.timeout.warningMs);
    let stalledTimer = setTimeout(onStalled, invocation.timeout.stalledMs);
    const hardTimer = setTimeout(() => {
      stopChild(child.pid);
      finishError(
        new Error(`单次 Agent 调用超过 ${invocation.timeout.hardMs}ms`),
      );
    }, invocation.timeout.hardMs);
    if (invocation.sessionId) invocation.onSession?.(invocation.sessionId);

    child.stdout?.on("data", (chunk) => {
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
      stderr += chunk.toString();
      lastOutputAt = Date.now();
    });
    child.on("error", finishError);
    child.on("close", (code) => {
      if (finished) return;
      cleanupTimers();
      finished = true;
      if ((code ?? 1) !== 0) {
        reject(new Error(formatAgentFailure(invocation.agent, code, stdout, stderr)));
        return;
      }
      try {
        const output = extractStructuredOutput<T>(
          invocation.agent,
          stdout,
          command.outputFile,
        );
        const resolvedSession =
          sessionId ??
          extractSessionFromLines(stdout) ??
          command.initialSessionId;
        if (!resolvedSession)
          throw new Error("Agent 输出中缺少可恢复 session ID");
        resolve({
          sessionId: resolvedSession,
          output,
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      } catch (error) {
        reject(error);
      }
    });
    child.stdin?.end(invocation.prompt);

    function onStalled(): void {
      if (Date.now() - lastOutputAt < invocation.timeout.stalledMs) return;
      stopChild(child.pid);
      finishError(new Error("Agent 长时间没有输出，已保存现场并中断"));
    }

    function finishError(error: Error): void {
      if (finished) return;
      finished = true;
      cleanupTimers();
      reject(error);
    }

    function cleanupTimers(): void {
      clearTimeout(warningTimer);
      clearTimeout(stalledTimer);
      clearTimeout(hardTimer);
    }
  });
}

export function formatAgentFailure(
  agent: ManagedAgent,
  code: number | null,
  stdout: string,
  stderr: string,
): string {
  const details = [stderr.trim(), extractFailureFromEvents(stdout)]
    .filter(Boolean)
    .join("\n")
    .slice(-2_000);
  return `${agent} 调用失败，退出码 ${code ?? 1}: ${redactFailure(details) || "未返回错误详情"}`;
}

function extractFailureFromEvents(stdout: string): string {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  const messages: string[] = [];
  for (let index = lines.length - 1; index >= 0 && messages.length < 4; index--) {
    const event = safeJson(lines[index]);
    if (!event) continue;
    for (const key of ["error", "message", "result", "reason"]) {
      const value = event[key];
      if (typeof value === "string" && value.trim()) messages.push(value.trim());
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
  const args = ["-p"];
  let initialSessionId = invocation.sessionId;
  if (invocation.sessionId) args.push("--resume", invocation.sessionId);
  else {
    initialSessionId = cryptoRandomUuid();
    args.push("--session-id", initialSessionId);
  }
  args.push(
    "--output-format",
    "stream-json",
    "--verbose",
    "--json-schema",
    schema,
    "--permission-mode",
    invocation.role === "supervisor" ? "plan" : "auto",
  );
  for (const root of invocation.writableRoots) args.push("--add-dir", root);
  return { command: "claude", args, outputFile: null, initialSessionId };
}

function extractStructuredOutput<T>(
  agent: ManagedAgent,
  stdout: string,
  outputFile: string | null,
): T {
  if (agent === "codex" && outputFile && existsSync(outputFile)) {
    return parseStructuredValue<T>(readFileSync(outputFile, "utf-8"));
  }
  const events = stdout.split(/\r?\n/).map(safeJson).filter(Boolean) as Record<
    string,
    unknown
  >[];
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    for (const key of ["structured_output", "structuredOutput", "result"]) {
      if (event[key] !== undefined) return parseStructuredValue<T>(event[key]);
    }
  }
  return parseStructuredValue<T>(stdout);
}

function parseStructuredValue<T>(value: unknown): T {
  if (typeof value === "object" && value !== null) return value as T;
  if (typeof value !== "string") throw new Error("Agent 未返回结构化结果");
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Agent 最终输出不是 JSON");
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
  for (const key of ["session_id", "sessionId", "thread_id", "threadId"]) {
    if (typeof object[key] === "string" && isUuid(object[key]))
      return object[key] as string;
  }
  for (const child of Object.values(object)) {
    const nested = extractSessionId(child);
    if (nested) return nested;
  }
  return null;
}

function extractProgress(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  for (const key of ["message", "summary", "text"]) {
    if (typeof object[key] === "string" && object[key].length > 0) {
      return (object[key] as string).slice(0, 240);
    }
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
  if (!pid) return;
  try {
    if (process.platform === "win32") process.kill(pid, "SIGTERM");
    else process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Process already exited.
    }
  }
}

function isUuid(value: unknown): boolean {
  return (
    typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)
  );
}

function cryptoRandomUuid(): string {
  return globalThis.crypto.randomUUID();
}
