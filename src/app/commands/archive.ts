import { checkSkillDeployment, type SkillCheckOptions } from '../../domains/skill/check.js';

const SKILL_NAME = 'superflow-archive';

export async function archiveCommand(
  _change?: string,
  options: SkillCheckOptions = {}
): Promise<void> {
  checkSkillDeployment(SKILL_NAME, options);
}
