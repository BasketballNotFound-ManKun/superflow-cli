import {
  checkSkillDeployment,
  type SkillCheckOptions,
} from "../../domains/skill/check.js";
import { runChangeGuard } from "./change-guard.js";

const SKILL_NAME = "superflow-docs";

export async function docsCommand(
  change?: string,
  options: SkillCheckOptions = {},
): Promise<void> {
  if (change) {
    runChangeGuard(change, "docs");
  }
  checkSkillDeployment(SKILL_NAME, options);
}
