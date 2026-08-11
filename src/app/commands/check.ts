import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { execFileSync } from "node:child_process";
import path from "path";
import { ASSETS_DIR } from "../../platform/assets.js";
import { runChangeGuard, runCodingReady } from "./change-guard.js";

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

export type CheckLevel = "files" | "docs" | "coding-ready";

const REQUIRED_DOCS: { file: string; note?: string }[] = [
  { file: ".openspec.yaml" },
  { file: "proposal.md", note: "背景、目标、非目标、影响范围、验收标准" },
  { file: "api.md", note: "API 合同（纯 CLI 项目可标注 N/A 并说明原因）" },
  { file: "design.md", note: "设计方案" },
  { file: "tasks.md", note: "任务拆分，checkbox 格式" },
  { file: "tests.md", note: "测试用例，含可执行命令和 RED/GREEN 预期" },
  { file: "traceability-matrix.md", note: "需求→测试追溯矩阵" },
  { file: "review-checklist.md", note: "评审检查清单" },
  { file: "sdd-quality-gate.md", note: "质量门禁状态" },
  { file: "test-report.md", note: "测试报告（实现前可留占位）" },
];

const SPEC_ALTERNATIVES = ["spec.md", "specs"];

const HANDOFF_FILES = [
  ".sdd/handoff/sdd-context.md",
  ".sdd/handoff/sdd-context.json",
  ".sdd/handoff/sdd-context.sha256",
];

const PROMPT_INDICATOR = "prompt";

export async function checkCommand(
  changeName: string,
  options: {
    projectPath?: string;
    json?: boolean;
    level?: CheckLevel;
  } = {},
): Promise<void> {
  const projectPath = path.resolve(options.projectPath ?? process.cwd());
  const changeDir = path.join(projectPath, "openspec", "changes", changeName);

  if (!existsSync(changeDir)) {
    console.error(`错误：change 目录不存在: ${changeDir}`);
    process.exit(1);
  }

  const result = collectCheck(changeDir, changeName);
  const level = options.level ?? "files";

  if (!["files", "docs", "coding-ready"].includes(level)) {
    console.error(`错误：不支持的检查等级 ${level}`);
    process.exit(1);
  }

  if (!options.json) {
    printCheck(result);
  } else if (level === "files") {
    console.log(JSON.stringify(result, null, 2));
  }

  if (result.failed > 0) {
    process.exit(1);
  }

  if (level === "docs") {
    try {
      runChangeGuard(changeDir, "docs", { quiet: options.json });
      const documentAudit = runDocumentAudit(changeDir, options.json);
      if (options.json) {
        console.log(JSON.stringify({ ...result, documentAudit }, null, 2));
      }
    } catch (error) {
      reportGateFailure(result, level, error, options.json);
    }
  }
  if (level === "coding-ready") {
    try {
      const codingReady = runCodingReady(changeDir, { json: options.json });
      if (options.json) {
        console.log(JSON.stringify({ ...result, codingReady }, null, 2));
      }
    } catch (error) {
      reportGateFailure(result, level, error, options.json);
    }
  }
}

function reportGateFailure(
  result: CheckResult,
  level: CheckLevel,
  error: unknown,
  json = false,
): void {
  if (json) {
    const stderr = (error as { stderr?: string | Buffer })?.stderr;
    const rawDetail = stderr
      ? String(stderr).trim().slice(-2000)
      : error instanceof Error
        ? error.message
        : "检查失败";
    let detail: unknown = rawDetail;
    try {
      detail = JSON.parse(rawDetail);
    } catch {
      // Keep non-JSON gate output as a bounded string.
    }
    console.error(
      JSON.stringify(
        { ...result, level, ready: false, error: detail },
        null,
        2,
      ),
    );
  }
  process.exitCode = 1;
}

function runDocumentAudit(changeDir: string, json = false): unknown {
  const script = path.resolve(
    ASSETS_DIR,
    "scripts",
    "superflow-document-audit.mjs",
  );
  const args = [script, changeDir, ...(json ? ["--json"] : [])];
  if (json) {
    const output = execFileSync(process.execPath, args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(output);
  }
  execFileSync(process.execPath, args, { stdio: "inherit" });
  return undefined;
}

export function collectCheck(
  changeDir: string,
  changeName: string,
): CheckResult {
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
    existsSync(path.join(changeDir, alt)),
  );
  items.push({
    file: "spec.md 或 specs/",
    required: true,
    exists: hasSpec,
    note: "规格文档",
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
  const stateYaml = ".sdd/state.yaml";
  items.push({
    file: stateYaml,
    required: true,
    exists: existsSync(path.join(changeDir, stateYaml)),
  });

  // understand-anything 索引（项目级影响面发现前置条件）
  const projectRoot = path.resolve(changeDir, "..", "..", "..");
  const uaGraph = path.join(
    projectRoot,
    ".understand-anything",
    "knowledge-graph.json",
  );
  items.push({
    file: ".understand-anything/knowledge-graph.json",
    required: false,
    exists: existsSync(uaGraph),
    note: "平台级影响面导航工具（缺失时必须降级为源码、配置和跨仓检索并记录证据）",
  });

  // Prompt 文件（docs 阶段后期必须）
  const promptDir = path.join(changeDir, PROMPT_INDICATOR);
  const hasPromptDir =
    existsSync(promptDir) && statSync(promptDir).isDirectory();
  const hasPromptFiles =
    hasPromptDir && readdirSync(promptDir).some((f) => f.endsWith(".md"));
  items.push({
    file: "prompt/*.md",
    required: statePhase === "implement" || statePhase === "verify",
    exists: hasPromptFiles,
    note: "实现 prompt（implement 阶段前必须）",
  });

  const passed = items.filter((i) => i.exists || !i.required).length;
  const failed = items.filter((i) => !i.exists && i.required).length;

  return { change: changeName, phase: statePhase, passed, failed, items };
}

function readPhase(changeDir: string): string {
  const stateFile = path.join(changeDir, ".sdd", "state.yaml");
  if (!existsSync(stateFile)) return "unknown";
  try {
    const content = readFileSync(stateFile, "utf-8");
    for (const line of content.split("\n")) {
      if (line.trimStart().startsWith("phase:")) {
        return line.split(":")[1]?.trim() ?? "unknown";
      }
    }
  } catch {
    // ignore
  }
  return "unknown";
}

function printCheck(result: CheckResult): void {
  console.log(`\n📋 ${result.change} (phase: ${result.phase})`);
  console.log(`   通过: ${result.passed}  缺失: ${result.failed}\n`);

  for (const item of result.items) {
    const icon = item.exists ? "✅" : item.required ? "❌" : "⚪";
    const note = item.note ? ` — ${item.note}` : "";
    console.log(`  ${icon} ${item.file}${note}`);
  }

  if (result.failed > 0) {
    console.log(`\n⚠️  缺失 ${result.failed} 个必备文件。`);
    console.log("   补齐后运行: superflow-guard.sh <change-dir> docs");
  } else {
    console.log("\n✅ 文档完整性检查通过。");
  }
}
