import { writeFileSync } from "fs";
import path from "path";
import { managedRunDir } from "./paths.js";
import type { ManagedRunState } from "./types.js";

export const EXECUTOR_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    protocolVersion: { type: "string", const: "superflow.executor.v2" },
    messageType: { type: "string", const: "executor_delivery" },
    status: { type: "string", enum: ["ready_for_review", "blocked", "failed"] },
    summary: { type: "string" },
    changedFiles: { type: "array", items: { type: "string" } },
    commands: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          command: { type: "string" },
          exitCode: { type: "integer" },
          result: { type: "string" },
          categories: {
            type: "array",
            items: {
              type: "string",
              enum: ["build", "test", "startup", "invocation", "runtime"],
            },
          },
          assertion: {
            type: "string",
            enum: ["positive", "negative"],
          },
        },
        required: ["command", "exitCode", "result"],
      },
    },
    evidence: { type: "array", items: { type: "string" } },
    releasePrerequisites: { type: "array", items: { type: "string" } },
    blockers: { type: "array", items: { type: "string" } },
    taskEvidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          taskId: { type: "string" },
          category: {
            type: "string",
            enum: [
              "local_required",
              "environment_required",
              "release_required",
            ],
          },
          owner: {
            type: "string",
            enum: ["executor", "tester", "dba", "sre", "user"],
          },
          evidencePaths: { type: "array", items: { type: "string" } },
          verificationCommands: { type: "array", items: { type: "string" } },
          changedFiles: { type: "array", items: { type: "string" } },
        },
        required: [
          "taskId",
          "category",
          "owner",
          "evidencePaths",
          "verificationCommands",
          "changedFiles",
        ],
      },
    },
  },
  required: [
    "protocolVersion",
    "messageType",
    "status",
    "summary",
    "commands",
    "evidence",
    "releasePrerequisites",
    "blockers",
  ],
} as const;

export const REVIEW_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    protocolVersion: { type: "string", const: "superflow.review.v2" },
    messageType: { type: "string", const: "host_review" },
    result: { type: "string", enum: ["pass", "needs_fix", "blocked"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
          },
          blocking: { type: "boolean" },
          category: { type: "string" },
          target: { type: "string" },
          evidence: { type: "string" },
          risk: { type: "string" },
          requiredFix: { type: "string" },
          acceptanceChecks: { type: "array", items: { type: "string" } },
        },
        required: [
          "id",
          "severity",
          "blocking",
          "category",
          "target",
          "evidence",
          "risk",
          "requiredFix",
          "acceptanceChecks",
        ],
      },
    },
    verificationCommands: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          command: { type: "string" },
          exitCode: { type: "integer" },
          result: { type: "string" },
        },
        required: ["command", "exitCode", "result"],
      },
    },
  },
  required: [
    "protocolVersion",
    "messageType",
    "result",
    "summary",
    "findings",
  ],
} as const;

export function writeManagedSchemas(state: ManagedRunState): {
  executor: string;
  reviewer: string;
} {
  const runDir = managedRunDir(state.projectRoot, state.taskId, state.runId);
  const executor = path.join(runDir, "executor-result.schema.json");
  const reviewer = path.join(runDir, "review-result.schema.json");
  writeFileSync(
    executor,
    `${JSON.stringify(EXECUTOR_RESULT_SCHEMA, null, 2)}\n`,
    "utf-8",
  );
  writeFileSync(
    reviewer,
    `${JSON.stringify(REVIEW_RESULT_SCHEMA, null, 2)}\n`,
    "utf-8",
  );
  return { executor, reviewer };
}
