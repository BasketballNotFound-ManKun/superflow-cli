import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { auditQuickSpec, evaluateQuickGate } from "../../domains/quick-dev/gate.js";

export interface QuickCommandOptions {
  project?: string;
  path?: string[];
  json?: boolean;
  spec?: string;
  approve?: boolean;
  seam?: string;
  activeSdd?: boolean;
}

export function quickCommand(request: string, options: QuickCommandOptions = {}): void {
  const project = options.project ?? process.cwd();
  const baselineCommit = gitHead(project);
  const dirty = changedFiles(project);
  const files = options.path?.length ? options.path : dirty;
  const result = evaluateQuickGate({
    request,
    changedFiles: files,
    testSeam: options.seam,
    dirtyWorktree: dirty.some((file) =>
      !files.includes(file) && file !== options.spec &&
      !isManagedGitignoreOnly(project, file)),
    activeSddChange: options.activeSdd ?? false,
  });
  if (!baselineCommit) result.reasons.push("Quick 路径需要已提交基线的 Git 项目");
  for (const file of [...files, ...(options.seam ? [options.seam] : [])]) {
    if (!validProjectFile(project, file)) {
      result.reasons.push(`文件不在项目内或不可读取: ${file}`);
    }
  }
  if (result.reasons.length > 0) result.verdict = "STOP";
  const specPath = options.spec;
  const specValidPath = specPath ? validProjectFile(project, specPath) : false;
  if (specPath && !specValidPath) {
    result.reasons.push(`Quick Spec 不在项目内或不可读取: ${specPath}`);
    result.verdict = "STOP";
  }
  const specResult = specPath && specValidPath
    ? auditQuickSpec(fs.readFileSync(specPath, "utf8"))
    : undefined;
  if (specPath && specValidPath && baselineCommit) {
    const specContent = fs.readFileSync(specPath, "utf8");
    const declared = /^baseline:\s*([0-9a-f]{7,40})\s*$/m.exec(specContent)?.[1];
    if (declared !== baselineCommit) {
      result.reasons.push("Quick Spec baseline 与当前 HEAD 不一致");
      result.verdict = "STOP";
    }
  }
  if (specResult && !specResult.ok) {
    result.reasons.push(...specResult.errors);
    result.verdict = "STOP";
  }
  if (options.approve && (!specPath || result.verdict !== "QUICK" || !specResult?.ok)) {
    result.reasons.push("Quick Spec 未通过当前准入与文档校验，不能批准");
    result.verdict = "STOP";
  }
  if (specPath && options.approve && result.verdict === "QUICK" &&
    specResult?.ok && specResult.status === "draft") {
    const content = fs.readFileSync(specPath, "utf8")
      .replace(/^status:\s*draft\s*$/m, "status: ready-for-dev")
      .replace(/\n?approved-digest:\s*[^\n]*\n?/m, "\n")
      .trimEnd() + `\napproved-digest: ${specResult.digest}\n`;
    fs.writeFileSync(specPath, content);
    specResult.status = "ready-for-dev";
    result.next = "Quick Spec 已批准；按测试先行实施，并保留 RED/GREEN 证据";
  }
  if (result.verdict === "QUICK" && specResult?.status === "ready-for-dev") {
    result.next = "Quick Spec 当前版本有效；按测试先行实施";
  }
  if (result.verdict === "STOP") {
    result.nextSkill = "superflow-clarify";
    result.next = "停止 Quick；先核实在途变更是否拥有同一行为，再由 superflow-clarify 对齐正式 SDD。用户明确选择 ake SSD 时才切换到 ssd-propose";
  }
  if (options.json) {
    console.log(JSON.stringify({ ...result, changedFiles: files, ...(specResult ? { spec: specResult } : {}) }, null, 2));
  } else {
    console.log(`${result.verdict} — ${result.target}`);
    for (const reason of result.reasons) console.log(`- ${reason}`);
    console.log(`下一步：${result.next}`);
  }
  if (result.verdict === "STOP" || (specResult && !specResult.ok)) process.exitCode = 2;
}

function changedFiles(project: string): string[] {
  try {
    return execFileSync("git", ["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], {
      cwd: project,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).split("\0").filter(Boolean).map((entry) => entry.slice(3));
  } catch {
    return [];
  }
}

function gitHead(project: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: project,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function isManagedGitignoreOnly(project: string, file: string): boolean {
  if (file !== ".gitignore") return false;
  try {
    const rules = fs.readFileSync(path.join(project, file), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    return rules.length === 1 && rules[0] === ".superflow/";
  } catch {
    return false;
  }
}

function validProjectFile(project: string, candidate: string): boolean {
  const root = path.resolve(project);
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  try {
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(absolute);
    const realRelative = path.relative(realRoot, realFile);
    return !realRelative.startsWith("..") && !path.isAbsolute(realRelative) &&
      fs.statSync(realFile).isFile();
  } catch {
    return false;
  }
}
