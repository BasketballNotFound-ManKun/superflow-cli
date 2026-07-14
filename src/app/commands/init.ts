import path from 'path';
import { existsSync } from 'fs';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { detectOS } from '../../platform/os.js';
import { getPlatformPaths, stateFile } from '../../platform/paths.js';
import {
  parseAgentSelection,
  parseInstallScope,
  resolveAgents,
} from '../../domains/agent.js';
import {
  installOpenspec,
  initializeOpenspec,
  openspecInitArgs,
  installSuperpowers,
  installCodexSuperpowers,
  installUnderstand,
  installCodexUnderstand,
  installApiDocChangelog,
} from '../../domains/deps.js';
import { deploySkill } from '../../domains/skill/deploy.js';
import { deployScripts } from '../../domains/skill/scripts.js';
import { deployPrompts } from '../../domains/skill/prompts.js';
import { deployRules } from '../../domains/skill/rules.js';
import { registerHook, clearSddHooks } from '../../domains/hook.js';
import { loadState, saveState, initState } from '../../domains/state.js';
import { scaffoldBusinessContext, checkUnderstandScan, printSoftPrompt } from '../../domains/config/context.js';
import {
  ALL_RULES,
  ALL_SKILLS,
  CODEX_PROMPTS,
  scriptsForAgent,
  hookScriptsForAgent,
} from '../../domains/skill/assets.js';
import { normalizeLanguage, t } from '../../domains/config/i18n.js';
import type { Agent, AgentSelection, InstallScope, Language } from '../../types.js';
import { ASSETS_DIR } from '../../platform/assets.js';

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
  overwrite: boolean;
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
}) {
  // commander 的 --no-hooks 标志让 options.hooks = false；默认是 true
  // commander 的 --no-scan 标志让 options.scan = false；默认是 true
  try {
    const language = await resolveInitLanguage(cmdOptions);
    const agent = await resolveInitAgentSelection(cmdOptions, language);
    await runInit({
      dryRun: !!cmdOptions.dryRun,
      agent,
      resume: !!cmdOptions.resume,
      noHooks: cmdOptions.hooks === false,  // 明确 false 才算 noHooks
      noOpenspecInit: cmdOptions.openspecInit === false,
      noScan: cmdOptions.scan === false,    // 明确 false 才算 noScan
      yes: !!cmdOptions.yes,
      json: !!cmdOptions.json,
      skipExisting: !!cmdOptions.skipExisting,
      overwrite: !!cmdOptions.overwrite,
      scope: parseInstallScope(cmdOptions.scope),
      language,
      projectPath: path.resolve(cmdOptions.targetPath ?? process.cwd()),
    });
  } catch (err) {
    if (cmdOptions.json) {
      console.log(JSON.stringify({ ok: false, error: (err as Error).message }, null, 2));
    } else {
      console.error(`[FAIL] ${(err as Error).message}`);
    }
    process.exit(1);
  }
}

async function resolveInitLanguage(cmdOptions: {
  language?: string;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
  resume?: boolean;
}): Promise<Language> {
  if (cmdOptions.language) {
    const parsed = normalizeLanguage(cmdOptions.language);
    if (!parsed) throw new Error(`invalid language: ${cmdOptions.language}`);
    return parsed;
  }
  const envLanguage = normalizeLanguage(process.env.SUPERFLOW_LANG);
  if (envLanguage) return envLanguage;
  if (cmdOptions.yes || cmdOptions.json || cmdOptions.dryRun || cmdOptions.resume) {
    return 'zh';
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) return 'zh';
  return promptLanguageSelection();
}

async function resolveInitAgentSelection(cmdOptions: {
  agent?: string;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
  resume?: boolean;
}, language: Language): Promise<AgentSelection> {
  if (cmdOptions.agent) return parseAgentSelection(cmdOptions.agent);
  if (cmdOptions.yes || cmdOptions.json || cmdOptions.dryRun || cmdOptions.resume) {
    return 'both';
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) return 'both';
  return promptAgentSelection(language);
}

export function parseInitAgentInput(value: string): AgentSelection | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'a' || normalized === 'both') {
    return 'both';
  }
  if (normalized === 'all') return 'all';
  const parts = normalized
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const selected = new Set<Agent>();
  for (const part of parts) {
    if (part === '1' || part === 'claude' || part === 'c') {
      selected.add('claude');
    } else if (part === '2' || part === 'codex' || part === 'x') {
      selected.add('codex');
    } else if (part === '3' || part === 'opencode' || part === 'o') {
      selected.add('opencode');
    } else {
      return null;
    }
  }
  if (selected.size === 3) return 'all';
  if (selected.size === 2 && selected.has('claude') && selected.has('codex')) return 'both';
  if (selected.size > 1) return [...selected];
  if (selected.has('claude')) return 'claude';
  if (selected.has('codex')) return 'codex';
  if (selected.has('opencode')) return 'opencode';
  return null;
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

