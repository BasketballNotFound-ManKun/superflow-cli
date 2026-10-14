import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { detectOS } from '../../platform/os.js';
import { getPlatformPaths, stateFile } from '../../platform/paths.js';
import {
  parseAgentSelection,
  parseInstallScope,
  resolveAgents,
} from '../../domains/agent.js';
import {
  CODEX_SUPERPOWERS_PLUGIN,
  installOpenspec,
  initializeOpenspec,
  openspecInitArgs,
  installSuperpowers,
  installCodexSuperpowers,
  installUnderstand,
  installCodexUnderstand,
} from '../../domains/deps.js';
import { deploySkill, retireSkillAssets } from '../../domains/skill/deploy.js';
import { deployScripts } from '../../domains/skill/scripts.js';
import { deployPrompts } from '../../domains/skill/prompts.js';
import { deployRules } from '../../domains/skill/rules.js';
import { syncManagedHooks } from '../../domains/hook.js';
import { migrateGlobalHooks, migrateProjectHooks } from '../../domains/hook-migration.js';
import { loadState, saveState, initState, upsertManagedProject } from '../../domains/state.js';
import { scaffoldBusinessContext, checkUnderstandScan, printSoftPrompt } from '../../domains/config/context.js';
import {
  ALL_RULES,
  ALL_SKILLS,
  CODEX_PROMPTS,
  scriptsForAgent,
  hookScriptsForAgent,
} from '../../domains/skill/assets.js';
import { getManifest } from '../../domains/config/manifest.js';
import { normalizeLanguage, t } from '../../domains/config/i18n.js';
import type { AgentSelection, InstallScope, Language } from '../../types.js';
import { ASSETS_DIR, PACKAGE_ROOT } from '../../platform/assets.js';
import { manageMcpIntegration } from "./mcp.js";
import { resolveRuntimeLanguage } from "../../domains/config/cli-help.js";
import {
  TerminalWizard,
  WizardCancelled,
  canPrompt,
  detectedAgentDefault,
} from "../interactive.js";
export { parseAgentInput as parseInitAgentInput } from "../interactive.js";
import { ensureSuperflowGitignore } from '../../domains/managed-work/gitignore.js';

export interface InitOptions {
  dryRun: boolean;
  agent: AgentSelection;
  resume: boolean;
  noHooks: boolean;   // --no-hooks 标志：跳过 hook 注册（脚本仍部署）
  noOpenspecInit: boolean;
  noScan: boolean;    // --no-scan 标志：跳过 Step 5 项目扫描
  yes: boolean;
  json: boolean;
  skipExisting: boolean;
  scope: InstallScope;
  language: Language;
  projectPath: string;
}

export interface InitResult {
  ok: boolean;
  dryRun: boolean;
  agents: string[];
  scope: InstallScope;
  language: Language;
  projectPath: string;
  steps: Array<{ id: number; name: string; status: 'completed' | 'skipped' | 'failed'; error?: string }>;
  skills: { total: number; names: string[] };
  rules: { total: number; names: string[] };
  scripts: Record<string, { total: number; names: string[] }>;
  hooks: Record<string, { total: number; names: string[]; registered: boolean }>;
  stateFile: string;
  resumeCommand?: string;
}

