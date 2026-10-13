import {
  checkSkillDeployment,
  type SkillCheckOptions,
} from "../../domains/skill/check.js";
import { runCodingReady } from "./change-guard.js";

const SKILL_NAME = "superflow-handoff";

export async function implementCommand(
  change?: string,
  options: SkillCheckOptions = {},
): Promise<void> {
  if (change) {
    runCodingReady(change);
  }
  checkSkillDeployment(SKILL_NAME, options);
}
