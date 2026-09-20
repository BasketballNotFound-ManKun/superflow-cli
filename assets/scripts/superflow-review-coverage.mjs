import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const reviewPath = ".sdd/reviews/document-review.json";
export function fileHash(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// Reuse the handoff's canonical projection: progress checkboxes/report updates
// must not invalidate a frozen contract. Do not invent a second hash algorithm.
export function currentHandoffHash(root) {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(directory, "../skills/superflow-pipeline/scripts"),
    path.resolve(directory, "../skills-en/superflow-pipeline/scripts"),
    path.join(os.homedir(), ".codex/skills/superflow-pipeline/scripts"),
    path.join(os.homedir(), ".claude/skills/superflow-pipeline/scripts"),
  ];
  const script = candidates
    .map((dir) => path.join(dir, "superflow-handoff.sh"))
    .find((file) => fs.existsSync(file));
  if (!script) throw new Error("缺少 handoff 脚本，请执行 superflow update");
  const result = spawnSync("bash", [script, root, "--hash-only"], {
    encoding: "utf-8",
    timeout: 30000,
  });
  const hash = result.stdout?.trim();
  if (result.status !== 0 || !/^[a-f0-9]{64}$/.test(hash ?? "")) {
    throw new Error("无法重新计算 handoff hash，请检查冻结文档");
  }
  return hash;
}

const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;
const list = (value) => (Array.isArray(value) ? value : []);

// This validates trace structure and evidence identity, NOT business semantics.
export function validateCoverage(root, review, issues, checkCode = true) {
  const coverage = review?.coverage;
  if (coverage?.schemaVersion !== "superflow.review-coverage.v1") {
    issues.push(
      "缺少需求×入口评审 coverage；按 document-review-coverage.md 补齐并重新评审",
    );
    return;
  }
  for (const field of [
    "sources",
    "requirements",
    "entries",
    "cases",
    "decisions",
  ]) {
    if (
      !Array.isArray(coverage[field]) ||
      coverage[field].some(
        (item) => !item || typeof item !== "object" || Array.isArray(item),
      )
    ) {
      issues.push(`coverage.${field} 必须是对象数组`);
      return;
    }
  }
  const index = (items, label) => {
    const result = new Map();
    if (!Array.isArray(items) || items.length === 0)
      issues.push(`${label}不能为空`);
    for (const item of list(items)) {
      if (!nonempty(item?.id) || result.has(item.id)) {
        issues.push(`${label}存在空白或重复 ID`);
      } else result.set(item.id, item);
    }
    return result;
  };
  const sources = index(coverage.sources, "来源清单");
  const requirements = index(coverage.requirements, "需求清单");
  const entries = index(coverage.entries, "真实入口清单");
  const cases = new Map();
  for (const item of list(coverage.cases)) {
    if (!nonempty(item?.id) || cases.has(item.id))
      issues.push("验收用例存在空白或重复 ID");
    else cases.set(item.id, item);
  }
  const refs = (values, role, label) => {
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.some((id) => !sources.has(id))
    ) {
      issues.push(`${label}缺少有效来源引用`);
    } else if (role && !values.some((id) => sources.get(id).role === role)) {
      issues.push(`${label}缺少 ${role} 来源`);
    }
  };
  for (const source of sources.values()) {
    if (
      !nonempty(source.path) ||
      !/^[a-f0-9]{64}$/.test(source.sha256 ?? "") ||
      !["requirement", "code", "contract"].includes(source.role)
    ) {
      issues.push(`来源 ${source.id} 缺少路径、角色或 SHA-256`);
      continue;
    }
    if (!checkCode && source.role === "code") continue;
    try {
      if (fileHash(path.resolve(root, source.path)) !== source.sha256) {
        issues.push(`来源 ${source.id} 内容已变化，需要重新评审`);
      }
    } catch {
      issues.push(`来源 ${source.id} 不可读取`);
    }
  }
  for (const req of requirements.values()) {
    if (!nonempty(req.statement)) issues.push(`需求 ${req.id} 缺少原始语义`);
    refs(req.sourceRefs, "requirement", `需求 ${req.id}`);
  }
  for (const entry of entries.values()) {
    if (
      !nonempty(entry.actor) ||
      !nonempty(entry.route) ||
      !["browser", "api", "job", "event", "library", "cli"].includes(entry.kind)
    ) {
      issues.push(`入口 ${entry.id} 缺少角色、实际路由或入口类型`);
    }
    refs(entry.sourceRefs, "code", `入口 ${entry.id}`);
  }
  for (const test of cases.values()) {
    const entry = entries.get(test.entryId);
    if (!entry || !nonempty(test.action) || test.level !== entry.kind) {
      issues.push(`用例 ${test.id} 未对应真实入口及验收等级`);
    }
    for (const key of ["response", "state", "forbiddenEffects"]) {
      if (!nonempty(test.assertions?.[key]))
        issues.push(`用例 ${test.id} 缺少 ${key} 断言`);
    }
    refs(test.sourceRefs, "contract", `用例 ${test.id}`);
  }
  const pairs = new Set();
  for (const decision of list(coverage.decisions)) {
    const key = JSON.stringify([decision?.requirementId, decision?.entryId]);
    if (
      !requirements.has(decision?.requirementId) ||
      !entries.has(decision?.entryId) ||
      pairs.has(key)
    ) {
      issues.push("需求×入口存在未知或重复映射");
      continue;
    }
    pairs.add(key);
    if (
      !["FIX", "VERIFY_EXISTING", "EXCLUDED"].includes(decision.disposition) ||
      !nonempty(decision.rationale) ||
      !nonempty(decision.currentBehavior) ||
      !nonempty(decision.targetBehavior)
    ) {
      issues.push(`${key} 缺少适用性结论、理由或当前/目标行为`);
    }
    refs(
      decision.sourceRefs,
      decision.disposition === "EXCLUDED" ? "requirement" : null,
      key,
    );
    if (
      decision.disposition !== "EXCLUDED" &&
      (!Array.isArray(decision.caseIds) ||
        decision.caseIds.length === 0 ||
        decision.caseIds.some(
          (id) => cases.get(id)?.entryId !== decision.entryId,
        ))
    ) {
      issues.push(`${key} 缺少对应真实入口的验收用例`);
    }
    if (
      decision.disposition === "EXCLUDED" &&
      list(decision.caseIds).length > 0
    ) {
      issues.push(`${key} 排除项不能同时声明已被验收覆盖`);
    }
  }
  const expected = [];
  for (const req of requirements.keys())
    for (const entry of entries.keys()) {
      const pair = [req, entry];
      expected.push(JSON.stringify(pair));
      if (!pairs.has(JSON.stringify(pair)))
        issues.push(`需求×入口缺少映射: ${req} / ${entry}`);
    }
  for (const lens of ["source-contract", "e2e-environment"]) {
    const rounds = list(review.rounds).filter((round) => round?.lens === lens);
    const reviewed = new Set(
      rounds.flatMap((round) =>
        list(round.reviewedPairs).map((pair) => JSON.stringify(pair)),
      ),
    );
    if (
      expected.some((pair) => !reviewed.has(pair)) ||
      [...reviewed].some((pair) => !pairs.has(pair))
    ) {
      issues.push(
        `${lens} 未逐项评审全部需求×入口（含 EXCLUDED/VERIFY_EXISTING）`,
      );
    }
  }
}

