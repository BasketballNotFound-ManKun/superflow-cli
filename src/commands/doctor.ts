import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { runCommand } from '../utils/shell.js';
import {
  getPlatformPaths,
  parseAgentSelection,
  parseInstallScope,
  resolveAgents,
} from '../core/detect.js';
import {
  ALL_RULES,
  ALL_SKILLS,
  CODEX_PROMPTS,
  hookScriptsForAgent,
  scriptsForAgent,
} from '../core/assets.js';
import type { Agent, InstallScope } from '../types.js';

type DoctorStatus = 'pass' | 'warn' | 'fail';
type DoctorScope = InstallScope | 'auto';

interface DoctorCheck {
  check: string;
  status: DoctorStatus;
  message: string;
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
} = {}): Promise<void> {
  if (options.json) {
    const result = await collectDoctor(options);
    console.log(JSON.stringify(result, null, 2));
    if (result.failed) process.exit(1);
    return;
  }

  let failed = false;
  const agents = resolveAgents(parseAgentSelection(options.agent));
  const scope = parseDoctorScope(options.scope);
  const projectPath = path.resolve(options.targetPath ?? process.cwd());

  console.log('[CLI]');
  const which = await runCommand('which', ['superflow']).catch(() => ({ code: 1, stdout: '', stderr: '' }));
  if (which.code === 0) {
    console.log('  ✓ superflow CLI 在 PATH');
  } else {
    console.log('  ✗ superflow CLI 不在 PATH（FAIL）');
    failed = true;
  }

  console.log('\n[第三方依赖]');
  const openspec = await runCommand('which', ['openspec']).catch(() => ({ code: 1, stdout: '', stderr: '' }));
  if (openspec.code === 0) {
    console.log('  ✓ openspec CLI 在 PATH');
  } else {
    console.log('  ✗ openspec CLI 缺失（FAIL）');
    failed = true;
  }

  const openspecProjectChecks = collectOpenSpecProjectChecks(projectPath);
  for (const check of openspecProjectChecks) {
    if (check.status === 'pass') {
      console.log(`  ✓ ${check.check}: ${check.message}`);
    } else {
      console.log(`  ✗ ${check.check}: ${check.message}`);
      failed = true;
    }
  }

  for (const agent of agents) {
    failed = checkAgentDependencies(agent, failed, firstInstallScope(scope), projectPath);
  }

  for (const currentScope of scopesForDoctor(scope)) {
    for (const agent of agents) {
    const platform = getPlatformPaths(agent, currentScope, projectPath);
    console.log(`\n[脚本: ${platform.name}]`);
    if (existsSync(platform.scriptsDir)) {
      for (const hook of scriptsForAgent(agent)) {
        if (existsSync(path.join(platform.scriptsDir, hook))) {
          console.log(`  ✓ ${hook}`);
        } else {
          console.log(`  ✗ ${hook} 缺失（FAIL）`);
          failed = true;
        }
      }
      if (hookScriptsForAgent(agent).length === 0) {
        console.log(`  ⚠ ${platform.name} 未注册自动 hook；使用 /superflow-* command 显式运行门禁（WARN）`);
      } else {
        failed = checkHookRegistration(platform.settingsFile, agent, failed);
      }
    } else {
      console.log(`  ✗ ${platform.scriptsDir} 缺失（FAIL）`);
      failed = true;
    }

    console.log(`\n[Skills: ${platform.name}]`);
    for (const skill of ALL_SKILLS) {
      if (existsSync(path.join(platform.skillsDir, skill, 'SKILL.md'))) {
        console.log(`  ✓ ${skill}`);
      } else {
        console.log(`  ✗ ${skill} 缺失（FAIL）`);
        failed = true;
      }
    }

    if (agent === 'codex' || agent === 'opencode') {
      console.log(`\n[${agent === 'opencode' ? 'Command Alias' : 'Prompt Alias'}: ${platform.name}]`);
      for (const prompt of CODEX_PROMPTS) {
        if (existsSync(path.join(platform.promptsDir, prompt))) {
          console.log(`  ✓ /${prompt.replace(/\.md$/, '')}`);
        } else {
          console.log(`  ✗ /${prompt.replace(/\.md$/, '')} 缺失（FAIL）`);
          failed = true;
        }
      }
    }

    console.log(`\n[Rules: ${platform.name}]`);
    for (const rule of ALL_RULES) {
      if (existsSync(path.join(platform.rulesDir, rule))) {
        console.log(`  ✓ ${rule}`);
      } else {
        console.log(`  ✗ ${rule} 缺失（FAIL）`);
        failed = true;
      }
    }
    }
  }

  const stateChecks = collectSddStateChecks(projectPath);
  if (stateChecks.length > 0) {
    console.log('\n[SuperBridge Flow State]');
    for (const check of stateChecks) {
      if (check.status === 'pass') {
        console.log(`  ✓ ${check.check}: ${check.message}`);
      } else if (check.status === 'warn') {
        console.log(`  ⚠ ${check.check}: ${check.message}`);
      } else {
        console.log(`  ✗ ${check.check}: ${check.message}`);
        failed = true;
      }
    }
  }

  console.log('');
  if (failed) {
    console.log('→ Exit code: 1 (FAIL)');
    process.exit(1);
  } else {
    console.log('→ Exit code: 0 (PASS / 仅 WARN)');
  }
}

