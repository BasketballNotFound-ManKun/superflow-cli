import { createHash } from 'crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

/**
 * 计算目录的 SHA-256 哈希。
 * 算法：递归读取所有文件，path + sha256(file) 拼接后整体 hash。
 */
export function computeDirHash(dir: string): string {
  const files = collectFiles(dir);
  const hash = createHash('sha256');

  for (const file of files) {
    const relative = path.relative(dir, file);
    hash.update(`path:${relative}\n`);
    hash.update(`sha256:${hashFile(file)}\n`);
  }

  return hash.digest('hex');
}

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  walk(dir, result);
  return result.sort();
}

function walk(dir: string, result: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    throw new Error(`Cannot read directory: ${dir} (${(err as Error).message})`);
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, result);
    } else if (stat.isFile()) {
      result.push(full);
    }
  }
}

export function hashFile(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
