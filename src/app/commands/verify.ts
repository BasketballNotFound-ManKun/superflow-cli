import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import {
  checkSkillDeployment,
  type SkillCheckOptions,
} from "../../domains/skill/check.js";
import { resolveCliLanguage } from "../../domains/config/cli-help.js";
import { ASSETS_DIR } from "../../platform/assets.js";
import { resolveChangeDir, runChangeGuard } from "./change-guard.js";

const SKILL_NAME = "superflow-verify";

export interface VerifyOptions extends SkillCheckOptions {
  executionPlan?: string | string[];
  reuseValid?: boolean;
  run?: boolean;
  syncReport?: boolean;
  executionStatus?: boolean;
}

export async function verifyCommand(
  change?: string,
  options: VerifyOptions = {},
): Promise<void> {
  if (
    options.executionPlan ||
    options.reuseValid ||
    options.run ||
    options.syncReport ||
    options.executionStatus
  ) {
    runExecutionOperation(change, options);
    return;
  }
  if (change) {
    runChangeGuard(change, "verify");
  }
  checkSkillDeployment(SKILL_NAME, options);
}

function runExecutionOperation(
  change: string | undefined,
  options: VerifyOptions,
): void {
  const english = resolveCliLanguage() === "en";
  try {
    validateExecutionOptions(options, english);
    const changeDir = selectedChangeDir(change, english);
    const report = path.join(changeDir, "test-report.md");
    let args: string[];
    if (options.executionStatus) {
      args = [
        "--execution-status",
        report,
        "--review",
        path.join(changeDir, ".sdd/reviews/document-review.json"),
      ];
    } else {
      const values = Array.isArray(options.executionPlan)
        ? options.executionPlan
        : [options.executionPlan!];
      const plans = values.map((value) => path.resolve(value));
      for (const plan of plans) {
        checkPlanChangeBinding(
          plan,
          changeDir,
          { ...options, syncReport: options.syncReport && plans.length === 1 },
          english,
        );
      }
      args = [
        options.run ? "--record-execution" : "--check-execution-plan",
        ...plans,
      ];
      if (options.reuseValid) args.push("--reuse-valid");
      if (options.syncReport) args.push("--sync-report", report);
    }
    const script = path.join(
      ASSETS_DIR,
      "scripts/superflow-test-report-lint.py",
    );
    const result = spawnSync("python3", [script, ...args], {
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    if (result.signal) {
      console.error(
        english
          ? `Execution process stopped by signal: ${result.signal}`
          : `验证子进程被信号终止：${result.signal}`,
      );
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

function validateExecutionOptions(
  options: VerifyOptions,
  english: boolean,
): void {
  if (
    options.executionStatus &&
    (options.executionPlan ||
      options.run ||
      options.syncReport ||
      options.reuseValid)
  ) {
    throw new Error(
      english
        ? "--execution-status cannot be combined with --execution-plan, --run or --sync-report"
        : "--execution-status 不能与 --execution-plan、--run 或 --sync-report 混用",
    );
  }
  if (options.reuseValid && (!options.run || !options.executionPlan)) {
    throw new Error(
      english
        ? "--reuse-valid requires --execution-plan and --run"
        : "--reuse-valid 需要 --execution-plan 和 --run",
    );
  }
  if ((options.run || options.syncReport) && !options.executionPlan) {
    throw new Error(
      english
        ? "--run/--sync-report requires --execution-plan <PLAN>"
        : "--run/--sync-report 需要 --execution-plan <PLAN>",
    );
  }
  if (options.syncReport && !options.run) {
    throw new Error(
      english
        ? "--sync-report requires --execution-plan <PLAN> and --run"
        : "--sync-report 需要 --execution-plan <PLAN> 和 --run",
    );
  }
}

function selectedChangeDir(
  change: string | undefined,
  english: boolean,
): string {
  if (!change) {
    throw new Error(
      english
        ? "Execution operations require an existing change: superflow verify <change>"
        : "执行操作需要指定已存在的 change：superflow verify <change>",
    );
  }
  const selected = resolveChangeDir(change);
  try {
    if (statSync(selected).isDirectory()) return realpathSync(selected);
  } catch {
    // Report the selected change rather than falling back to another workspace.
  }
  throw new Error(
    english
      ? `Selected change directory does not exist: ${selected}`
      : `所选 change 目录不存在：${selected}`,
  );
}

function checkPlanChangeBinding(
  planFile: string,
  changeDir: string,
  options: VerifyOptions,
  english: boolean,
): void {
  let plan;
  try {
    plan = JSON.parse(readFileSync(planFile, "utf8"));
  } catch {
    // The canonical Python preflight owns plan file/schema diagnostics.
    return;
  }
  if (options.syncReport && plan?.kind === "build") {
    throw new Error(
      english
        ? "--sync-report requires a Case plan bound to the selected change"
        : "--sync-report 需要绑定所选 change 的 Case 计划",
    );
  }
  if (plan?.kind !== "case" || typeof plan.changeDir !== "string") return;
  let planChangeDir: string;
  try {
    planChangeDir = realpathSync(
      path.resolve(path.dirname(planFile), plan.changeDir),
    );
  } catch {
    // Python validates missing paths and all other execution-plan fields.
    return;
  }
  if (planChangeDir !== changeDir) {
    throw new Error(
      english
        ? `plan.changeDir must match the selected change: ${planChangeDir} != ${changeDir}`
        : `plan.changeDir 必须匹配所选 change：${planChangeDir} != ${changeDir}`,
    );
  }
}
