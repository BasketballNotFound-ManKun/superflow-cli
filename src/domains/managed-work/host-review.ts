import { existsSync, unlinkSync } from "fs";
import path from "path";
import type { Language } from "../../types.js";
import { managedText } from "./i18n.js";
import { managedRunDir } from "./paths.js";
import { validateReviewResult } from "./runner.js";
import {
  computeScopedWorkspaceFingerprint,
  computeWorkspaceFingerprintForRoots,
} from "./state.js";
import {
  saveManagedRun,
  saveManagedTask,
  upsertRegistryEntry,
  writeJsonAtomic,
} from "./storage.js";
import type {
  ManagedRunState,
  ManagedTaskContract,
  ReviewResult,
} from "./types.js";

export function submitExternalHostReviewResult(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  result: ReviewResult,
  language: Language = "zh",
  env: NodeJS.ProcessEnv = process.env,
): string {
  result.protocolVersion = "superflow.review.v2";
  result.messageType = "host_review";
  if (
    state.status !== "waiting_for_host_review" ||
    state.currentStep !== "external_supervisor_review_required" ||
    !state.pendingExternalReview
  ) {
    throw new Error(
      managedText(
        language,
        "当前任务没有等待 Host Agent 评审",
        "The current task is not waiting for a host Agent review",
      ),
    );
  }
  const roots = [contract.projectRoot, ...contract.relatedProjectRoots];
  const hasScopedWorkspacePaths =
    state.pendingExternalReview.workspacePaths !== undefined;
  const scope = state.pendingExternalReview.workspacePaths ?? [];
  const currentFingerprint = hasScopedWorkspacePaths
    ? computeScopedWorkspaceFingerprint(roots, scope)
    : computeWorkspaceFingerprintForRoots(roots);
  if (currentFingerprint !== state.pendingExternalReview.workspaceFingerprint) {
    throw new Error(
      managedText(
        language,
        "Host 评审期间工作区已变化，必须重新生成评审请求",
        "The workspace changed during host review; generate a new review request",
      ),
    );
  }
  validateReviewResult(result, language);
  if (
    contract.source === "sdd" &&
    !result.verificationCommands?.some(
      (item) =>
        item.exitCode === 0 &&
        /openspec\s+instructions\s+apply/i.test(item.command),
    )
  ) {
    throw new Error(
      managedText(
        language,
        "SDD 主 Agent 评审缺少真实 openspec instructions apply 命令证据",
        "SDD host review is missing a successful openspec instructions apply command",
      ),
    );
  }
  const resultPath = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    `review-result-${state.pendingExternalReview.round}.json`,
  );
  const previousState = structuredClone(state);
  const previousContract = structuredClone(contract);
  writeJsonAtomic(resultPath, result);
  try {
    upsertRegistryEntry(registryEntry(contract, state, "queued"), env);
    state.lastReviewResult = resultPath;
    state.pendingExternalReview = null;
    state.status = "queued";
    state.currentStep = "external_review_received";
    state.blocker = null;
    state.activeSince = null;
    contract.status = "queued";
    saveManagedRun(state);
    saveManagedTask(contract);
  } catch (error) {
    Object.assign(state, previousState);
    Object.assign(contract, previousContract);
    try {
      saveManagedRun(previousState);
      saveManagedTask(previousContract);
      upsertRegistryEntry(
        registryEntry(previousContract, previousState, previousState.status),
        env,
      );
    } catch {
      // Preserve the original failure; recovery can use the unchanged local state.
    }
    if (existsSync(resultPath)) unlinkSync(resultPath);
    throw error;
  }
  return resultPath;
}

function registryEntry(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  status: ManagedRunState["status"],
) {
  return {
    taskId: contract.taskId,
    projectRoot: contract.projectRoot,
    status,
    profile: contract.profile,
    language: contract.language,
    activeRunId: state.runId,
    createdAt: contract.createdAt,
    updatedAt: new Date().toISOString(),
    servicePid: state.servicePid,
  };
}
