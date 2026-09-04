#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [projectArg = ".", taskId] = process.argv.slice(2);
if (!taskId) {
  fail(
    "用法: superflow-managed-executor-preflight.mjs <project-root> <task-id>",
  );
}

const root = path.resolve(projectArg);
const taskFile = path.join(root, ".superflow", "tasks", taskId, "task.json");
if (!fs.existsSync(taskFile)) fail(`缺少托管任务合同: ${taskFile}`);
const task = JSON.parse(fs.readFileSync(taskFile, "utf8"));
const english = task.language === "en";
const protectedInputErrors = validateProtectedInputs(root, taskId);
const enforceEightyColumns = requiresEightyColumns(task, root);
const enforcePortableAcceptance = requiresPortableAcceptance(task);
const enforceOwnedCleanup = requiresOwnedCleanup(task);
const changed = changedFiles(root).filter(
  (file) =>
    !file.startsWith(".superflow/") &&
    !file.startsWith("target/") &&
    !file.startsWith("node_modules/") &&
    !file.includes("/node_modules/"),
);
if (changed.length === 0) fail("没有检测到需求产物变更");

const errors = [...protectedInputErrors];
const warnings = [];
for (const relative of changed) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) continue;
  if (!isTextFile(relative)) continue;
  const content = fs.readFileSync(absolute, "utf8");
  if (enforceEightyColumns && /\.(?:java|xml)$/i.test(relative)) {
    content.split(/\r?\n/).forEach((line, index) => {
      if ([...line].length > 80) {
        errors.push(`${relative}:${index + 1} 超过 80 字符`);
      }
    });
  }
  content.split(/\r?\n/).forEach((line, index) => {
    if (/[ \t]+$/.test(line)) {
      errors.push(`${relative}:${index + 1} 存在行尾空白`);
    }
  });
  if (containsPlaintextCredential(content)) {
    if (isEvidencePath(relative)) {
      errors.push(`${relative} 的交付证据包含明文凭据`);
    } else {
      warnings.push(`${relative} 命中疑似明文凭据，交由 Host 语义复核`);
    }
  } else if (isEvidencePath(relative) && containsEvidenceCredential(content)) {
    errors.push(`${relative} 的交付证据包含明文凭据`);
  }
  if (
    enforcePortableAcceptance &&
    isPortableExecutable(relative) &&
    containsPersonalAbsolutePath(content)
  ) {
    errors.push(
      `${relative} 的验收脚本包含个人绝对路径，必须改为 PATH、项目相对路径或运行时发现`,
    );
  }
  if (enforceOwnedCleanup && isPortableExecutable(relative)) {
    errors.push(...unsafeCleanupErrors(relative, content));
  }
}

const changeDir = findChangeDir(task, root);
if (changeDir) {
  const tasksFile = path.join(changeDir, "tasks.md");
  const reportFile = path.join(changeDir, "test-report.md");
  if (!fs.existsSync(tasksFile)) {
    errors.push(`缺少 tasks.md: ${tasksFile}`);
  } else {
    const taskContent = fs.readFileSync(tasksFile, "utf8");
    const pending = taskContent
      .split(/\r?\n/)
      .filter((line) => /^\s*- \[ \]/.test(line))
      .filter(
        (line) => !/\[(?:environment_required|release_required)\]/.test(line),
      );
    if (pending.length > 0) {
      errors.push(`仍有 ${pending.length} 个 local_required 任务未勾选`);
    }
    const frozenPrompt = task.taskPrompt?.snapshotPath;
    if (
      frozenPrompt &&
      fs.existsSync(frozenPrompt) &&
      frozenPromptRequiresLocalOnly(fs.readFileSync(frozenPrompt, "utf8")) &&
      /\[(?:environment_required|release_required)\]/i.test(taskContent)
    ) {
      errors.push(
        "冻结 Prompt 规定 tasks.md 仅使用 local_required，禁止把任务降级为 environment_required 或 release_required",
      );
    }
  }
  if (!fs.existsSync(reportFile))
    errors.push(`缺少 test-report.md: ${reportFile}`);
}

