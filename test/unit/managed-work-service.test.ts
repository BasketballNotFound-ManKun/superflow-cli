import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { runManagedService } from "../../src/domains/managed-work/service.js";
import {
  loadRegistry,
  saveRegistry,
} from "../../src/domains/managed-work/storage.js";

describe("managed work service", () => {
  it("isolates a broken task and records evidence instead of crashing", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-service-"));
    const home = path.join(root, "home");
    const env = {
      ...process.env,
      SUPERFLOW_HOME: home,
      SUPERFLOW_DISABLE_OS_NOTIFICATIONS: "1",
    };
    saveRegistry(
      {
        schemaVersion: 1,
        tasks: [
          {
            taskId: "task-broken",
            projectRoot: root,
            status: "queued",
            profile: "quick",
            activeRunId: "run-missing",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            servicePid: null,
          },
        ],
      },
      env,
    );

    await runManagedService({ once: true }, env);

    expect(loadRegistry(env).tasks[0].status).toBe("waiting_for_human");
    const errors = fs.readFileSync(
      path.join(home, "managed", "service-errors.jsonl"),
      "utf-8",
    );
    expect(errors).toContain("task-broken");
    fs.rmSync(root, { recursive: true, force: true });
  });
});
