import { describe, expect, it } from 'vitest';
import { normalizeLanguage, t } from '../../src/domains/config/i18n.js';

describe('core/i18n', () => {
  it('normalizes language aliases', () => {
    expect(normalizeLanguage('en')).toBe('en');
    expect(normalizeLanguage('English')).toBe('en');
    expect(normalizeLanguage('1')).toBe('en');
    expect(normalizeLanguage('zh')).toBe('zh');
    expect(normalizeLanguage('Chinese')).toBe('zh');
    expect(normalizeLanguage('2')).toBe('zh');
    expect(normalizeLanguage('fr')).toBeNull();
  });

  it('returns translated strings', () => {
    expect(t('en', 'languagePrompt')).toContain('language');
    expect(t('zh', 'languagePrompt')).toContain('语言');
  });
});
