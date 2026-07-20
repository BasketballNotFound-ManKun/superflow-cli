import { spawnSync } from "child_process";
import path from "path";
import { describe, expect, it } from "vitest";

const guard = path.join(
  process.cwd(),
  "assets",
  "scripts",
  "superflow-managed-work-guard.sh",
);

describe("managed work hook guard", () => {
  it("blocks supervisor writes", async () => {
    const result = await runGuard("supervisor", {
      tool_name: "Write",
      tool_input: { file_path: "/tmp/demo.txt" },
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("监督角色只允许检查");
  });

  it("blocks executor state edits and git commit", async () => {
    const stateEdit = await runGuard("executor", {
      tool_name: "Write",
      tool_input: { file_path: "/repo/.superflow/tasks/x/task.json" },
    });
    expect(stateEdit.code).toBe(2);

    const git = await runGuard("executor", {
      tool_name: "Bash",
      tool_input: { command: "git commit -m test" },
    });
    expect(git.code).toBe(2);
    expect(git.stderr).toContain("禁止自动 Git");

    const stateCommand = await runGuard("executor", {
      tool_name: "Bash",
      tool_input: {
        command: "printf changed > .superflow/tasks/x/task.json",
      },
    });
    expect(stateCommand.code).toBe(2);
    expect(stateCommand.stderr).toContain("禁止直接访问托管运行目录");
  });

  it("fails closed when a managed hook receives malformed input", () => {
    const result = spawnSync("bash", [guard], {
      env: { ...process.env, SUPERFLOW_MANAGED_ROLE: "executor" },
      input: "not-json",
      encoding: "utf-8",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("按失败关闭");
  });

  it("allows normal executor edits and tests", async () => {
    const edit = await runGuard("executor", {
      tool_name: "Write",
      tool_input: { file_path: "/repo/src/demo.ts" },
    });
    expect(edit.code).toBe(0);

    const test = await runGuard("executor", {
      tool_name: "Bash",
      tool_input: { command: "npm test" },
    });
    expect(test.code).toBe(0);
  });
});

async function runGuard(role: string, input: unknown) {
  const result = spawnSync("bash", [guard], {
    env: { ...process.env, SUPERFLOW_MANAGED_ROLE: role },
    input: JSON.stringify(input),
    encoding: "utf-8",
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
