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
  phase: "docs" | "design" | "implement" | "verify",
  options: { quiet?: boolean } = {},
): void {
  const guard = path.join(PIPELINE_SCRIPTS, "superflow-guard.sh");
  execFileSync("bash", [guard, resolveChangeDir(change), phase], {
    stdio: options.quiet ? "pipe" : "inherit",
  });
}

export function runCodingReady(
  change: string,
  options: { json?: boolean } = {},
): unknown {
  const readiness = path.resolve(
    ASSETS_DIR,
    "scripts",
    "superflow-coding-ready.mjs",
  );
  const args = [
    readiness,
    resolveChangeDir(change),
    ...(options.json ? ["--json"] : []),
  ];
  if (options.json) {
    const output = execFileSync(process.execPath, args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(output);
  }
  execFileSync(process.execPath, args, { stdio: "inherit" });
  return undefined;
}

export function runArchiveDryRun(change: string): void {
  const archive = path.join(PIPELINE_SCRIPTS, "superflow-archive.sh");
  execFileSync("bash", [archive, resolveChangeDir(change), "--dry-run"], {
    stdio: "inherit",
  });
}
