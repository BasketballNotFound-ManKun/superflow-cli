import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkSkillDeployment,
  type SkillCheckOptions,
} from "../../domains/skill/check.js";

const SKILL_NAME = "superflow-design";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GUARD = path.resolve(
  __dirname,
  "..",
  "..",
  "assets",
  "skills",
  "superflow-pipeline",
  "scripts",
  "superflow-guard.sh",
);

export async function designCommand(
  change?: string,
  options: SkillCheckOptions = {},
): Promise<void> {
  if (change) {
    runDesignGuard(resolveChangeDir(change));
  }
  checkSkillDeployment(SKILL_NAME, options);
}

function resolveChangeDir(change: string): string {
  const direct = path.resolve(change);
  if (existsSync(direct)) return direct;

  const openspecChange = path.resolve("openspec", "changes", change);
  if (existsSync(openspecChange)) return openspecChange;

  return direct;
}

function runDesignGuard(changeDir: string): void {
  execFileSync("bash", [GUARD, changeDir, "design"], { stdio: "inherit" });
}
