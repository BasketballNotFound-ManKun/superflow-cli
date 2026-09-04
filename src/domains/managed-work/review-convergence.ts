import type { ReviewFinding, ReviewResult } from "./types.js";

export interface ReviewConvergenceDecision {
  shouldContinue: boolean;
  stagnantTransitions: number;
  previousBlocking: number;
  currentBlocking: number;
}

const MAX_STAGNANT_TRANSITIONS = 2;

export function assessReviewConvergence(
  history: ReviewResult[],
): ReviewConvergenceDecision {
  const relevant = history.filter((review) => review.result === "needs_fix");
  const current = relevant.at(-1);
  const previous = relevant.at(-2);
  if (!current || !previous) {
    return decision(true, 0, previous, current);
  }
  let stagnantTransitions = 0;
  for (let index = relevant.length - 1; index > 0; index -= 1) {
    if (resolvedAny(relevant[index - 1], relevant[index])) break;
    stagnantTransitions += 1;
  }
  return decision(
    stagnantTransitions < MAX_STAGNANT_TRANSITIONS,
    stagnantTransitions,
    previous,
    current,
  );
}

function decision(
  shouldContinue: boolean,
  stagnantTransitions: number,
  previous?: ReviewResult,
  current?: ReviewResult,
): ReviewConvergenceDecision {
  return {
    shouldContinue,
    stagnantTransitions,
    previousBlocking: blocking(previous).length,
    currentBlocking: blocking(current).length,
  };
}

function resolvedAny(previous: ReviewResult, current: ReviewResult): boolean {
  const currentFindings = blocking(current);
  return blocking(previous).some(
    (finding) => !currentFindings.some((item) => sameFinding(finding, item)),
  );
}

function blocking(review?: ReviewResult): ReviewFinding[] {
  return review?.findings.filter((finding) => finding.blocking) ?? [];
}

function sameFinding(left: ReviewFinding, right: ReviewFinding): boolean {
  const sameId =
    normalize(left.id) !== "" && normalize(left.id) === normalize(right.id);
  const sameScope =
    normalize(left.category) === normalize(right.category) &&
    normalize(left.target) === normalize(right.target);
  return sameId || sameScope;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
