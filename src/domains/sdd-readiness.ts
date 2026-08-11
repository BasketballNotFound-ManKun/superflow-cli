import fs from "node:fs";
import path from "node:path";

export interface CodingReadyReceipt {
  schemaVersion?: string;
  codingReady?: boolean;
  handoffHash?: string;
}

export function assertCodingReadyForPrompt(promptPath: string): void {
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
    receipt.handoffHash !== expectedHash
  ) {
    throw codingReadyError(changeDir);
  }
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
      "请先执行 superflow check <change> --level coding-ready，" +
      "不能把门禁修复交给开发 Agent。",
  );
}
