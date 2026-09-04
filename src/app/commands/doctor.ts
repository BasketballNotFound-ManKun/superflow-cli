import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { runCommand } from '../../platform/process.js';
import { getPlatformPaths } from '../../platform/paths.js';
import {
  parseAgentSelection,
  parseInstallScope,
  resolveAgents,
} from '../../domains/agent.js';
import {
  ALL_RULES,
  ALL_SKILLS,
  CODEX_PROMPTS,
  hookScriptsForAgent,
  scriptsForAgent,
} from '../../domains/skill/assets.js';
import type { Agent, InstallScope } from '../../types.js';
import type { Language } from '../../types.js';
import { resolveRuntimeLanguage } from '../../domains/config/cli-help.js';
import { managedText } from '../../domains/managed-work/i18n.js';
import {
  missingCodexSuperpowerSkills,
  REQUIRED_CODEX_SUPERPOWER_SKILLS,
} from '../../domains/deps.js';
import { resolveMcpServerPath } from './mcp.js';

type DoctorStatus = 'pass' | 'warn' | 'fail';
type DoctorScope = InstallScope | 'auto';

interface DoctorCheck {
  check: string;
  status: DoctorStatus;
  message: string;
  remediation?: string;
}

export interface DoctorRuntime {
  runCommand?: typeof runCommand;
  mcpServerPath?: string;
}

const VALID_STATE_FIELDS = new Set([
  'workflow',
  'phase',
  'canonical_spec',
  'context_compression',
  'design_doc',
  'technical_design',
  'plan',
  'base_ref',
  'build_mode',
  'build_pause',
  'subagent_dispatch',
  'tdd_mode',
  'review_mode',
  'isolation',
  'verify_mode',
  'auto_transition',
  'verify_result',
  'verification_report',
  'branch_status',
  'archived',
  'direct_override',
  'build_command',
  'verify_command',
  'handoff_context',
  'handoff_hash',
  'superpower_strategy',
  'implementation_prompt',
  'worktree_ports',
  'created_at',
  'verified_at',
  'updated_at',
]);

const REQUIRED_STATE_FIELDS = [
  'workflow',
  'phase',
  'canonical_spec',
  'build_mode',
  'tdd_mode',
  'review_mode',
  'isolation',
  'verify_mode',
  'auto_transition',
  'verify_result',
  'verification_report',
  'branch_status',
  'archived',
  'handoff_context',
  'handoff_hash',
  'created_at',
  'updated_at',
];

export async function doctorCommand(options: {
  agent?: string;
  json?: boolean;
  scope?: string;
  targetPath?: string;
  language?: string;
} = {}): Promise<void> {
  const language = resolveRuntimeLanguage(options.language);
  const result = await collectDoctor({ ...options, language });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    if (result.failed) process.exit(1);
    return;
  }
  console.log(
    managedText(language, '[Superflow 健康诊断]', '[Superflow health check]'),
  );
  for (const check of result.checks) {
    const symbol = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
    console.log(`  ${symbol} ${check.check}: ${check.message}`);
    if (check.remediation) {
      console.log(`    → ${check.remediation}`);
    }
  }
  console.log('');
  if (result.failed) {
    console.log(managedText(language, '→ 退出码：1（失败）', '→ Exit code: 1 (FAIL)'));
    process.exit(1);
  } else {
    console.log(managedText(language, '→ 退出码：0（通过或仅警告）', '→ Exit code: 0 (PASS / warnings only)'));
  }
}

