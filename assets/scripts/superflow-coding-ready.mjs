#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileHash, reviewPath } from "./superflow-review-coverage.mjs";

const args = process.argv.slice(2);
const changeArg = args.find((arg) => !arg.startsWith("--"));
const jsonOutput = args.includes("--json");

if (!changeArg) {
  fail(["用法: superflow-coding-ready.mjs <change-dir> [--json]"]);
}

const changeDir = fs.realpathSync(path.resolve(changeArg));
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pipelineScripts = resolvePipelineScripts(scriptDir);
const checks = [
  [
    "YAML 状态",
    "bash",
    [path.join(pipelineScripts, "superflow-yaml-validate.sh"), changeDir],
  ],
  [
    "docs 门禁",
    "bash",
    [path.join(pipelineScripts, "superflow-guard.sh"), changeDir, "docs"],
  ],
  [
    "design 门禁",
    "bash",
    [path.join(pipelineScripts, "superflow-guard.sh"), changeDir, "design"],
  ],
  [
    "implement 门禁",
    "bash",
    [path.join(pipelineScripts, "superflow-guard.sh"), changeDir, "implement"],
  ],
  [
    "文档交付审计",
    process.execPath,
    [path.join(scriptDir, "superflow-document-audit.mjs"), changeDir, "--json"],
  ],
  [
    "环境预检",
    process.execPath,
    [
      path.join(scriptDir, "superflow-environment-preflight.mjs"),
      changeDir,
      "--json",
    ],
  ],
];
const issues = [];
const evidence = [];

for (const [label, command, commandArgs] of checks) {
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot(changeDir),
    encoding: "utf-8",
    env: { ...process.env, SUPERFLOW_CODING_READY: "1" },
  });
  evidence.push({ label, exitCode: result.status ?? 1 });
  if (result.status !== 0) {
    issues.push(`${label}失败：${tail(result.stderr || result.stdout)}`);
  }
}

// openspec CLI 以工作区根（含 config.yaml 的目录，如 <repo>/openspec 或
// <repo>/doc/openspec）为工作目录解析 change；仓库根不一定是工作区。
function openspecWorkspaceDir(repoRoot) {
  const declared = readDeclaredProjectRoot(changeDir);
  const base = declared ?? repoRoot;
  const candidates = [
    path.join(base, "openspec"),
    path.join(base, "doc", "openspec"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "config.yaml"))) return dir;
  }
  return repoRoot;
}
const openspec = spawnSync(
  "openspec",
  ["validate", path.basename(changeDir), "--strict"],
  {
    cwd: openspecWorkspaceDir(projectRoot(changeDir)),
    encoding: "utf-8",
  },
);
evidence.push({ label: "OpenSpec strict", exitCode: openspec.status ?? 1 });
if (openspec.status !== 0) {
  issues.push(
    `OpenSpec strict 失败：${tail(openspec.stderr || openspec.stdout)}`,
  );
}

const handoffHash = readHandoffHash(changeDir, issues);
const reviewRounds = readReviewRounds(changeDir);
let reviewHash = "";
try {
  reviewHash = fileHash(path.join(changeDir, reviewPath));
} catch {
  issues.push("无法冻结文档评审凭证指纹");
}
const receipt = {
  schemaVersion: "superflow.coding-ready.v1",
  codingReady: issues.length === 0,
  documentReadiness: issues.length === 0 ? "READY" : "BLOCKED",
  environmentReadiness: issues.length === 0 ? "READY" : "BLOCKED",
  reviewRounds,
  handoffHash,
  reviewHash,
  checkedAt: new Date().toISOString(),
  evidence,
  ownerDecisions: 0,
  issues,
};

const receiptDir = path.join(changeDir, ".sdd", "readiness");
fs.mkdirSync(receiptDir, { recursive: true });
const target = path.join(receiptDir, "coding-ready.json");
const temporary = path.join(
  receiptDir,
  `.coding-ready-${process.pid}-${Date.now()}.tmp`,
);
fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {
  mode: 0o600,
});
fs.renameSync(temporary, target);

// Persist BLOCKED too: a failed recheck must revoke an earlier READY receipt.
if (issues.length > 0) fail(issues, receipt);

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} else {
  process.stdout.write(`Coding Ready 通过，凭证已写入 ${target}\n`);
}

function resolvePipelineScripts(currentScriptDir) {
  const candidates = [
    path.resolve(
      currentScriptDir,
      "..",
      "skills",
      "superflow",
      "scripts",
    ),
    path.join(
      os.homedir(),
      ".codex",
      "skills",
      "superflow",
      "scripts",
    ),
    path.join(
      os.homedir(),
      ".claude",
      "skills",
      "superflow",
      "scripts",
    ),
  ];
  const found = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "superflow-guard.sh")),
  );
  if (!found) {
    fail(["找不到 superflow 门禁脚本，请先执行 superflow update"]);
  }
  return found;
}

function readDeclaredProjectRoot(changeDir) {
  try {
    const review = JSON.parse(
      fs.readFileSync(path.join(changeDir, ".sdd", "reviews", "document-review.json"), "utf8"),
    );
    if (typeof review.projectRoot === "string" && review.projectRoot.length > 0) {
      return path.resolve(changeDir, review.projectRoot);
    }
  } catch {
    // 评审文件不可读时退回目录探测
  }
  return null;
}
function projectRoot(root) {
  const declared = readDeclaredProjectRoot(root);
  if (declared) return declared;
  // fallback：openspec 默认布局 <repo>/openspec/changes/<name>
  return path.resolve(root, "..", "..", "..");
}

function readHandoffHash(root, targetIssues) {
  const file = path.join(root, ".sdd", "handoff", "sdd-context.sha256");
  const content = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  const match = content.match(/[a-f0-9]{64}/i);
  if (!match) {
    targetIssues.push("缺少合法的当前 handoff hash");
    return "";
  }
  return match[0].toLowerCase();
}

function readReviewRounds(root) {
  const file = path.join(root, ".sdd", "reviews", "document-review.json");
  try {
    const review = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(review.rounds) ? review.rounds.length : 0;
  } catch {
    return 0;
  }
}

function tail(value) {
  return String(value).trim().split("\n").slice(-4).join(" | ").slice(0, 800);
}

function fail(
  targetIssues,
  receipt = { codingReady: false, issues: targetIssues },
) {
  if (jsonOutput) {
    process.stderr.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    process.stderr.write(
      `Coding Ready 未通过：\n${targetIssues.map((item) => `- ${item}`).join("\n")}\n`,
    );
  }
  process.exit(1);
}
