import { existsSync } from 'fs';
import path from 'path';
import { computeDirHash } from '../../platform/fs.js';
import { getPlatformPaths } from '../../platform/paths.js';
import { parseAgentSelection, resolveAgents } from '../agent.js';

export interface SkillCheckOptions {
  agent?: string;
}

export function checkSkillDeployment(
  skillName: string,
  options: SkillCheckOptions = {}
): void {
  const agents = resolveAgents(parseAgentSelection(options.agent));
  const readyPaths: string[] = [];

  for (const agent of agents) {
    const platform = getPlatformPaths(agent);
    const skillPath = path.join(platform.skillsDir, skillName);
    const skillFile = path.join(skillPath, 'SKILL.md');
    if (!existsSync(skillFile)) {
      console.error(`Error: ${skillName} not deployed for ${platform.name}. Run: superflow init --agent ${agent}`);
      process.exit(1);
    }

    try {
      computeDirHash(skillPath);
    } catch (err) {
      console.error(`[FAIL] ${platform.name} integrity check failed: ${(err as Error).message}`);
      process.exit(2);
    }
    readyPaths.push(`  ${platform.name}: ${skillFile}`);
  }

  console.log(`✓ ${skillName} ready at:`);
  for (const readyPath of readyPaths) {
    console.log(readyPath);
  }
  console.log(`\n→ Agent should load this skill via description matching.`);
}
