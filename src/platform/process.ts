import spawn from "cross-spawn";
import { createRequire } from "node:module";
import { PACKAGE_ROOT } from "./assets.js";

const runtime = createRequire(import.meta.url)(
  "../../scripts/npm-runtime.cjs",
) as {
  resolveManagedNodeTool(
    command: string,
    packageRoot: string,
  ): { executable: string; argumentPrefix: string[] } | null;
};

export interface SpawnResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {},
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const tool = runtime.resolveManagedNodeTool(command, PACKAGE_ROOT);
    const child = spawn(
      tool?.executable ?? command,
      tool ? [...tool.argumentPrefix, ...args] : args,
      {
        cwd: options.cwd,
        env: { ...process.env, ...(options.env ?? {}) },
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = options.timeout ?? 120_000;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `Command timed out after ${timeout}ms: ${command} ${args.join(" ")}`,
        ),
      );
    }, timeout);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
