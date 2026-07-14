import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// src/platform/assets.ts and dist/platform/assets.js are both two levels
// below the package root.
export const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
export const ASSETS_DIR = path.join(PACKAGE_ROOT, 'assets');
