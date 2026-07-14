import {
  checkSkillDeployment,
  type SkillCheckOptions,
} from "../../domains/skill/check.js";
import { runArchiveDryRun } from "./change-guard.js";

const SKILL_NAME = "superflow-archive";

export async function archiveCommand(
  change?: string,
  options: SkillCheckOptions = {},
): Promise<void> {
  if (change) {
    runArchiveDryRun(change);
  }
  checkSkillDeployment(SKILL_NAME, options);
}
