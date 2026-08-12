#!/usr/bin/env node

import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const args = process.argv.slice(2);
const changeArg = args.find((arg) => !arg.startsWith("--"));
const jsonOutput = args.includes("--json");

if (!changeArg) {
  fail(["用法: superflow-environment-preflight.mjs <change-dir> [--json]"]);
}

const changeDir = fs.realpathSync(path.resolve(changeArg));
const reportPath = path.join(
  changeDir,
  ".sdd",
  "readiness",
  "environment.json",
);
const issues = [];
const report = readReport(reportPath, issues);
const handoffHash = readHandoffHash(changeDir, issues);

if (report) {
  if (report.schemaVersion !== "superflow.environment-readiness.v2") {
    issues.push(
      "环境报告 schemaVersion 必须为 superflow.environment-readiness.v2",
    );
  }
  if (report.handoffHash !== handoffHash) {
    issues.push("环境报告未绑定当前 handoff hash");
  }
  if (!report.scope) issues.push("环境报告必须声明 local/dev/test 等实际范围");
  if (!['READY', 'LOCAL_FIXTURE_READY'].includes(report.overall)) {
    issues.push(`环境整体状态不是可执行状态: ${report.overall ?? "未填写"}`);
  }
  if ((report.ownerHelpRequired?.length ?? 0) > 0) {
    issues.push("仍有需要用户协助的环境问题，必须集中澄清后再交付开发");
  }
  const contractTargets = validateExecutionContract(
    report.executionContract,
    issues,
  );
  const referencedTargets = new Set();
  if (!Array.isArray(report.checks) || report.checks.length === 0) {
    issues.push("环境报告至少需要一项可执行检查");
  } else {
    for (const check of report.checks) {
      validateContractRef(check, contractTargets, referencedTargets, issues);
      await probe(check, issues);
    }
    for (const target of contractTargets) {
      if (!referencedTargets.has(target)) {
        issues.push(`${target}: 缺少对应的失败安全检查`);
      }
    }
  }
}

const result = {
  schemaVersion: "superflow.environment-preflight.v1",
  ready: issues.length === 0,
  scope: report?.scope ?? null,
  handoffHash,
  checks: (report?.checks ?? []).map((check) => ({
    id: check.id,
    type: check.type,
    status: check.status,
  })),
  issues,
};

if (issues.length > 0) fail(issues, result);
if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`环境预检通过：${result.checks.length} 项检查\n`);
}

async function probe(check, targetIssues) {
  if (!check?.id || !check?.type) {
    targetIssues.push("环境检查缺少 id 或 type");
    return;
  }
  if (!['READY', 'LOCAL_FIXTURE_READY'].includes(check.status)) {
    targetIssues.push(`${check.id}: 状态不是 READY 或 LOCAL_FIXTURE_READY`);
    return;
  }
  try {
    switch (check.type) {
      case "file": {
        const target = resolveSafeTarget(check.target);
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
          targetIssues.push(`${check.id}: 文件不存在或已失效`);
        }
        break;
      }
      case "directory": {
        const target = resolveSafeTarget(check.target);
        if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
          targetIssues.push(`${check.id}: 目录不存在或已失效`);
        }
        break;
      }
      case "executable":
        if (!findExecutable(check.target)) {
          targetIssues.push(`${check.id}: 可执行程序不可用`);
        }
        break;
      case "tcp":
        await probeTcp(check.host, check.port, check.timeoutMs ?? 1500);
        break;
      case "http":
        await probeHttp(check);
        break;
      default:
        targetIssues.push(`${check.id}: 不支持的环境检查类型 ${check.type}`);
    }
  } catch (error) {
    targetIssues.push(`${check.id}: ${safeError(error)}`);
  }
}

function validateExecutionContract(contract, targetIssues) {
  const targets = new Set();
  if (!contract || typeof contract !== "object") {
    targetIssues.push("缺少结构化环境执行合同 executionContract");
    return targets;
  }

  const applicationLocations = new Set(["local", "dev", "test"]);
  if (!applicationLocations.has(contract.applicationLocation)) {
    targetIssues.push("executionContract.applicationLocation 必须为 local/dev/test");
  }

  const dependencyPolicies = new Set([
    "local-isolated",
    "shared-dev",
    "shared-test",
    "mixed",
  ]);
  if (!dependencyPolicies.has(contract.dependencyPolicy)) {
    targetIssues.push(
      "executionContract.dependencyPolicy 必须为 local-isolated/shared-dev/shared-test/mixed",
    );
  }
  if (typeof contract.allowLocalProvisioning !== "boolean") {
    targetIssues.push("executionContract.allowLocalProvisioning 必须为布尔值");
  }
  if (typeof contract.allowRemoteDevDependencies !== "boolean") {
    targetIssues.push("executionContract.allowRemoteDevDependencies 必须为布尔值");
  }
  if (
    contract.dependencyPolicy === "shared-dev" &&
    contract.allowLocalProvisioning === true
  ) {
    targetIssues.push("dependencyPolicy=shared-dev 禁止自建本地依赖");
  }
  if (
    contract.dependencyPolicy === "local-isolated" &&
    contract.allowRemoteDevDependencies === true
  ) {
    targetIssues.push("dependencyPolicy=local-isolated 禁止使用远程开发依赖");
  }

  validateOverrides(contract, targetIssues);
  validateContractItems(
    contract.services,
    "service",
    contract.dependencyPolicy,
    targets,
    targetIssues,
  );
  validateContractItems(
    contract.dependencies,
    "dependency",
    contract.dependencyPolicy,
    targets,
    targetIssues,
  );
  return targets;
}