export async function collectDoctor(options: {
  agent?: string;
  scope?: string;
  projectPath?: string;
  targetPath?: string;
} = {}): Promise<{
  agents: Agent[];
  scope: DoctorScope;
  scopesChecked: InstallScope[];
  projectPath: string;
  failed: boolean;
  checks: DoctorCheck[];
}> {
  const agents = resolveAgents(parseAgentSelection(options.agent));
  const scope = parseDoctorScope(options.scope);
  const scopesChecked = scopesForDoctor(scope);
  const projectPath = path.resolve(
    options.projectPath ?? options.targetPath ?? process.cwd()
  );
  const checks: DoctorCheck[] = [];

  const which = await runCommand('which', ['superflow']).catch(() => ({ code: 1, stdout: '', stderr: '' }));
  checks.push({
    check: 'superflow CLI',
    status: which.code === 0 ? 'pass' : 'fail',
    message: which.code === 0 ? 'available in PATH' : 'missing from PATH',
  });

  const openspec = await runCommand('which', ['openspec']).catch(() => ({ code: 1, stdout: '', stderr: '' }));
  checks.push({
    check: 'openspec CLI',
    status: openspec.code === 0 ? 'pass' : 'fail',
    message: openspec.code === 0 ? 'available in PATH' : 'missing from PATH',
  });
  checks.push(...collectOpenSpecProjectChecks(projectPath));

  for (const currentScope of scopesChecked) {
    for (const agent of agents) {
    const platform = getPlatformPaths(agent, currentScope, projectPath);
    checks.push({
      check: `superpowers:${agent}`,
      status: hasSuperpowers(agent) ? 'pass' : 'warn',
      message: hasSuperpowers(agent) ? 'detected' : 'not detected',
    });
    checks.push({
      check: `understand-anything:${agent}`,
      status: hasUnderstand(agent) ? 'pass' : 'warn',
      message: hasUnderstand(agent) ? 'detected' : 'not detected',
    });
    checks.push({
      check: `api-doc-changelog:${agent}`,
      status: existsSync(path.join(platform.skillsDir, 'api-doc-changelog', 'SKILL.md')) ? 'pass' : 'warn',
      message: existsSync(path.join(platform.skillsDir, 'api-doc-changelog', 'SKILL.md')) ? 'detected' : 'missing',
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
        message: 'native hook registration is not supported; use command aliases',
      });
    } else {
      const hookCount = countSddHookCommands(platform.settingsFile, agent);
      checks.push({
        check: `hooks:${agent}:${currentScope}`,
        status: hookCount >= 7 ? 'pass' : 'fail',
        message: `${hookCount} command(s) registered`,
      });
    }

    for (const skill of ALL_SKILLS) {
      const skillPath = path.join(platform.skillsDir, skill, 'SKILL.md');
      checks.push({
        check: `skill:${agent}:${currentScope}:${skill}`,
        status: existsSync(skillPath) ? 'pass' : 'fail',
        message: skillPath,
      });
    }

    if (agent === 'codex' || agent === 'opencode') {
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

  checks.push(...collectSddStateChecks(projectPath));

  return {
    agents,
    scope,
    scopesChecked,
    projectPath,
    failed: checks.some((check) => check.status === 'fail'),
    checks,
  };
}

function collectOpenSpecProjectChecks(projectPath: string): DoctorCheck[] {
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
      ? `missing ${missing.join(', ')}; run superflow init or openspec init`
      : 'openspec/changes and openspec/specs detected',
  }];
}

