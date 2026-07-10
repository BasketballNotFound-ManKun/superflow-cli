import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';

export interface DeployRulesOptions {
  skipExisting?: boolean;
}

export async function deployRules(
  ruleNames: string[],
  assetsDir: string,
  rulesDir: string,
  options: DeployRulesOptions = {}
): Promise<void> {
  await fs.mkdir(rulesDir, { recursive: true });

  for (const name of ruleNames) {
    const source = path.join(assetsDir, name);
    const dest = path.join(rulesDir, name);
    if (options.skipExisting && existsSync(dest)) continue;
    await fs.cp(source, dest, { recursive: false, force: true });
  }
}

export function rulePath(rulesDir: string, ruleName: string): string {
  return path.join(rulesDir, ruleName);
}
