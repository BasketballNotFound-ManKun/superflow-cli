import { checkSkillDeployment, type SkillCheckOptions } from '../../domains/skill/check.js';

const SKILL_NAME = 'superflow-docs';

export async function docsCommand(
  _change?: string,
  options: SkillCheckOptions = {}
): Promise<void> {
  checkSkillDeployment(SKILL_NAME, options);
}
