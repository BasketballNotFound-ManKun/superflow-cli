#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

const requirements = new Map([
  [
    "AGENTS.md",
    [
      "docs/superflow-cli-design-principles.md",
      "docs/superflow-cli-evaluation-framework.md",
      "Codex、Claude",
    ],
  ],
  [
    "CLAUDE.md",
    [
      "docs/superflow-cli-design-principles.md",
      "docs/superflow-cli-evaluation-framework.md",
      "docs/managed-work-design-principles.md",
    ],
  ],
  [
    "assets/skills/superflow-pipeline/SKILL.md",
    [
      "docs/superflow-cli-design-principles.md",
      "docs/superflow-cli-evaluation-framework.md",
      "先判定责任层",
      "Host 语义分流",
    ],
  ],
  [
    "assets/skills-en/superflow-pipeline/SKILL.md",
    [
      "docs/superflow-cli-design-principles.en.md",
      "docs/superflow-cli-evaluation-framework.en.md",
      "Identify the owner layer",
      "Host semantic routing",
    ],
  ],
  [
    "docs/superflow-cli-design-principles.md",
    [
      "最高维护约束",
      "事实源与职责分层",
      "Agent 判断与脚本裁决",
      "完整 Superflow 任务必须是低自由度交付",
      "评价驱动维护",
      "Codex、Claude",
      "三个彼此独立但可衔接的入口",
    ],
  ],
  [
    "docs/superflow-cli-design-principles.en.md",
    [
      "highest maintenance contract",
      "Sources of Truth and Responsibility Layers",
      "Agent Judgment and Script Decisions",
      "low-freedom delivery contract",
      "Evaluation-Driven Maintenance",
      "Codex and Claude",
      "three independent but composable entries",
    ],
  ],
  [
    "docs/superflow-cli-evaluation-framework.md",
    [
      "文档合同质量",
      "每次优化的最小评价记录",
      "受影响验证",
      "任务级真实验收",
      "框架认证",
      "不能证明代码、架构或业务语义正确",
    ],
  ],
  [
    "docs/superflow-cli-evaluation-framework.en.md",
    [
      "Document contract quality",
      "Minimum Evaluation Record for Every Optimization",
      "Change-scoped verification",
      "Task-level real acceptance",
      "Framework certification",
      "cannot prove code, architecture, or business semantics correct",
    ],
  ],
]);

const failures = [];
for (const [file, markers] of requirements) {
  if (!fs.existsSync(file)) {
    failures.push(`${file}: missing`);
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!text.includes(marker))
      failures.push(`${file}: missing marker: ${marker}`);
  }
}

if (failures.length > 0) {
  console.error("Superflow design-principles check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("Superflow global design principles and evaluation framework: OK");