export async function initCommand(cmdOptions: {
  dryRun?: boolean;
  agent?: string;
  resume?: boolean;
  hooks?: boolean;
  openspecInit?: boolean;
  scan?: boolean;
  yes?: boolean;
  json?: boolean;
  skipExisting?: boolean;
  overwrite?: boolean;
  scope?: string;
  targetPath?: string;
  language?: string;
  interactive?: boolean;
}) {
  let wizard: TerminalWizard | undefined;
  // commander 的 --no-hooks 标志让 options.hooks = false；默认是 true
  // commander 的 --no-scan 标志让 options.scan = false；默认是 true
  try {
    if (cmdOptions.resume && (!cmdOptions.agent || !cmdOptions.scope)) {
      throw new Error(
        resolveRuntimeLanguage(cmdOptions.language) === 'zh'
          ? '恢复需要原来的 --agent 和 --scope，请使用失败输出中的完整恢复命令。'
          : 'Resume requires the original --agent and --scope. Use the complete recovery command from the failure output.',
      );
    }
    const fullWizard =
      cmdOptions.interactive ??
      (!cmdOptions.agent && !cmdOptions.scope && !cmdOptions.language);
    if (canPrompt(cmdOptions))
      wizard = new TerminalWizard(resolveRuntimeLanguage(cmdOptions.language));
    const explicitLanguage = cmdOptions.language
      ? normalizeLanguage(cmdOptions.language)
      : undefined;
    if (cmdOptions.language && !explicitLanguage)
      throw new Error(`invalid language: ${cmdOptions.language}`);
    const language =
      explicitLanguage ??
      (wizard ? await wizard.selectLanguage() : resolveRuntimeLanguage());
    const agent = cmdOptions.agent
      ? parseAgentSelection(cmdOptions.agent)
      : wizard
        ? await wizard.selectAgents(await detectedAgentDefault())
        : 'both';
    const scope = cmdOptions.scope
      ? parseInstallScope(cmdOptions.scope)
      : wizard && fullWizard
        ? ((await wizard.selectScope(false)) as InstallScope)
        : 'global';
    if (wizard && fullWizard) {
      const installed = JSON.parse(
        readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
      ) as { version: string };
      console.log(
        `CLI: ${installed.version} (${path.join(PACKAGE_ROOT, 'dist', 'app', 'cli.js')})`,
      );
      console.log(
        wizard.text(
          `\nAgent: ${resolveAgents(agent).join(', ')}\n语言: ${language}\n范围: ${scope}\n项目: ${path.resolve(cmdOptions.targetPath ?? process.cwd())}`,
          `\nAgents: ${resolveAgents(agent).join(', ')}\nLanguage: ${language}\nScope: ${scope}\nProject: ${path.resolve(cmdOptions.targetPath ?? process.cwd())}`,
        ),
      );
      console.log(
        wizard.text(
          '将部署技能、Hooks、依赖、MCP，并按选项初始化项目上下文。',
          'Deploy skills, Hooks, dependencies and MCP, initializing project context as selected.',
        ),
      );
      const confirmed = await wizard.confirm();
      wizard.close();
      wizard = undefined;
      if (!confirmed) return;
    }
    wizard?.close();
    wizard = undefined;
    await runInit({
      dryRun: !!cmdOptions.dryRun,
      agent,
      resume: !!cmdOptions.resume,
      noHooks: cmdOptions.hooks === false, // 明确 false 才算 noHooks
      noOpenspecInit: cmdOptions.openspecInit === false,
      noScan: cmdOptions.scan === false, // 明确 false 才算 noScan
      yes: !!cmdOptions.yes,
      json: !!cmdOptions.json,
      skipExisting: !!cmdOptions.skipExisting,
      scope,
      language,
      projectPath: path.resolve(cmdOptions.targetPath ?? process.cwd()),
    });
  } catch (err) {
    if (err instanceof WizardCancelled) {
      console.log('Cancelled / 已取消');
      return;
    }
    if (cmdOptions.json) {
      console.log(
        JSON.stringify({ ok: false, error: (err as Error).message }, null, 2),
      );
    } else {
      console.error(`[FAIL] ${(err as Error).message}`);
    }
    process.exit(1);
  } finally {
    wizard?.close();
  }
}

function initStepSummary(result: InitResult): string[] {
  const completed = result.steps.filter((step) => step.status === 'completed');
  const skipped = result.steps.filter((step) => step.status === 'skipped');
  const failed = result.steps.filter((step) => step.status === 'failed');
  const lines = [
    '',
    '=== superflow init summary ===',
    `Agents: ${result.agents.join(', ')}`,
    `Language: ${result.language}`,
    `Scope: ${result.scope}`,
    `Project: ${result.projectPath}`,
    `Steps: ${completed.length} completed, ${skipped.length} skipped, ${failed.length} failed`,
  ];
  if (completed.length > 0) {
    lines.push(`Completed: ${completed.map((step) => `${step.id}.${step.name}`).join(' / ')}`);
  }
  if (skipped.length > 0) {
    lines.push(`Skipped: ${skipped.map((step) => `${step.id}.${step.name}`).join(' / ')}`);
  }
  if (failed.length > 0) {
    lines.push(
      `Failed: ${failed
        .map((step) => `${step.id}.${step.name}${step.error ? ` (${step.error})` : ''}`)
        .join(' / ')}`
    );
  }
  return lines;
}

