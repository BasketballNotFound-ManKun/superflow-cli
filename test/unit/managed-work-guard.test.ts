import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const GUARD = path.resolve("assets/scripts/superflow-managed-work-guard.sh");
const roots: string[] = [];

afterEach(() => {
  roots.splice(0).forEach((root) => {
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("managed work pre-tool guard", () => {
  it("blocks supervisor writes", () => {
    const fixture = createFixture();
    expect(() =>
      invokeGuard(
        fixture,
        { tool_name: "Write", tool_input: { file_path: fixture.design } },
        { SUPERFLOW_MANAGED_ROLE: "supervisor" },
      ),
    ).toThrow("监督角色只允许检查");
  });

  it("blocks executor state edits and git commits", () => {
    const fixture = createFixture();
    expect(() =>
      invokeGuard(fixture, {
        tool_name: "Write",
        tool_input: {
          file_path: path.join(
            fixture.root,
            ".superflow",
            "tasks",
            fixture.taskId,
            "task.json",
          ),
        },
      }),
    ).toThrow("禁止修改托管状态");
    expect(() =>
      invokeGuard(fixture, {
        tool_name: "Bash",
        tool_input: { command: "git commit -m test" },
      }),
    ).toThrow("禁止自动 Git");
  });

  it("fails closed on malformed managed hook input", () => {
    const fixture = createFixture();
    const result = spawnSync("bash", [GUARD], {
      input: "not-json",
      encoding: "utf-8",
      env: {
        ...process.env,
        SUPERFLOW_MANAGED_ROLE: "executor",
        SUPERFLOW_MANAGED_PROJECT_ROOT: fixture.root,
        SUPERFLOW_MANAGED_CONTEXT_MANIFEST: fixture.manifest,
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("按失败关闭");
  });

  it("allows normal executor edits and tests", () => {
    const fixture = createFixture();
    const edit = invokeGuard(fixture, {
      tool_name: "Write",
      tool_input: { file_path: path.join(fixture.root, "src", "demo.ts") },
    });
    const test = invokeGuard(fixture, {
      tool_name: "Bash",
      tool_input: { command: "npm test" },
    });
    expect(edit.status).toBe(0);
    expect(test.status).toBe(0);
  });

  it("does not affect a docs-only process without a managed role", async () => {
    const fixture = createFixture();
    const result = invokeGuard(
      fixture,
      { tool_name: "Write", tool_input: { file_path: fixture.design } },
      { SUPERFLOW_MANAGED_ROLE: "" },
    );

    expect(result.stderr).toBe("");
  });

  it("blocks editing an immutable design before the tool runs", async () => {
    const fixture = createFixture();

    expect(() =>
      invokeGuard(fixture, {
        tool_name: "Edit",
        tool_input: { file_path: fixture.design },
      }),
    ).toThrow("冻结输入只读");
  });

  it("uses the frozen English language for guard failures", () => {
    const fixture = createFixture("en");
    expect(() =>
      invokeGuard(fixture, {
        tool_name: "Edit",
        tool_input: { file_path: fixture.design },
      }),
    ).toThrow("Frozen input is read-only");
  });

  it("allows updating a retained test report but blocks deleting it", async () => {
    const fixture = createFixture();
    const write = invokeGuard(fixture, {
      tool_name: "Write",
      tool_input: { file_path: fixture.report },
    });
    expect(write.stderr).toBe("");

    expect(() =>
      invokeGuard(fixture, {
        tool_name: "Bash",
        tool_input: { command: `rm ${fixture.report}` },
      }),
    ).toThrow("受保护合同/交付文档");
  });

  it("blocks broad process cleanup and allows repository build caches", async () => {
    const fixture = createFixture();

    expect(() =>
      invokeGuard(fixture, {
        tool_name: "Bash",
        tool_input: { command: "pkill -9 java" },
      }),
    ).toThrow("按进程名清理");

    const cleanup = invokeGuard(fixture, {
      tool_name: "Bash",
      tool_input: { command: "rm -rf target" },
    });
    expect(cleanup.stderr).toBe("");
  });
});

function createFixture(language: "zh" | "en" = "zh") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-guard-"));
  roots.push(root);
  const taskId = "task-test";
  const taskDir = path.join(root, ".superflow", "tasks", taskId);
  const design = path.join(root, "openspec", "changes", "demo", "design.md");
  const report = path.join(
    root,
    "openspec",
    "changes",
    "demo",
    "test-report.md",
  );
  fs.mkdirSync(taskDir, { recursive: true });
  fs.mkdirSync(path.dirname(design), { recursive: true });
  fs.writeFileSync(design, "# design\n");
  fs.writeFileSync(report, "# report\n");
  fs.writeFileSync(
    path.join(taskDir, "task.json"),
    JSON.stringify({ language }),
  );
  const manifest = path.join(taskDir, "context-manifest.json");
  fs.writeFileSync(
    manifest,
    JSON.stringify({
      entries: [
        { path: design, protection: "immutable" },
        { path: report, protection: "retain" },
      ],
    }),
  );
  return { root, taskId, manifest, design, report };
}

function invokeGuard(
  fixture: ReturnType<typeof createFixture>,
  payload: object,
  overrides: NodeJS.ProcessEnv = {},
) {
  const result = spawnSync("bash", [GUARD], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
    env: {
      ...process.env,
      SUPERFLOW_MANAGED_ROLE: "executor",
      SUPERFLOW_MANAGED_TASK_ID: fixture.taskId,
      SUPERFLOW_MANAGED_PROJECT_ROOT: fixture.root,
      SUPERFLOW_MANAGED_CONTEXT_MANIFEST: fixture.manifest,
      ...overrides,
    },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `guard exited ${result.status}`);
  }
  return result;
}
