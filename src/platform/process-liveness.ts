import { execFileSync } from "node:child_process";

export interface ProcessIdentity {
  startedAt: string;
  command: string;
}

export function readProcessIdentity(
  pid: number,
  runtime: { platform?: NodeJS.Platform; execute?: typeof execFileSync } = {},
): ProcessIdentity | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  const execute = runtime.execute ?? execFileSync;
  const windows = (runtime.platform ?? process.platform) === "win32";
  try {
    const args = windows
      ? [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; ` +
            "if($p){@{startedAt=$p.CreationDate.ToUniversalTime().ToString('o');" +
            "command=$p.CommandLine}|ConvertTo-Json -Compress}",
        ]
      : ["-p", String(pid), "-o", "lstart=", "-o", "args="];
    const output = execute(windows ? "powershell.exe" : "/bin/ps", args, {
      encoding: "utf8",
      timeout: 3000,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, LC_ALL: "C" },
    })
      .toString()
      .trim();
    const match = windows
      ? null
      : output.match(
          /^(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/,
        );
    const identity = windows
      ? JSON.parse(output)
      : match && {
          startedAt: match[1].replace(/\s+/g, " "),
          command: match[2].trim(),
        };
    return typeof identity?.startedAt === "string" &&
      identity.startedAt &&
      typeof identity.command === "string" &&
      identity.command.trim()
      ? { startedAt: identity.startedAt, command: identity.command }
      : null;
  } catch {
    return null;
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
