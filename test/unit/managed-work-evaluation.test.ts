import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  evaluateManagedTask,
  summarizeManagedEvaluations,
  type ManagedEvaluation,
} from "../../src/domains/managed-work/evaluation.js";

describe("managed work offline evaluation", () => {
  it("summarizes one persisted delivery without invoking an Agent", () => {
    const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-eval-"));
    const runDir = path.join(taskDir, "runs", "run-smoke");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, "task.json"),
      JSON.stringify({ taskId: "task-smoke" }),
    );
    fs.writeFileSync(
      path.join(runDir, "run-state.json"),
      JSON.stringify({
        runId: "run-smoke",
        status: "awaiting_git_approval",
        profile: "engineering",
        executorInvocations: 3,
        executorInvocationCredits: 1,
        reviewRound: 1,
        activeRunMilliseconds: 120000,
        startedAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:03:00.000Z",
        completedAt: "2026-08-11T00:03:00.000Z",
        executorUsage: {
          inputTokens: 800,
          outputTokens: 200,
          cacheReadTokens: 3200,
          cacheWriteTokens: 0,
          costUsd: 0.5,
        },
      }),
    );
    fs.writeFileSync(
      path.join(runDir, "progress.jsonl"),
      [
        JSON.stringify({ eventType: "executor.stage_changed" }),
        JSON.stringify({ eventType: "executor.command_completed" }),
        JSON.stringify({ eventType: "executor.supervision_checkpoint" }),
        JSON.stringify({ eventType: "host.review_required_notified" }),
        JSON.stringify({ eventType: "human.message_received" }),
        JSON.stringify({ eventType: "human.guidance_resumed" }),
        JSON.stringify({ eventType: "budget.limit_increased" }),
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(runDir, "task-report.md"),
      "cleanup PASS; zero-residue PASS\n",
    );
    fs.writeFileSync(
      path.join(runDir, "review-result-1.json"),
      JSON.stringify({ result: "pass", summary: "pass", findings: [] }),
    );

    const [result] = evaluateManagedTask(taskDir);
    expect(result.executor).toEqual({
      physicalInvocations: 3,
      creditedInvocations: 1,
      effectiveInvocations: 2,
    });
    expect(result.usage.cacheHitRatio).toBe(0.8);
    expect(result.progress).toMatchObject({
      milestoneEvents: 2,
      humanInterventions: 3,
      humanInterventionBreakdown: {
        guidance: 2,
        control: 0,
        budgetApproval: 1,
      },
      usefulMilestonesPerInvocation: 1,
      supervision: {
        effectiveCheckpoints: 1,
        idleCheckpoints: 0,
        idleEscalations: 0,
        hostWakeups: 1,
      },
    });
    expect(result.quality).toMatchObject({
      terminalDelivery: true,
      cleanupEvidence: true,
      zeroResidueEvidence: true,
      firstReviewPassed: true,
      blockingFindings: 0,
      blockingFindingCategories: [],
      closedBlockingFindings: 0,
    });
    expect(result.progress.tokensPerMilestone).toBe(500);
    expect(result.elapsed.waiting).toEqual({
      hostReviewMilliseconds: 0,
      connectivityMilliseconds: 0,
      userActionMilliseconds: 0,
      unattributedMilliseconds: 60000,
    });
    expect(result.diagnosis.verdict).toBe("needs_improvement");
    expect(result.diagnosis.reasons).toContain(
      "首轮 Host 评审通过，说明首次交付完整度高。",
    );
    fs.rmSync(taskDir, { recursive: true, force: true });
  });

  it("keeps compatibility with legacy type events", () => {
    const taskDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow-eval-legacy-"),
    );
    const runDir = path.join(taskDir, "runs", "run-legacy");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, "task.json"),
      JSON.stringify({ taskId: "task-legacy" }),
    );
    fs.writeFileSync(
      path.join(runDir, "run-state.json"),
      JSON.stringify({
        runId: "run-legacy",
        status: "running",
        profile: "quick",
        executorInvocations: 1,
        reviewRound: 0,
        activeRunMilliseconds: 1,
        startedAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:01.000Z",
      }),
    );
    fs.writeFileSync(
      path.join(runDir, "progress.jsonl"),
      JSON.stringify({ type: "executor.stage_changed" }),
    );

    const [result] = evaluateManagedTask(taskDir);
    expect(result.progress.milestoneEvents).toBe(1);
    fs.rmSync(taskDir, { recursive: true, force: true });
  });

  it("reads only Runner-confirmed project acceptance reports for cleanup metrics", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow-eval-project-report-"),
    );
    const taskDir = path.join(projectRoot, ".superflow", "tasks", "task-report");
    const runDir = path.join(taskDir, "runs", "run-report");
    fs.mkdirSync(path.join(projectRoot, "reports"), { recursive: true });
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, "task.json"),
      JSON.stringify({ taskId: "task-report", projectRoot }),
    );
    fs.writeFileSync(
      path.join(runDir, "run-state.json"),
      JSON.stringify({
        runId: "run-report",
        projectRoot,
        status: "release_ready",
        profile: "engineering",
        executorInvocations: 1,
        reviewRound: 1,
        activeRunMilliseconds: 1,
        startedAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:01.000Z",
      }),
    );
    fs.writeFileSync(
      path.join(runDir, "review-facts-1.json"),
      JSON.stringify({
        workspace: {
          changedFiles: [
            "reports/acceptance-report.md",
            "../outside-report.md",
            "/tmp/outside-report.md",
            "src/server.ts",
          ],
        },
      }),
    );
    fs.writeFileSync(
      path.join(projectRoot, "reports", "acceptance-report.md"),
      "owner cleanup complete; zero residue\n",
    );

    const [result] = evaluateManagedTask(taskDir);
    expect(result.quality).toMatchObject({
      cleanupEvidence: true,
      zeroResidueEvidence: true,
    });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("attributes non-active time by persisted waiting status before using unattributed time", () => {
    const taskDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow-eval-wait-"),
    );
    const runDir = path.join(taskDir, "runs", "run-wait");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, "task.json"),
      JSON.stringify({ taskId: "task-wait" }),
    );
    fs.writeFileSync(
      path.join(runDir, "run-state.json"),
      JSON.stringify({
        runId: "run-wait",
        status: "local_delivery_ready",
        profile: "engineering",
        executorInvocations: 1,
        reviewRound: 1,
        activeRunMilliseconds: 120000,
        startedAt: "2026-08-11T00:00:00.000Z",
        completedAt: "2026-08-11T00:10:00.000Z",
      }),
    );
    fs.writeFileSync(
      path.join(runDir, "progress.jsonl"),
      [
        JSON.stringify({
          eventType: "review.external_requested",
          timestamp: "2026-08-11T00:02:00.000Z",
          status: "waiting_for_host_review",
        }),
        JSON.stringify({
          eventType: "human.review_submitted",
          timestamp: "2026-08-11T00:04:00.000Z",
          status: "running",
        }),
        JSON.stringify({
          eventType: "connectivity.lost",
          timestamp: "2026-08-11T00:06:00.000Z",
          status: "waiting_for_connectivity",
        }),
        JSON.stringify({
          eventType: "executor.resumed",
          timestamp: "2026-08-11T00:07:00.000Z",
          status: "running",
        }),
      ].join("\n"),
    );

    const [result] = evaluateManagedTask(taskDir);
    expect(result.elapsed.waiting).toEqual({
      hostReviewMilliseconds: 120000,
      connectivityMilliseconds: 60000,
      userActionMilliseconds: 0,
      unattributedMilliseconds: 300000,
    });
    fs.rmSync(taskDir, { recursive: true, force: true });
  });

  it("explains repair convergence and recommends prompt or gate improvements", () => {
    const taskDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "superflow-eval-repair-"),
    );
    const runDir = path.join(taskDir, "runs", "run-repair");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, "task.json"),
      JSON.stringify({ taskId: "task-repair", language: "en" }),
    );
    fs.writeFileSync(
      path.join(runDir, "run-state.json"),
      JSON.stringify({
        runId: "run-repair",
        status: "release_ready",
        profile: "engineering",
        executorInvocations: 2,
        reviewRound: 2,
        activeRunMilliseconds: 60000,
        startedAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:02:00.000Z",
        completedAt: "2026-08-11T00:02:00.000Z",
      }),
    );
    fs.writeFileSync(
      path.join(runDir, "progress.jsonl"),
      JSON.stringify({ eventType: "run.delivery_ready" }),
    );
    fs.writeFileSync(
      path.join(runDir, "review-result-1.json"),
      JSON.stringify({
        result: "needs_fix",
        summary: "repair",
        findings: [
          {
            id: "F-1",
            blocking: true,
            severity: "high",
            category: "test",
            target: "script",
            evidence: "missing",
            risk: "not portable",
            requiredFix: "fix",
            acceptanceChecks: ["verify"],
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(runDir, "review-result-2.json"),
      JSON.stringify({ result: "pass", summary: "pass", findings: [] }),
    );

    const [result] = evaluateManagedTask(taskDir);
    expect(result.quality).toMatchObject({
      firstReviewPassed: false,
      blockingFindings: 1,
      blockingFindingCategories: ["test"],
      closedBlockingFindings: 1,
      repairClosureRatio: 1,
    });
    expect(result.diagnosis.verdict).toBe("good");
    expect(result.diagnosis.reasons.join(" ")).toContain(
      "All blocking findings were closed",
    );
    expect(result.diagnosis.recommendations.join(" ")).toContain(
      "frozen prompt, preflight, or Host checklist",
    );
    fs.rmSync(taskDir, { recursive: true, force: true });
  });

  it("aggregates comparable persisted runs into an offline baseline", () => {
    const baseline = summarizeManagedEvaluations([
      evaluation({
        executor: {
          physicalInvocations: 1,
          creditedInvocations: 0,
          effectiveInvocations: 1,
        },
        hostReviewRounds: 1,
        elapsed: {
          activeMilliseconds: 60000,
          wallMilliseconds: 90000,
          waiting: emptyWaiting(),
        },
        progress: {
          milestoneEvents: 3,
          tokensPerMilestone: 100,
          humanInterventions: 0,
          supervision: {
            effectiveCheckpoints: 1,
            idleCheckpoints: 0,
            idleEscalations: 0,
            hostWakeups: 1,
          },
        },
      }),
      evaluation({
        executor: {
          physicalInvocations: 3,
          creditedInvocations: 1,
          effectiveInvocations: 2,
        },
        hostReviewRounds: 1,
        elapsed: {
          activeMilliseconds: 120000,
          wallMilliseconds: 150000,
          waiting: emptyWaiting(),
        },
        progress: {
          milestoneEvents: 2,
          tokensPerMilestone: 300,
          humanInterventions: 1,
          supervision: {
            effectiveCheckpoints: 2,
            idleCheckpoints: 1,
            idleEscalations: 0,
            hostWakeups: 1,
          },
        },
        quality: { terminalDelivery: false, firstReviewPassed: false },
      }),
    ]);

    expect(baseline).toMatchObject({
      sampleSize: 2,
      deliveryReady: { count: 1, rate: 0.5 },
      firstReviewPass: { reviewedRuns: 2, count: 1, rate: 0.5 },
      effectiveInvocations: { average: 1.5, p50: 1, p95: 2 },
      tokensPerMilestone: { average: 200, p50: 100, p95: 300 },
      humanIntervention: { runs: 1, rate: 0.5 },
      supervision: {
        hostWakeups: 2,
        effectiveCheckpoints: 3,
        idleCheckpoints: 1,
        idleEscalations: 0,
      },
    });
  });
});

