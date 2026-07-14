import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSETS_DIR, PACKAGE_ROOT } from '../../src/platform/assets.js';

describe('bundled asset paths', () => {
  it('resolves assets from the package root', () => {
    expect(ASSETS_DIR).toBe(path.join(PACKAGE_ROOT, 'assets'));
    expect(existsSync(path.join(ASSETS_DIR, 'manifest.json'))).toBe(true);
    expect(existsSync(path.join(ASSETS_DIR, 'skills', 'superflow-pipeline'))).toBe(
      true,
    );
  });
});
