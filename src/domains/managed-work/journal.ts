import { createHash, randomUUID } from "crypto";
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import path from "path";
import { managedRunDir } from "./paths.js";
import { redactManagedLog, redactManagedValue } from "./redaction.js";
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
    summary: redactManagedLog(input.summary),
    evidencePaths: (input.evidencePaths ?? []).map(redactManagedLog),
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

export function rebuildManagedJournalAfterSecurityRedaction(
  state: ManagedRunState,
  reason: string,
): string {
  if (!reason.trim()) {
    throw new Error("Security redaction migration requires an audit reason");
  }
  const runDir = managedRunDir(state.projectRoot, state.taskId, state.runId);
  const journal = path.join(runDir, "progress.jsonl");
  const redactedArtifacts = redactHistoricalRunArtifacts(runDir);
  const events = readManagedEvents(state);
  const previousHead = events.at(-1)?.eventHash ?? null;
  let previous: string | null = null;
  const rebuilt = events.map((event) => {
    const { eventHash: _oldHash, ...base } = event;
    base.summary = redactManagedLog(base.summary);
    base.evidencePaths = base.evidencePaths.map(redactManagedLog);
    base.previousEventHash = previous;
    const eventHash = createHash("sha256")
      .update(JSON.stringify(base))
      .digest("hex");
    previous = eventHash;
    return { ...base, eventHash };
  });
  writeFileSync(
    journal,
    `${rebuilt.map((event) => JSON.stringify(event)).join("\n")}\n`,
    "utf-8",
  );
  const timestamp = new Date().toISOString();
  const manifest = path.join(
    runDir,
    `journal-security-redaction-${timestamp.replaceAll(":", "-")}.json`,
  );
  writeFileSync(
    manifest,
    `${JSON.stringify(
      {
        migrationType: "security_redaction",
        taskId: state.taskId,
        runId: state.runId,
        reason: reason.trim(),
        previousHead,
        rebuiltHead: previous,
        eventCount: rebuilt.length,
        redactedArtifacts,
        migratedAt: timestamp,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  appendManagedEvent(state, {
    eventType: "journal.security_redaction_migrated",
    actor: "superflow-pipeline",
    role: "runner",
    summary: reason.trim(),
    evidencePaths: [manifest],
  });
  return manifest;
}

function redactHistoricalRunArtifacts(runDir: string): string[] {
  if (!existsSync(runDir)) return [];
  return readdirSync(runDir)
    .filter((name) => isManagedTextArtifact(name))
    .filter((name) => redactManagedArtifact(path.join(runDir, name)))
    .sort();
}

function isManagedTextArtifact(name: string): boolean {
  return /^(?:executor-progress-\d+\.jsonl|executor-result-\d+(?:-invalid)?\.json|executor-\d+(?:-invalid)?-events(?:-part-\d+)?\.jsonl|executor-\d+(?:-invalid)?-stderr(?:-part-\d+)?\.log|review-facts-\d+\.json|review-result-\d+\.json|progress\.md|task-report\.md)$/.test(
    name,
  );
}

function redactManagedArtifact(file: string): boolean {
  const original = readFileSync(file, "utf-8");
  const redacted = file.endsWith(".json")
    ? redactJsonArtifact(original)
    : redactManagedLog(original);
  if (redacted === original) return false;
  writeFileSync(file, redacted, "utf-8");
  return true;
}

function redactJsonArtifact(value: string): string {
  try {
    return `${JSON.stringify(redactManagedValue(JSON.parse(value)), null, 2)}\n`;
  } catch {
    return redactManagedLog(value);
  }
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
