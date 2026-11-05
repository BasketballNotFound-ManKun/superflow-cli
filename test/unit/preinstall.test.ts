import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

import {
  buildNodeVersionMessage,
  isSupportedNode,
  nodeMajor,
  runPreinstall,
} from '../../scripts/preinstall.js';

describe('scripts/preinstall', () => {
  it('registers the Node requirement check in the actual npm install lifecycle', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(pkg.scripts.preinstall).toBe('node scripts/preinstall.js');
  });
  it('parses Node major versions defensively', () => {
    expect(nodeMajor('14.21.3')).toBe(14);
    expect(nodeMajor('v22.17.0')).toBe(22);
    expect(nodeMajor('unknown')).toBe(0);
  });

  it('requires Node 20 or later', () => {
    expect(isSupportedNode('20.0.0')).toBe(true);
    expect(isSupportedNode('19.99.0')).toBe(false);
  });

  it('renders bilingual upgrade instructions', () => {
    const english = buildNodeVersionMessage('14.21.3', 'en');
    expect(english).toContain('Node.js 20 or later');
    expect(english).toContain('after confirmation');
    expect(english).toContain('npx --yes --package=@chenmk/superflow@latest superflow-install');

    const chinese = buildNodeVersionMessage('14.21.3', 'zh');
    expect(chinese).toContain('需要 Node.js 20 或更高版本');
    expect(chinese).toContain('确认后补齐');
  });

  it('fails before installation on unsupported Node versions', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(runPreinstall('14.21.3', { LANG: 'en_US.UTF-8' })).toBe(1);
    expect(runPreinstall('22.17.0', { LANG: 'en_US.UTF-8' })).toBe(0);
    error.mockRestore();
  });
  it('lets npm exec reach the bootstrap without allowing unsupported global installs', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(runPreinstall('18.0.0', { npm_command: 'exec' })).toBe(0);
      expect(runPreinstall('18.0.0', { npm_command: 'install', npm_config_global: 'true' })).toBe(1);
    } finally { error.mockRestore(); }
  });
});
