import { promises as fs } from 'fs';
import path from 'path';
import { scaffoldBusinessContext, checkUnderstandScan, printSoftPrompt } from '../core/context.js';
import { normalizeLanguage } from '../core/i18n.js';
import type { Language } from '../types.js';

export interface ScanOptions {
  dryRun: boolean;
  force: boolean;  // --force: 覆盖现有 docs/sdd-context/ 4 文件
  language: Language;
}

const CONTEXT_FILES = [
  'business-rules.md',
  'incidents.md',
  'decisions.md',
  'external-systems.md',
] as const;

export async function scanCommand(cmdOptions: {
  dryRun?: boolean;
  force?: boolean;
  language?: string;
}) {
  await runScan({
    dryRun: !!cmdOptions.dryRun,
    force: !!cmdOptions.force,
    language: normalizeLanguage(cmdOptions.language) ?? 'zh',
  });
}

export async function runScan(options: ScanOptions): Promise<void> {
  const cwd = process.cwd();
  const targetDir = path.join(cwd, 'docs', 'sdd-context');

  console.log('=== superflow scan ===\n');
  console.log(`Target: ${targetDir}`);
  console.log(`Mode: ${options.force ? 'force (overwrite)' : 'default (skip existing)'}\n`);

  if (options.dryRun) {
    console.log('[dry-run] Will scaffold 4 files, run understand-anything scan, print soft prompt');
    return;
  }

  // 1. 确保目标目录存在
  await fs.mkdir(targetDir, { recursive: true });

  // 2. 脚手架
  let scaffolding = await scaffoldBusinessContext(cwd, options.language);
  console.log(`Scaffold: copied ${scaffolding.copied.length}, skipped ${scaffolding.skipped.length}`);

  // 3. --force 时删除已存在的再复制
  if (options.force) {
    console.log('--force: removing existing files first');
    for (const filename of CONTEXT_FILES) {
      const target = path.join(targetDir, filename);
      try {
        await fs.unlink(target);
      } catch {
        // 文件不存在无所谓
      }
    }
    // 重新脚手架（此时所有都该被复制）
    scaffolding = await scaffoldBusinessContext(cwd, options.language);
    console.log(`Scaffold (after force): copied ${scaffolding.copied.length}`);
  }

  // 4. 检查 understand-anything 扫描状态
  console.log('\nChecking understand-anything graph...');
  const understandResult = await checkUnderstandScan(cwd);
  if (understandResult.ok) {
    console.log('✓ understand-anything graph found: ' + understandResult.graphPath);
  } else {
    console.log(options.language === 'en'
      ? '⚠ understand-anything has not scanned this project yet (run /understand in an agent session)'
      : '⚠ understand-anything 还没扫（在 Claude 会话中跑 /understand）'
    );
  }

  // 5. 软提示
  printSoftPrompt(cwd, scaffolding, understandResult, options.language);
}