export async function collectDoctor(options: {
  agent?: string;
  scope?: string;
  projectPath?: string;
  targetPath?: string;
  language?: string;
} = {}, runtime: DoctorRuntime = {}): Promise<{
  agents: Agent[];
  scope: DoctorScope;
  scopesChecked: InstallScope[];
  projectPath: string;
  failed: boolean;
  checks: DoctorCheck[];
}> {
  const language = resolveRuntimeLanguage(options.language);
  const run = runtime.runCommand ?? runCommand;
  const agents = resolveAgents(parseAgentSelection(options.agent));
  const scope = parseDoctorScope(options.scope);
  const scopesChecked = scopesForDoctor(scope);
  const projectPath = path.resolve(
    options.projectPath ?? options.targetPath ?? process.cwd()
  );
  const checks: DoctorCheck[] = [];

  checks.push(await executableCheck('superflow', language, run));
  checks.push(await executableCheck('openspec', language, run));
  checks.push(...collectOpenSpecProjectChecks(projectPath, language));
  const serverPath = runtime.mcpServerPath ?? resolveMcpServerPath();
  checks.push({
    check: 'managed:mcp-server',
    status: existsSync(serverPath) ? 'pass' : 'fail',
    message: existsSync(serverPath)
      ? serverPath
      : managedText(language, `MCP Server 文件缺失：${serverPath}`, `MCP server file is missing: ${serverPath}`),
    ...(existsSync(serverPath)
      ? {}
      : { remediation: managedText(language, '重新安装或更新 Superflow', 'Reinstall or update Superflow') }),
  });
  for (const agent of agents) {
    const executable = await executableCheck(agent, language, run);
    checks.push(executable);
    checks.push(await mcpCheck(agent, serverPath, executable.status, language, run));
    const superpowers = hasSuperpowers(agent);
    checks.push({
      check: `superpowers:${agent}`,
      status: superpowers ? 'pass' : 'warn',
      message: superpowers
        ? managedText(language, '已检测', 'detected')
        : managedText(language, '未检测', 'not detected'),
    });
    if (agent === 'codex') {
      const missingSkills = new Set(missingCodexSuperpowerSkills());
      for (const skill of REQUIRED_CODEX_SUPERPOWER_SKILLS) {
        const available = !missingSkills.has(skill);
        checks.push({
          check: `superpowers:codex:${skill}`,
          status: available ? 'pass' : 'fail',
          message: available
            ? managedText(language, '已检测；新会话可加载', 'detected; available to new sessions')
            : managedText(language, '缺失', 'missing'),
          ...(available ? {} : {
            remediation: managedText(
              language,
              '运行 superflow update --agent codex --scope global，并重启 Codex Host',
              'Run superflow update --agent codex --scope global, then restart the Codex host',
            ),
          }),
        });
      }
    }
    const understand = hasUnderstand(agent);
    checks.push({
      check: `understand-anything:${agent}`,
      status: understand ? 'pass' : 'warn',
      message: understand
        ? managedText(language, '已检测', 'detected')
        : managedText(language, '未检测', 'not detected'),
    });
  }

  for (const currentScope of scopesChecked) {
    for (const agent of agents) {
    const platform = getPlatformPaths(agent, currentScope, projectPath);
    checks.push({
      check: `api-doc-changelog:${agent}`,
      status: existsSync(path.join(platform.skillsDir, 'api-doc-changelog', 'SKILL.md')) ? 'pass' : 'warn',
      message: existsSync(path.join(platform.skillsDir, 'api-doc-changelog', 'SKILL.md'))
        ? managedText(language, '已检测', 'detected')
        : managedText(language, '缺失', 'missing'),
    });

    for (const script of scriptsForAgent(agent)) {
      const scriptPath = path.join(platform.scriptsDir, script);
      checks.push({
        check: `script:${agent}:${currentScope}:${script}`,
        status: existsSync(scriptPath) ? 'pass' : 'fail',
        message: scriptPath,
      });
    }

    const hookScripts = hookScriptsForAgent(agent);
    if (hookScripts.length === 0) {
      checks.push({
        check: `hooks:${agent}:${currentScope}`,
        status: 'warn',
        message: managedText(
          language,
          '平台不支持原生 Hook 注册，请使用命令别名',
          'native hook registration is not supported; use command aliases',
        ),
      });
    } else {
      try {
        const hookCount = countSddHookCommands(platform.settingsFile, agent);
        checks.push({
          check: `hooks:${agent}:${currentScope}`,
          status: hookCount >= 7 ? 'pass' : 'fail',
          message: managedText(
            language,
            `已注册 ${hookCount} 条命令`,
            `${hookCount} command(s) registered`,
          ),
          ...(hookCount >= 7
            ? {}
            : {
                remediation: managedText(
                  language,
                  '运行 superflow update 重新注册 Hook',
                  'Run superflow update to register hooks again',
                ),
              }),
        });
      } catch (error) {
        checks.push({
          check: `hooks:${agent}:${currentScope}`,
          status: 'fail',
          message: managedText(
            language,
            `配置文件无法解析：${(error as Error).message}`,
            `settings file cannot be parsed: ${(error as Error).message}`,
          ),
          remediation: managedText(
            language,
            '修复配置 JSON 后运行 superflow update',
            'Repair the settings JSON, then run superflow update',
          ),
        });
      }
    }

    for (const skill of ALL_SKILLS) {
      const skillPath = path.join(platform.skillsDir, skill, 'SKILL.md');
      checks.push({
        check: `skill:${agent}:${currentScope}:${skill}`,
        status: existsSync(skillPath) ? 'pass' : 'fail',
        message: skillPath,
      });
    }

    if (agent === 'codex') {
      for (const prompt of CODEX_PROMPTS) {
        const promptPath = path.join(platform.promptsDir, prompt);
        checks.push({
          check: `prompt:${agent}:${currentScope}:${prompt}`,
          status: existsSync(promptPath) ? 'pass' : 'fail',
          message: promptPath,
        });
      }
    }

    for (const rule of ALL_RULES) {
      const ruleFile = path.join(platform.rulesDir, rule);
      checks.push({
        check: `rule:${agent}:${currentScope}:${rule}`,
        status: existsSync(ruleFile) ? 'pass' : 'fail',
        message: ruleFile,
      });
    }
    }
  }

  checks.push(...collectSddStateChecks(projectPath, language));

  return {
    agents,
    scope,
    scopesChecked,
    projectPath,
    failed: checks.some((check) => check.status === 'fail'),
    checks,
  };
}

