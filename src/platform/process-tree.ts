import { spawnSync } from "child_process";

export interface ProcessTreeStopPlan {
  kind: "process_group" | "windows_tree";
  pid: number;
  command: string | null;
  args: string[];
}

interface StopProcessTreeRuntime {
  platform?: NodeJS.Platform;
  kill?: typeof process.kill;
  taskkill?: typeof spawnSync;
}

export function processTreeStopPlan(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): ProcessTreeStopPlan {
  return platform === "win32"
    ? {
        kind: "windows_tree",
        pid,
        command: "taskkill.exe",
        args: ["/PID", String(pid), "/T", "/F"],
      }
    : {
        kind: "process_group",
        pid,
        command: null,
        args: [],
      };
}

export function stopProcessTree(
  pid: number | null | undefined,
  runtime: StopProcessTreeRuntime = {},
): void {
  if (!pid) return;
  const platform = runtime.platform ?? process.platform;
  const kill = runtime.kill ?? process.kill;
  const plan = processTreeStopPlan(pid, platform);
  if (plan.kind === "windows_tree") {
    const result = (runtime.taskkill ?? spawnSync)(plan.command!, plan.args, {
      stdio: "ignore",
      windowsHide: true,
      shell: false,
    });
    if (result.status === 0) return;
  }
  try {
    kill(platform === "win32" ? pid : -pid, "SIGTERM");
  } catch {
    try {
      kill(pid, "SIGTERM");
    } catch {
      // The process has already exited.
    }
  }
}
