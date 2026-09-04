import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import type {
  ManagedRunState,
  ManagedTaskContract,
  ReviewResult,
} from "./types.js";

export interface ManagedEvaluation {
  schemaVersion: 1;
  taskId: string;
  runId: string;
  status: ManagedRunState["status"];
  profile: ManagedRunState["profile"];
  executor: {
    physicalInvocations: number;
    creditedInvocations: number;
    effectiveInvocations: number;
  };
  hostReviewRounds: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    cacheHitRatio: number | null;
    costUsd: number | null;
  };
  progress: {
    milestoneEvents: number;
    supervision: {
      effectiveCheckpoints: number;
      idleCheckpoints: number;
      idleEscalations: number;
      hostWakeups: number;
    };
    humanInterventions: number;
    humanInterventionBreakdown: {
      guidance: number;
      control: number;
      budgetApproval: number;
    };
    usefulMilestonesPerInvocation: number | null;
    tokensPerMilestone: number | null;
  };
  elapsed: {
    activeMilliseconds: number;
    wallMilliseconds: number;
    waiting: {
      hostReviewMilliseconds: number;
      connectivityMilliseconds: number;
      userActionMilliseconds: number;
      unattributedMilliseconds: number;
    };
  };
  quality: {
    terminalDelivery: boolean;
    cleanupEvidence: boolean;
    zeroResidueEvidence: boolean;
    firstReviewPassed: boolean;
    blockingFindings: number;
    blockingFindingCategories: string[];
    closedBlockingFindings: number;
    repairClosureRatio: number | null;
  };
  diagnosis: {
    verdict: "excellent" | "good" | "needs_improvement" | "poor";
    reasons: string[];
    recommendations: string[];
  };
}

export interface ManagedEvaluationBaseline {
  schemaVersion: 1;
  sampleSize: number;
  deliveryReady: { count: number; rate: number | null };
  firstReviewPass: {
    reviewedRuns: number;
    count: number;
    rate: number | null;
  };
  effectiveInvocations: EvaluationDistribution;
  hostReviewRounds: EvaluationDistribution;
  activeMilliseconds: EvaluationDistribution;
  wallMilliseconds: EvaluationDistribution;
  tokensPerMilestone: EvaluationDistribution;
  humanIntervention: { runs: number; rate: number | null };
  supervision: {
    hostWakeups: number;
    effectiveCheckpoints: number;
    idleCheckpoints: number;
    idleEscalations: number;
  };
}

interface EvaluationDistribution {
  average: number | null;
  p50: number | null;
  p95: number | null;
}

interface ProgressEvent {
  eventType?: string;
  type?: string;
  timestamp?: string;
  status?: ManagedRunState["status"];
}

export function evaluateManagedTask(taskPath: string): ManagedEvaluation[] {
  const taskDir = resolveTaskDir(taskPath);
  const contract = readJson<ManagedTaskContract>(
    path.join(taskDir, "task.json"),
  );
  const runsDir = path.join(taskDir, "runs");
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir)
    .filter((name) => name.startsWith("run-"))
    .map((name) => path.join(runsDir, name))
    .filter((runDir) => existsSync(path.join(runDir, "run-state.json")))
    .sort()
    .map((runDir) => evaluateRun(contract, runDir));
}

/**
 * Aggregates persisted runs only. Callers must keep task type, Host/Executor,
 * environment, and version comparable before treating this as a trend.
 */
