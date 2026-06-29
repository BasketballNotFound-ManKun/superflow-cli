import { describe, it, expect } from 'vitest';
import path from 'path';
import { writeFileSync } from 'fs';
import { computeDirHash } from '../../src/core/integrity.js';

const FIXTURE = path.join(process.cwd(), 'test', 'fixture', 'integrity-skill');

describe('core/integrity', () => {
  it('computeDirHash 对相同目录返回相同 hash', () => {
    const h1 = computeDirHash(FIXTURE);
    const h2 = computeDirHash(FIXTURE);
    expect(h1).toBe(h2);
  });

  it('computeDirHash 返回 64 字符 SHA-256 hex', () => {
    const h = computeDirHash(FIXTURE);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('computeDirHash 修改文件后 hash 变化', () => {
    const h1 = computeDirHash(FIXTURE);
    const target = path.join(FIXTURE, 'file1.md');
    const original = 'hello';
    writeFileSync(target, 'modified');
    try {
      const h2 = computeDirHash(FIXTURE);
      expect(h1).not.toBe(h2);
    } finally {
      writeFileSync(target, original);
    }
  });

  it('computeDirHash 对不存在的目录抛出', () => {
    expect(() => computeDirHash('/tmp/nonexistent-' + Date.now())).toThrow();
  });
});