export function checkReceipt(root, { checkCode = false } = {}) {
  const issues = [];
  try {
    const receipt = JSON.parse(
      fs.readFileSync(
        path.join(root, ".sdd/readiness/coding-ready.json"),
        "utf8",
      ),
    );
    const state = fs.readFileSync(path.join(root, ".sdd/state.yaml"), "utf8");
    const stateHash = state.match(
      /^handoff_hash:\s*["']?([a-f0-9]{64})["']?\s*$/m,
    )?.[1];
    if (
      receipt.schemaVersion !== "superflow.coding-ready.v1" ||
      receipt.codingReady !== true ||
      receipt.handoffHash !== stateHash ||
      receipt.handoffHash !== currentHandoffHash(root) ||
      receipt.reviewHash !== fileHash(path.join(root, reviewPath))
    ) {
      issues.push("Coding Ready 内容已过期或缺少评审指纹");
    }
    const review = JSON.parse(
      fs.readFileSync(path.join(root, reviewPath), "utf8"),
    );
    validateCoverage(root, review, issues, checkCode);
  } catch {
    issues.push("Coding Ready 凭证或当前合同不可验证");
  }
  return issues;
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = process.argv[2];
  const issues = root
    ? checkReceipt(path.resolve(root), {
        checkCode: process.argv.includes("--check-sources"),
      })
    : ["缺少 change 目录"];
  if (issues.length) {
    process.stderr.write(
      `${issues.join("\n")}\n请重新评审并执行 superflow check <change> --level coding-ready\n`,
    );
    process.exitCode = 1;
  }
}