function validateOverrides(contract, targetIssues) {
  const allowed = contract.allowedOverrides;
  const forbidden = contract.forbiddenOverrides;
  if (!isStringArray(allowed)) {
    targetIssues.push("executionContract.allowedOverrides 必须为字符串数组");
  }
  if (!isStringArray(forbidden)) {
    targetIssues.push("executionContract.forbiddenOverrides 必须为字符串数组");
  }
  if (!isStringArray(allowed) || !isStringArray(forbidden)) return;
  const forbiddenSet = new Set(forbidden);
  const overlap = [...new Set(allowed)].filter((item) => forbiddenSet.has(item));
  if (overlap.length > 0) {
    targetIssues.push(`允许覆盖项与禁止覆盖项重复: ${overlap.join(", ")}`);
  }
}

function validateContractItems(
  items,
  type,
  dependencyPolicy,
  targets,
  targetIssues,
) {
  const label = type === "service" ? "services" : "dependencies";
  if (!Array.isArray(items) || items.length === 0) {
    targetIssues.push(`executionContract.${label} 至少需要一项`);
    return;
  }
  for (const item of items) {
    if (!item?.id || typeof item.id !== "string") {
      targetIssues.push(`${label}: 缺少 id`);
      continue;
    }
    const reference = `${type}:${item.id}`;
    if (targets.has(reference)) {
      targetIssues.push(`${reference}: id 重复`);
    }
    targets.add(reference);
    if (!isConfigSource(item.configSource)) {
      targetIssues.push(`${item.id}: 缺少 configSource`);
    }
    if (
      type === "service" &&
      (!item.startupCommandSource ||
        typeof item.startupCommandSource !== "string")
    ) {
      targetIssues.push(`${item.id}: 缺少 startupCommandSource`);
    }
    if (type === "dependency") {
      validateDependency(item, dependencyPolicy, targetIssues);
    }
  }
}

function validateDependency(dependency, dependencyPolicy, targetIssues) {
  const provisioningValues = new Set([
    "local-isolated",
    "shared-dev",
    "shared-test",
  ]);
  if (!dependency.kind || typeof dependency.kind !== "string") {
    targetIssues.push(`${dependency.id}: 缺少 kind`);
  }
  if (!provisioningValues.has(dependency.provisioning)) {
    targetIssues.push(`${dependency.id}: provisioning 不合法`);
    return;
  }
  if (
    dependencyPolicy !== "mixed" &&
    dependencyPolicy !== dependency.provisioning
  ) {
    targetIssues.push(
      `${dependency.id}: provisioning 与 dependencyPolicy 不一致`,
    );
  }
}

function validateContractRef(
  check,
  contractTargets,
  referencedTargets,
  targetIssues,
) {
  if (!check?.id) return;
  if (!check.contractRef || typeof check.contractRef !== "string") {
    targetIssues.push(`${check.id}: 缺少 contractRef`);
    return;
  }
  if (!contractTargets.has(check.contractRef)) {
    targetIssues.push(`${check.id}: contractRef 未指向已声明的服务或依赖`);
    return;
  }
  referencedTargets.add(check.contractRef);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isConfigSource(value) {
  const types = new Set([
    "bundled-profile",
    "external-file",
    "environment",
    "cli-override",
    "generated-fixture",
  ]);
  return Boolean(
    value &&
      typeof value === "object" &&
      types.has(value.type) &&
      typeof value.ref === "string" &&
      value.ref.length > 0,
  );
}

function resolveSafeTarget(target) {
  if (typeof target !== "string" || target.length === 0) {
    throw new Error("缺少检查目标");
  }
  return path.isAbsolute(target) ? target : path.resolve(changeDir, target);
}

function findExecutable(name) {
  if (typeof name !== "string" || !/^[A-Za-z0-9._-]+$/.test(name)) return false;
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .some((directory) => {
      try {
        fs.accessSync(path.join(directory, name), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
}

function probeTcp(host, port, timeoutMs) {
  if (typeof host !== "string" || !Number.isInteger(port)) {
    return Promise.reject(new Error("TCP 检查缺少 host/port"));
  }
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => socket.destroy(new Error("连接超时")), timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function probeHttp(check) {
  const url = new URL(check.url);
  if (url.username || url.password) throw new Error("HTTP URL 禁止内嵌凭据");
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(check.timeoutMs ?? 2000),
  });
  const configured = check.expectedStatus ?? [200, 204];
  const expected = Array.isArray(configured) ? configured : [configured];
  if (!expected.includes(response.status)) {
    throw new Error(`HTTP 状态不符合预期: ${response.status}`);
  }
}

function readReport(file, targetIssues) {
  if (!fs.existsSync(file)) {
    targetIssues.push("缺少环境预检合同 .sdd/readiness/environment.json");
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    targetIssues.push("环境预检合同不是合法 JSON");
    return null;
  }
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

function safeError(error) {
  const message = error instanceof Error ? error.message : "检查失败";
  return message.replace(
    /\b(password|secret|token|authorization)=[^\s]+/gi,
    (_match, key) => `${key}=[REDACTED]`,
  );
}

function fail(targetIssues, result = { ready: false, issues: targetIssues }) {
  if (jsonOutput) {
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stderr.write(
      `环境预检失败：\n${targetIssues.map((item) => `- ${item}`).join("\n")}\n`,
    );
  }
  process.exit(1);
}