if (errors.length > 0) {
  console.error("Executor 交付前确定性门禁失败:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

warnings.forEach((warning) => console.warn(`WARN ${warning}`));

console.log(`OK Executor 交付前确定性门禁通过: ${changed.length} 个需求文件`);

function changedFiles(projectRoot) {
  try {
    const output = execFileSync(
      "git",
      [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--no-renames",
      ],
      {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    return output
      .split("\0")
      .filter(Boolean)
      .map((entry) => entry.slice(3).replaceAll("\\", "/"));
  } catch {
    return walkWorkspaceFiles(projectRoot);
  }
}

function walkWorkspaceFiles(projectRoot) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if ([".git", ".superflow"].includes(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(path.relative(projectRoot, absolute).replaceAll("\\", "/"));
      }
    }
  };
  visit(projectRoot);
  return files;
}

function findChangeDir(contract, projectRoot) {
  const original = contract.taskPrompt?.originalPath;
  if (!original) return null;
  let current = path.dirname(path.resolve(original));
  while (current.startsWith(projectRoot)) {
    if (fs.existsSync(path.join(current, "tasks.md"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function isTextFile(file) {
  return /\.(?:java|xml|ts|tsx|js|jsx|vue|json|ya?ml|md|sql|properties|log|out|txt|sh|bash|zsh|ps1)$/i.test(
    file,
  );
}

function isEvidencePath(file) {
  return /(?:^|\/)evidence(?:\/|$)/i.test(file);
}

function containsEvidenceCredential(value) {
  const assignment =
    /\b(?:[a-z0-9]+_)*(?:password|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*["']?([^\s,"'}\]]+)/gi;
  for (const match of value.matchAll(assignment)) {
    const candidate = match[1].trim().toLowerCase();
    if (
      candidate &&
      !candidate.includes("<redacted>") &&
      !candidate.includes("<masked>") &&
      !candidate.startsWith("$")
    )
      return true;
  }
  return (
    /authorization\s*[:=]\s*(?!<redacted>|<masked>)[^\s"']+/i.test(value) ||
    /jdbc:[^\s]+:\/\/[^\s/:]+:[^\s/@]+@/i.test(value)
  );
}

function requiresEightyColumns(contract, projectRoot) {
  const files = [
    contract.taskPrompt?.snapshotPath,
    path.join(projectRoot, "AGENTS.md"),
    path.join(projectRoot, "CLAUDE.md"),
    ...ruleFiles(path.join(projectRoot, ".claude", "rules")),
  ].filter((file) => file && fs.existsSync(file));
  const text = [
    ...(contract.mandatoryEngineeringRules ?? []),
    ...files.map((file) => fs.readFileSync(file, "utf8")),
  ].join("\n");
  return /(?:每行|行|line).{0,24}(?:不超过|不得超过|<=|maximum|max).{0,12}80|80.{0,12}(?:字符|columns?)/i.test(
    text,
  );
}

function ruleFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return ruleFiles(target);
    return entry.isFile() && entry.name.endsWith(".md") ? [target] : [];
  });
}

function containsPlaintextCredential(value) {
  const literal =
    /\b(?:[a-z0-9]+_)*(?:password|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*["']([^"']+)["']/gi;
  for (const match of value.matchAll(literal)) {
    if (isSecret(match[1])) return true;
  }
  const mysql =
    /(?:\s-p(?:'([^']*)'|"([^"]*)"|([^\s'"-][^\s]*))|--password=(?:'([^']*)'|"([^"]*)"|([^\s]+)))/g;
  for (const match of value.matchAll(mysql)) {
    const secret = match.slice(1).find((item) => item !== undefined) ?? "";
    if (isSecret(secret)) return true;
  }
  return /authorization\s*[:=]\s*bearer\s+(?!<redacted>)[^\s"']+/i.test(value);
}

function isSecret(value) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length >= 6 &&
    !normalized.includes("<redacted>") &&
    !isDocumentationSecretPlaceholder(normalized) &&
    !normalized.startsWith("$") &&
    !isNonceDerivedTemporarySecret(normalized)
  );
}

function isDocumentationSecretPlaceholder(value) {
  return /^<(?:pass(?:word)?|secret|api[_-]?key|access[_-]?token|auth[_-]?token)>$/i.test(
    value,
  );
}

function isNonceDerivedTemporarySecret(value) {
  return /^[a-z0-9_-]*\$(?:\{[a-z0-9_]*nonce\}|[a-z0-9_]*nonce)$/.test(value);
}

function frozenPromptRequiresLocalOnly(content) {
  return (
    /tasks\.md[\s\S]{0,160}(?:仅使用|只能使用)[\s\S]{0,80}\[local_required\]/i.test(
      content,
    ) ||
    /tasks\.md[\s\S]{0,160}(?:only|must)[\s\S]{0,40}(?:use|contain)[\s\S]{0,80}\[local_required\]/i.test(
      content,
    )
  );
}

function requiresPortableAcceptance(contract) {
  const prompt = contract.taskPrompt?.snapshotPath;
  if (!prompt || !fs.existsSync(prompt)) return false;
  const content = fs.readFileSync(prompt, "utf8");
  return /(?:可移植|个人绝对路径|portable|personal absolute path)/i.test(
    content,
  );
}

function requiresOwnedCleanup(contract) {
  const content = [contract.request, contract.objective]
    .filter(Boolean)
    .join("\n");
  return /(?:\bapi\b|\bhttp\b|\be2e\b|\bsql\b|\bmysql\b|\bdatabase\b|\bdocker\b|\bbrowser\b|\bserver\b|\bservice\b|接口|启动|数据库|浏览器|服务|容器|端到端|集成测试)/i.test(
    content,
  );
}

function validateProtectedInputs(projectRoot, currentTaskId) {
  const manifestFile = path.join(
    projectRoot,
    ".superflow",
    "tasks",
    currentTaskId,
    "context-manifest.json",
  );
  if (!fs.existsSync(manifestFile)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const issues = [];
  for (const entry of manifest.entries ?? []) {
    const protection = entry.protection ?? "immutable";
    if (!fs.existsSync(entry.path)) {
      issues.push(
        managedMessage(
          `受保护输入已被删除：${entry.path}`,
          `Protected input was deleted: ${entry.path}`,
        ),
      );
      continue;
    }
    if (protection === "immutable" && sha256File(entry.path) !== entry.sha256) {
      issues.push(
        managedMessage(
          `冻结输入已被修改：${entry.path}`,
          `Immutable input was modified: ${entry.path}`,
        ),
      );
    }
  }
  return issues;
}

function unsafeCleanupErrors(relative, content) {
  const issues = [];
  if (/(?:^|[;&|]\s*)(?:pkill|killall)\b/m.test(content)) {
    issues.push(
      managedMessage(
        `${relative} 使用按进程名清理，必须改用 owner helper`,
        `${relative} uses process-name cleanup; use the owner helper`,
      ),
    );
  }
  if (
    /(?:^|[;&|]\s*)kill\s+(?!-0\b)/m.test(content) &&
    !/superflow_signal_owner/.test(content)
  ) {
    issues.push(
      managedMessage(
        `${relative} 使用裸 kill，必须调用 superflow_signal_owner`,
        `${relative} uses bare kill; call superflow_signal_owner`,
      ),
    );
  }
  if (
    /\bdocker\s+(?:(?:container|network|volume)\s+)?rm\b/i.test(content) &&
    !/superflow_docker_remove_verified/.test(content)
  ) {
    issues.push(
      managedMessage(
        `${relative} 直接删除 Docker 资源，必须调用 owner helper`,
        `${relative} deletes Docker resources directly; use the owner helper`,
      ),
    );
  }
  if (
    /(?:^|[;&|]\s*)rm\s+-[^\n;&|]*r[^\n;&|]*f/m.test(content) &&
    !/superflow_runtime_remove_verified/.test(content) &&
    !safeBuildDirectoryCleanup(content)
  ) {
    issues.push(
      managedMessage(
        `${relative} 使用未校验的 rm -rf，运行目录必须由 owner helper 删除`,
        `${relative} uses unverified rm -rf; runtime directories require the owner helper`,
      ),
    );
  }
  return issues;
}

function safeBuildDirectoryCleanup(content) {
  const matches = content.matchAll(
    /(?:^|[;&|]\s*)rm\s+-[^\n;&|]*r[^\n;&|]*f\s+([^\n;&|]+)/gm,
  );
  let found = false;
  for (const match of matches) {
    found = true;
    const targets = match[1]
      .trim()
      .split(/\s+/)
      .filter((value) => value && !value.startsWith("-"));
    if (
      targets.length === 0 ||
      targets.some(
        (target) =>
          /[$*?]/.test(target) ||
          !/^(?:\.\/)?(?:target|build|dist|coverage|\.gradle|\.cache|\.tmp|tmp)(?:\/|$)/.test(
            target.replace(/^['"]|['"]$/g, ""),
          ),
      )
    ) {
      return false;
    }
  }
  return found;
}

function sha256File(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function managedMessage(zh, en) {
  return english ? en : zh;
}

function isPortableExecutable(file) {
  return /\.(?:sh|bash|zsh|ps1)$/i.test(file);
}

function containsPersonalAbsolutePath(content) {
  return /(?:^|[\s"'=])(?:\/Users|\/home)\/[A-Za-z0-9._-]+(?:\/|$)|(?:^|[\s"'=])[A-Za-z]:\\Users\\[A-Za-z0-9._-]+(?:\\|$)/m.test(
    content,
  );
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
