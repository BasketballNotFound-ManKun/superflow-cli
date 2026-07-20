import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAgentCommand,
  formatAgentFailure,
} from "../../src/platform/agent-process.js";
import type { AgentInvocation } from "../../src/domains/managed-work/types.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

describe("agent process command", () => {
  it("uses explicit Codex session resume and never --last", () => {
    const invocation = fixture("codex", "executor");
    invocation.sessionId = "00000000-0000-4000-8000-000000000001";
    const command = buildAgentCommand(invocation);

    expect(command.args).toContain(invocation.sessionId);
    expect(command.args).not.toContain("--last");
    expect(command.args).not.toContain("--ephemeral");
  });

  it("creates a persistent Claude session and uses safe permissions", () => {
    const invocation = fixture("claude", "executor");
    const command = buildAgentCommand(invocation);

    expect(command.args).toContain("--session-id");
    expect(command.initialSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(command.args).toContain("auto");
    expect(command.args).not.toContain("--dangerously-skip-permissions");
  });

  it("keeps the supervisor read-only", () => {
    const invocation = fixture("codex", "supervisor");
    const command = buildAgentCommand(invocation);
    const sandbox = command.args.indexOf("--sandbox");
    expect(command.args[sandbox + 1]).toBe("read-only");
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
