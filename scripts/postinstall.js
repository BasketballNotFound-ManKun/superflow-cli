#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgPath = join(__dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

const LANGUAGE_ZH = 'zh';
const LANGUAGE_EN = 'en';

export function isGlobalInstall(env = process.env) {
  return env.npm_config_global === 'true';
}

export function resolveInstallLanguage(env = process.env) {
  const lang = env.SUPERFLOW_LANG || env.LC_ALL || env.LANG || '';
  const normalized = lang.toLowerCase();
  if (normalized.includes('zh') || normalized.includes('cn')) return LANGUAGE_ZH;
  if (normalized.includes('en')) return LANGUAGE_EN;
  return LANGUAGE_ZH;
}

export function buildInstallMessage(version, language) {
  if (language === LANGUAGE_ZH) {
    return [
      `✅ @chenmk/superflow v${version} CLI 安装成功（已有 Agent 配置保留）`,
      "",
      "   下一步：进入项目根目录，运行初始化向导",
      "   向导会选择语言、Agent、范围，并注册 MCP：",
      "     superflow init",
      "   以后升级：superflow update",
      "     superflow --help            # 查看全部命令",
    ].join("\n");
  }
  return [
    `✅ @chenmk/superflow v${version} CLI installed successfully (existing Agent configuration preserved)`,
    "",
    "   Next: enter your project root and run the setup wizard.",
    "   Choose language, Agents, scope and register MCP:",
    "     superflow init",
    "   Future updates: superflow update",
    "     superflow --help            # Show all commands",
  ].join("\n");
}

function printInstallMessage(version, language) {
  console.log(buildInstallMessage(version, language));
}

export async function runPostinstall(env = process.env, runtime = {}) {
  // npm exec and an existing update owner deploy once through their own entry.
  if (!isGlobalInstall(env) || env.npm_command === 'exec' || env.SUPERFLOW_INSTALL_OWNER) return;
  const migrateGlobalHooks = runtime.migrateGlobalHooks
    ?? (await import('../dist/domains/hook-migration.js')).migrateGlobalHooks;
  const homeRoot = runtime.homeRoot ?? homedir();
  for (const host of ['codex', 'claude']) {
    const migration = migrateGlobalHooks(homeRoot, host);
    if (migration.error) {
      throw new Error(`${host} global Hook migration failed: ${migration.error}`);
    }
    if (migration.changed) {
      console.log(`[Superflow] Migrated old ${host} global Hooks; backup: ${migration.backup}`);
    }
  }
  const loadState = runtime.loadState
    ?? (await import('../dist/domains/state.js')).loadState;
  const state = loadState(join(homeRoot, '.sdd-state.json'));
  const caller = resolve(env.INIT_CWD || homeRoot);
  const agents = ['claude', 'codex'].filter((agent) =>
    state?.platforms[agent]?.scope || state?.platforms[agent]?.skills?.length ||
    state?.managedProjects?.projects?.some((project) => project.agents?.includes(agent)) ||
    [homeRoot, caller].some((root) =>
      existsSync(join(root, `.${agent}`, 'skills', 'superflow', 'SKILL.md'))));
  for (const agent of agents) {
    if (state?.platforms[agent]?.scope === 'project' &&
      !existsSync(join(homeRoot, `.${agent}`, 'skills', 'superflow', 'SKILL.md')) &&
      !existsSync(join(caller, `.${agent}`, 'skills', 'superflow', 'SKILL.md')) &&
      !state.managedProjects?.projects?.some((project) =>
        project.agents?.includes(agent) && existsSync(project.root))) {
      throw new Error(`Registered ${agent} project unavailable; restore its directory and run superflow update there. / 登记项目不可用，请恢复目录后在项目中运行 superflow update。`);
    }
  }
  const installed = agents.length > 0;
  const runCommand = runtime.runCommand
    ?? (await import('../dist/platform/process.js')).runCommand;
  if (!installed) {
    for (const agent of ['claude', 'codex']) {
      try {
        const result = await runCommand(agent, ['--version'], { env, timeout: 3_000 });
        if (result.code === 0) agents.push(agent);
      } catch { /* An unavailable host is not an installation target. */ }
    }
  }
  if (!agents.length) {
    printInstallMessage(pkg.version, resolveInstallLanguage(env));
    return;
  }
  const language = state?.language ?? resolveInstallLanguage(env);
  const args = installed
    ? ['update', caller, '--scope', 'auto', '--with-dependencies']
    : ['init', homeRoot, '--scope', 'global', '--yes', '--no-scan', '--no-openspec-init'];
  args.push('--agent', agents.join(','), '--language', language);
  console.log(language === 'zh' ? '[Superflow] 自动同步技能与配套组件…' : '[Superflow] Synchronizing skills and companion components…');
  const result = await runCommand(process.execPath,
    [join(__dirname, '../dist/app/cli.js'), ...args],
    { env: { ...env, SUPERFLOW_INSTALL_OWNER: 'postinstall' }, cwd: homeRoot, timeout: 600_000 });
  if (result.stdout) console.log(result.stdout.trim());
  if (result.code !== 0) {
    throw new Error(`${result.stderr || result.stdout || 'deployment failed'}\n` +
      `Recovery: superflow ${args[0]} --agent ${agents.join(',')} --scope ${installed ? 'auto' : 'global'} --language ${language}`);
  }
  console.log(language === 'zh'
    ? `[Superflow] CLI v${pkg.version} 与配套组件已同步，请重启所选宿主。`
    : `[Superflow] CLI v${pkg.version} and companion components synchronized. Restart the selected hosts.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPostinstall().catch((error) => {
    console.error(`[Superflow] Postinstall failed: ${error.message}`);
    process.exitCode = 1;
  });
}
