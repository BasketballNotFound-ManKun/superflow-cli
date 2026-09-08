#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const NODE_MIN = 20;
const MAIN = `@chenmk/superflow@${require('../../package.json').version}`;
const NVM_URL = 'https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh';

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with ${result.status}`);
}

function major(version) {
  const match = String(version || '').match(/^v?(\d+)/);
  return match ? Number(match[1]) : 0;
}

function removeNpmNvmConflict(home) {
  const npmrc = join(home, '.npmrc');
  if (!existsSync(npmrc)) return;
  const source = readFileSync(npmrc, 'utf8');
  const lines = source.split(/\r?\n/);
  const kept = lines.filter((line) => !/^\s*(prefix|globalconfig)\s*=/i.test(line));
  if (kept.length === lines.length) return;
  const backup = `${npmrc}.superflow-backup`;
  writeFileSync(backup, source, { mode: 0o600 });
  writeFileSync(npmrc, kept.join('\n'), { mode: 0o600 });
  console.log(`[Superflow] Backed up incompatible npm settings: ${backup}`);
}

function main() {
  console.log('[Superflow] Starting one-command installation...');
  if (major(process.version) >= NODE_MIN) {
    run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '-g', MAIN,
      '--registry', 'https://registry.npmjs.org']);
    return;
  }
  if (process.platform === 'win32') {
    run('winget', ['install', '--id', 'OpenJS.NodeJS', '--exact', '--source', 'winget',
      '--accept-package-agreements', '--accept-source-agreements']);
    const npm = join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'npm.cmd');
    if (!existsSync(npm)) throw new Error('Node installed; reopen terminal and rerun this command.');
    run(npm, ['install', '-g', MAIN, '--registry', 'https://registry.npmjs.org']);
    return;
  }
  const home = process.env.HOME;
  if (!home) throw new Error('HOME is required to install Node.js.');
  removeNpmNvmConflict(home);
  const nvm = process.env.NVM_DIR || join(home, '.nvm');
  const script = [
    'set -e',
    'export NVM_DIR="$SUPERFLOW_NVM_DIR"',
    'if [ ! -s "$NVM_DIR/nvm.sh" ]; then',
    `  curl -fsSL "${NVM_URL}" | bash`,
    'fi',
    '. "$NVM_DIR/nvm.sh"',
    `nvm use --delete-prefix 20 --silent || true`,
    `nvm install 20`,
    `nvm use --delete-prefix ${NODE_MIN}`,
    `nvm alias default ${NODE_MIN}`,
    `npm install -g "${MAIN}" --registry https://registry.npmjs.org`,
    'superflow --version',
  ].join('\n');
  run('bash', ['-lc', script], { env: { ...process.env, SUPERFLOW_NVM_DIR: nvm } });
}

if (require.main === module) {
try {
  main();
  console.log('[Superflow] Installation complete. Restart your terminal before using Superflow.');
} catch (error) {
  console.error(`[Superflow] Installation failed: ${error.message}`);
  process.exitCode = 1;
}

}
module.exports = { major };