function evaluation(
  overrides: Partial<ManagedEvaluation> & {
    executor?: ManagedEvaluation["executor"];
    elapsed?: ManagedEvaluation["elapsed"];
    progress?: Partial<ManagedEvaluation["progress"]>;
    quality?: Partial<ManagedEvaluation["quality"]>;
  },
): ManagedEvaluation {
  const { executor, elapsed, progress, quality, ...rest } = overrides;
  return {
    schemaVersion: 1,
    taskId: "task",
    runId: "run",
    status: "release_ready",
    profile: "engineering",
    executor: executor ?? {
      physicalInvocations: 1,
      creditedInvocations: 0,
      effectiveInvocations: 1,
    },
    hostReviewRounds: 1,
    usage: {
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheHitRatio: null,
      costUsd: null,
    },
    progress: {
      milestoneEvents: 1,
      supervision: {
        effectiveCheckpoints: 0,
        idleCheckpoints: 0,
        idleEscalations: 0,
        hostWakeups: 0,
      },
      humanInterventions: 0,
      humanInterventionBreakdown: {
        guidance: 0,
        control: 0,
        budgetApproval: 0,
      },
      usefulMilestonesPerInvocation: 1,
      tokensPerMilestone: null,
      ...progress,
    },
    elapsed: {
      activeMilliseconds: 0,
      wallMilliseconds: 0,
      waiting: emptyWaiting(),
      ...elapsed,
    },
    quality: {
      terminalDelivery: true,
      cleanupEvidence: true,
      zeroResidueEvidence: true,
      firstReviewPassed: true,
      blockingFindings: 0,
      blockingFindingCategories: [],
      closedBlockingFindings: 0,
      repairClosureRatio: null,
      ...quality,
    },
    diagnosis: { verdict: "excellent", reasons: [], recommendations: [] },
    ...rest,
  };
}

function emptyWaiting(): ManagedEvaluation["elapsed"]["waiting"] {
  return {
    hostReviewMilliseconds: 0,
    connectivityMilliseconds: 0,
    userActionMilliseconds: 0,
    unattributedMilliseconds: 0,
  };
}