function collectOpenSpecProjectChecks(projectPath: string, language: Language): DoctorCheck[] {
  const changesDir = path.join(projectPath, 'openspec', 'changes');
  const specsDir = path.join(projectPath, 'openspec', 'specs');
  const missing = [
    existsSync(changesDir) ? '' : 'openspec/changes',
    existsSync(specsDir) ? '' : 'openspec/specs',
  ].filter(Boolean);

  return [{
    check: 'openspec project',
    status: missing.length > 0 ? 'fail' : 'pass',
    message: missing.length > 0
      ? managedText(language, `缺少 ${missing.join('、')}；请运行 superflow init 或 openspec init`, `missing ${missing.join(', ')}; run superflow init or openspec init`)
      : managedText(language, '已检测 openspec/changes 和 openspec/specs', 'openspec/changes and openspec/specs detected'),
  }];
}

function collectSddStateChecks(projectPath: string, language: Language): DoctorCheck[] {
  const changesDir = path.join(projectPath, 'openspec', 'changes');
  if (!existsSync(changesDir)) return [];
  const checks: DoctorCheck[] = [];

  for (const entry of readdirSync(changesDir).sort()) {
    const changeDir = path.join(changesDir, entry);
    if (!safeIsDirectory(changeDir)) continue;
    const statePath = path.join(changeDir, '.sdd', 'state.yaml');
    if (!existsSync(statePath)) continue;
    const state = readFileSync(statePath, 'utf-8');
    const keys = collectTopLevelYamlKeys(state);
    const unknown = keys.filter((key) => !VALID_STATE_FIELDS.has(key));
    const missing = REQUIRED_STATE_FIELDS.filter((key) => !keys.includes(key));
    const invalidHash = invalidHandoffHash(state, language);
    const problems = [
      unknown.length > 0
        ? managedText(language, `未知字段：${unknown.join('、')}`, `unknown field(s): ${unknown.join(', ')}`)
        : '',
      missing.length > 0
        ? managedText(language, `缺少字段：${missing.join('、')}`, `missing field(s): ${missing.join(', ')}`)
        : '',
      invalidHash,
    ].filter(Boolean);

    checks.push({
      check: `superflow-state:${entry}`,
      status: problems.length > 0 ? 'fail' : 'pass',
      message: problems.length > 0
        ? problems.join('; ')
        : managedText(language, '有效', 'valid'),
    });
  }

  return checks;
}

function collectTopLevelYamlKeys(content: string): string[] {
  const keys: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/^\s/.test(line) || trimmed.startsWith('- ')) continue;
    const match = line.match(/^['"]?([A-Za-z0-9_-]+)['"]?\s*:/);
    if (match) keys.push(match[1]);
  }
  return keys;
}

