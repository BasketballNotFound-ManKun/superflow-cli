import { describe, expect, it } from "vitest";
import { assertManagedAgentPair } from "../../src/domains/managed-work/pair-admission.js";
import { hookScriptsForAgent } from "../../src/domains/skill/assets.js";

function healthyRuntime() {
  return {
    executable: () => true,
    exists: () => true,
    readFile: (file: string) => hookSettings(
      file.includes(".claude/") ? "claude" : "codex",
    ),
    mcpServerPath: "/superflow/dist/mcp/server.js",
    run: () => ({
      status: 0,
      stdout: "superflow /superflow/dist/mcp/server.js",
      stderr: "",
    }),
  };
}

function hookSettings(agent: "codex" | "claude"): string {
  const directory = agent === "claude" ? "/scripts/" : "/hooks/";
  return JSON.stringify({
    hooks: {
      PreToolUse: [{
        hooks: hookScriptsForAgent(agent).map((script) => ({
          command: `${directory}${script}`,
        })),
      }],
    },
  });
}

describe("managed work pair admission", () => {
  it("accepts two distinct hosts only when both local installations are healthy", () => {
    expect(() =>
      assertManagedAgentPair("codex", "claude", healthyRuntime()),
    ).not.toThrow();
  });

  it("rejects using one host for both roles before task creation", () => {
    expect(() =>
      assertManagedAgentPair("codex", "codex", healthyRuntime()),
    ).toThrow("不同的智能体");
  });

  it("rejects a missing asset and gives a repair command", () => {
    const runtime = healthyRuntime();
    runtime.exists = (file: string) => !file.endsWith("superflow-pipeline/SKILL.md");

    expect(() => assertManagedAgentPair("codex", "claude", runtime)).toThrow(
      "superflow update --agent codex --scope global",
    );
  });

  it("rejects an incomplete MCP registration even when files and hooks exist", () => {
    const runtime = healthyRuntime();
    runtime.run = () => ({ status: 0, stdout: "superflow /old/server.js", stderr: "" });

    expect(() => assertManagedAgentPair("codex", "claude", runtime)).toThrow(
      "未指向当前运行时",
    );
  });
});
