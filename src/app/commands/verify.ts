import {
  checkSkillDeployment,
  type SkillCheckOptions,
} from "../../domains/skill/check.js";
import { runChangeGuard } from "./change-guard.js";

const SKILL_NAME = "superflow-verify";

export async function verifyCommand(
  change?: string,
  options: SkillCheckOptions = {},
): Promise<void> {
  if (change) {
    runChangeGuard(change, "verify");
  }
  checkSkillDeployment(SKILL_NAME, options);
}