export function summarizeManagedEvaluations(
  evaluations: ManagedEvaluation[],
): ManagedEvaluationBaseline {
  const reviewed = evaluations.filter((item) => item.hostReviewRounds > 0);
  const deliveryReady = evaluations.filter(
    (item) => item.quality.terminalDelivery,
  );
  const firstReviewPass = reviewed.filter(
    (item) => item.quality.firstReviewPassed,
  );
  const humanInterventionRuns = evaluations.filter(
    (item) => item.progress.humanInterventions > 0,
  );
  return {
    schemaVersion: 1,
    sampleSize: evaluations.length,
    deliveryReady: {
      count: deliveryReady.length,
      rate: ratio(deliveryReady.length, evaluations.length),
    },
    firstReviewPass: {
      reviewedRuns: reviewed.length,
      count: firstReviewPass.length,
      rate: ratio(firstReviewPass.length, reviewed.length),
    },
    effectiveInvocations: distribution(
      evaluations.map((item) => item.executor.effectiveInvocations),
    ),
    hostReviewRounds: distribution(
      evaluations.map((item) => item.hostReviewRounds),
    ),
    activeMilliseconds: distribution(
      evaluations.map((item) => item.elapsed.activeMilliseconds),
    ),
    wallMilliseconds: distribution(
      evaluations.map((item) => item.elapsed.wallMilliseconds),
    ),
    tokensPerMilestone: distribution(
      evaluations.flatMap((item) =>
        item.progress.tokensPerMilestone === null
          ? []
          : [item.progress.tokensPerMilestone],
      ),
    ),
    humanIntervention: {
      runs: humanInterventionRuns.length,
      rate: ratio(humanInterventionRuns.length, evaluations.length),
    },
    supervision: evaluations.reduce(
      (total, item) => ({
        hostWakeups: total.hostWakeups + item.progress.supervision.hostWakeups,
        effectiveCheckpoints:
          total.effectiveCheckpoints +
          item.progress.supervision.effectiveCheckpoints,
        idleCheckpoints:
          total.idleCheckpoints + item.progress.supervision.idleCheckpoints,
        idleEscalations:
          total.idleEscalations + item.progress.supervision.idleEscalations,
      }),
      {
        hostWakeups: 0,
        effectiveCheckpoints: 0,
        idleCheckpoints: 0,
        idleEscalations: 0,
      },
    ),
  };
}

