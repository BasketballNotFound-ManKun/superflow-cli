import { describe, expect, it } from 'vitest';
import {
  buildInstallMessage,
  isGlobalInstall,
  resolveInstallLanguage,
} from '../../scripts/postinstall.js';

describe('scripts/postinstall', () => {
  it('detects global install from npm_config_global', () => {
    expect(isGlobalInstall({ npm_config_global: 'true' })).toBe(true);
    expect(isGlobalInstall({ npm_config_global: 'false' })).toBe(false);
    expect(isGlobalInstall({})).toBe(false);
  });

  it('resolves language from SUPERFLOW_LANG', () => {
    expect(resolveInstallLanguage({ SUPERFLOW_LANG: 'en' })).toBe('en');
    expect(resolveInstallLanguage({ SUPERFLOW_LANG: 'zh' })).toBe('zh');
  });

  it('falls back to system locale', () => {
    expect(resolveInstallLanguage({ LANG: 'en_US.UTF-8' })).toBe('en');
    expect(resolveInstallLanguage({ LC_ALL: 'zh_CN.UTF-8' })).toBe('zh');
  });

  it('defaults to Chinese when no locale is set', () => {
    expect(resolveInstallLanguage({})).toBe('zh');
  });

  it('includes version in Chinese install message', () => {
    const message = buildInstallMessage('0.2.3', 'zh');
    expect(message).toContain('@chenmk/superflow v0.2.3');
    expect(message).toContain('安装成功');
    expect(message).toContain('superflow init');
  });

  it('includes version in English install message', () => {
    const message = buildInstallMessage('0.2.3', 'en');
    expect(message).toContain('@chenmk/superflow v0.2.3');
    expect(message).toContain('installed successfully');
    expect(message).toContain('superflow init');
  });
});
