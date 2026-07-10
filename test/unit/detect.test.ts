import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectOS } from '../../src/platform/os.js';
import { getPlatformPaths } from '../../src/platform/paths.js';
import {
  parseAgentSelection,
  parseInstallScope,
  resolveAgents,
} from '../../src/domains/agent.js';

describe('core/detect', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('detectOS 在 macOS 上返回 darwin', () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    expect(detectOS()).toBe('darwin');
  });

  it('detectOS 在 Linux 上返回 linux', () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });
    expect(detectOS()).toBe('linux');
  });

  it('detectOS 在 win32 + MSYSTEM 下返回 msys', () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' });
    vi.stubEnv('MSYSTEM', 'MINGW64');
    vi.stubEnv('SHELL', '/usr/bin/bash');
    expect(detectOS()).toBe('msys');
  });

  it('detectOS 在 win32 + bash 下返回 mingw', () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' });
    vi.stubEnv('MSYSTEM', '');
    vi.stubEnv('SHELL', '/usr/bin/bash');
    expect(detectOS()).toBe('mingw');
  });

  it('detectOS 在原生 win32 下返回 windows', () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' });
    vi.stubEnv('MSYSTEM', '');
    vi.stubEnv('SHELL', '');
    expect(detectOS()).toBe('windows');
  });

  it('getPlatformPaths(claude) 返回 claude 路径', () => {
    const p = getPlatformPaths('claude');
    expect(p.id).toBe('claude');
    expect(p.skillsDir).toMatch(/\.claude\/skills$/);
    expect(p.rulesDir).toMatch(/\.claude\/rules$/);
    expect(p.scriptsDir).toMatch(/\.claude\/scripts$/);
    expect(p.settingsFile).toMatch(/\.claude\/settings\.json$/);
  });

  it('getPlatformPaths(codex) 返回 codex 路径', () => {
    const p = getPlatformPaths('codex');
    expect(p.id).toBe('codex');
    expect(p.skillsDir).toMatch(/\.codex\/skills$/);
    expect(p.rulesDir).toMatch(/\.codex\/rules$/);
    expect(p.scriptsDir).toMatch(/\.codex\/hooks$/);
    expect(p.settingsFile).toMatch(/\.codex\/hooks\.json$/);
  });

  it('getPlatformPaths(opencode) 返回 OpenCode 项目路径', () => {
    const p = getPlatformPaths('opencode', 'project', '/tmp/demo');
    expect(p.id).toBe('opencode');
    expect(p.skillsDir).toBe('/tmp/demo/.opencode/skills');
    expect(p.rulesDir).toBe('/tmp/demo/.opencode/rules');
    expect(p.scriptsDir).toBe('/tmp/demo/.opencode/scripts');
    expect(p.promptsDir).toBe('/tmp/demo/.opencode/commands');
    expect(p.settingsFile).toBe('/tmp/demo/opencode.json');
  });

  it('getPlatformPaths 拒绝未知 agent', () => {
    expect(() => getPlatformPaths('unknown' as any)).toThrow();
  });

  it('parseAgentSelection 默认选择 both', () => {
    expect(parseAgentSelection(undefined)).toBe('both');
    expect(parseAgentSelection('')).toBe('both');
  });

  it('parseAgentSelection 拒绝未知 agent 选择', () => {
    expect(parseAgentSelection('opencode')).toBe('opencode');
    expect(parseAgentSelection('codex,opencode')).toEqual(['codex', 'opencode']);
    expect(parseAgentSelection('all')).toBe('all');
    expect(() => parseAgentSelection('cursor')).toThrow(/claude, codex, opencode, both, all/);
  });

  it('parseInstallScope 默认 global 且只接受 global/project', () => {
    expect(parseInstallScope(undefined)).toBe('global');
    expect(parseInstallScope('project')).toBe('project');
    expect(() => parseInstallScope('workspace')).toThrow(/global, project/);
  });

  it('resolveAgents 展开 both 为 claude + codex', () => {
    expect(resolveAgents('both')).toEqual(['claude', 'codex']);
    expect(resolveAgents('codex')).toEqual(['codex']);
    expect(resolveAgents('all')).toEqual(['claude', 'codex', 'opencode']);
    expect(resolveAgents(['codex', 'opencode'])).toEqual(['codex', 'opencode']);
  });
});
