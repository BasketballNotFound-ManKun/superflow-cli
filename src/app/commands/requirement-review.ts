import {
  checkSkillDeployment,
  type SkillCheckOptions,
} from "../../domains/skill/check.js";

const SKILL_NAME = "superflow-requirement-review";

export async function requirementReviewCommand(
  _change?: string,
  options: SkillCheckOptions = {},
): Promise<void> {
  checkSkillDeployment(SKILL_NAME, options);
}
