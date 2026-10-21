import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ASSETS_DIR } from "../platform/assets.js";
import type { ManagedTaskContract } from "./managed-work/types.js";

export interface CodingReadyReceipt {
  schemaVersion?: string;
  codingReady?: boolean;
  workflowPolicy?: string;
  handoffHash?: string;
}

// Recovery keeps the frozen document contract while implementation sources evolve.
export function assertManagedSddCodingReady(
  contract: Pick<ManagedTaskContract, "source" | "profile" | "taskPrompt">,
): void {
  if (contract.source !== "sdd" || contract.profile === "native") return;
  const prompt = contract.taskPrompt?.originalPath;
  if (!prompt) throw new Error("SDD 任务缺少原始 Prompt，无法核验当前 Coding Ready");
  assertCodingReadyForPrompt(prompt, { checkCode: false });
}

export function assertCodingReadyForPrompt(
  promptPath: string,
  { checkCode = true } = {},
): void {
  const changeDir = findChangeDirectory(promptPath);
  const stateFile = path.join(changeDir, ".sdd", "state.yaml");
  const expectedHash = readStateValue(stateFile, "handoff_hash");
  const receiptFile = path.join(
    changeDir,
    ".sdd",
    "readiness",
    "coding-ready.json",
  );
  if (!expectedHash || !fs.existsSync(receiptFile)) {
    throw codingReadyError(changeDir);
  }
  let receipt: CodingReadyReceipt;
  try {
    receipt = JSON.parse(fs.readFileSync(receiptFile, "utf-8"));
  } catch {
    throw codingReadyError(changeDir);
  }
  if (
    receipt.schemaVersion !== "superflow.coding-ready.v1" ||
    receipt.codingReady !== true ||
    receipt.workflowPolicy !== "observed-delivery.v1" ||
    receipt.handoffHash !== expectedHash
  ) {
    throw codingReadyError(changeDir);
  }
  const checked = spawnSync(
    process.execPath,
    [
      path.join(ASSETS_DIR, "scripts", "superflow-review-coverage.mjs"),
      changeDir,
      ...(checkCode ? ["--check-sources"] : []),
    ],
    { encoding: "utf-8", timeout: 35000 },
  );
  if (checked.status !== 0) throw codingReadyError(changeDir);
}

function findChangeDirectory(promptPath: string): string {
  let current = path.resolve(path.dirname(promptPath));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, ".sdd", "state.yaml"))) {
      return current;
    }
    current = path.dirname(current);
  }
  throw new Error("SDD Prompt 不属于包含 .sdd/state.yaml 的 change 目录");
}

function readStateValue(file: string, key: string): string {
  const content = fs.readFileSync(file, "utf-8");
  const match = content.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  return match?.[1]?.replace(/^['\"]|['\"]$/g, "") ?? "";
}

function codingReadyError(changeDir: string): Error {
  return new Error(
    `SDD 任务尚未获得当前 Coding Ready 凭证：${changeDir}。` +
      "请回文档 owner 补齐当前合同并重新评审，再执行 superflow check <change> --level coding-ready，" +
      "不能把门禁修复交给开发 Agent。",
  );
}