async function promptAgentSelection(language: Language): Promise<AgentSelection> {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      console.log(`\n${t(language, 'agentPrompt')}`);
      console.log(`  1) ${t(language, 'agentClaude')}`);
      console.log(`  2) ${t(language, 'agentCodex')}`);
      console.log(`  3) ${t(language, 'agentOpenCode')}`);
      console.log(`  a) ${t(language, 'agentBoth')}`);
      const answer = await rl.question(t(language, 'agentAnswer'));
      const selection = parseInitAgentInput(answer);
      if (selection) return selection;
      console.log(t(language, 'agentInvalid'));
    }
  } finally {
    rl.close();
  }
}

async function promptLanguageSelection(): Promise<Language> {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      console.log(`\n${t('en', 'languagePrompt')}`);
      console.log(`  1) ${t('en', 'languageEnglish')}`);
      console.log(`  2) ${t('en', 'languageChinese')}`);
      const answer = await rl.question('Enter 1 / 2 / en / zh: ');
      const language = normalizeLanguage(answer);
      if (language) return language;
      console.log(t('en', 'languageInvalid'));
    }
  } finally {
    rl.close();
  }
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  if (options.skipExisting && options.overwrite) {
    throw new Error('--skip-existing and --overwrite cannot be used together');
  }

  const state = options.resume
    ? (loadState(stateFile) ?? initState('0.1.0', 'claude', options.language))
    : initState('0.1.0', 'claude', options.language);
  state.language = options.language;

  const osType = detectOS();
  const zh = options.language === 'zh';
  const agents = resolveAgents(options.agent);
  const projectPath = options.projectPath;
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
          log('[dry-run] Codex plugins/skills: superpowers / understand-anything / api-doc');
        }
        if (agents.includes('opencode')) {
          log('[dry-run] OpenCode: deploy skills/commands/scripts/rules; native hooks are not registered');
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
        if (!sup.ok) throw new Error(`superpowers install failed: ${sup.error}`);
        const und = await installUnderstand();
        if (!und.ok) warn(`[WARN] understand-anything: ${und.error}`);
        const api = await installApiDocChangelog(
          getPlatformPaths('claude', options.scope, projectPath).skillsDir
        );
        if (!api.ok) warn(`[WARN] api-doc-changelog: ${api.error}`);
      }
      if (agents.includes('codex')) {
        const sup = await installCodexSuperpowers();
        if (!sup.ok) throw new Error(`codex superpowers install failed: ${sup.error}`);
        const und = await installCodexUnderstand();
        if (!und.ok) warn(`[WARN] codex understand-anything: ${und.error}`);
        const api = await installApiDocChangelog(
          getPlatformPaths('codex', options.scope, projectPath).skillsDir
        );
        if (!api.ok) warn(`[WARN] codex api-doc-changelog: ${api.error}`);
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
            overwrite: options.overwrite,
            skipExisting: options.skipExisting,
          });
          log(`    ${options.skipExisting && existed ? '-' : '✓'} ${name}`);
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
          const cleared = clearSddHooks(platform.settingsFile);
          if (cleared > 0) {
            log(`  ✓ cleared ${cleared} old superflow/legacy sdd hooks (avoid duplicate registration)`);
          }
          for (const script of hookScripts) {
            const command = path.join(platform.scriptsDir, script);
            try {
              const timeout = script === 'superflow-dependency-update-hook.sh' ? 300 : undefined;
              registerHook(platform.settingsFile, script, command, { timeout });
              if (script === 'superflow-sql-sync-hook.py') {
                registerHook(platform.settingsFile, script, command, { matcherOverride: 'Bash' });
              }
            } catch (err) {
              warn(`  [WARN] ${script}: ${(err as Error).message}`);
            }
          }
          state.platforms[agent].hooks = hookScripts;
          log(`  ✓ ${hookScripts.length} hooks registered to ${platform.settingsFile}`);
        }
      }
    }},
    { id: 5, name: t(options.language, 'stepPrompts'), run: async () => {
      const promptAgents = agents.filter((agent) => agent === 'codex' || agent === 'opencode');
      if (promptAgents.length === 0) {
        log(zh
          ? '  - 未选择 Codex/OpenCode，跳过 prompt/command alias'
          : '  - Codex/OpenCode was not selected; skipping prompt/command aliases'
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
        const label = agent === 'opencode' ? 'command alias' : 'prompt alias';
        log(`  ✓ ${platform.name}: ${CODEX_PROMPTS.length} ${label} deployed`);
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
        console.error(t(options.language, 'runResume'));
      }
      process.exit(1);
    }
  }

  if (!options.dryRun) {
    log(`\n=== ${t(options.language, 'initComplete')} ===`);
    log(`${t(options.language, 'stateLabel')}: ${stateFile}`);
    printInitSummary(result, log);
  }
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  }
  return result;
}
