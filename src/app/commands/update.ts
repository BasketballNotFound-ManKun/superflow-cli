import path from 'path';
import { existsSync, readFileSync } from 'fs';
import {
  ALL_RULES,
  ALL_SKILLS,
  CODEX_PROMPTS,
  hookScriptsForAgent,
  scriptsForAgent,
} from '../../domains/skill/assets.js';
import { getPlatformPaths } from '../../platform/paths.js';
import {
  parseAgentSelection,
  parseInstallScope,
  resolveAgents,
} from '../../domains/agent.js';
import { deployRules } from '../../domains/skill/rules.js';
import { deployScripts } from '../../domains/skill/scripts.js';
import { deploySkill } from '../../domains/skill/deploy.js';
import { deployPrompts } from '../../domains/skill/prompts.js';
import { clearSddHooks, registerHook } from '../../domains/hook.js';
import type { Agent, InstallScope } from '../../types.js';
import { runCommand } from '../../platform/process.js';
import { installCodexSuperpowers, installSuperpowers } from '../../domains/deps.js';
import { ASSETS_DIR, PACKAGE_ROOT } from '../../platform/assets.js';

const PACKAGE_NAME = '@chenmk/superflow';
const OPENSPEC_PACKAGE_NAME = '@fission-ai/openspec';
const OFFICIAL_REGISTRY = 'https://registry.npmjs.org';

export interface UpdatePlan {
  agents: Agent[];
  scope: InstallScope;
  projectPath: string;
  targets: UpdateTarget[];
  packageUpdate: { enabled: boolean; commands: string[] };
  skills: { total: number; names: string[] };
  rules: { total: number; names: string[] };
  scripts: { total: number; names: string[] };
  hooks: { total: number; names: string[] };
}

export interface UpdateTarget {
  agent: Agent;
  scope: InstallScope;
  projectPath: string;
}

export async function updateCommand(options: {
  agent?: string;
  dryRun?: boolean;
  json?: boolean;
  noHooks?: boolean;
  scope?: string;
  withPackage?: boolean;
  targetPath?: string;
} = {}): Promise<void> {
  const agents = resolveAgents(parseAgentSelection(options.agent));
  const projectPath = path.resolve(options.targetPath ?? process.cwd());
  const targets = resolveUpdateTargets(projectPath, agents, options.scope);
  const planScope = targets[0]?.scope ?? 'global';
  const packageScope = options.scope && options.scope !== 'auto'
    ? parseInstallScope(options.scope)
    : detectPackageScope(projectPath);
  const planAgents = [...new Set(targets.map((target) => target.agent))];
  const plan = createUpdatePlan(
    planAgents,
    planScope,
    projectPath,
    !!options.withPackage,
    targets,
    packageScope
  );

  if (options.dryRun) {
    printPlan(plan, !!options.json);
    return;
  }

  if (options.withPackage) {
    await updateNpmPackage(PACKAGE_NAME, packageScope, 'superflow package');
    await updateNpmPackage(OPENSPEC_PACKAGE_NAME, 'global', 'openspec package');
    await updateSuperpowers(planAgents);
  }

  for (const target of targets) {
    const { agent, scope } = target;
    const platform = getPlatformPaths(agent, scope, target.projectPath);
    for (const skill of ALL_SKILLS) {
      await deploySkill(skill, path.join(ASSETS_DIR, 'skills'), platform.skillsDir, { agent });
    }
    await deployRules(ALL_RULES, path.join(ASSETS_DIR, 'rules'), platform.rulesDir);
    const scripts = scriptsForAgent(agent);
    await deployScripts(scripts, path.join(ASSETS_DIR, 'scripts'), platform.scriptsDir, { agent });
    if (agent === 'codex' || agent === 'opencode') {
      await deployPrompts(CODEX_PROMPTS, path.join(ASSETS_DIR, 'prompts'), platform.promptsDir);
    }
    const hooks = hookScriptsForAgent(agent);
    if (!options.noHooks && hooks.length > 0) {
      clearSddHooks(platform.settingsFile);
      for (const hook of hooks) {
        const command = path.join(platform.scriptsDir, hook);
        const timeout = hook === 'superflow-dependency-update-hook.sh' ? 300 : undefined;
        registerHook(platform.settingsFile, hook, command, { timeout });
        if (hook === 'superflow-sql-sync-hook.py') {
          registerHook(platform.settingsFile, hook, command, { matcherOverride: 'Bash' });
        }
      }
    }
  }

  printPlan(plan, !!options.json, 'updated');
}

export function detectInstalledTargets(
  projectPath: string,
  agents: Agent[]
): UpdateTarget[] {
  const targets: UpdateTarget[] = [];
  for (const scope of ['project', 'global'] as InstallScope[]) {
    for (const agent of agents) {
      const platform = getPlatformPaths(agent, scope, projectPath);
      if (
        existsSync(path.join(platform.skillsDir, 'superflow-pipeline', 'SKILL.md')) ||
        existsSync(path.join(platform.skillsDir, 'sdd-spec-pipeline', 'SKILL.md'))
      ) {
        targets.push({ agent, scope, projectPath });
      }
    }
  }
  return targets;
}

