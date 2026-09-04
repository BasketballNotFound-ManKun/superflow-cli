import { existsSync, readdirSync } from "fs";
import path from "path";
import type { ManagedTaskContract } from "./types.js";

export type ManagedRuleScenario =
  | "core"
  | "java"
  | "frontend"
  | "database"
  | "runtime";

export interface ManagedRuleSelection {
  scenarios: ManagedRuleScenario[];
  files: string[];
}

const SCENARIO_TOKENS: Record<ManagedRuleScenario, string[]> = {
  core: ["common", "core", "general", "security", "git", "review"],
  java: ["java", "spring", "maven", "gradle", "backend"],
  frontend: ["front", "javascript", "typescript", "react", "vue", "node"],
  database: ["database", "mysql", "sql", "migration", "mybatis"],
  runtime: ["runtime", "e2e", "integration", "docker", "browser", "deploy"],
};

export function selectManagedRuleFiles(
  contract: ManagedTaskContract,
): ManagedRuleSelection {
  const roots = [contract.projectRoot, ...contract.relatedProjectRoots];
  const scenarios = new Set<ManagedRuleScenario>(["core"]);
  for (const root of roots) detectRepositoryScenarios(root, scenarios);
  detectRequestScenarios(contract, scenarios);
  const files = roots.flatMap((root) => selectRootRules(root, scenarios));
  return {
    scenarios: [...scenarios].sort(),
    files: [...new Set(files)].sort(),
  };
}

function detectRepositoryScenarios(
  root: string,
  scenarios: Set<ManagedRuleScenario>,
): void {
  const javaMarkers = ["pom.xml", "build.gradle", "build.gradle.kts"];
  if (javaMarkers.some((name) => existsSync(path.join(root, name)))) {
    scenarios.add("java");
  }
  if (existsSync(path.join(root, "package.json"))) scenarios.add("frontend");
  if (
    ["migrations", "db", "sql"].some((name) =>
      existsSync(path.join(root, name)),
    )
  ) {
    scenarios.add("database");
  }
}

function detectRequestScenarios(
  contract: ManagedTaskContract,
  scenarios: Set<ManagedRuleScenario>,
): void {
  const text = [contract.request, contract.objective, ...contract.doneCriteria]
    .join("\n")
    .toLowerCase();
  for (const [scenario, tokens] of Object.entries(SCENARIO_TOKENS)) {
    if (tokens.some((token) => text.includes(token))) {
      scenarios.add(scenario as ManagedRuleScenario);
    }
  }
  if (["engineering", "sdd"].includes(contract.profile)) {
    scenarios.add("runtime");
  }
}

function selectRootRules(
  root: string,
  scenarios: Set<ManagedRuleScenario>,
): string[] {
  const files = ["AGENTS.md", "CLAUDE.md"]
    .map((name) => path.join(root, name))
    .filter((file) => existsSync(file));
  for (const relativeRoot of [
    path.join(".codex", "rules"),
    path.join(".claude", "rules"),
  ]) {
    const rulesRoot = path.join(root, relativeRoot);
    if (!existsSync(rulesRoot)) continue;
    for (const file of markdownFiles(rulesRoot)) {
      if (matchesScenario(file, rulesRoot, scenarios)) files.push(file);
    }
  }
  return files;
}

function matchesScenario(
  file: string,
  rulesRoot: string,
  scenarios: Set<ManagedRuleScenario>,
): boolean {
  const relative = path.relative(rulesRoot, file).toLowerCase();
  let classified = false;
  for (const [scenario, tokens] of Object.entries(SCENARIO_TOKENS)) {
    if (!tokens.some((token) => relative.includes(token))) continue;
    classified = true;
    if (scenarios.has(scenario as ManagedRuleScenario)) return true;
  }
  return !classified;
}

function markdownFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return markdownFiles(target);
    return entry.isFile() && entry.name.endsWith(".md") ? [target] : [];
  });
}