function evaluateRun(
  contract: ManagedTaskContract,
  runDir: string,
): ManagedEvaluation {
  const state = readJson<ManagedRunState>(path.join(runDir, "run-state.json"));
  const events = readEvents(path.join(runDir, "progress.jsonl"));
  const credits = state.executorInvocationCredits ?? 0;
  const effectiveInvocations = Math.max(0, state.executorInvocations - credits);
  const milestoneEvents = events.filter(isMilestone).length;
  const supervision = summarizeSupervision(events);
  const humanInterventionBreakdown = countHumanInterventions(events);
  const humanInterventions =
    humanInterventionBreakdown.guidance +
    humanInterventionBreakdown.control +
    humanInterventionBreakdown.budgetApproval;
  const input = state.executorUsage?.inputTokens ?? null;
  const cacheRead = state.executorUsage?.cacheReadTokens ?? null;
  const startedAt = Date.parse(state.startedAt);
  const endedAt = Date.parse(state.completedAt ?? state.updatedAt);
  const evidenceText = readEvidenceText(
    runDir,
    state.projectRoot ?? contract.projectRoot,
  );
  const reviews = readReviews(runDir);
  const firstReviewPassed = reviews[0]?.result === "pass";
  const blockingIds = new Set(
    reviews.flatMap((review) =>
      review.findings
        .filter((finding) => finding.blocking)
        .map((finding) => finding.id),
    ),
  );
  const blockingFindingCategories = [
    ...new Set(
      reviews.flatMap((review) =>
        review.findings
          .filter((finding) => finding.blocking)
          .map((finding) => finding.category),
      ),
    ),
  ].sort();
  const remainingBlockingIds = new Set(
    reviews
      .at(-1)
      ?.findings.filter((finding) => finding.blocking)
      .map((finding) => finding.id) ?? [],
  );
  const closedBlockingFindings = [...blockingIds].filter(
    (id) => !remainingBlockingIds.has(id),
  ).length;
  const totalTokens =
    (state.executorUsage?.inputTokens ?? 0) +
    (state.executorUsage?.outputTokens ?? 0);
  const wallMilliseconds =
    Number.isFinite(startedAt) && Number.isFinite(endedAt)
      ? Math.max(0, endedAt - startedAt)
      : 0;
  const waiting = classifyWaitingTime(
    events,
    startedAt,
    endedAt,
    state.activeRunMilliseconds,
  );
  const diagnostics = diagnose({
    language: contract.language ?? "zh",
    terminalDelivery: terminalDelivery(state.status),
    effectiveInvocations,
    reviewRounds: state.reviewRound,
    firstReviewPassed,
    blockingFindings: blockingIds.size,
    blockingFindingCategories,
    closedBlockingFindings,
    humanInterventions,
    milestoneEvents,
    supervision,
    activeMilliseconds: state.activeRunMilliseconds,
    wallMilliseconds,
    waiting,
    transientCredits: credits,
  });
  return {
    schemaVersion: 1,
    taskId: contract.taskId,
    runId: state.runId,
    status: state.status,
    profile: state.profile,
    executor: {
      physicalInvocations: state.executorInvocations,
      creditedInvocations: credits,
      effectiveInvocations,
    },
    hostReviewRounds: state.reviewRound,
    usage: {
      inputTokens: input,
      outputTokens: state.executorUsage?.outputTokens ?? null,
      cacheReadTokens: cacheRead,
      cacheHitRatio:
        input !== null && cacheRead !== null && input + cacheRead > 0
          ? cacheRead / (input + cacheRead)
          : null,
      costUsd: state.executorUsage?.costUsd ?? null,
    },
    progress: {
      milestoneEvents,
      supervision,
      humanInterventions,
      humanInterventionBreakdown,
      usefulMilestonesPerInvocation:
        effectiveInvocations > 0
          ? milestoneEvents / effectiveInvocations
          : null,
      tokensPerMilestone:
        milestoneEvents > 0 ? totalTokens / milestoneEvents : null,
    },
    elapsed: {
      activeMilliseconds: state.activeRunMilliseconds,
      wallMilliseconds,
      waiting,
    },
    quality: {
      terminalDelivery: terminalDelivery(state.status),
      cleanupEvidence: /cleanup|清理/i.test(evidenceText),
      zeroResidueEvidence: /zero[- ]?residue|零残留|无残留/i.test(evidenceText),
      firstReviewPassed,
      blockingFindings: blockingIds.size,
      blockingFindingCategories,
      closedBlockingFindings,
      repairClosureRatio:
        blockingIds.size > 0 ? closedBlockingFindings / blockingIds.size : null,
    },
    diagnosis: diagnostics,
  };
}

function terminalDelivery(status: ManagedRunState["status"]): boolean {
  return [
    "local_delivery_ready",
    "release_ready",
    "awaiting_git_approval",
    "completed",
  ].includes(status);
}

function readReviews(runDir: string): ReviewResult[] {
  return readdirSync(runDir)
    .filter((name) => /^review-result-\d+\.json$/.test(name))
    .sort(
      (left, right) =>
        Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]),
    )
    .flatMap((name) => {
      try {
        return [readJson<ReviewResult>(path.join(runDir, name))];
      } catch {
        return [];
      }
    });
}