function collectSddStateChecks(projectPath: string): DoctorCheck[] {
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
    const invalidHash = invalidHandoffHash(state);
    const problems = [
      unknown.length > 0 ? `unknown field(s): ${unknown.join(', ')}` : '',
      missing.length > 0 ? `missing field(s): ${missing.join(', ')}` : '',
      invalidHash,
    ].filter(Boolean);

    checks.push({
      check: `superflow-state:${entry}`,
      status: problems.length > 0 ? 'fail' : 'pass',
      message: problems.length > 0 ? problems.join('; ') : 'valid',
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

function invalidHandoffHash(content: string): string {
  const match = content.match(/^handoff_hash:\s*(.*)$/m);
  if (!match) return '';
  const value = match[1].replace(/\s+#.*$/, '').trim();
  if (!value || value === 'null') return '';
  return /^[a-f0-9]{64}$/.test(value)
    ? ''
    : `handoff_hash is not sha256: ${value}`;
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

function firstInstallScope(scope: DoctorScope): InstallScope {
  return scope === 'auto' ? 'global' : scope;
}

function checkAgentDependencies(
  agent: Agent,
  failed: boolean,
  scope: InstallScope,
  projectPath: string
): boolean {
  const platform = getPlatformPaths(agent, scope, projectPath);
  const label = agent === 'claude'
    ? 'Claude'
    : agent === 'codex'
      ? 'Codex'
      : 'OpenCode';

  if (hasSuperpowers(agent)) {
    console.log(`  ✓ superpowers (${label})`);
  } else {
    console.log(`  ⚠ superpowers 未检测到（${label}，WARN）`);
  }

  if (hasUnderstand(agent)) {
    console.log(`  ✓ understand-anything (${label})`);
  } else {
    console.log(`  ⚠ understand-anything 未检测到（${label}，WARN）`);
  }

  if (existsSync(path.join(platform.skillsDir, 'api-doc-changelog', 'SKILL.md'))) {
    console.log(`  ✓ api-doc-changelog (${label})`);
  } else {
    console.log(`  ⚠ api-doc-changelog 缺失（${label}，WARN）`);
  }
  return failed;
}

function checkHookRegistration(settingsFile: string, agent: Agent, failed: boolean): boolean {
  if (!existsSync(settingsFile)) {
    console.log(`  ✗ ${settingsFile} 不存在，无法检查 hook 注册（FAIL）`);
    return true;
  }
  const settings = JSON.parse(readFileSync(settingsFile, 'utf-8'));
  const sddCommands = countSddHookCommands(settingsFile, agent, settings);
  if (sddCommands >= 7) {
    console.log(`  ✓ ${sddCommands} workflow hook command 已注册到 ${settingsFile}`);
    return failed;
  }
  console.log(`  ✗ ${settingsFile} 只有 ${sddCommands} workflow hook command（FAIL，需要 7+）`);
  return true;
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
    : [
        path.join(home, '.claude', 'plugins'),
        path.join(home, '.claude', 'plugins', 'cache'),
      ];
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
  return existsSync(pluginSkill);
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
