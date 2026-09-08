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
  const commands = [
    '  nvm install 20',
    '  nvm use 20',
    '  nvm alias default 20',
  ].join('\n');

  if (language === 'zh') {
    return [
      `[Superflow] 需要 Node.js ${MIN_NODE_MAJOR} 或更高版本，当前检测到 ${version}。`,
      '',
      '请先升级到 Node.js 20；请改用一键安装器；它会自动安装并设定 Node.js 20。',
      '若已安装 nvm，请运行：',
      commands,
      '',
      '完成后重新打开终端，再运行：',
      '  npx --yes --package=@chenmk/superflow@0.5.6 superflow-install',
      '未安装 nvm 时，请用系统包管理器或 https://nodejs.org 安装 Node.js 20。',
    ].join('\n');
  }

  return [
    `[Superflow] Node.js ${MIN_NODE_MAJOR} or later is required; detected ${version}.`,
    '',
    'Install Node.js 20 first. Use the one-command installer to install and set Node.js 20 automatically.',
    'If nvm is already installed, run:',
    commands,
    '',
    'Open a new terminal, then rerun:',
    '  npx --yes --package=@chenmk/superflow@0.5.6 superflow-install',
    'Without nvm, use your system package manager or https://nodejs.org to install Node.js 20.',
  ].join('\n');
}

export function runPreinstall(version = process.versions.node, env = process.env) {
  if (isSupportedNode(version)) return 0;
  const language = resolveInstallLanguage(env);
  console.error(buildNodeVersionMessage(version, language));
  return 1;
}

const exitCode = runPreinstall();
if (exitCode !== 0) process.exitCode = exitCode;
