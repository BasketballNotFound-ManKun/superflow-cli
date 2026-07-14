#!/usr/bin/env node
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgPath = join(__dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

const LANGUAGE_ZH = 'zh';
const LANGUAGE_EN = 'en';

export function isGlobalInstall(env = process.env) {
  return env.npm_config_global === 'true';
}

export function resolveInstallLanguage(env = process.env) {
  const lang = env.SUPERFLOW_LANG || env.LC_ALL || env.LANG || '';
  const normalized = lang.toLowerCase();
  if (normalized.includes('zh') || normalized.includes('cn')) return LANGUAGE_ZH;
  if (normalized.includes('en')) return LANGUAGE_EN;
  return LANGUAGE_ZH;
}

export function buildInstallMessage(version, language) {
  if (language === LANGUAGE_ZH) {
    return [
      `✅ @chenmk/superflow v${version} 安装成功`,
      '',
      '   快速开始：',
      '     superflow init              # 在当前项目初始化',
      '     superflow --help            # 查看全部命令',
    ].join('\n');
  }
  return [
    `✅ @chenmk/superflow v${version} installed successfully`,
    '',
    '   Quick start:',
    '     superflow init              # Initialize in current project',
    '     superflow --help            # Show all commands',
  ].join('\n');
}

function printInstallMessage(version, language) {
  console.log(buildInstallMessage(version, language));
}

export function runPostinstall(env = process.env) {
  if (!isGlobalInstall(env)) return;
  printInstallMessage(pkg.version, resolveInstallLanguage(env));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPostinstall();
}
