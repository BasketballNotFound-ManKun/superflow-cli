import { promises as fs } from 'fs';
import path from 'path';
import type { Language } from '../../types.js';
import { ASSETS_DIR } from '../../platform/assets.js';

const CONTEXT_FILES = [
  'business-rules.md',
  'incidents.md',
  'decisions.md',
  'external-systems.md',
] as const;

export interface ScaffoldingResult {
  copied: string[];
  skipped: string[];
}

export interface UnderstandScanResult {
  ok: boolean;
  reason: 'already-scanned' | 'not-scanned';
  graphPath?: string;
}

function templatesDir(language: Language = 'zh'): string {
  return path.join(ASSETS_DIR, language === 'en' ? 'context-templates-en' : 'context-templates');
}

/**
 * 把 4 个初始文件从 assets/context-templates/ 复制到 <cwd>/docs/sdd-context/
 * - 已存在则跳过（保留用户已编辑的，不覆盖）
 * - 目录不存在则创建
 */
export async function scaffoldBusinessContext(
  cwd: string,
  language: Language = 'zh'
): Promise<ScaffoldingResult> {
  const targetDir = path.join(cwd, 'docs', 'sdd-context');
  const copied: string[] = [];
  const skipped: string[] = [];

  // 确保目标目录存在
  try {
    await fs.mkdir(targetDir, { recursive: true });
  } catch (err) {
    throw new Error(`无法创建 ${targetDir}: ${(err as Error).message}`);
  }

  for (const filename of CONTEXT_FILES) {
    const target = path.join(targetDir, filename);
    try {
      await fs.access(target);
      // 文件已存在，跳过（保留用户编辑）
      skipped.push(filename);
    } catch {
      // 文件不存在，复制
      const source = path.join(templatesDir(language), filename);
      try {
        await fs.copyFile(source, target);
        copied.push(filename);
      } catch (err) {
        // 单个文件失败不阻塞，记录但继续
        skipped.push(`${filename} (copy failed: ${(err as Error).message})`);
      }
    }
  }

  return { copied, skipped };
}

/**
 * 检查 understand-anything 是否已扫过当前项目
 * （understand-anything 由 agent 技能触发，CLI 只做轻量检测）
 * - 扫过：返回 ok=true, graphPath 指向 .understand-anything/knowledge-graph.json
 * - 没扫：返回 ok=false, 提示用户在 Claude 会话中跑 /understand
 */
export async function checkUnderstandScan(cwd: string): Promise<UnderstandScanResult> {
  const graphPath = path.join(cwd, '.understand-anything', 'knowledge-graph.json');
  try {
    await fs.access(graphPath);
    return { ok: true, reason: 'already-scanned', graphPath };
  } catch {
    return { ok: false, reason: 'not-scanned' };
  }
}

/**
 * 打印软提示：引导用户去看 docs/sdd-context/，并提示可让 LLM 协助补全
 * 末尾用换行分隔，避免紧贴下面命令输出
 */
export function printSoftPrompt(
  cwd: string,
  scaffolding: ScaffoldingResult,
  understand: UnderstandScanResult,
  language: Language = 'zh'
): void {
  const zh = language === 'zh';
  console.log('');
  console.log('━'.repeat(70));
  console.log(zh
    ? '💡 已在 docs/sdd-context/ 生成 4 个初始文件'
    : '💡 Generated 4 starter files under docs/sdd-context/'
  );
  for (const f of CONTEXT_FILES) {
    const status = scaffolding.copied.includes(f)
      ? (zh ? '✓ 复制' : '✓ copied')
      : scaffolding.skipped.includes(f)
        ? (zh ? '○ 跳过（已存在）' : '○ skipped (already exists)')
        : (zh ? '✗ 失败' : '✗ failed');
    console.log(`   [${status}] ${f}`);
  }
  console.log('');
  console.log(zh
    ? '📖 建议：阅读这 4 个文件了解项目业务上下文'
    : '📖 Recommended: review these files and fill in project-specific context'
  );
  console.log(zh
    ? '   如果项目结构 / 业务规则与初始版不符，直接编辑文件即可'
    : '   Edit the files directly when project structure or rules differ'
  );
  console.log(zh
    ? '   完善后的文档能帮 sdd 技能更精确地理解你的项目'
    : '   Better context helps Superflow understand the project more accurately'
  );
  console.log('');
  console.log(zh
    ? '🤖 LLM 协助补全：把这 4 个文件 + 项目源码 一起发给 Claude，'
    : '🤖 LLM-assisted backfill: ask your agent to read these files plus source code'
  );
  console.log(zh
    ? '   让其协助补全缺失内容'
    : '   and fill missing project-specific rules and integration facts'
  );

  if (understand.ok) {
    console.log('');
    console.log((zh ? '🔍 understand-anything 已扫项目：' : '🔍 understand-anything graph detected: ') + understand.graphPath);
  } else {
    console.log('');
    console.log(zh
      ? '⚠️  understand-anything 还没扫 — 这是 SDD 平台级影响面发现的前置条件'
      : '⚠️  understand-anything has not scanned this project yet — required for SDD impact discovery'
    );
    console.log(zh
      ? '   在 Claude 会话中跑 /understand（输出 .understand-anything/knowledge-graph.json）'
      : '   Run /understand in an agent session to produce .understand-anything/knowledge-graph.json'
    );
    console.log(zh
      ? '   ⛔ 不跑的话，SDD docs/design 阶段的平台级影响面门禁会阻塞，届时仍需补跑或降级手动分析'
      : '   ⛔ Without it, the SDD platform impact gate will block during docs/design phase'
    );
  }
  console.log('━'.repeat(70));
  console.log('');
}