function diagnose(input: {
  language: ManagedTaskContract["language"];
  terminalDelivery: boolean;
  effectiveInvocations: number;
  reviewRounds: number;
  firstReviewPassed: boolean;
  blockingFindings: number;
  blockingFindingCategories: string[];
  closedBlockingFindings: number;
  humanInterventions: number;
  milestoneEvents: number;
  supervision: ManagedEvaluation["progress"]["supervision"];
  activeMilliseconds: number;
  wallMilliseconds: number;
  waiting: ManagedEvaluation["elapsed"]["waiting"];
  transientCredits: number;
}): ManagedEvaluation["diagnosis"] {
  const en = input.language === "en";
  const reasons: string[] = [];
  const recommendations: string[] = [];
  if (input.terminalDelivery) {
    reasons.push(
      en
        ? "The run reached a delivery-ready terminal state."
        : "任务已达到交付就绪终态。",
    );
  } else {
    reasons.push(
      en
        ? "The run has not reached a delivery-ready terminal state."
        : "任务尚未达到交付就绪终态。",
    );
    recommendations.push(
      en
        ? "Close the current blocker before optimizing cost or speed."
        : "先关闭当前阻塞，再优化成本或速度。",
    );
  }
  if (input.firstReviewPassed) {
    reasons.push(
      en
        ? "The first Host review passed, indicating a complete initial delivery."
        : "首轮 Host 评审通过，说明首次交付完整度高。",
    );
  } else if (input.reviewRounds > 0) {
    const categories = input.blockingFindingCategories.join(", ");
    reasons.push(
      en
        ? `The first review found ${input.blockingFindings} distinct blocking issue(s)${categories ? ` in: ${categories}` : ""}.`
        : `首轮未通过，共发现 ${input.blockingFindings} 个不同阻断问题${categories ? `，类别：${categories}` : ""}。`,
    );
    recommendations.push(
      en
        ? "Move recurring first-round findings into the frozen prompt, preflight, or Host checklist."
        : "把重复出现的首轮问题下沉到冻结 Prompt、preflight 或 Host checklist。",
    );
  }
  if (
    input.blockingFindings > 0 &&
    input.closedBlockingFindings === input.blockingFindings
  ) {
    reasons.push(
      en
        ? "All blocking findings were closed in later repair rounds."
        : "所有阻断问题均在后续整改轮关闭。",
    );
  }
  if (input.effectiveInvocations > 2 || input.reviewRounds > 2) {
    recommendations.push(
      en
        ? "Reduce fragmented executor returns and require one complete repair batch per invocation."
        : "减少碎片化返回，要求每次调用成批完成全部整改。",
    );
  }
  const idleRatio =
    input.wallMilliseconds > 0
      ? Math.max(0, input.wallMilliseconds - input.activeMilliseconds) /
        input.wallMilliseconds
      : 0;
  if (idleRatio > 0.35) {
    reasons.push(
      en
        ? `Non-active waiting consumed ${(idleRatio * 100).toFixed(0)}% of wall time.`
        : `非活跃等待占墙钟时间 ${(idleRatio * 100).toFixed(0)}%。`,
    );
    if (input.waiting.hostReviewMilliseconds > 0) {
      recommendations.push(
        en
          ? "Reduce Host review handoff latency or improve first-round contract completeness."
          : "缩短 Host 评审交接等待，或提高首轮合同完整度。",
      );
    }
    if (input.waiting.connectivityMilliseconds > 0) {
      recommendations.push(
        en
          ? "Separate provider/connectivity recovery from effective development time and inspect provider reliability."
          : "将供应商/连接恢复与有效研发时间分离统计，并排查供应商稳定性。",
      );
    }
    if (input.waiting.userActionMilliseconds > 0) {
      recommendations.push(
        en
          ? "Record pause/resume intent separately from engineering throughput."
          : "将暂停/恢复等用户控制与研发吞吐分开统计。",
      );
    }
    if (input.waiting.unattributedMilliseconds > 0) {
      recommendations.push(
        en
          ? "Add interruption telemetry to distinguish sleep, scheduling delay, and unclassified waiting."
          : "补充中断遥测，区分休眠、调度延迟和未归类等待。",
      );
    }
  }
  if (input.milestoneEvents === 0 && input.effectiveInvocations > 0) {
    reasons.push(
      en
        ? "Executor calls produced no recorded useful milestone."
        : "研发调用没有产生已记录的有效里程碑。",
    );
    recommendations.push(
      en
        ? "Audit stage emission and stop no-progress sessions earlier."
        : "核查阶段事件上报，并更早终止无进展会话。",
    );
  }
  if (input.supervision.idleEscalations > 0) {
    reasons.push(
      en
        ? `${input.supervision.idleEscalations} idle-supervision escalation(s) woke the Host.`
        : `${input.supervision.idleEscalations} 次连续无有效里程碑监督升级唤醒了 Host。`,
    );
    recommendations.push(
      en
        ? "Reduce no-progress intervals; active model output alone is not a useful milestone."
        : "缩短无进展区间；只有模型持续输出不等于有效里程碑。",
    );
  }
  if (input.humanInterventions > 0) {
    recommendations.push(
      en
        ? "Classify human interventions and automate repeated non-owner decisions."
        : "分类人工介入原因，把重复的非业务决策自动化。",
    );
  }
  if (input.transientCredits > 0) {
    reasons.push(
      en
        ? `${input.transientCredits} provider/infrastructure invocation(s) were credited.`
        : `${input.transientCredits} 次供应商或基础设施调用已抵扣。`,
    );
  }
  const verdict = !input.terminalDelivery
    ? "poor"
    : input.firstReviewPassed &&
        input.effectiveInvocations <= 1 &&
        input.humanInterventions === 0
      ? "excellent"
      : input.effectiveInvocations <= 2 &&
          input.reviewRounds <= 2 &&
          input.humanInterventions === 0
        ? "good"
        : "needs_improvement";
  if (recommendations.length === 0) {
    recommendations.push(
      en
        ? "Keep the current prompt, evidence, and review strategy as the next-run baseline."
        : "保留当前 Prompt、证据和评审策略，作为下一轮基线。",
    );
  }
  return { verdict, reasons, recommendations };
}

