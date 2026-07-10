import { checkSkillDeployment, type SkillCheckOptions } from '../../domains/skill/check.js';

const SKILL_NAME = 'superflow-verify';

export async function verifyCommand(
  _change?: string,
  options: SkillCheckOptions = {}
): Promise<void> {
  checkSkillDeployment(SKILL_NAME, options);
}