function invalidHandoffHash(content: string, language: Language): string {
  const match = content.match(/^handoff_hash:\s*(.*)$/m);
  if (!match) return '';
  const value = match[1].replace(/\s+#.*$/, '').trim();
  if (!value || value === 'null') return '';
  return /^[a-f0-9]{64}$/.test(value)
    ? ''
    : managedText(language, `handoff_hash 不是 sha256：${value}`, `handoff_hash is not sha256: ${value}`);
}

function safeIsDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function parseDoctorScope(value: unknown): DoctorScope {
  if (value === 'auto') return 'auto';
  return parseInstallScope(value);
}

function scopesForDoctor(scope: DoctorScope): InstallScope[] {
  return scope === 'auto' ? ['project', 'global'] : [scope];
}

async function executableCheck(
  executable: string,
  language: Language,
  run: typeof runCommand,
): Promise<DoctorCheck> {
  const result = await run(executable, ['--version'], { timeout: 8_000 }).catch(
    () => ({ code: 1, stdout: '', stderr: '' }),
  );
  const version = [result.stdout, result.stderr]
    .join('\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return {
    check: `${executable} CLI`,
    status: result.code === 0 ? 'pass' : 'fail',
    message:
      result.code === 0
        ? managedText(language, `可用${version ? `（${version}）` : ''}`, `available${version ? ` (${version})` : ''}`)
        : managedText(language, '不可执行或不在 PATH', 'not executable or missing from PATH'),
    ...(result.code === 0
      ? {}
      : {
          remediation: managedText(
            language,
            `安装 ${executable} 并确认 --version 可执行`,
            `Install ${executable} and verify that --version succeeds`,
          ),
        }),
  };
}

async function mcpCheck(
  agent: Agent,
  serverPath: string,
  executableStatus: DoctorStatus,
  language: Language,
  run: typeof runCommand,
): Promise<DoctorCheck> {
  const remediation = managedText(
    language,
    `运行 superflow mcp install --agent ${agent}`,
    `Run superflow mcp install --agent ${agent}`,
  );
  if (executableStatus === 'fail') {
    return {
      check: `managed:mcp:${agent}`,
      status: 'fail',
      message: managedText(language, 'Agent CLI 不可用，无法检查 MCP', 'Agent CLI is unavailable; MCP cannot be checked'),
      remediation,
    };
  }
  const args = ['mcp', 'get', 'superflow'];
  const result = await run(agent, args, { timeout: 8_000 }).catch(() => ({
    code: 1,
    stdout: '',
    stderr: '',
  }));
  if (result.code !== 0 || !/superflow/i.test(`${result.stdout}\n${result.stderr}`)) {
    return {
      check: `managed:mcp:${agent}`,
      status: 'fail',
      message: managedText(language, 'Superflow MCP 未配置', 'Superflow MCP is not configured'),
      remediation,
    };
  }
  const output = `${result.stdout}\n${result.stderr}`.replaceAll('\\', '/');
  const expected = serverPath.replaceAll('\\', '/');
  if (!output.includes(expected)) {
    return {
      check: `managed:mcp:${agent}`,
      status: 'warn',
      message: managedText(language, 'MCP 已配置，但无法确认它指向当前 Server 文件', 'MCP is configured, but its current server path could not be verified'),
      remediation,
    };
  }
  return {
    check: `managed:mcp:${agent}`,
    status: 'pass',
    message: managedText(language, '已配置且运行路径一致', 'configured with the current runtime path'),
  };
}

export function countSddHookCommands(
  settingsFile: string,
  agent: Agent,
  parsedSettings?: any
): number {
  if (!existsSync(settingsFile)) return 0;
  const settings = parsedSettings ?? JSON.parse(readFileSync(settingsFile, 'utf-8'));
  const hooks = settings.hooks || {};
  let sddCommands = 0;
  const scriptDir = agent === 'claude' ? '/scripts/' : '/hooks/';
  for (const entries of Object.values(hooks) as any[]) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry?.hooks) continue;
      for (const h of entry.hooks) {
        if (
          h.command?.includes(`${scriptDir}superflow-`) ||
          h.command?.includes(`${scriptDir}sdd-`) ||
          h.command?.includes(`${scriptDir}${agent}-auto-backup`)
        ) {
          sddCommands++;
        }
      }
    }
  }
  return sddCommands;
}

function hasSuperpowers(agent: Agent): boolean {
  const home = homedir();
  const roots = agent === 'codex'
    ? [
        path.join(home, '.codex', 'plugins', 'cache'),
        path.join(home, '.codex', '.tmp', 'plugins'),
      ]
    : agent === 'claude'
      ? [
        path.join(home, '.claude', 'plugins'),
        path.join(home, '.claude', 'plugins', 'cache'),
      ]
      : [];
  return roots.some((root) => containsPathSegment(root, 'superpowers'));
}

function hasUnderstand(agent: Agent): boolean {
  const home = homedir();
  const pluginSkill = path.join(
    home,
    '.understand-anything',
    'repo',
    'understand-anything-plugin',
    'skills',
    'understand',
    'SKILL.md'
  );
  if (!existsSync(pluginSkill)) return false;
  if (agent === 'codex') {
    return existsSync(path.join(home, '.agents', 'skills', 'understand', 'SKILL.md'));
  }
  if (agent === 'claude') return existsSync(pluginSkill);
  return false;
}

function containsPathSegment(root: string, segment: string): boolean {
  if (!existsSync(root)) return false;
  const stack = [root];
  const needle = segment.toLowerCase();
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry);
      if (entry.toLowerCase().includes(needle)) return true;
      if (stack.length < 200 && existsSync(full)) {
        try {
          if (statSync(full).isDirectory()) stack.push(full);
        } catch {
          continue;
        }
      }
    }
  }
  return false;
}