function resolveTaskDir(input: string): string {
  const resolved = path.resolve(input);
  if (existsSync(path.join(resolved, "task.json"))) return resolved;
  throw new Error(`Managed task directory is invalid: ${resolved}`);
}

function readEvents(file: string): ProgressEvent[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ProgressEvent];
      } catch {
        return [];
      }
    });
}

function readEvidenceText(runDir: string, projectRoot?: string): string {
  return [
    ...["task-report.md", "progress.md"].map((name) => path.join(runDir, name)),
    ...(projectRoot ? runnerConfirmedReportPaths(runDir, projectRoot) : []),
  ]
    .filter(existsSync)
    .map((file) => readFileSync(file, "utf-8"))
    .join("\n");
}

/**
 * The Runner's review facts own the authoritative changed-file list. Evaluation
 * may read only report-shaped files from that list, never arbitrary workspace
 * files or an Executor's self-reported evidence metadata.
 */
function runnerConfirmedReportPaths(
  runDir: string,
  projectRoot: string,
): string[] {
  if (!projectRoot) return [];
  const root = path.resolve(projectRoot);
  return readdirSync(runDir)
    .filter((name) => /^review-facts-\d+\.json$/.test(name))
    .flatMap((name) => readChangedFiles(path.join(runDir, name)))
    .filter((candidate) => isReportPathInsideRoot(root, candidate))
    .map((candidate) => path.resolve(root, candidate));
}

