import {
  evaluateManagedTask,
  summarizeManagedEvaluations,
  type ManagedEvaluationBaseline,
} from "../../domains/managed-work/evaluation.js";
import { resolveRuntimeLanguage } from "../../domains/config/cli-help.js";

export async function evalCommand(
  taskPaths: string | string[],
  options: { json?: boolean; language?: string; summary?: boolean } = {},
): Promise<void> {
  const language = resolveRuntimeLanguage(options.language);
  const paths = Array.isArray(taskPaths) ? taskPaths : [taskPaths];
  const evaluations = paths.flatMap((taskPath) =>
    evaluateManagedTask(taskPath),
  );
  const baseline = options.summary
    ? summarizeManagedEvaluations(evaluations)
    : null;
  if (options.json) {
    console.log(
      JSON.stringify(
        baseline ? { evaluations, baseline } : evaluations,
        null,
        2,
      ),
    );
    return;
  }
  if (evaluations.length === 0) {
    console.log(
      language === "en" ? "No managed runs found." : "未发现托管 Run。",
    );
    return;
  }
  for (const item of evaluations) {
    const ratio =
      item.usage.cacheHitRatio === null
        ? "unknown"
        : `${(item.usage.cacheHitRatio * 100).toFixed(1)}%`;
    console.log(
      language === "en"
        ? `${item.taskId}/${item.runId}: ${item.status}; executor ${item.executor.effectiveInvocations} effective/${item.executor.physicalInvocations} physical; Host ${item.hostReviewRounds}; cache ${ratio}`
        : `${item.taskId}/${item.runId}：${item.status}；研发调用 ${item.executor.effectiveInvocations} 次有效/${item.executor.physicalInvocations} 次物理；Host ${item.hostReviewRounds} 轮；缓存 ${ratio}`,
    );
    const supervision = item.progress.supervision;
    console.log(
      language === "en"
        ? `  Supervision: ${supervision.hostWakeups} Host wakeup(s); ${supervision.effectiveCheckpoints} effective / ${supervision.idleCheckpoints} idle checkpoint(s); ${supervision.idleEscalations} idle escalation(s)`
        : `  监督：Host 唤醒 ${supervision.hostWakeups} 次；有效/空闲监督点 ${supervision.effectiveCheckpoints}/${supervision.idleCheckpoints}；无进展升级 ${supervision.idleEscalations} 次`,
    );
    const diagnosis = item.diagnosis;
    const verdict =
      language === "en"
        ? diagnosis.verdict
        : (
            {
              excellent: "优秀",
              good: "良好",
              needs_improvement: "需要改进",
              poor: "不合格",
            } as const
          )[diagnosis.verdict];
    console.log(
      language === "en" ? `  Verdict: ${verdict}` : `  结论：${verdict}`,
    );
    for (const reason of diagnosis.reasons) {
      console.log(
        language === "en" ? `  Why: ${reason}` : `  为什么：${reason}`,
      );
    }
    for (const recommendation of diagnosis.recommendations) {
      console.log(
        language === "en"
          ? `  Next: ${recommendation}`
          : `  下一步：${recommendation}`,
      );
    }
  }
  if (baseline) printBaseline(baseline, language);
}

function printBaseline(
  baseline: ManagedEvaluationBaseline,
  language: "zh" | "en",
): void {
  const rate = (value: number | null) =>
    value === null ? "unknown" : `${(value * 100).toFixed(1)}%`;
  const value = (input: number | null) =>
    input === null ? "unknown" : input.toFixed(1);
  console.log(
    language === "en"
      ? `Baseline (${baseline.sampleSize} run(s)): delivery-ready ${baseline.deliveryReady.count}/${baseline.sampleSize} (${rate(baseline.deliveryReady.rate)}); first-review pass ${baseline.firstReviewPass.count}/${baseline.firstReviewPass.reviewedRuns} (${rate(baseline.firstReviewPass.rate)})`
      : `基线（${baseline.sampleSize} 个 Run）：交付就绪 ${baseline.deliveryReady.count}/${baseline.sampleSize}（${rate(baseline.deliveryReady.rate)}）；首轮评审通过 ${baseline.firstReviewPass.count}/${baseline.firstReviewPass.reviewedRuns}（${rate(baseline.firstReviewPass.rate)}）`,
  );
  console.log(
    language === "en"
      ? `  Effective calls avg/P50/P95: ${value(baseline.effectiveInvocations.average)}/${value(baseline.effectiveInvocations.p50)}/${value(baseline.effectiveInvocations.p95)}; tokens per milestone avg/P50/P95: ${value(baseline.tokensPerMilestone.average)}/${value(baseline.tokensPerMilestone.p50)}/${value(baseline.tokensPerMilestone.p95)}`
      : `  有效调用 平均/P50/P95：${value(baseline.effectiveInvocations.average)}/${value(baseline.effectiveInvocations.p50)}/${value(baseline.effectiveInvocations.p95)}；每里程碑 Token 平均/P50/P95：${value(baseline.tokensPerMilestone.average)}/${value(baseline.tokensPerMilestone.p50)}/${value(baseline.tokensPerMilestone.p95)}`,
  );
  console.log(
    language === "en"
      ? `  Supervision: ${baseline.supervision.hostWakeups} Host wakeup(s); ${baseline.supervision.effectiveCheckpoints}/${baseline.supervision.idleCheckpoints} effective/idle checkpoint(s); ${baseline.supervision.idleEscalations} idle escalation(s); human intervention ${baseline.humanIntervention.runs}/${baseline.sampleSize} (${rate(baseline.humanIntervention.rate)})`
      : `  监督：Host 唤醒 ${baseline.supervision.hostWakeups} 次；有效/空闲监督点 ${baseline.supervision.effectiveCheckpoints}/${baseline.supervision.idleCheckpoints}；无进展升级 ${baseline.supervision.idleEscalations} 次；人工介入 ${baseline.humanIntervention.runs}/${baseline.sampleSize}（${rate(baseline.humanIntervention.rate)}）`,
  );
}
