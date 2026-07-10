import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

/**
 * SDD 文档完整性检查。
 * 对照 pipeline SKILL.md 要求的必备文件清单，逐项核验。
 */

interface CheckItem {
  file: string;
  required: boolean;
  exists: boolean;
  note?: string;
}

interface CheckResult {
  change: string;
  phase: string;
  passed: number;
  failed: number;
  items: CheckItem[];
}

const REQUIRED_DOCS: { file: string; note?: string }[] = [
  { file: '.openspec.yaml' },
  { file: 'proposal.md', note: '背景、目标、非目标、影响范围、验收标准' },
  { file: 'api.md', note: 'API 合同（纯 CLI 项目可标注 N/A 并说明原因）' },
  { file: 'design.md', note: '设计方案' },
  { file: 'tasks.md', note: '任务拆分，checkbox 格式' },
  { file: 'tests.md', note: '测试用例，含可执行命令和 RED/GREEN 预期' },
  { file: 'traceability-matrix.md', note: '需求→测试追溯矩阵' },
  { file: 'review-checklist.md', note: '评审检查清单' },
  { file: 'sdd-quality-gate.md', note: '质量门禁状态' },
  { file: 'test-report.md', note: '测试报告（实现前可留占位）' },
];

const SPEC_ALTERNATIVES = ['spec.md', 'specs'];

const HANDOFF_FILES = [
  '.sdd/handoff/sdd-context.md',
  '.sdd/handoff/sdd-context.json',
  '.sdd/handoff/sdd-context.sha256',
];

const PROMPT_INDICATOR = 'prompt';

export async function checkCommand(
  changeName: string,
  options: {
    projectPath?: string;
    json?: boolean;
  } = {}
): Promise<void> {
  const projectPath = path.resolve(options.projectPath ?? process.cwd());
  const changeDir = path.join(projectPath, 'openspec', 'changes', changeName);

  if (!existsSync(changeDir)) {
    console.error(`错误：change 目录不存在: ${changeDir}`);
    process.exit(1);
  }

  const result = collectCheck(changeDir, changeName);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printCheck(result);
  }

  if (result.failed > 0) {
    process.exit(1);
  }
}

export function collectCheck(changeDir: string, changeName: string): CheckResult {
  const items: CheckItem[] = [];
  const statePhase = readPhase(changeDir);

  // 必备文档
  for (const doc of REQUIRED_DOCS) {
    items.push({
      file: doc.file,
      required: true,
      exists: existsSync(path.join(changeDir, doc.file)),
      note: doc.note,
    });
  }

  // spec.md 或 specs/ 目录
  const hasSpec = SPEC_ALTERNATIVES.some((alt) =>
    existsSync(path.join(changeDir, alt))
  );
  items.push({
    file: 'spec.md 或 specs/',
    required: true,
    exists: hasSpec,
    note: '规格文档',
  });

  // Handoff 文件
  for (const hf of HANDOFF_FILES) {
    items.push({
      file: hf,
      required: true,
      exists: existsSync(path.join(changeDir, hf)),
    });
  }

  // state.yaml
  const stateYaml = '.sdd/state.yaml';
  items.push({
    file: stateYaml,
    required: true,
    exists: existsSync(path.join(changeDir, stateYaml)),
  });

  // understand-anything 索引（项目级影响面发现前置条件）
  const projectRoot = path.resolve(changeDir, '..', '..', '..');
  const uaGraph = path.join(projectRoot, '.understand-anything', 'knowledge-graph.json');
  items.push({
    file: '.understand-anything/knowledge-graph.json',
    required: statePhase === 'docs' || statePhase === 'design',
    exists: existsSync(uaGraph),
    note: '平台级影响面发现前置条件（缺失将阻塞 docs/design 门禁，需跑 /understand 或降级手动分析）',
  });

  // Prompt 文件（docs 阶段后期必须）
  const promptDir = path.join(changeDir, PROMPT_INDICATOR);
  const hasPromptDir = existsSync(promptDir) && statSync(promptDir).isDirectory();
  const hasPromptFiles = hasPromptDir &&
    readdirSync(promptDir).some((f) => f.endsWith('.md'));
  items.push({
    file: 'prompt/*.md',
    required: statePhase === 'implement' || statePhase === 'verify',
    exists: hasPromptFiles,
    note: '实现 prompt（implement 阶段前必须）',
  });

  const passed = items.filter((i) => i.exists || !i.required).length;
  const failed = items.filter((i) => !i.exists && i.required).length;

  return { change: changeName, phase: statePhase, passed, failed, items };
}

function readPhase(changeDir: string): string {
  const stateFile = path.join(changeDir, '.sdd', 'state.yaml');
  if (!existsSync(stateFile)) return 'unknown';
  try {
    const content = readFileSync(stateFile, 'utf-8');
    for (const line of content.split('\n')) {
      if (line.trimStart().startsWith('phase:')) {
        return line.split(':')[1]?.trim() ?? 'unknown';
      }
    }
  } catch {
    // ignore
  }
  return 'unknown';
}

function printCheck(result: CheckResult): void {
  console.log(`\n📋 ${result.change} (phase: ${result.phase})`);
  console.log(`   通过: ${result.passed}  缺失: ${result.failed}\n`);

  for (const item of result.items) {
    const icon = item.exists ? '✅' : item.required ? '❌' : '⚪';
    const note = item.note ? ` — ${item.note}` : '';
    console.log(`  ${icon} ${item.file}${note}`);
  }

  if (result.failed > 0) {
    console.log(`\n⚠️  缺失 ${result.failed} 个必备文件。`);
    console.log('   补齐后运行: superflow-guard.sh <change-dir> docs');
  } else {
    console.log('\n✅ 文档完整性检查通过。');
  }
}
