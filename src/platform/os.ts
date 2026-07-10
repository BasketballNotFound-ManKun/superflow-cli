import type { OS } from '../types.js';

export type { OS };

export function detectOS(): OS {
  const platform = process.platform;
  if (platform === 'darwin' || platform === 'linux') return platform;
  if (platform === 'win32') {
    if (process.env.MSYSTEM) return 'msys';
    if (process.env.SHELL?.includes('bash')) return 'mingw';
    return 'windows';
  }
  return 'unknown';
}