function readChangedFiles(file: string): string[] {
  try {
    const facts = readJson<{ workspace?: { changedFiles?: unknown } }>(file);
    return Array.isArray(facts.workspace?.changedFiles)
      ? facts.workspace.changedFiles.filter(
          (candidate): candidate is string => typeof candidate === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function isReportPathInsideRoot(root: string, candidate: string): boolean {
  if (
    path.isAbsolute(candidate) ||
    !path.basename(candidate).endsWith("report.md")
  ) {
    return false;
  }
  const relative = path.relative(root, path.resolve(root, candidate));
  return (
    relative !== "" &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

function classifyWaitingTime(
  events: ProgressEvent[],
  startedAt: number,
  endedAt: number,
  activeMilliseconds: number,
): ManagedEvaluation["elapsed"]["waiting"] {
  const empty = {
    hostReviewMilliseconds: 0,
    connectivityMilliseconds: 0,
    userActionMilliseconds: 0,
    unattributedMilliseconds: 0,
  };
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(endedAt) ||
    endedAt <= startedAt
  ) {
    return empty;
  }
  const timeline = events
    .flatMap((event) => {
      const at = Date.parse(event.timestamp ?? "");
      return Number.isFinite(at) ? [{ at, status: event.status }] : [];
    })
    .filter((event) => event.at >= startedAt && event.at <= endedAt)
    .sort((left, right) => left.at - right.at);
  const points = [
    { at: startedAt, status: "running" as const },
    ...timeline,
    { at: endedAt, status: null },
  ];
  for (let index = 0; index < points.length - 1; index += 1) {
    const duration = Math.max(0, points[index + 1].at - points[index].at);
    const status = points[index].status;
    if (status === "waiting_for_host_review") {
      empty.hostReviewMilliseconds += duration;
    } else if (
      status === "waiting_for_connectivity" ||
      status === "waiting_for_provider_change"
    ) {
      empty.connectivityMilliseconds += duration;
    } else if (status === "paused" || status === "waiting_for_human") {
      empty.userActionMilliseconds += duration;
    }
  }
  const nonActive = Math.max(0, endedAt - startedAt - activeMilliseconds);
  const classified =
    empty.hostReviewMilliseconds +
    empty.connectivityMilliseconds +
    empty.userActionMilliseconds;
  if (classified > nonActive) {
    const scale = nonActive / classified;
    empty.hostReviewMilliseconds = Math.round(
      empty.hostReviewMilliseconds * scale,
    );
    empty.connectivityMilliseconds = Math.round(
      empty.connectivityMilliseconds * scale,
    );
    empty.userActionMilliseconds = Math.round(
      empty.userActionMilliseconds * scale,
    );
  }
  empty.unattributedMilliseconds = Math.max(
    0,
    nonActive -
      empty.hostReviewMilliseconds -
      empty.connectivityMilliseconds -
      empty.userActionMilliseconds,
  );
  return empty;
}

function isMilestone(event: ProgressEvent): boolean {
  return [
    "executor.stage_changed",
    "executor.command_completed",
    "executor.delivery_received",
    "run.delivery_ready",
  ].includes(event.eventType ?? event.type ?? "");
}

function summarizeSupervision(
  events: ProgressEvent[],
): ManagedEvaluation["progress"]["supervision"] {
  return events.reduce(
    (summary, event) => {
      const type = event.eventType ?? event.type ?? "";
      if (type === "executor.supervision_checkpoint") {
        summary.effectiveCheckpoints += 1;
      } else if (type === "executor.supervision_checkpoint_idle") {
        summary.idleCheckpoints += 1;
      } else if (type === "executor.supervision_attention_required") {
        summary.idleEscalations += 1;
      }
      if (
        ["host.review_required_notified", "host.attention_notified"].includes(
          type,
        )
      ) {
        summary.hostWakeups += 1;
      }
      return summary;
    },
    {
      effectiveCheckpoints: 0,
      idleCheckpoints: 0,
      idleEscalations: 0,
      hostWakeups: 0,
    },
  );
}

function countHumanInterventions(events: ProgressEvent[]): {
  guidance: number;
  control: number;
  budgetApproval: number;
} {
  return events.reduce(
    (counts, event) => {
      const type = event.eventType ?? event.type ?? "";
      if (["human.message_received", "human.guidance_resumed"].includes(type)) {
        counts.guidance += 1;
      }
      if (
        [
          "task.paused",
          "executor.provider_switched",
          "executor.session_reset",
        ].includes(type)
      ) {
        counts.control += 1;
      }
      if (
        [
          "budget.limit_increased",
          "budget.unlimited_enabled",
          "budget.executor_window_set",
          "budget.infrastructure_credited",
        ].includes(type)
      ) {
        counts.budgetApproval += 1;
      }
      return counts;
    },
    { guidance: 0, control: 0, budgetApproval: 0 },
  );
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function distribution(values: number[]): EvaluationDistribution {
  if (values.length === 0) {
    return { average: null, p50: null, p95: null };
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    average: sorted.reduce((total, value) => total + value, 0) / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  };
}

function percentile(sorted: number[], percentileValue: number): number {
  const index = Math.ceil(percentileValue * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf-8")) as T;
}