export function resolveUpdateTargets(
  projectPath: string,
  agents: Agent[],
  scopeValue?: string
): UpdateTarget[] {
  if (!scopeValue || scopeValue === 'auto') {
    const detected = detectInstalledTargets(projectPath, agents);
    return detected.length > 0
      ? detected
      : agents.map((agent) => ({ agent, scope: 'global', projectPath }));
  }

  const scope = parseInstallScope(scopeValue);
  return agents.map((agent) => ({ agent, scope, projectPath }));
}

export function createUpdatePlan(
  agents: Agent[],
  scope: InstallScope = 'global',
  projectPath = process.cwd(),
  withPackage = false,
  targets: UpdateTarget[] = agents.map((agent) => ({ agent, scope, projectPath })),
  packageScope: InstallScope = scope
): UpdatePlan {
  const scriptNames = [...new Set(agents.flatMap((agent) => scriptsForAgent(agent)))];
  const hookNames = [...new Set(agents.flatMap((agent) => hookScriptsForAgent(agent)))];
  return {
    agents,
    scope,
    projectPath,
    targets,
    packageUpdate: {
      enabled: withPackage,
      commands: withPackage ? formatDependencyUpdateCommands(agents, packageScope) : [],
    },
    skills: { total: ALL_SKILLS.length, names: [...ALL_SKILLS] },
    rules: { total: ALL_RULES.length, names: [...ALL_RULES] },
    scripts: { total: scriptNames.length, names: scriptNames },
    hooks: { total: hookNames.length, names: hookNames },
  };
}

export function buildPackageUpdateArgs(scope: InstallScope): string[] {
  return buildNpmUpdateArgs(PACKAGE_NAME, scope);
}

export function buildOpenSpecUpdateArgs(): string[] {
  return buildNpmUpdateArgs(OPENSPEC_PACKAGE_NAME, 'global');
}

export function buildNpmUpdateArgs(packageName: string, scope: InstallScope): string[] {
  return scope === 'global'
    ? ['install', '-g', `${packageName}@latest`, '--registry', OFFICIAL_REGISTRY]
    : ['install', `${packageName}@latest`, '--registry', OFFICIAL_REGISTRY];
}

export function formatPackageUpdateCommand(scope: InstallScope): string {
  return ['npm', ...buildPackageUpdateArgs(scope)].join(' ');
}

export function formatDependencyUpdateCommands(agents: Agent[], packageScope: InstallScope): string[] {
  const commands = [
    formatPackageUpdateCommand(packageScope),
    ['npm', ...buildOpenSpecUpdateArgs()].join(' '),
  ];
  if (agents.includes('claude')) {
    commands.push('claude plugin install superpowers@superpowers-marketplace');
  }
  if (agents.includes('codex')) {
    commands.push('codex plugin add superpowers@openai-curated');
  }
  return commands;
}

export function detectPackageScope(
  projectPath: string,
  packageRoot = PACKAGE_ROOT
): InstallScope {
  const localPackageRoot = path.join(projectPath, 'node_modules', '@chenmk', 'superflow');
  if (isSameOrInside(packageRoot, localPackageRoot)) return 'project';

  const packageJsonPath = path.join(projectPath, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      if (
        pkg.dependencies?.[PACKAGE_NAME] ||
        pkg.devDependencies?.[PACKAGE_NAME] ||
        pkg.optionalDependencies?.[PACKAGE_NAME]
      ) {
        return 'project';
      }
    } catch {
      return 'global';
    }
  }

  return 'global';
}

function isSameOrInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function printPlan(plan: UpdatePlan, json: boolean, status = 'planned'): void {
  if (json) {
    console.log(JSON.stringify({ status, ...plan }, null, 2));
    return;
  }
  console.log(`SuperBridge Flow update ${status}: ${plan.agents.join(', ')}`);
  if (plan.packageUpdate.enabled) {
    console.log('packages:');
    for (const command of plan.packageUpdate.commands) {
      console.log(`  ${command}`);
    }
  }
  console.log(`skills: ${plan.skills.total}`);
  console.log(`rules: ${plan.rules.total}`);
  console.log(`scripts: ${plan.scripts.total}`);
  console.log(`hooks: ${plan.hooks.total}`);
}

async function updateNpmPackage(
  packageName: string,
  scope: InstallScope,
  label: string
): Promise<void> {
  const npmResult = await runCommand('npm', buildNpmUpdateArgs(packageName, scope));
  if (npmResult.code !== 0) {
    throw new Error(`${label} update failed: ${npmResult.stderr || npmResult.stdout}`);
  }
}

async function updateSuperpowers(agents: Agent[]): Promise<void> {
  if (agents.includes('claude')) {
    const result = await installSuperpowers();
    if (!result.ok) throw new Error(`superpowers update failed: ${result.error}`);
  }
  if (agents.includes('codex')) {
    const result = await installCodexSuperpowers();
    if (!result.ok) throw new Error(`codex superpowers update failed: ${result.error}`);
  }
}
