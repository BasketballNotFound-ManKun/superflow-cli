import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');
const EN_SKILLS_DIR = path.join(ROOT, 'assets', 'skills-en');
const TEXT_EXTENSIONS = new Set(['.md', '.yaml', '.yml', '.sh']);
const HAN_RE = /[\p{Script=Han}]/u;

function listTextFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listTextFiles(fullPath);
    }
    return TEXT_EXTENSIONS.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

describe('English skill assets', () => {
  it('do not contain Chinese user-facing text', () => {
    const offenders = listTextFiles(EN_SKILLS_DIR)
      .filter((file) => HAN_RE.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});