function printInitSummary(result: InitResult, write: (line: string) => void): void {
  for (const line of initStepSummary(result)) {
    write(line);
  }
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const state = options.resume
    ? (loadState(stateFile) ?? initState('0.1.0', 'claude', options.language))
    : initState('0.1.0', 'claude', options.language);
  state.language = options.language;

  const osType = detectOS();
  const zh = options.language === 'zh';
  const agents = resolveAgents(options.agent);
  const projectPath = options.projectPath;
  if (!options.dryRun && options.scope === 'project') {
    ensureSuperflowGitignore(projectPath);
  }
  const result: InitResult = {
    ok: true,
    dryRun: options.dryRun,
    agents,
    scope: options.scope,
    language: options.language,
    projectPath,
    steps: [],
    skills: { total: ALL_SKILLS.length, names: ALL_SKILLS },
    rules: { total: ALL_RULES.length, names: ALL_RULES },
    scripts: {},
    hooks: {},
    stateFile,
  };
  const log = (message = '') => {
    if (!options.json) console.log(message);
  };
  const warn = (message: string) => {
    if (!options.json) console.warn(message);
  };

  for (const agent of agents) {
    const scripts = scriptsForAgent(agent);
    const hooks = hookScriptsForAgent(agent);
    result.scripts[agent] = { total: scripts.length, names: scripts };
    result.hooks[agent] = {
      total: hooks.length,
      names: hooks,
      registered: !options.noHooks,
    };
  }

  const steps = [
    { id: 1, name: t(options.language, 'stepDetect'), run: async () => {
      log(`OS: ${osType}`);
      log(`Agents: ${agents.join(', ')}`);
      for (const agent of agents) {
        const platform = getPlatformPaths(agent, options.scope, projectPath);
        log(`${platform.name} skillsDir: ${platform.skillsDir}`);
        log(`${platform.name} rulesDir: ${platform.rulesDir}`);
        log(`${platform.name} scriptsDir: ${platform.scriptsDir}`);
        log(`${platform.name} settingsFile: ${platform.settingsFile}`);
      }
    }},
    { id: 2, name: t(options.language, 'stepDeps'), run: async () => {
      if (options.dryRun) {
        log('[dry-run] npm install -g @fission-ai/openspec@latest');
        if (options.noOpenspecInit) {
          log('[dry-run] --no-openspec-init set, skipping openspec init');
        } else {
          log(`[dry-run] openspec ${openspecInitArgs(projectPath, agents, options.scope).join(' ')}`);
        }
        if (agents.includes('claude')) {
          log('[dry-run] Claude plugins: superpowers / understand-anything / api-doc');
        }
        if (agents.includes('codex')) {
          log(`[dry-run] codex plugin add ${CODEX_SUPERPOWERS_PLUGIN}`);
          log('[dry-run] Codex skills: understand-anything / api-doc');
        }
        return;
      }
      const openspec = await installOpenspec();
      if (!openspec.ok) throw new Error(`openspec install failed: ${openspec.error}`);
      if (options.noOpenspecInit) {
        log(zh
          ? '  ⚠ --no-openspec-init: 跳过当前项目 OpenSpec 原生初始化'
          : '  ⚠ --no-openspec-init: skipping native OpenSpec initialization'
        );
      } else {
        const openspecInit = await initializeOpenspec(projectPath, agents, options.scope);
        if (!openspecInit.ok) {
          throw new Error(`openspec init failed: ${openspecInit.error}`);
        }
        log(`  ✓ OpenSpec initialized for tools: ${agents.join(', ')}`);
      }
      if (agents.includes('claude')) {
        const sup = await installSuperpowers();
        if (!sup.ok) {
          throw new Error(`claude superpowers install failed: ${sup.error}`);
        }
        const und = await installUnderstand();
        if (!und.ok) warn(`[WARN] understand-anything: ${und.error}`);
      }
      if (agents.includes('codex')) {
        const sup = await installCodexSuperpowers(true);
        if (!sup.ok) {
          throw new Error(`codex superpowers install failed: ${sup.error}`);
        }
        log(zh
          ? '  ✓ Codex Superpowers 已安装；重启当前 Host 后加载验证、代码评审和分支收尾技能'
          : '  ✓ Codex Superpowers installed; restart the current host to load verification, code review, and branch-closeout skills'
        );
        const und = await installCodexUnderstand();
        if (!und.ok) warn(`[WARN] codex understand-anything: ${und.error}`);
      }
    }},
    { id: 3, name: `${t(options.language, 'stepSkills')} (${ALL_SKILLS.length})`, run: async () => {
      const skillsRoot = options.language === 'en'
        ? path.join(ASSETS_DIR, 'skills-en')
        : path.join(ASSETS_DIR, 'skills');
      if (options.dryRun) {
        for (const agent of agents) {
          const platform = getPlatformPaths(agent, options.scope, projectPath);
          log(`[dry-run] cp -R ${ALL_SKILLS.join(', ')} → ${platform.skillsDir}`);
        }
        return;
      }
      for (const agent of agents) {
        const platform = getPlatformPaths(agent, options.scope, projectPath);
        log(`  ${platform.name}:`);
        for (const name of ALL_SKILLS) {
          const dest = path.join(platform.skillsDir, name);
          const existed = existsSync(dest);
          await deploySkill(name, skillsRoot, platform.skillsDir, {
            agent,
            skipExisting: options.skipExisting,
          });
          log(`    ${options.skipExisting && existed ? '-' : '✓'} ${name}`);
        }
        if (!options.skipExisting) {
          const retired = await retireSkillAssets(platform.skillsDir, getManifest().retiredSkills ?? {});
          if (retired.preserved.length) warn(zh
            ? `保留修改过的旧技能，请人工核对：${retired.preserved.join(', ')}`
            : `Modified old skills preserved for manual review: ${retired.preserved.join(', ')}`);
        }
        state.platforms[agent].skills = ALL_SKILLS;
      }
    }},
    { id: 4, name: t(options.language, 'stepScriptsHooks'), run: async () => {
      if (options.dryRun) {
        for (const agent of agents) {
          const platform = getPlatformPaths(agent, options.scope, projectPath);
          const scripts = scriptsForAgent(agent);
          const hookScripts = hookScriptsForAgent(agent);
          log(`[dry-run] cp ${scripts.length} scripts → ${platform.scriptsDir}`);
          if (hookScripts.length === 0) {
            log(`[dry-run] ${platform.name}: native hook registration is not supported`);
          } else if (!options.noHooks) {
            log(`[dry-run] register ${hookScripts.length} hooks → ${platform.settingsFile}`);
          } else {
            log(`[dry-run] --no-hooks set, skipping hook registration`);
          }
        }
        return;
      }
      for (const agent of agents) {
        const platform = getPlatformPaths(agent, options.scope, projectPath);
        const scripts = scriptsForAgent(agent);
        await deployScripts(scripts, path.join(ASSETS_DIR, 'scripts'), platform.scriptsDir, {
          agent,
          skipExisting: options.skipExisting,
        });
        log(`  ✓ ${platform.name}: ${scripts.length} scripts deployed`);
        state.platforms[agent].scripts = scripts;

        if (options.noHooks) {
          log(zh
            ? `  ⚠ --no-hooks: 跳过 ${platform.name} hook 注册（脚本已部署，hook 需手工配）`
            : `  ⚠ --no-hooks: skipped ${platform.name} hook registration (scripts deployed)`
          );
        } else {
          const hookScripts = hookScriptsForAgent(agent);
          if (hookScripts.length === 0) {
            log(zh
              ? `  ⚠ ${platform.name}: 当前未注册自动 hook；可通过 /superflow-* command 显式运行门禁`
              : `  ⚠ ${platform.name}: automatic hooks are not registered; run /superflow-* commands to execute gates`
            );
            state.platforms[agent].hooks = [];
            continue;
          }
          if (options.scope === 'project') {
            const migration = migrateProjectHooks(projectPath, agent === 'codex' ? 'codex' : 'claude', { replacementAvailable: true });
            if (migration.changed) log(`  ✓ migrated legacy ${agent} project hooks; backup: ${migration.backup}`);
          }
          const synced = syncManagedHooks(platform.settingsFile, platform.scriptsDir, hookScripts);
          if (synced.changed) log(`  ✓ reconciled ${synced.registered} hooks; removed ${synced.removed} old registrations`);
          state.platforms[agent].hooks = hookScripts;
          log(`  ✓ ${hookScripts.length} hooks registered to ${platform.settingsFile}`);
        }
      }
    }},
    { id: 5, name: t(options.language, 'stepPrompts'), run: async () => {
      const promptAgents = agents.filter((agent) => agent === 'codex');
      if (promptAgents.length === 0) {
        log(zh
          ? '  - 未选择 Codex，跳过 prompt alias'
          : '  - Codex was not selected; skipping prompt alias'
        );
        return;
      }
      if (options.dryRun) {
        for (const agent of promptAgents) {
          const platform = getPlatformPaths(agent, options.scope, projectPath);
          log(`[dry-run] cp ${CODEX_PROMPTS.join(', ')} → ${platform.promptsDir}`);
        }
        return;
      }
      for (const agent of promptAgents) {
        const platform = getPlatformPaths(agent, options.scope, projectPath);
        await deployPrompts(
          CODEX_PROMPTS,
          path.join(ASSETS_DIR, 'prompts'),
          platform.promptsDir,
          { skipExisting: options.skipExisting }
        );
        if (!options.skipExisting) {
          const retiredPrompts = await retireSkillAssets(platform.promptsDir, getManifest().retiredPrompts ?? {});
          if (retiredPrompts.preserved.length) warn(zh
            ? `保留修改过的旧 Prompt：${retiredPrompts.preserved.join(', ')}`
            : `Modified old prompts preserved: ${retiredPrompts.preserved.join(', ')}`);
        }
        log(`  ✓ ${platform.name}: ${CODEX_PROMPTS.length} prompt alias deployed`);
      }
    }},
    { id: 6, name: `${t(options.language, 'stepRules')} (${ALL_RULES.length})`, run: async () => {
      if (options.dryRun) {
        for (const agent of agents) {
          const platform = getPlatformPaths(agent, options.scope, projectPath);
          log(`[dry-run] cp ${ALL_RULES.join(', ')} → ${platform.rulesDir}`);
        }
        return;
      }
      for (const agent of agents) {
        const platform = getPlatformPaths(agent, options.scope, projectPath);
        await deployRules(ALL_RULES, path.join(ASSETS_DIR, 'rules'), platform.rulesDir, {
          skipExisting: options.skipExisting,
        });
        log(`  ✓ ${platform.name}: ${ALL_RULES.length} rule(s) deployed`);
      }
    }},
    { id: 7, name: t(options.language, 'stepScan'), run: async () => {
      if (options.noScan) {
        if (options.dryRun) {
          log(`[dry-run] --no-scan set, skipping Step 7 entirely`);
        } else {
          log(zh
            ? '  ⚠ --no-scan: 跳过 Step 7 项目扫描（脚手架 + understand-anything + 软提示）'
            : '  ⚠ --no-scan: skipped Step 7 project context scaffolding and scan hints'
          );
        }
        return;
      }
      if (options.dryRun) {
        log(zh
          ? `[dry-run] scaffold <cwd>/docs/sdd-context/ (4 files) + understand-anything scan + 软提示`
          : '[dry-run] scaffold <cwd>/docs/sdd-context/ (4 files) + understand-anything scan + soft prompt'
        );
        return;
      }
      // 1. 脚手架 4 个初始文件
      const cwd = projectPath;
      const scaffolding = await scaffoldBusinessContext(cwd, options.language);
      log(`  ✓ scaffolded docs/sdd-context/ (copied ${scaffolding.copied.length}, skipped ${scaffolding.skipped.length})`);
      // 2. 检查 understand-anything 是否已扫
      const understandResult = await checkUnderstandScan(cwd);
      if (understandResult.ok) {
        log('  ✓ understand-anything graph detected: ' + understandResult.graphPath);
      } else {
        log(zh
          ? '  ⚠ understand-anything 还没扫 — SDD 影响面发现前置条件，不跑会导致 docs/design 门禁阻塞'
          : '  ⚠ understand-anything not scanned — required for SDD impact discovery; will block docs/design gate'
        );
      }
      // 3. 软提示
      if (!options.json) {
        printSoftPrompt(cwd, scaffolding, understandResult, options.language);
      }
    }},
    {
      id: 8,
      name: t(options.language, "stepMcp"),
      run: async () => {
        if (options.dryRun) {
          log(`[dry-run] superflow mcp install --agent ${agents.join(",")}`);
          return;
        }
        const registration = manageMcpIntegration(
          "install",
          { agent: agents.join(",") },
          options.language,
        );
        for (const item of registration.agents)
          log(`  ✓ ${item.agent}: MCP configured`);
      },
    },
  ];

  for (const step of steps) {
    if (state.completedSteps.includes(step.id)) {
      log(`Step ${step.id} (${step.name}): already completed, skipping`);
      result.steps.push({ id: step.id, name: step.name, status: 'skipped' });
      continue;
    }
    log(`\n=== Step ${step.id}: ${step.name} ===`);
    try {
      await step.run();
      result.steps.push({ id: step.id, name: step.name, status: 'completed' });
      state.completedSteps.push(step.id);
      if (!options.dryRun) {
        state.lastInit = new Date().toISOString();
        saveState(stateFile, state);
      }
    } catch (err) {
      state.completedSteps = state.completedSteps.filter((n) => n !== step.id);
      if (!options.dryRun) saveState(stateFile, state);
      result.ok = false;
      result.resumeCommand = initResumeCommand(options);
      result.steps.push({
        id: step.id,
        name: step.name,
        status: 'failed',
        error: (err as Error).message,
      });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.error(`[FAIL] Step ${step.id} failed: ${(err as Error).message}`);
        printInitSummary(result, (line) => console.error(line));
        console.error(`${t(options.language, 'runResume')}\n${result.resumeCommand}`);
      }
      process.exit(1);
    }
  }

  if (!options.dryRun) {
    if (!options.noHooks) {
      for (const agent of agents) {
        const globalSettings = getPlatformPaths(agent, 'global', projectPath).settingsFile;
        const homeRoot = path.dirname(path.dirname(globalSettings));
        const migration = migrateGlobalHooks(homeRoot, agent);
        if (migration.error) throw new Error(`global ${agent} Hook migration failed: ${migration.error}`);
        if (migration.changed) log(`  ✓ migrated legacy global ${agent} Hooks; backup: ${migration.backup}`);
      }
    }
    // 统一记录安装范围（不依赖 step 4 是否执行，resume 跳过场景也保持一致）
    for (const agent of agents) {
      state.platforms[agent].scope = options.scope;
    }
    if (options.scope === 'project') {
      // 登记/更新受管项目清单（按 root 幂等），供 uninstall/update 遍历
      upsertManagedProject(state, {
        root: projectPath,
        agents,
        scope: options.scope,
        hooks: agents.flatMap((agent) => state.platforms[agent].hooks),
        registeredAt: new Date().toISOString(),
      });
    }
    saveState(stateFile, state);
    log(`\n=== ${t(options.language, 'initComplete')} ===`);
    log(`${t(options.language, 'stateLabel')}: ${stateFile}`);
    printInitSummary(result, log);
    log(
      zh
        ? "请重启所选宿主，让新技能和 MCP 生效。"
        : "Restart the selected hosts to load the new skills and MCP.",
    );
    log(
      `superflow doctor --agent ${agents.length === 2 ? "both" : agents[0]} --scope ${options.scope}`,
    );
  }
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  }
  return result;
}

function initResumeCommand(options: InitOptions): string {
  const escape = process.platform === 'win32' ? "''" : "'\\''";
  const project = "'" + options.projectPath.replaceAll("'", escape) + "'";
  const args = [
    'superflow',
    'init',
    project,
    '--resume',
    '--agent',
    resolveAgents(options.agent).join(','),
    '--scope',
    options.scope,
    '--language',
    options.language,
    '--yes',
  ];
  if (options.noHooks) args.push('--no-hooks');
  if (options.noScan) args.push('--no-scan');
  if (options.noOpenspecInit) args.push('--no-openspec-init');
  if (options.skipExisting) args.push('--skip-existing');
  if (options.json) args.push('--json');
  return args.join(' ');
}
