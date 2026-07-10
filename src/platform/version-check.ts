import { runCommand } from './process.js';

const PACKAGE_NAME = '@chenmk/superflow';
const CHECK_INTERVAL_MS = 1000 * 60 * 60 * 24; // 一天检查一次

let lastCheck = 0;
let cachedLatest: string | null = null;

/**
 * 启动时检查 npm registry 是否有新版本。
 * 非阻塞：失败静默跳过，不影响命令执行。
 */
export async function checkForUpdates(currentVersion: string): Promise<void> {
  if (Date.now() - lastCheck < CHECK_INTERVAL_MS && cachedLatest) {
    if (cachedLatest !== currentVersion) {
      printUpdateHint(currentVersion, cachedLatest);
    }
    return;
  }

  try {
    const result = await runCommand('npm', ['view', PACKAGE_NAME, 'version'], {
      timeout: 5000,
    });
    if (result.code !== 0) return;

    const latest = result.stdout.trim();
    lastCheck = Date.now();
    cachedLatest = latest;

    if (latest !== currentVersion) {
      printUpdateHint(currentVersion, latest);
    }
  } catch {
    // npm view failed（无网络、npm 未安装等），静默跳过
  }
}

function printUpdateHint(current: string, latest: string): void {
  // 只在终端输出（stderr 避免干扰 --json 输出）
  const msg = [
    '',
    `\x1b[33m⚠  superflow ${latest} 可用（当前 ${current}）\x1b[0m`,
    `   升级: \x1b[36mnpm install -g ${PACKAGE_NAME}@latest\x1b[0m`,
    `   或: \x1b[36msuperflow update --with-package\x1b[0m`,
    '',
  ].join('\n');
  process.stderr.write(msg + '\n');
}
