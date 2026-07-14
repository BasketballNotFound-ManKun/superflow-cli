import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { ASSETS_DIR } from "../../platform/assets.js";

const PIPELINE_SCRIPTS = path.resolve(
  ASSETS_DIR,
  "skills",
  "superflow-pipeline",
  "scripts",
);

export function resolveChangeDir(change: string): string {
  const direct = path.resolve(change);
  if (existsSync(direct)) return direct;

  const openspecChange = path.resolve("openspec", "changes", change);
  if (existsSync(openspecChange)) return openspecChange;

  return direct;
}

export function runChangeGuard(
  change: string,
  phase: "design" | "verify",
): void {
  const guard = path.join(PIPELINE_SCRIPTS, "superflow-guard.sh");
  execFileSync("bash", [guard, resolveChangeDir(change), phase], {
    stdio: "inherit",
  });
}

export function runArchiveDryRun(change: string): void {
  const archive = path.join(PIPELINE_SCRIPTS, "superflow-archive.sh");
  execFileSync("bash", [archive, resolveChangeDir(change), "--dry-run"], {
    stdio: "inherit",
  });
}
