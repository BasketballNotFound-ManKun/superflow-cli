import fs from "node:fs";
import path from "node:path";
import manifestJson from "../../../assets/manifest.json" with { type: "json" };
import registryJson from "../../../assets/skill-registry.json" with { type: "json" };
import { auditSkillRegistry } from "../../domains/skill/registry.js";
import { ASSETS_DIR } from "../../platform/assets.js";

export interface SkillAuditOptions {
  json?: boolean;
  strict?: boolean;
}

export function runSkillAudit(): ReturnType<typeof auditSkillRegistry> {
  const zh = listSkillAssets(path.join(ASSETS_DIR, "skills"));
  const en = listSkillAssets(path.join(ASSETS_DIR, "skills-en"));
  return auditSkillRegistry(
    {
      skills: manifestJson.skills,
      contracts: registryJson.contracts,
    },
    { zh, en },
  );
}

export function skillAuditCommand(options: SkillAuditOptions = {}): void {
  const result = runSkillAudit();
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(
      `Skill registry: ${result.ok ? "PASS" : "FAIL"} | ` +
      `${result.stats.contracts}/${result.stats.manifestSkills} contracts | ` +
      `${result.stats.missingMirrors} English mirror gaps`,
    );
    for (const error of result.errors) console.log(`- ${error}`);
  }
  if (options.strict && !result.ok) process.exitCode = 1;
}

function listSkillAssets(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => fs.existsSync(path.join(root, entry.name, "SKILL.md")))
    .map((entry) => entry.name);
}
