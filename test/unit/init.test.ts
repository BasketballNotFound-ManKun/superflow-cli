import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseInitAgentInput } from '../../src/app/commands/init.js';

describe('commands/init', () => {
  it('parseInitAgentInput 支持默认和 both', () => {
    expect(parseInitAgentInput('')).toBe('both');
    expect(parseInitAgentInput('a')).toBe('both');
    expect(parseInitAgentInput('both')).toBe('both');
  });

  it('parseInitAgentInput 支持序号多选', () => {
    expect(parseInitAgentInput('1')).toBe('claude');
    expect(parseInitAgentInput('2')).toBe('codex');
    expect(parseInitAgentInput('1,2')).toBe('both');
    expect(parseInitAgentInput('1 2')).toBe('both');
  });

  it('parseInitAgentInput 支持名称输入并拒绝未知工具', () => {
    expect(parseInitAgentInput('claude,codex')).toBe('both');
    expect(parseInitAgentInput('codex')).toBe('codex');
    expect(parseInitAgentInput('cursor')).toBeNull();
  });

  it('Claude Superpowers 安装失败会中止完整双端安装', () => {
    const source = fs.readFileSync(
      path.resolve('src/app/commands/init.ts'),
      'utf-8',
    );
    expect(source).toContain(
      'throw new Error(`claude superpowers install failed: ${sup.error}`)',
    );
    expect(source).not.toContain('warn(`[WARN] Claude Superpowers: ${sup.error}`)');
  });
});
