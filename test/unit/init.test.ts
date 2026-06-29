import { describe, expect, it } from 'vitest';
import { parseInitAgentInput } from '../../src/commands/init.js';

describe('commands/init', () => {
  it('parseInitAgentInput 支持默认和 both/all', () => {
    expect(parseInitAgentInput('')).toBe('both');
    expect(parseInitAgentInput('a')).toBe('both');
    expect(parseInitAgentInput('all')).toBe('all');
    expect(parseInitAgentInput('both')).toBe('both');
  });

  it('parseInitAgentInput 支持序号多选', () => {
    expect(parseInitAgentInput('1')).toBe('claude');
    expect(parseInitAgentInput('2')).toBe('codex');
    expect(parseInitAgentInput('3')).toBe('opencode');
    expect(parseInitAgentInput('1,2')).toBe('both');
    expect(parseInitAgentInput('2,3')).toEqual(['codex', 'opencode']);
    expect(parseInitAgentInput('1 2')).toBe('both');
  });

  it('parseInitAgentInput 支持名称输入并拒绝未知工具', () => {
    expect(parseInitAgentInput('claude,codex')).toBe('both');
    expect(parseInitAgentInput('codex')).toBe('codex');
    expect(parseInitAgentInput('opencode')).toBe('opencode');
    expect(parseInitAgentInput('cursor')).toBeNull();
  });
});
