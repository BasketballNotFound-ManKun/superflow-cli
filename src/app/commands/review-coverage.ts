import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ASSETS_DIR } from "../../platform/assets.js";
import { resolveReviewCoverage, type ReviewRule } from "../../domains/review/coverage.js";
import { auditReviewReport } from "../../domains/review/report.js";

export interface ReviewCoverageOptions {
  base?: string;
  json?: boolean;
  paths?: string[];
  report?: string;
}

export function reviewCoverageCommand(options: ReviewCoverageOptions = {}): void {
  const system = readRules(path.join(ASSETS_DIR, "review-rules.json"), "system");
  const user = readRules(path.join(os.homedir(), ".config", "superflow", "review-rules.json"), "user");
  const project = readRules(path.join(process.cwd(), ".sdd", "review-rules.json"), "project");
  const rules = [...project.rules, ...user.rules, ...system.rules];
  const files = options.paths?.length ? options.paths : changedFiles(options.base);
  const result = resolveReviewCoverage(files, rules, {
    excludes: [...project.excludes, ...user.excludes],
  });
  const report = options.report
    ? auditReviewReport(fs.readFileSync(options.report, "utf8"), process.cwd())
    : undefined;
  if (options.json) console.log(JSON.stringify({ ...result, ...(report ? { report } : {}) }, null, 2));
  else {
    console.log(
      `Review coverage: ${result.coverage.included}/${result.coverage.total} included, ` +
      `${result.coverage.excluded} excluded | risk ${result.risk.tier}`,
    );
    for (const file of result.files) {
      console.log(
        `- ${file.path}: ${file.included ? file.rules.join("; ") || "generic review" : file.reason}`,
      );
    }
    for (const [bundle, paths] of Object.entries(result.bundles)) {
      console.log(`bundle ${bundle}: ${paths.join(", ")}`);
    }
    for (const error of result.errors) console.error(`error: ${error}`);
    if (report) {
      console.log(`reviewer: ${report.state ?? "INVALID"} | triage ${report.eligibleForTriage ? "ready" : "blocked"}`);
      for (const issue of report.issues) console.error(`error: ${issue}`);
    }
  }
  if (result.errors.length > 0 || (report && !report.eligibleForTriage)) {
    process.exitCode = 1;
  }
}

function readRules(
  file: string,
  source: "project" | "user" | "system",
): { rules: ReviewRule[]; excludes: string[] } {
  if (!fs.existsSync(file)) return { rules: [], excludes: [] };
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
    rules?: Array<{ path: string; rule: string }>;
    excludes?: string[];
  };
  if (!Array.isArray(parsed.rules) || parsed.rules.some((rule) =>
    !rule || typeof rule.path !== "string" || typeof rule.rule !== "string"
  )) {
    throw new Error(`invalid review rules: ${file}`);
  }
  if (parsed.excludes !== undefined && (!Array.isArray(parsed.excludes) ||
    parsed.excludes.some((item) => typeof item !== "string"))) {
    throw new Error(`invalid review excludes: ${file}`);
  }
  return {
    rules: parsed.rules.map((rule) => ({ ...rule, source })),
    excludes: parsed.excludes ?? [],
  };
}

function changedFiles(base?: string): string[] {
  if (base) {
    return gitNames(["diff", "--name-only", "-z", `${base}...HEAD`]);
  }
  let headExists = false;
  try {
    headExists = Boolean(execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim());
  } catch {
    headExists = false;
  }
  const tracked = headExists
    ? gitNames(["diff", "--name-only", "-z", "HEAD"])
    : gitNames(["diff", "--cached", "--name-only", "-z"]);
  const untracked = gitNames(["ls-files", "--others", "--exclude-standard", "-z"]);
  return [...new Set([...tracked, ...untracked])];
}

function gitNames(args: string[]): string[] {
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}
