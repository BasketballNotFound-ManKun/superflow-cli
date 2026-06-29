import { checkSkillDeployment, type SkillCheckOptions } from '../core/skill-check.js';

const SKILL_NAME = 'superflow-clarify';

export async function clarifyCommand(
  _feature?: string,
  options: SkillCheckOptions = {}
): Promise<void> {
  checkSkillDeployment(SKILL_NAME, options);
}
