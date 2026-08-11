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
  if (report.schemaVersion !== "superflow.environment-readiness.v1") {
    issues.push(
      "环境报告 schemaVersion 必须为 superflow.environment-readiness.v1",
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
  if (!Array.isArray(report.checks) || report.checks.length === 0) {
    issues.push("环境报告至少需要一项可执行检查");
  } else {
    for (const check of report.checks) {
      await probe(check, issues);
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
