#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const changeArg = args.find((arg) => !arg.startsWith("--"));
const jsonOutput = args.includes("--json");

if (!changeArg) {
  fail(["用法: superflow-document-audit.mjs <change-dir> [--json]"]);
}

const changeDir = fs.realpathSync(path.resolve(changeArg));
const issues = [];
const prompts = markdownFiles(path.join(changeDir, "prompt"));
const handoffHash = readHandoffHash(changeDir, issues);
const aggregateDocuments = [
  "tasks.md",
  "traceability-matrix.md",
  "sdd-quality-gate.md",
  "test-report.md",
];

if (prompts.length === 0) {
  issues.push("prompt/ 目录至少需要一份 Markdown 实现 Prompt");
}

for (const document of aggregateDocuments) {
  const documentPath = path.join(changeDir, document);
  if (!fs.existsSync(documentPath)) {
    issues.push(`缺少文档: ${document}`);
    continue;
  }
  const links = markdownTargets(fs.readFileSync(documentPath, "utf-8"));
  for (const prompt of prompts) {
    const relativePrompt = path.relative(changeDir, prompt).replaceAll("\\", "/");
    if (!links.has(relativePrompt)) {
      issues.push(`${document} 未链接 ${relativePrompt}`);
    }
  }
}

const review = readJson(
  path.join(changeDir, ".sdd", "reviews", "document-review.json"),
  "文档多轮评审凭证",
  issues,
);
validateReview(review, handoffHash, issues);
validateMermaid(changeDir, issues);

const result = {
  schemaVersion: "superflow.document-audit.v1",
  ready: issues.length === 0,
  handoffHash,
  promptCount: prompts.length,
  reviewRounds: Array.isArray(review?.rounds) ? review.rounds.length : 0,
  issues,
};

if (issues.length > 0) {
  fail(issues, result);
}

print(result);

function validateReview(review, currentHash, targetIssues) {
  if (!review) return;
  if (review.schemaVersion !== "superflow.document-review.v1") {
    targetIssues.push("文档评审凭证 schemaVersion 必须为 superflow.document-review.v1");
  }
  if (review.handoffHash !== currentHash) {
    targetIssues.push("文档评审凭证未绑定当前 handoff hash");
  }
  if (review.verdict !== "PASS") {
    targetIssues.push("文档评审最终结论必须为 PASS");
  }
  if ((review.openOwnerDecisions?.length ?? 0) > 0) {
    targetIssues.push("仍有 owner 决策未关闭，应集中询问用户后重新评审");
  }
  if (!Array.isArray(review.rounds) || review.rounds.length < 3) {
    targetIssues.push("文档交付前至少三轮独立视角评审");
    return;
  }
  const requiredLenses = new Set([
    "source-contract",
    "architecture-minimality",
    "e2e-environment",
  ]);
  for (const round of review.rounds) {
    requiredLenses.delete(round.lens);
    if (round.inputHash !== currentHash) {
      targetIssues.push(`第 ${round.round ?? "?"} 轮评审不是基于当前 handoff hash`);
    }
    const openFindings = (round.findings ?? []).filter(
      (finding) => finding.status !== "closed",
    );
    if (openFindings.length > 0) {
      targetIssues.push(`第 ${round.round ?? "?"} 轮仍有未关闭评审发现`);
    }
  }
  if (requiredLenses.size > 0) {
    targetIssues.push(`缺少评审视角: ${[...requiredLenses].join(", ")}`);
  }
}

function validateMermaid(root, targetIssues) {
  const configPath = path.join(root, ".openspec.yaml");
  const config = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, "utf-8")
    : "";
  const required =
    /^\s*mermaid:\s*required\s*$/m.test(config) ||
    /^\s*complex_logic:\s*true\s*$/m.test(config) ||
    /^\s*cross_repo:\s*true\s*$/m.test(config);
  if (!required) return;

  const markdown = ["design.md", "tests.md"]
    .map((file) => path.join(root, file))
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, "utf-8"))
    .join("\n");
  const blocks = [...markdown.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)].map(
    (match) => match[1].trim(),
  );
  for (const block of blocks) {
    validateMermaidBlock(block, targetIssues);
  }
  if (!blocks.some((block) => /^sequenceDiagram\b/m.test(block))) {
    targetIssues.push("复杂逻辑必须包含 Mermaid sequenceDiagram 端到端时序图");
  }
  if (
    !blocks.some((block) =>
      /^(flowchart\b|graph\b|stateDiagram(?:-v2)?\b)/m.test(block),
    )
  ) {
    targetIssues.push("复杂逻辑必须包含 Mermaid flowchart 或 stateDiagram");
  }
}

function validateMermaidBlock(block, targetIssues) {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));
  const directive = lines[0] ?? "";
  if (/^sequenceDiagram\b/.test(directive)) {
    const arrows = lines.filter((line) => /-{1,2}>>|--?>/.test(line));
    if (arrows.length === 0) {
      targetIssues.push("Mermaid sequenceDiagram 缺少有效消息箭头");
    }
    const openings = lines.filter((line) => /^(alt|opt|loop|par|critical)\b/.test(line)).length;
    const endings = lines.filter((line) => line === "end").length;
    if (openings !== endings) {
      targetIssues.push("Mermaid sequenceDiagram 分支块未正确闭合");
    }
    return;
  }
  if (/^(flowchart|graph)\s+(TD|TB|BT|LR|RL)\b/.test(directive)) {
    if (!lines.slice(1).some((line) => /-->|---|==>|-.->/.test(line))) {
      targetIssues.push("Mermaid flowchart 缺少有效连线");
    }
    return;
  }
  if (/^stateDiagram(?:-v2)?\b/.test(directive)) {
    if (!lines.slice(1).some((line) => /-->/.test(line))) {
      targetIssues.push("Mermaid stateDiagram 缺少状态迁移");
    }
    return;
  }
  targetIssues.push(`不支持或不完整的 Mermaid 图声明: ${directive || "空图"}`);
}

function markdownFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(target);
      return entry.isFile() && entry.name.endsWith(".md") ? [target] : [];
    })
    .sort();
}

function markdownTargets(content) {
  return new Set(
    [...content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) =>
      match[1].split("#", 1)[0].replace(/^\.\//, ""),
    ),
  );
}

function readHandoffHash(root, targetIssues) {
  const hashPath = path.join(root, ".sdd", "handoff", "sdd-context.sha256");
  if (!fs.existsSync(hashPath)) {
    targetIssues.push("缺少当前 handoff hash");
    return "";
  }
  const match = fs.readFileSync(hashPath, "utf-8").match(/[a-f0-9]{64}/i);
  if (!match) {
    targetIssues.push("handoff hash 格式不正确");
    return "";
  }
  return match[0].toLowerCase();
}

function readJson(file, label, targetIssues) {
  if (!fs.existsSync(file)) {
    targetIssues.push(`缺少${label}: ${path.relative(changeDir, file)}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    targetIssues.push(`${label}不是合法 JSON`);
    return null;
  }
}

function print(result) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `文档交付审计通过：${result.reviewRounds} 轮评审，${result.promptCount} 份 Prompt\n`,
  );
}

function fail(targetIssues, result = { ready: false, issues: targetIssues }) {
  if (jsonOutput) {
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stderr.write(
      `文档交付审计失败：\n${targetIssues.map((item) => `- ${item}`).join("\n")}\n`,
    );
  }
  process.exit(1);
}
