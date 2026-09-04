import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import {
  appendManagedEvent,
  readManagedEvents,
  rebuildManagedJournalAfterSecurityRedaction,
  verifyManagedJournal,
} from "../../src/domains/managed-work/journal.js";
import { createManagedTaskFiles } from "../../src/domains/managed-work/storage.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

describe("managed work journal", () => {
  it("creates an append-only hash chain and detects tampering", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-journal-"));
    roots.push(root);
    const env = { ...process.env, SUPERFLOW_HOME: path.join(root, "home") };
    const contract = createManagedTaskContract({
      request: "整理结果",
      projectRoot: root,
    });
    const state = initManagedRunState(contract);
    createManagedTaskFiles(contract, state, env);

    appendManagedEvent(state, {
      eventType: "run.created",
      actor: "test",
      role: "runner",
      summary: "创建",
    });
    appendManagedEvent(state, {
      eventType: "run.started",
      actor: "test",
      role: "runner",
      summary: "开始",
    });

    expect(verifyManagedJournal(state)).toBe(true);
    expect(readManagedEvents(state)).toHaveLength(2);
    const journal = path.join(
      root,
      ".superflow",
      "tasks",
      contract.taskId,
      "runs",
      state.runId,
      "progress.jsonl",
    );
    fs.appendFileSync(journal, '{"sequence":99}\n');
    expect(verifyManagedJournal(state)).toBe(false);
  });

  it("rehashes redacted history with an explicit audit event", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-journal-"));
    roots.push(root);
    const contract = createManagedTaskContract({
      request: "安全脱敏迁移",
      projectRoot: root,
    });
    const state = initManagedRunState(contract);
    const env = { ...process.env, SUPERFLOW_HOME: path.join(root, "home") };
    createManagedTaskFiles(contract, state, env);
    const secret = "journal-history-secret";
    appendManagedEvent(state, {
      eventType: "executor.progress",
      actor: "claude",
      role: "executor",
      summary: `R38_DB_PASSWORD=${secret}`,
    });
    const journal = path.join(
      root,
      ".superflow",
      "tasks",
      contract.taskId,
      "runs",
      state.runId,
      "progress.jsonl",
    );
    const changed = fs
      .readFileSync(journal, "utf-8")
      .replace("<redacted>", secret);
    fs.writeFileSync(journal, changed, "utf-8");
    fs.writeFileSync(
      path.join(path.dirname(journal), "executor-progress-1.jsonl"),
      `${JSON.stringify({ summary: `R38_DB_PASSWORD=${secret}` })}\n`,
      "utf-8",
    );
    expect(verifyManagedJournal(state)).toBe(false);

    const manifest = rebuildManagedJournalAfterSecurityRedaction(
      state,
      "清除历史凭据并重建哈希链",
    );

    expect(verifyManagedJournal(state)).toBe(true);
    expect(fs.existsSync(manifest)).toBe(true);
    expect(fs.readFileSync(journal, "utf-8")).toContain(
      "journal.security_redaction_migrated",
    );
    expect(fs.readFileSync(journal, "utf-8")).not.toContain(secret);
    expect(
      fs.readFileSync(
        path.join(path.dirname(journal), "executor-progress-1.jsonl"),
        "utf-8",
      ),
    ).not.toContain(secret);
    expect(fs.readFileSync(manifest, "utf-8")).toContain(
      '"migrationType": "security_redaction"',
    );
  });

  it("writes English progress and report artifacts for English contracts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-journal-en-"));
    roots.push(root);
    const env = { ...process.env, SUPERFLOW_HOME: path.join(root, "home") };
    const contract = createManagedTaskContract({
      request: "Prepare a result",
      projectRoot: root,
      language: "en",
    });
    const state = initManagedRunState(contract);
    createManagedTaskFiles(contract, state, env);
    appendManagedEvent(state, {
      eventType: "run.created",
      actor: "test",
      role: "runner",
      summary: "Created",
    });
    const runDir = path.join(
      root,
      ".superflow",
      "tasks",
      contract.taskId,
      "runs",
      state.runId,
    );

    expect(fs.readFileSync(path.join(runDir, "progress.md"), "utf-8"))
      .toContain("# Managed Task Progress");
    expect(fs.readFileSync(path.join(runDir, "task-report.md"), "utf-8"))
      .toContain("# Managed Task Report");
  });
});
