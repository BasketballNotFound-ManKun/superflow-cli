import { describe, expect, it } from "vitest";
import {
  buildExecutorPolicy,
  stableExecutorPolicy,
  stableExecutorPolicyHash,
} from "../../src/domains/managed-work/executor-policy.js";

describe("managed executor stable policy", () => {
  it("keeps one stable prefix across different task contexts", () => {
    const java = buildExecutorPolicy({
      ruleSelection: {
        scenarios: ["core", "java"],
        files: ["/repo/AGENTS.md"],
      },
      toolchainFacts: ["- java: /jdk/bin/java"],
      ownerTemplate: "/assets/owner.sh",
      preflightCommand: "node preflight.js /repo task-a",
      compatibilityContinuation: false,
      freshRecovery: false,
      deliveryProtocolRecovery: false,
    });
    const frontend = buildExecutorPolicy({
      ruleSelection: {
        scenarios: ["core", "frontend"],
        files: ["C:\\repo\\AGENTS.md"],
      },
      toolchainFacts: ["- node: C:\\node.exe"],
      ownerTemplate: "C:\\assets\\owner.cmd",
      preflightCommand: "node preflight.js C:\\repo task-b",
      compatibilityContinuation: true,
      freshRecovery: false,
      deliveryProtocolRecovery: false,
    });

    expect(java.startsWith(stableExecutorPolicy())).toBe(true);
    expect(frontend.startsWith(stableExecutorPolicy())).toBe(true);
    expect(stableExecutorPolicyHash()).toMatch(/^[a-f0-9]{64}$/);
    expect(java).toContain("task-a");
    expect(frontend).toContain("task-b");
  });
});
