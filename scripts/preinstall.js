#!/usr/bin/env node
import { resolveInstallLanguage } from './postinstall.js';

const MIN_NODE_MAJOR = 20;

export function nodeMajor(version) {
  const match = String(version).match(/^v?(\d+)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

export function isSupportedNode(version) {
  return nodeMajor(version) >= MIN_NODE_MAJOR;
}

export function buildNodeVersionMessage(version, language) {
  if (language === 'zh') {
    return [
      `[Superflow] 需要 Node.js ${MIN_NODE_MAJOR} 或更高版本，当前检测到 ${version}。`,
      '',
      '请使用已有的 Node.js 20+ 与配套 npm 后重试。',
      '安装器先复用已有合格运行时；缺少时展示方案并确认后补齐，不修改现有默认版本或 npm 配置。',
      '',
      '完成后重新打开终端，再运行：',
      '  npx --yes --package=@chenmk/superflow@latest superflow-install',
    ].join('\n');
  }

  return [
    `[Superflow] Node.js ${MIN_NODE_MAJOR} or later is required; detected ${version}.`,
    '',
    'Retry with an existing Node.js 20+ installation and its npm.',
    'The bootstrap reuses existing runtimes, or installs a user-scoped runtime after confirmation; existing Node defaults and npm configuration stay unchanged.',
    '',
    'Open a new terminal, then rerun:',
    '  npx --yes --package=@chenmk/superflow@latest superflow-install',
  ].join('\n');
}

export function runPreinstall(version = process.versions.node, env = process.env) {
  if (isSupportedNode(version)) return 0;
  // npm exec must be able to start the bootstrap before a suitable Node exists.
  // Ordinary npm install still enforces the runtime requirement.
  if (env.npm_command === 'exec') return 0;
  const language = resolveInstallLanguage(env);
  console.error(buildNodeVersionMessage(version, language));
  return 1;
}

const exitCode = runPreinstall();
if (exitCode !== 0) process.exitCode = exitCode;
