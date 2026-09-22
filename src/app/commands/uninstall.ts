import { existsSync, readdirSync, rmSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import {
  ALL_RULES,
  ALL_SKILLS,
  CODEX_PROMPTS,
  LEGACY_CODEX_PROMPTS,
  scriptsForAgent,
} from '../../domains/skill/assets.js';
import { getPlatformPaths } from '../../platform/paths.js';
import {
  parseAgentSelection,
  parseInstallScope,
  resolveAgents,
} from '../../domains/agent.js';
import { rulePath } from '../../domains/skill/rules.js';
import { clearSddHooks } from '../../domains/hook.js';
import { runCommand } from '../../platform/process.js';
import { CODEX_SUPERPOWERS_PLUGIN } from '../../domains/deps.js';
import { stateFile } from '../../platform/paths.js';
import {
  collectManagedProjectTargets,
  loadState,
  readManagedProjects,
  removeManagedProject,
  saveState,
} from '../../domains/state.js';
import type { Agent, InstallScope, SddState } from '../../types.js';

type UninstallScope = InstallScope | 'auto';

/** 读取某 agent 的安装范围记录；缺失回落 global 并通过 warn 上报（保持三命令目标一致）。 */
export function scopeForAgent(
  agent: Agent,
  state: SddState | null,
  warn: (message: string) => void = () => {},
): InstallScope {
  const recorded = state?.platforms?.[agent]?.scope;
  if (recorded === 'project' || recorded === 'global') return recorded;
  warn(`no install scope recorded for ${agent}; falling back to global`);
  return 'global';
}

/** 用户未显式指定 --scope 时，按 state 记录的安装范围推导各 agent 目标。 */
export function resolveUninstallTargetsFromRecord(
  projectPath: string,
  agents: Agent[],
  statePath = stateFile,
  warn: (message: string) => void = () => {},
): UninstallTarget[] {
  let state: SddState | null = null;
  try {
    state = loadState(statePath);
  } catch (err) {
    warn(`state file unreadable, ignoring recorded scopes: ${(err as Error).message}`);
  }
  return agents.map((agent) => ({
    agent,
    scope: scopeForAgent(agent, state, warn),
    projectPath,
  }));
}

const LEGACY_SKILLS = [
  'sdd-archive',
  'sdd-clarify',
  'sdd-design',
  'sdd-docs',
  'sdd-hotfix',
  'sdd-implement',
  'sdd-spec-pipeline',
  'sdd-table-impact-analysis',
  'sdd-tweak',
  'sdd-verify',
];

export interface UninstallTarget {
  agent: Agent;
  scope: InstallScope;
  projectPath: string;
}

export interface UninstallResult {
  ok: boolean;
  agents: string[];
  scope: UninstallScope;
  projectPath: string;
  dryRun: boolean;
  withDeps: boolean;
  removed: string[];
  hookCommandsRemoved: number;
  dependencyCommands: string[];
  targets: UninstallTarget[];
  summary: {
    targetsProcessed: number;
    totalRemoved: number;
    totalHookCommandsRemoved: number;
  };
}

export async function uninstallCommand(options: {
  agent?: string;
  dryRun?: boolean;
  withDeps?: boolean;
  json?: boolean;
  scope?: string;
  force?: boolean;
  targetPath?: string;
} = {}): Promise<void> {
  const agents = resolveAgents(parseAgentSelection(options.agent));
  const projectPath = path.resolve(options.targetPath ?? process.cwd());
  // 未显式指定 --scope 时按 state 记录的安装范围推导目标（与 init 保持一致）
  const hasExplicitScope = options.scope !== undefined && options.scope !== '';
  const scope: UninstallScope = hasExplicitScope ? parseUninstallScope(options.scope) : 'auto';
  const warn = (message: string) => {
    if (!options.json) console.warn(`  [WARN] ${message}`);
  };
  const targets = hasExplicitScope
    ? resolveUninstallTargets(projectPath, agents, scope)
    : resolveUninstallTargetsFromRecord(projectPath, agents, stateFile, warn);
  if (options.json && options.dryRun) {
    console.log(JSON.stringify(createUninstallPlan(agents, !!options.withDeps, scope, projectPath, targets), null, 2));
    return;
  }

  const result = await runUninstall({
    agents,
    scope,
    projectPath,
    dryRun: !!options.dryRun,
    withDeps: !!options.withDeps,
    quiet: !!options.json,
    targets,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nUninstall complete. Removed ${result.removed.length + result.hookCommandsRemoved} item(s).`);
}

export async function runUninstall(options: {
  agents: string[];
  scope: UninstallScope;
  projectPath: string;
  dryRun: boolean;
  withDeps: boolean;
  quiet?: boolean;
  targets?: UninstallTarget[];
  statePath?: string;
}): Promise<UninstallResult> {
  const removed: string[] = [];
  let hookCommandsRemoved = 0;
  const targets = options.targets ?? resolveUninstallTargets(
    options.projectPath,
    options.agents as Agent[],
    options.scope
  );

  for (const target of targets) {
    hookCommandsRemoved += cleanUninstallTarget(
      target,
      options.dryRun,
      removed,
      !!options.quiet
    );
  }
  hookCommandsRemoved += cleanManagedProjects(options, targets, removed);

  const dependencyCommands = dependencyUninstallCommands(options.agents, options.withDeps);
  if (options.withDeps) {
    await uninstallDependencies(options.agents, options.dryRun);
  }

  return {
    ok: true,
    agents: options.agents,
    scope: options.scope,
    projectPath: options.projectPath,
    dryRun: options.dryRun,
    withDeps: options.withDeps,
    removed,
    hookCommandsRemoved,
    dependencyCommands,
    targets,
    summary: {
      targetsProcessed: targets.length,
      totalRemoved: removed.length + hookCommandsRemoved,
      totalHookCommandsRemoved: hookCommandsRemoved,
    },
  };
}

/** 清理单个目标的 hooks/skills/rules/scripts/prompts；返回移除的 hook 命令数。 */
function cleanUninstallTarget(
  target: UninstallTarget,
  dryRun: boolean,
  removed: string[],
  quiet: boolean
): number {
  let hookCommandsRemoved = 0;
  const platform = getPlatformPaths(target.agent, target.scope, target.projectPath);
  if (existsSync(platform.settingsFile)) {
    if (dryRun) {
      removed.push(platform.settingsFile);
    } else {
      hookCommandsRemoved += clearSddHooks(platform.settingsFile);
    }
  }
  for (const skill of [...ALL_SKILLS, ...LEGACY_SKILLS]) {
    removeSkillWithBackups(platform.skillsDir, skill, dryRun, removed, quiet);
  }
  for (const rule of ALL_RULES) {
    removePath(rulePath(platform.rulesDir, rule), dryRun, removed, quiet);
  }
  for (const script of scriptsForAgent(target.agent)) {
    removePath(path.join(platform.scriptsDir, script), dryRun, removed, quiet);
  }
  if (target.agent === 'codex') {
    for (const prompt of [...CODEX_PROMPTS, ...LEGACY_CODEX_PROMPTS]) {
      removePath(path.join(platform.promptsDir, prompt), dryRun, removed, quiet);
    }
  }
  return hookCommandsRemoved;
}

function targetKey(target: UninstallTarget): string {
  return `${target.agent}|${target.scope}|${target.projectPath}`;
}

/** 遍历受管项目清单：清理目录仍存在的项目，目录已消失的条目直接移除；损坏/缺失不阻断。 */
function cleanManagedProjects(
  options: { dryRun: boolean; quiet?: boolean; statePath?: string },
  processedTargets: UninstallTarget[],
  removed: string[]
): number {
  const statePath = options.statePath ?? stateFile;
  let state: SddState | null = null;
  try {
    state = loadState(statePath);
  } catch (err) {
    if (!options.quiet) {
      console.warn(`  [WARN] managed project list skipped: ${(err as Error).message}`);
    }
    return 0;
  }
  if (!state) return 0;
  const quiet = !!options.quiet;
  const warn = (message: string) => {
    if (!quiet) console.warn(`  [WARN] ${message}`);
  };
  const projects = readManagedProjects(state, warn);
  const { targets, staleRoots } = collectManagedProjectTargets(projects);
  for (const root of staleRoots) {
    removeManagedProject(state, root);
    if (!quiet) console.log(`  ✓ pruned stale managed project entry: ${root}`);
  }
  const seen = new Set(processedTargets.map(targetKey));
  let hookCommandsRemoved = 0;
  let cleaned = 0;
  for (const project of targets) {
    for (const agent of project.agents) {
      const target: UninstallTarget = { agent, scope: 'project', projectPath: project.root };
      const key = targetKey(target);
      if (seen.has(key)) continue;
      seen.add(key);
      hookCommandsRemoved += cleanUninstallTarget(target, options.dryRun, removed, quiet);
      cleaned++;
    }
  }
  if (!options.dryRun && (staleRoots.length > 0 || cleaned > 0)) {
    try {
      saveState(statePath, state);
    } catch (err) {
      warn(`failed to update managed project list: ${(err as Error).message}`);
    }
  }
  return hookCommandsRemoved;
}

export function createUninstallPlan(
  agents: string[],
  withDeps: boolean,
  scope: UninstallScope = 'global',
  projectPath = process.cwd(),
  targetsToPlan?: UninstallTarget[]
): {
  agents: string[];
  scope: UninstallScope;
  projectPath: string;
  withDeps: boolean;
  targets: string[];
  installTargets: UninstallTarget[];
  dependencyCommands: string[];
} {
  const targets: string[] = [];
  const installTargets = targetsToPlan ?? resolveUninstallTargets(
    projectPath,
    agents as Agent[],
    scope
  );
  for (const target of installTargets) {
    const platform = getPlatformPaths(target.agent, target.scope, target.projectPath);
    targets.push(platform.settingsFile);
    for (const skill of [...ALL_SKILLS, ...LEGACY_SKILLS]) {
      targets.push(path.join(platform.skillsDir, skill));
      targets.push(path.join(platform.skillsDir, `${skill}.backup-*`));
    }
    for (const rule of ALL_RULES) {
      targets.push(rulePath(platform.rulesDir, rule));
    }
    for (const script of scriptsForAgent(target.agent)) {
      targets.push(path.join(platform.scriptsDir, script));
    }
    if (target.agent === 'codex') {
      for (const prompt of [...CODEX_PROMPTS, ...LEGACY_CODEX_PROMPTS]) {
        targets.push(path.join(platform.promptsDir, prompt));
      }
    }
  }
  const dependencyCommands = dependencyUninstallCommands(agents, withDeps);
  return { agents, scope, projectPath, withDeps, targets, installTargets, dependencyCommands };
}

export function detectInstalledUninstallTargets(
  projectPath: string,
  agents: Agent[]
): UninstallTarget[] {
  const targets: UninstallTarget[] = [];
  for (const scope of ['project', 'global'] as InstallScope[]) {
    for (const agent of agents) {
      const platform = getPlatformPaths(agent, scope, projectPath);
      const hasSkill =
        existsSync(path.join(platform.skillsDir, 'superflow-pipeline', 'SKILL.md')) ||
        existsSync(path.join(platform.skillsDir, 'sdd-spec-pipeline', 'SKILL.md'));
      const hasRule = ALL_RULES.some((rule) => existsSync(rulePath(platform.rulesDir, rule)));
      const hasScript = scriptsForAgent(agent).some((script) =>
        existsSync(path.join(platform.scriptsDir, script))
      );
      const hasPrompt = agent === 'codex' &&
        [...CODEX_PROMPTS, ...LEGACY_CODEX_PROMPTS].some((prompt) =>
          existsSync(path.join(platform.promptsDir, prompt))
        );
      if (hasSkill || hasRule || hasScript || hasPrompt) {
        targets.push({ agent, scope, projectPath });
      }
    }
  }
  return targets;
}

function resolveUninstallTargets(
  projectPath: string,
  agents: Agent[],
  scope: UninstallScope
): UninstallTarget[] {
  if (scope === 'auto') {
    return detectInstalledUninstallTargets(projectPath, agents);
  }
  return agents.map((agent) => ({ agent, scope, projectPath }));
}

function parseUninstallScope(value: unknown): UninstallScope {
  if (value === 'auto') return 'auto';
  return parseInstallScope(value);
}

function removePath(
  target: string,
  dryRun: boolean,
  removed?: string[],
  quiet = false
): number {
  if (!existsSync(target)) return 0;
  if (dryRun) {
    if (!quiet) console.log(`[dry-run] rm -rf ${target}`);
    removed?.push(target);
    return 1;
  }
  rmSync(target, { recursive: true, force: true });
  if (!quiet) console.log(`  ✓ removed ${target}`);
  removed?.push(target);
  return 1;
}

function removeSkillWithBackups(
  skillsDir: string,
  skill: string,
  dryRun: boolean,
  removed?: string[],
  quiet = false
): number {
  let count = removePath(path.join(skillsDir, skill), dryRun, removed, quiet);
  if (!existsSync(skillsDir)) return count;

  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith(`${skill}.backup-`)) continue;
    count += removePath(path.join(skillsDir, entry.name), dryRun, removed, quiet);
  }
  return count;
}

function dependencyUninstallCommands(agents: string[], withDeps: boolean): string[] {
  return withDeps
    ? [
        agents.includes('codex')
          ? `codex plugin remove ${CODEX_SUPERPOWERS_PLUGIN}`
          : null,
        agents.includes('codex') ? 'bash ~/.understand-anything/repo/install.sh --uninstall codex' : null,
        agents.includes('claude') ? 'claude plugin remove superpowers@superpowers-marketplace' : null,
        agents.includes('claude') ? 'claude plugin remove understand-anything@understand-anything' : null,
        'npm uninstall -g @fission-ai/openspec',
      ].filter((cmd): cmd is string => Boolean(cmd))
    : [];
}

async function uninstallDependencies(agents: string[], dryRun: boolean): Promise<void> {
  if (agents.includes('codex')) {
    await maybeRun(
      'codex superpowers',
      'codex',
      ['plugin', 'remove', CODEX_SUPERPOWERS_PLUGIN],
      dryRun
    );
    await maybeRun(
      'codex understand-anything',
      'bash',
      [path.join(homedir(), '.understand-anything', 'repo', 'install.sh'), '--uninstall', 'codex'],
      dryRun
    );
  }
  if (agents.includes('claude')) {
    await maybeRun(
      'claude superpowers',
      'claude',
      ['plugin', 'remove', 'superpowers@superpowers-marketplace'],
      dryRun
    );
    await maybeRun(
      'claude understand-anything',
      'claude',
      ['plugin', 'remove', 'understand-anything@understand-anything'],
      dryRun
    );
  }
  await maybeRun('openspec CLI', 'npm', ['uninstall', '-g', '@fission-ai/openspec'], dryRun);
}

async function maybeRun(label: string, command: string, args: string[], dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] ${command} ${args.join(' ')}`);
    return;
  }
  const result = await runCommand(command, args);
  if (result.code === 0) {
    console.log(`  ✓ uninstalled ${label}`);
  } else {
    console.warn(`  [WARN] ${label}: ${result.stderr || result.stdout}`);
  }
}
