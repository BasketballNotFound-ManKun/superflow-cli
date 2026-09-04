import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";
import type { ExecutorResult, ManagedTaskContract } from "./types.js";

export function validateRiskBasedEvidence(
  contract: ManagedTaskContract,
  result: ExecutorResult,
): void {
  validateCommandOutcomeConsistency(contract, result);
  validateFrozenTaskClassification(contract);
  const files = result.changedFiles.map(normalize);
  const commands = result.commands
    .filter((item) => item.exitCode === 0)
    .map((item) => item.command.toLowerCase());
  const frontendPageChanged = files.some((file) =>
    /\.(?:vue|tsx|jsx)$/.test(file),
  );
  const frontendApiChanged = files.some((file) =>
    /(?:^|\/)(?:api|apis|request|requests)(?:\/|\.).*\.(?:js|ts)$/.test(file),
  );
  const backendContractChanged = files.some((file) =>
    /(?:controller|request|response|dto).*\.java$/i.test(file),
  );
  const dynamicApiChanged = files.some((file) =>
    /(?:api|apis).*\.(?:js|ts)$/.test(file),
  );

  if (frontendPageChanged) {
    requireCommand(
      contract,
      commands,
      /(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:dev|start|serve)/,
      "前端页面变更缺少前端应用启动证据",
      "Frontend page changes require frontend application startup evidence",
    );
    requireCommand(
      contract,
      commands,
      /playwright|cypress|browser.*e2e|e2e.*browser/,
      "前端页面变更缺少真实浏览器 E2E 证据",
      "Frontend page changes require real-browser E2E evidence",
    );
  }
  if (frontendApiChanged && backendContractChanged) {
    requireCommand(
      contract,
      commands,
      /mvn.*(?:controller|mockmvc).*test|gradle.*(?:controller|mockmvc).*test/,
      "跨端 API 变更缺少后端 Controller/MockMvc 合同测试",
      "Cross-stack API changes require a backend Controller/MockMvc contract test",
    );
    requireCommand(
      contract,
      commands,
      /(?:npm|pnpm|yarn|npx).*(?:request|api|contract).*test/,
      "跨端 API 变更缺少前端请求合同测试",
      "Cross-stack API changes require a frontend request contract test",
    );
  }
  if (dynamicApiChanged) {
    requireCommand(
      contract,
      commands,
      /(?:api.export|api-export|export.snapshot|window.api|api.registry|api-registry)/,
      "前端 API 注册或导出变更缺少 API export snapshot/调用解析回归",
      "Frontend API registration or exports require an API export snapshot/call-resolution regression",
    );
  }
  validateHighRiskRewrites(contract, result, commands);
}

function validateCommandOutcomeConsistency(
  contract: ManagedTaskContract,
  result: ExecutorResult,
): void {
  const contradictory = result.commands.find(
    (command) => !isCommandOutcomeConsistent(command),
  );
  if (!contradictory) return;
  throw new Error(
    contract.language === "en"
      ? `Successful command evidence contradicts its runtime outcome: ${contradictory.result}`
      : `成功命令证据与真实运行结果矛盾：${contradictory.result}`,
  );
}

export function isCommandOutcomeConsistent(
  command: ExecutorResult["commands"][number],
): boolean {
  if (command.exitCode !== 0 || command.assertion === "negative") return true;
  return !(
    /(?:http(?:\s+status)?|status)\s*(?:=|:|->)?\s*[45]\d\d\b/i.test(
      command.result,
    ) && /(?:expected|failure|failed|error|异常|失败)/i.test(command.result)
  );
}

function validateFrozenTaskClassification(contract: ManagedTaskContract): void {
  const snapshot = contract.taskPrompt?.snapshotPath;
  if (!snapshot || !existsSync(snapshot)) return;
  const frozen = readFileSync(snapshot, "utf-8");
  const localOnly =
    /tasks\.md[\s\S]{0,160}(?:仅使用|只能使用)[\s\S]{0,80}\[local_required\]/i.test(
      frozen,
    ) ||
    /tasks\.md[\s\S]{0,160}(?:only|must)[\s\S]{0,40}(?:use|contain)[\s\S]{0,80}\[local_required\]/i.test(
      frozen,
    );
  if (!localOnly) return;
  const tasks = findTasksFile(contract);
  if (!tasks) return;
  const content = readFileSync(tasks, "utf-8");
  if (!/\[(?:environment_required|release_required)\]/i.test(content)) return;
  throw new Error(
    contract.language === "en"
      ? "Frozen prompt allows only local_required tasks; tasks.md must not downgrade work to environment_required or release_required"
      : "冻结 Prompt 规定 tasks.md 仅使用 local_required，禁止把任务降级为 environment_required 或 release_required",
  );
}

function findTasksFile(contract: ManagedTaskContract): string | null {
  const original = contract.taskPrompt?.originalPath;
  if (!original) return null;
  let current = path.dirname(path.resolve(original));
  const roots = [contract.projectRoot, ...contract.relatedProjectRoots].map(
    (root) => path.resolve(root),
  );
  while (roots.some((root) => current.startsWith(root))) {
    const candidate = path.join(current, "tasks.md");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function validateHighRiskRewrites(
  contract: ManagedTaskContract,
  result: ExecutorResult,
  commands: string[],
): void {
  const risky = diffNumStat(contract.projectRoot)
    .filter((item) =>
      result.changedFiles.map(normalize).includes(normalize(item.file)),
    )
    .filter(
      (item) =>
        item.deleted >= 50 && item.deleted > Math.max(item.added * 2, 50),
    );
  if (risky.length === 0) return;
  requireCommand(
    contract,
    commands,
    /(?:callsite|call-site|usage|reference).*(?:audit|check|test)|(?:audit|check).*(?:callsite|usage|reference)/,
    `检测到高风险整文件缩减，缺少调用点反查：${risky.map((item) => item.file).join("、")}`,
    `High-risk whole-file reduction requires a call-site audit: ${risky.map((item) => item.file).join(", ")}`,
  );
}

function diffNumStat(
  projectRoot: string,
): Array<{ added: number; deleted: number; file: string }> {
  try {
    return execFileSync("git", ["diff", "--numstat", "--", "."], {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [added, deleted, ...file] = line.split("\t");
        return {
          added: Number.parseInt(added, 10) || 0,
          deleted: Number.parseInt(deleted, 10) || 0,
          file: file.join("\t"),
        };
      });
  } catch {
    return [];
  }
}

function requireCommand(
  contract: ManagedTaskContract,
  commands: string[],
  pattern: RegExp,
  zh: string,
  en: string,
): void {
  if (commands.some((command) => pattern.test(command))) return;
  throw new Error(contract.language === "en" ? en : zh);
}

function normalize(file: string): string {
  return file.replaceAll("\\", "/").toLowerCase();
}
