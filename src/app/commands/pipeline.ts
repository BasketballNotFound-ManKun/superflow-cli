import { checkSkillDeployment, type SkillCheckOptions } from '../../domains/skill/check.js';

const SKILL_NAME = 'superflow-pipeline';

export async function pipelineCommand(
  options: SkillCheckOptions = {}
): Promise<void> {
  checkSkillDeployment(SKILL_NAME, options);
}
