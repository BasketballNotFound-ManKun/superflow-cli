import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { notifyManagedTask } from "../../src/domains/managed-work/notifications.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("managed notifications", () => {
  it("writes an outbox entry once per task event", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-notify-"));
    roots.push(root);
    const env = {
      ...process.env,
      SUPERFLOW_HOME: root,
      SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1",
    };
    const input = {
      taskId: "task-1",
      type: "delivery_ready" as const,
      title: "完成",
      message: "等待批准",
    };

    expect(notifyManagedTask(input, env)).toBe(true);
    expect(notifyManagedTask(input, env)).toBe(false);
    expect(
      notifyManagedTask({ ...input, message: "出现新的阻塞" }, env),
    ).toBe(true);
    const lines = fs
      .readFileSync(path.join(root, "managed", "notifications.jsonl"), "utf-8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(2);
  });
});
