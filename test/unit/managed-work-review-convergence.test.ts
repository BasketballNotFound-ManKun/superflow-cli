import { describe, expect, it } from "vitest";
import { assessReviewConvergence } from "../../src/domains/managed-work/review-convergence.js";
import type { ReviewResult } from "../../src/domains/managed-work/types.js";

describe("managed review convergence", () => {
  it("stops after two transitions without resolving any finding", () => {
    const decision = assessReviewConvergence([
      review("R-1"),
      review("R-1", "R-2"),
      review("R-1", "R-2"),
    ]);
    expect(decision).toEqual({
      shouldContinue: false,
      stagnantTransitions: 2,
      previousBlocking: 2,
      currentBlocking: 2,
    });
  });

  it("keeps repairing when the blocking set materially shrinks", () => {
    const decision = assessReviewConvergence([
      review("R-1", "R-2"),
      review("R-2"),
      review("R-2"),
    ]);
    expect(decision.shouldContinue).toBe(true);
    expect(decision.stagnantTransitions).toBe(1);
  });

  it("does not mistake a renumbered finding on the same scope for progress", () => {
    const first = review("R-1");
    const second = review("R-2");
    const third = review("R-3");
    second.findings[0].target = first.findings[0].target;
    third.findings[0].target = first.findings[0].target;
    const decision = assessReviewConvergence([first, second, third]);
    expect(decision.shouldContinue).toBe(false);
  });
});

function review(...ids: string[]): ReviewResult {
  return {
    result: "needs_fix",
    summary: "needs repair",
    findings: ids.map((id) => ({
      id,
      severity: "high",
      blocking: true,
      category: "correctness",
      target: `${id}.ts`,
      evidence: "failed assertion",
      risk: "incorrect result",
      requiredFix: "fix the assertion",
      acceptanceChecks: ["run test"],
    })),
  };
}
