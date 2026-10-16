import { execFileSync } from "node:child_process";
import path from "node:path";
import { fixtureProcessEnv } from "./fixture-process-env.js";

// Vitest cannot interrupt execFileSync; bound this real loopback fixture itself.
export function replayExecutionEvidence(
  directory: string,
  mode: "omit" | "complete",
  env = fixtureProcessEnv(directory),
): string {
  return execFileSync(
    "python3",
    [
      path.resolve(__dirname, "../fixture/execution-evidence/replay.py"),
      directory,
      mode,
    ],
    { env, encoding: "utf8", timeout: 10_000 },
  );
}
