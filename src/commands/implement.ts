import { checkSkillDeployment, type SkillCheckOptions } from '../core/skill-check.js';

const SKILL_NAME = 'superflow-implement';

export async function implementCommand(
  _task?: string,
  options: SkillCheckOptions = {}
): Promise<void> {
  checkSkillDeployment(SKILL_NAME, options);
}
