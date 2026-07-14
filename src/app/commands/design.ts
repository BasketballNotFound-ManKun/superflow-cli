import {
  checkSkillDeployment,
  type SkillCheckOptions,
} from "../../domains/skill/check.js";
import { runChangeGuard } from "./change-guard.js";

const SKILL_NAME = "superflow-design";

export async function designCommand(
  change?: string,
  options: SkillCheckOptions = {},
): Promise<void> {
  if (change) {
    runChangeGuard(change, "design");
  }
  checkSkillDeployment(SKILL_NAME, options);
}
