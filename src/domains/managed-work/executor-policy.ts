import { createHash } from "crypto";
import type { ManagedRuleSelection } from "./rule-selection.js";

const STABLE_POLICY_LINES = [
  "# Superflow Managed Executor Policy",
  "",
  "Read the frozen task prompt, context manifest, handoff, selected project rules, and current workspace before acting.",
  "# Compact Instructions",
  "When the Agent compacts this session, preserve the task ID, frozen prompt path and hash, all unfinished requirements and findings, changed files, active process/resource ownership, successful validation evidence, failed attempts that still need repair, and cleanup obligations. Re-read the frozen prompt and current handoff after compaction before continuing.",
  "This executor invocation has no Superflow max-turn limit. Keep working in this process until all locally executable work is complete, then return one structured result to notify the Host.",
  "Complete every locally executable item in one work batch, then build, test, start applications, call real HTTP endpoints, and run required browser E2E.",
  "Use three verification levels: change-scoped checks, task-level real acceptance, and framework certification. Generic non-owner, PID-reuse, forged-state, and signal-escalation disaster tests belong to framework certification and must not be rebuilt for every business task.",
  "When real runtime infrastructure is required, create and use a repository-owned, portable, repeatable, failure-safe one-command acceptance entry in this first invocation. It must own preflight, setup, build, startup, real calls, assertions, and cleanup from a clean state, including the success path and one representative setup/verification failure cleanup with final zero residue.",
  "Reuse the certified owner-verification helper named in the task context. A wrapper may bind task nonce, signatures, ports, and resource names, but must not copy or rewrite identity, kill, or delete primitives. The helper does not decide business deletion safety; the Host still reviews that semantically.",
  "Persist verbose build/framework/database logs in task-owned files and print only bounded stage summaries plus bounded failure tails. Never stream unbounded DEBUG output through the Agent tool channel; reference full log paths as evidence and keep those paths readable after cleanup removes nonce/runtime directories.",
  "In managed non-interactive mode, do not probe tool availability or repeatedly retry denied shell variants. Use declared project commands directly as standalone commands without pipes, semicolons, or echo wrappers; run Superflow/OpenSpec gates through installed scripts when required.",
  "If a passing automated test already starts the real application process and performs real TCP HTTP requests, reuse that evidence instead of launching a duplicate server or curl probe.",
  "Local curl commands must target http://127.0.0.1 or http://localhost. Permission denials are already preserved in the raw transcript and telemetry: never put denied/non-zero attempts into the commands array of ready_for_review. That array is successful gate evidence only. Use an allowed equivalent, or return blocked when no equivalent can satisfy the requirement.",
  "Before returning, perform one delivery self-check: include only successful evidence from this invocation. Superflow automatically merges valid evidence from earlier invocations, so do not rerun or manually copy prior startup, HTTP, build, or test commands.",
  "During a repair invocation, map each finding to the evidence invalidated by its current diff. Run affected checks first. Rerun the complete acceptance chain only when production runtime behavior, SQL, configuration, authorization, public contracts, or the acceptance entry changed, or when the finding explicitly requires that chain.",
  "For multi-repository work, verify each affected repository's build/runtime contract and the cross-repository real path when the requirement spans services. Evidence from one repository never substitutes for another.",
  "For absence checks where grep, rg, pgrep, lsof, find, or similar tools correctly return exit 1 or 2, set assertion to negative and record the expected absence in result. Never mark an unexpected failure as a negative assertion.",
  "Expected-failure tests must be wrapped by a parent acceptance command that asserts the child command failed as expected and itself exits 0. Keep the raw child failure in logs, never in the ready_for_review commands array.",
  "Run the exact deterministic preflight command from the task context before StructuredOutput and repair every failure in the same session. Do not return ready_for_review unless it exits 0.",
  "Treat managed assets by class: runtime resources and workspace-temporary files are cleaned by the Executor; delivery artifacts remain for Host review; protected contracts stay readable and are never deleted. Immutable protected inputs are read-only, while retained progress/report files may be updated but not removed.",
  "Never use pkill, killall, a bare kill, port/name-only cleanup, or an unverified rm -rf. Use the certified owner helper for task-owned processes, containers, and runtime directories; ordinary build caches may be removed only inside the repository.",
  "Do not commit, push, deploy, publish, write production data, bypass permissions, or edit .superflow task state.",
  "Use only real evidence. Never replace a named MySQL, browser, or service gate with H2, mocks, or static inspection.",
  "You own cleanup of every process you start.",
] as const;

export interface ExecutorPolicyContext {
  ruleSelection: ManagedRuleSelection;
  toolchainFacts: string[];
  ownerTemplate: string;
  preflightCommand: string;
  compatibilityContinuation: boolean;
  freshRecovery: boolean;
  deliveryProtocolRecovery: boolean;
}

export function stableExecutorPolicy(): string {
  return `${STABLE_POLICY_LINES.join("\n")}\n`;
}

export function stableExecutorPolicyHash(): string {
  return createHash("sha256").update(stableExecutorPolicy()).digest("hex");
}

export function buildExecutorPolicy(context: ExecutorPolicyContext): string {
  const dynamic = [
    "# Task-specific context",
    `Stable policy SHA-256: ${stableExecutorPolicyHash()}`,
    `Selected rule scenarios: ${context.ruleSelection.scenarios.join(", ") || "none"}`,
    "Read these exact applicable project rule files:",
    ...(context.ruleSelection.files.length > 0
      ? context.ruleSelection.files.map((file) => `- ${file}`)
      : ["- none"]),
    ...context.toolchainFacts,
    `Certified owner-verification helper: ${context.ownerTemplate}`,
    `Deterministic preflight command: ${context.preflightCommand}`,
    ...(context.compatibilityContinuation
      ? [
          "Continue from the current workspace after the recorded compatibility interruption. Do not restart broad exploration.",
        ]
      : []),
    ...(context.freshRecovery
      ? [
          "The previous session ended without useful workspace progress. Use the frozen prompt and Handoff, implement pending work immediately, then verify and clean up.",
        ]
      : []),
    ...(context.deliveryProtocolRecovery
      ? [
          "The previous executor session returned no parseable delivery JSON. This is the one bounded protocol-recovery session: read the current workspace and handoff, preserve valid historical evidence, complete only remaining affected work, then return schema-valid structured delivery. Do not redo completed work merely to restate JSON.",
        ]
      : []),
  ];
  return `${stableExecutorPolicy()}${dynamic.join("\n")}\n`;
}
