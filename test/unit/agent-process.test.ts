import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import * as agentProcess from "../../src/platform/agent-process.js";
import {
  agentProcessInput,
  buildAgentEnvironment,
  buildAgentCommand,
  extractProgress,
  formatAgentFailure,
  initialTelemetry,
  managedExecutablePath,
  shouldStopClaudeRetry,
  updateAgentUsage,
  updateTelemetry,
  wrapWithSleepPrevention,
} from "../../src/platform/agent-process.js";
import type { AgentInvocation } from "../../src/domains/managed-work/types.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

describe("agent process command", () => {
  it("classifies only deterministic unresumable session failures", () => {
    const classify = (agentProcess as Record<string, unknown>)[
      "classifyUnresumableSessionFailure"
    ];

    expect(classify).toBeTypeOf("function");
    const classifier = classify as (input: {
      message: string;
      stdout?: string;
      stderr?: string;
    }) => string | null;
    expect(
      classifier({ message: "failed to resume: session not found" }),
    ).toBe("session_not_found");
    expect(
      classifier({
        message: "resume rejected: invalid session id",
      }),
    ).toBe("session_invalid");
    expect(
      classifier({
        message: "resume history exceeds the context window",
      }),
    ).toBe("resume_context_limit");
    expect(
      classifier({ message: "connection reset by peer" }),
    ).toBeNull();
    expect(
      classifier({ message: "unit test failed: assertion error session not found" }),
    ).toBeNull();
    expect(
      classifier({ message: "test output: resume session not found" }),
    ).toBeNull();
  });

  it("supplements a GUI-style macOS PATH with standard executable locations", () => {
    expect(
      managedExecutablePath(
        "/usr/bin:/bin",
        "darwin",
        (candidate) => candidate === "/opt/homebrew/bin",
      ),
    ).toBe("/usr/bin:/bin:/opt/homebrew/bin");
  });

  it("does not inject a personal directory into the managed PATH", () => {
    expect(managedExecutablePath("/usr/bin", "linux", () => true)).toBe(
      "/usr/bin:/usr/local/bin:/bin",
    );
  });

  it("uses explicit Codex session resume and never --last", () => {
    const invocation = fixture("codex", "executor");
    invocation.sessionId = "00000000-0000-4000-8000-000000000001";
    const command = buildAgentCommand(invocation);

    expect(command.args).toContain(invocation.sessionId);
    expect(command.args).not.toContain("--last");
    expect(command.args).not.toContain("--ephemeral");
    expect(command.args).toContain("--disable");
    expect(command.args).toContain("memories");
    expect(command.args).not.toContain("--ignore-user-config");
  });

  it(
    "disables native Codex memory for a new managed executor without bypassing user configuration",
    () => {
      const invocation = fixture("codex", "executor");
      const command = buildAgentCommand(invocation);

      expect(command.args).toContain("--disable");
      expect(command.args).toContain("memories");
      expect(command.args).toContain("--sandbox");
      expect(command.args).toContain("--output-schema");
      expect(command.args).not.toContain("--ignore-user-config");
      expect(command.args).not.toContain("--ephemeral");
    },
  );

  it("creates a continuous non-interactive Claude executor session", () => {
    const invocation = fixture("claude", "executor");
    invocation.promptPath = "/tmp/executor-prompt.md";
    invocation.systemPromptPath = "/tmp/executor-policy.md";
    const command = buildAgentCommand(invocation);

    expect(command.args).toContain("--session-id");
    expect(command.args).toContain("--bare");
    expect(command.initialSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(command.args).toContain("--tools");
    expect(command.args).not.toContain("--allowedTools");
    expect(command.args).not.toContain("dontAsk");
    expect(command.args).toContain("--include-partial-messages");
    expect(command.args).not.toContain("--max-turns");
    expect(command.args).not.toContain("--max-budget-usd");
    expect(command.args).toContain("--append-system-prompt-file");
    expect(command.args.join(" ")).not.toContain("/tmp/executor-prompt.md");
    expect(agentProcessInput(invocation)).toBe(
      "Read /tmp/executor-prompt.md completely and execute it.",
    );
    expect(command.args).toContain("--dangerously-skip-permissions");
  });

  it("compacts long Claude executor context before a 1M window becomes costly", () => {
    const invocation = fixture("claude", "executor");
    const env = buildAgentEnvironment(invocation, {});

    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe("200000");
    expect(env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE).toBe("70");
    expect(env.SUPERFLOW_MANAGED_CONTEXT_MANIFEST).toBe(
      path.join(
        invocation.projectRoot,
        ".superflow",
        "tasks",
        "task-1",
        "context-manifest.json",
      ),
    );
  });

  it("respects explicit Claude compaction settings and leaves other agents alone", () => {
    const claude = buildAgentEnvironment(fixture("claude", "executor"), {
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: "500000",
      CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "80",
    });
    const codex = buildAgentEnvironment(fixture("codex", "executor"), {});

    expect(claude.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe("500000");
    expect(claude.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE).toBe("80");
    expect(codex.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBeUndefined();
    expect(codex.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE).toBeUndefined();
  });

  it("treats the final Claude result usage as authoritative instead of summing events", () => {
    const empty = {
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      costUsd: null,
    };
    const intermediate = updateAgentUsage(empty, {
      usage: { input_tokens: 100, output_tokens: 10 },
      total_cost_usd: 0.1,
    });
    const final = updateAgentUsage(intermediate, {
      type: "result",
      usage: { input_tokens: 160, output_tokens: 15 },
      total_cost_usd: 0.2,
    });

    expect(final.inputTokens).toBe(160);
    expect(final.outputTokens).toBe(15);
    expect(final.costUsd).toBe(0.2);
  });

  it("passes a multi-repository Claude prompt through stdin", () => {
    const invocation = fixture("claude", "executor");
    invocation.promptPath = "/tmp/executor-prompt.md";
    invocation.writableRoots = ["/tmp/backend", "/tmp/frontend"];
    const command = buildAgentCommand(invocation);

    expect(command.args).toContain("/tmp/backend");
    expect(command.args).toContain("/tmp/frontend");
    expect(command.args.join(" ")).not.toContain("/tmp/executor-prompt.md");
    expect(agentProcessInput(invocation)).toContain(invocation.promptPath);
  });

  it("passes a resumed Claude session prompt through stdin", () => {
    const invocation = fixture("claude", "executor");
    invocation.promptPath = "/tmp/review-fix-prompt.md";
    invocation.sessionId = "00000000-0000-4000-8000-000000000001";
    const command = buildAgentCommand(invocation);

    expect(command.args).toContain("--resume");
    expect(command.args).toContain(invocation.sessionId);
    expect(command.args.join(" ")).not.toContain(invocation.promptPath);
    expect(agentProcessInput(invocation)).toContain(invocation.promptPath);
  });

  it("prevents idle macOS sleep while an Agent process is running", () => {
    expect(wrapWithSleepPrevention("claude", ["-p"], "darwin", true)).toEqual({
      command: "/usr/bin/caffeinate",
      args: ["-im", "claude", "-p"],
    });
    expect(wrapWithSleepPrevention("claude", ["-p"], "linux", true)).toEqual({
      command: "claude",
      args: ["-p"],
    });
  });

  it("keeps Claude supervisor read-only without bypass permissions", () => {
    const command = buildAgentCommand(fixture("claude", "supervisor"));

    expect(command.args).toContain("--allowedTools");
    expect(command.args).toContain("dontAsk");
    expect(command.args).toContain("--max-turns");
    expect(command.args).not.toContain("--dangerously-skip-permissions");
    expect(command.args).not.toContain("Write");
  });

  it("stops Claude after the third transient provider retry", () => {
    expect(
      shouldStopClaudeRetry({
        type: "system",
        subtype: "api_retry",
        attempt: 2,
        error_status: 529,
        error: "overloaded",
      }),
    ).toBe(false);
    expect(
      shouldStopClaudeRetry({
        type: "system",
        subtype: "api_retry",
        attempt: 3,
        error_status: 529,
        error: "overloaded",
      }),
    ).toBe(true);
    expect(
      shouldStopClaudeRetry({
        type: "system",
        subtype: "api_retry",
        attempt: 3,
        error_status: null,
        error: "unknown",
      }),
    ).toBe(false);
  });

  it("records permission denials for orchestration circuit breaking", () => {
    const telemetry = updateTelemetry(initialTelemetry(), {
      type: "result",
      permission_denials: [
        { tool: "Bash" },
        { tool: "Bash" },
        { tool: "Bash" },
      ],
    });

    expect(telemetry.permissionDenials).toBe(3);
  });

  it("leaves tool-running telemetry when the agent returns a result", () => {
    const running = updateTelemetry(initialTelemetry(), {
      type: "assistant",
      content: [{ type: "tool_use", name: "Bash" }],
    });
    const completed = updateTelemetry(running, {
      type: "result",
      permission_denials: [],
    });

    expect(running.phase).toBe("tool_running");
    expect(completed.phase).toBe("model_waiting");
    expect(completed.lastProgressReason).toBe("agent_result");
  });

  it("derives safe delivery stages from tool calls without persisting commands", () => {
    const startup = extractProgress({
      type: "assistant",
      content: [
        {
          type: "tool_use",
          name: "Bash",
          input: {
            command: "java -jar app.jar --password=do-not-persist",
          },
        },
      ],
    });
    const http = extractProgress({
      type: "tool_use",
      name: "Bash",
      input: {
        command: "curl -H 'token: do-not-persist' http://localhost/health",
      },
    });

    expect(startup).toBe("superflow-stage:application_startup");
    expect(http).toBe("superflow-stage:http_e2e");
    expect(`${startup}${http}`).not.toContain("do-not-persist");
  });

  it("keeps the supervisor read-only", () => {
    const invocation = fixture("codex", "supervisor");
    const command = buildAgentCommand(invocation);
    const sandbox = command.args.indexOf("--sandbox");
    expect(command.args[sandbox + 1]).toBe("read-only");
  });

  it("lets approved Java executors run project toolchains", () => {
    const invocation = fixture("claude", "executor");
    const command = buildAgentCommand(invocation);

    expect(command.args).toContain("--dangerously-skip-permissions");
    expect(command.args).toContain("Read,Write,Edit,Grep,Glob,Bash");
  });

  it("extracts redacted failure details from JSONL stdout", () => {
    const message = formatAgentFailure(
      "claude",
      1,
      '{"type":"result","is_error":true,"result":"service busy token=abc"}\n',
      "",
    );

    expect(message).toContain("service busy");
    expect(message).not.toContain("token=abc");
    expect(message).toContain("token=<redacted>");
  });

  it("reports Claude max-turn failures instead of hiding the reason", () => {
    const message = formatAgentFailure(
      "claude",
      1,
      `${JSON.stringify({
        type: "result",
        subtype: "error_max_turns",
        terminal_reason: "max_turns",
        errors: ["Reached maximum number of turns (40)"],
      })}\n`,
      "",
    );

    expect(message).toContain("max_turns");
    expect(message).toContain("Reached maximum number of turns (40)");
    expect(message).not.toContain("未返回错误详情");
  });

  it("formats Agent failures in English when requested", () => {
    const message = formatAgentFailure("claude", 1, "", "service busy", "en");

    expect(message).toContain("invocation failed with exit code 1");
    expect(message).not.toMatch(/[\p{Script=Han}]/u);
  });
});

function fixture(
  agent: AgentInvocation["agent"],
  role: AgentInvocation["role"],
): AgentInvocation {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-command-"));
  roots.push(root);
  const schemaPath = path.join(root, "schema.json");
  fs.writeFileSync(schemaPath, '{"type":"object"}');
  return {
    taskId: "task-1",
    runId: "run-1",
    role,
    agent,
    projectRoot: root,
    writableRoots: [],
    prompt: "test",
    schemaPath,
    sessionId: null,
    timeout: { warningMs: 1_000, stalledMs: 2_000, hardMs: 3_000 },
  };
}
