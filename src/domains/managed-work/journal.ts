import { createHash, randomUUID } from "crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { managedRunDir } from "./paths.js";
import type { ManagedEvent, ManagedRunState } from "./types.js";

export interface AppendManagedEventInput {
  eventType: string;
  actor: string;
  role: ManagedEvent["role"];
  summary: string;
  evidencePaths?: string[];
}

export function appendManagedEvent(
  state: ManagedRunState,
  input: AppendManagedEventInput,
): ManagedEvent {
  const runDir = managedRunDir(state.projectRoot, state.taskId, state.runId);
  const file = path.join(runDir, "progress.jsonl");
  const previous = lastEvent(file);
  const base = {
    sequence: (previous?.sequence ?? 0) + 1,
    eventId: randomUUID(),
    eventType: input.eventType,
    actor: input.actor,
    role: input.role,
    timestamp: new Date().toISOString(),
    status: state.status,
    summary: input.summary,
    evidencePaths: input.evidencePaths ?? [],
    previousEventHash: previous?.eventHash ?? null,
  };
  const event: ManagedEvent = {
    ...base,
    eventHash: createHash("sha256").update(JSON.stringify(base)).digest("hex"),
  };
  appendFileSync(file, `${JSON.stringify(event)}\n`, "utf-8");
  regenerateProgress(state, file);
  return event;
}

export function readManagedEvents(state: ManagedRunState): ManagedEvent[] {
  const file = path.join(
    managedRunDir(state.projectRoot, state.taskId, state.runId),
    "progress.jsonl",
  );
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ManagedEvent);
}

export function verifyManagedJournal(state: ManagedRunState): boolean {
  let previous: string | null = null;
  let sequence = 0;
  for (const event of readManagedEvents(state)) {
    const { eventHash, ...base } = event;
    const expected = createHash("sha256")
      .update(JSON.stringify(base))
      .digest("hex");
    if (event.sequence !== sequence + 1) return false;
    if (event.previousEventHash !== previous) return false;
    if (eventHash !== expected) return false;
    sequence = event.sequence;
    previous = eventHash;
  }
  return true;
}

function lastEvent(file: string): ManagedEvent | null {
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return null;
  return JSON.parse(lines[lines.length - 1]) as ManagedEvent;
}

function regenerateProgress(state: ManagedRunState, file: string): void {
  const events = readFileSync(file, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ManagedEvent);
  const latest = events[events.length - 1];
  if (state.language === "en") {
    const markdown = [
      "# Managed Task Progress",
      "",
      `Task: ${state.taskId}`,
      `Run: ${state.runId}`,
      `Status: ${state.status}`,
      `Step: ${state.currentStep}`,
      `Review round: ${state.reviewRound}`,
      `Executor calls: ${state.executorInvocations}`,
      `Total Agent calls: ${state.totalAgentInvocations}`,
      `Supervisor session: ${shortId(state.supervisorSession.sessionId)}`,
      `Executor session: ${shortId(state.executorSession.sessionId)}`,
      `Latest event: ${latest?.summary ?? "none"}`,
      "",
      "## Timeline",
      "",
      ...events
        .slice(-50)
        .map((event) => `- ${event.timestamp} [${event.eventType}] ${event.summary}`),
      "",
    ].join("\n");
    writeFileSync(path.join(path.dirname(file), "progress.md"), markdown, "utf-8");
    return;
  }
  const markdown = [
    "# 托管任务进度",
    "",
    `任务：${state.taskId}`,
    `运行：${state.runId}`,
    `状态：${state.status}`,
    `步骤：${state.currentStep}`,
    `检查轮次：${state.reviewRound}`,
    `执行调用：${state.executorInvocations}`,
    `总 Agent 调用：${state.totalAgentInvocations}`,
    `监督会话：${shortId(state.supervisorSession.sessionId)}`,
    `执行会话：${shortId(state.executorSession.sessionId)}`,
    `最近事件：${latest?.summary ?? "无"}`,
    "",
    "## 时间线",
    "",
    ...events
      .slice(-50)
      .map(
        (event) => `- ${event.timestamp} [${event.eventType}] ${event.summary}`,
      ),
    "",
  ].join("\n");
  writeFileSync(
    path.join(path.dirname(file), "progress.md"),
    markdown,
    "utf-8",
  );
}

function shortId(value: string | null): string {
  return value ? value.slice(0, 8) : "--";
}
