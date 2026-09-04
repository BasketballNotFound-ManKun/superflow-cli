import { randomUUID } from "crypto";
import { appendFileSync, existsSync, readFileSync } from "fs";
import path from "path";
import { managedTaskDir } from "./paths.js";
import type { ManagedHumanMessage, ManagedTaskContract } from "./types.js";

function humanMessagesPath(contract: ManagedTaskContract): string {
  return path.join(
    managedTaskDir(contract.projectRoot, contract.taskId),
    "human-messages.jsonl",
  );
}

export function appendManagedHumanMessage(
  contract: ManagedTaskContract,
  content: string,
  actor = "user",
): ManagedHumanMessage {
  const normalized = content.trim();
  if (!normalized) {
    throw new Error("Human guidance cannot be empty");
  }
  const message: ManagedHumanMessage = {
    messageId: randomUUID(),
    timestamp: new Date().toISOString(),
    actor: actor.trim() || "user",
    content: normalized,
  };
  appendFileSync(
    humanMessagesPath(contract),
    `${JSON.stringify(message)}\n`,
    "utf-8",
  );
  return message;
}

export function readManagedHumanMessages(
  contract: ManagedTaskContract,
): ManagedHumanMessage[] {
  const file = humanMessagesPath(contract);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ManagedHumanMessage);
}
