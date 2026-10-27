import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ASSETS_DIR } from "../../platform/assets.js";
import {
  resolveReviewCoverage,
  type ReviewRule,
} from "../../domains/review/coverage.js";
import { auditReviewReport } from "../../domains/review/report.js";
import { prepareReviewPackage } from "../../domains/review/package.js";
import { resolveCliLanguage } from "../../domains/config/cli-help.js";

export interface ReviewCoverageOptions {
  base?: string;
  json?: boolean;
  paths?: string[];
  report?: string;
  prepare?: string;
  originalReview?: string;
  ownerResponse?: string;
}

export function reviewCoverageCommand(
  options: ReviewCoverageOptions = {},
): void {
  if ((options.originalReview || options.ownerResponse) && !options.prepare) {
    throw new Error("--original-review and --owner-response require --prepare");
  }
  const cwd = process.cwd();
  const root = reviewProjectRoot(cwd);
  const system = readRules(
    path.join(ASSETS_DIR, "review-rules.json"),
    "system",
  );
  const user = readRules(
    path.join(os.homedir(), ".config", "superflow", "review-rules.json"),
    "user",
  );
  const project = readRules(
    path.join(root, ".sdd", "review-rules.json"),
    "project",
  );
  const rules = [...project.rules, ...user.rules, ...system.rules];
  const prepared = options.prepare
    ? prepareReviewPackage(cwd, options.prepare, {
        ...options,
        english: resolveCliLanguage() === "en",
        reviewerChecklist: path.join(
          ASSETS_DIR,
          resolveCliLanguage() === "en" ? "skills-en" : "skills",
          "superflow",
          "references",
          "reviewer-checklist.md",
        ),
      })
    : undefined;
  const files =
    prepared?.files ??
    (options.paths?.length ? options.paths : changedFiles(root, options.base));
  const result = resolveReviewCoverage(files, rules, {
    excludes: [...project.excludes, ...user.excludes],
  });
  const report = options.report
    ? auditReviewReport(fs.readFileSync(options.report, "utf8"), root)
    : undefined;
  if (options.json)
    console.log(
      JSON.stringify(
        {
          ...result,
          ...(prepared ? { package: prepared } : {}),
          ...(report ? { report } : {}),
        },
        null,
        2,
      ),
    );
  else {
    const english = resolveCliLanguage() === "en";
    console.log(
      english
        ? `Review coverage: ${result.coverage.included}/${result.coverage.total} included, ` +
            `${result.coverage.excluded} excluded | path risk hint ${result.risk.tier}; Host impact assessment required`
        : `评审覆盖：${result.coverage.included}/${result.coverage.total} 纳入，` +
            `${result.coverage.excluded} 排除 | 路径风险提示 ${result.risk.tier}；实际影响由 Host 判断`,
    );
    if (prepared) {
      console.log(
        `${english ? "Review input package" : "评审输入包"}: ${prepared.directory}`,
      );
      console.log(
        `${english ? "Dispatch instructions" : "派发说明"}: ${prepared.dispatchInstructions}`,
      );
      console.log(
        `${english ? "Use the exact template" : "直接使用此模板"}: ${prepared.reportTemplate ?? prepared.ownerResponseTemplate}`,
      );
    }
    for (const file of result.files) {
      console.log(
        `- ${file.path}: ${file.included ? file.rules.join("; ") || (english ? "generic review" : "通用五维评审") : file.reason}`,
      );
    }
    for (const [bundle, paths] of Object.entries(result.bundles)) {
      console.log(`bundle ${bundle}: ${paths.join(", ")}`);
    }
    for (const error of result.errors) console.error(`error: ${error}`);
    if (report) {
      console.log(
        `reviewer: ${report.state ?? "INVALID"} | triage ${report.eligibleForTriage ? "ready" : "blocked"}`,
      );
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
  if (
    !Array.isArray(parsed.rules) ||
    parsed.rules.some(
      (rule) =>
        !rule || typeof rule.path !== "string" || typeof rule.rule !== "string",
    )
  ) {
    throw new Error(`invalid review rules: ${file}`);
  }
  if (
    parsed.excludes !== undefined &&
    (!Array.isArray(parsed.excludes) ||
      parsed.excludes.some((item) => typeof item !== "string"))
  ) {
    throw new Error(`invalid review excludes: ${file}`);
  }
  return {
    rules: parsed.rules.map((rule) => ({ ...rule, source })),
    excludes: parsed.excludes ?? [],
  };
}

function changedFiles(root: string, base?: string): string[] {
  const names = (args: string[]) => gitNames(root, args);
  if (base) {
    return names(["diff", "--name-only", "-z", `${base}...HEAD`]);
  }
  let headExists = false;
  try {
    headExists = Boolean(
      execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    headExists = false;
  }
  const tracked = headExists
    ? names(["diff", "--name-only", "-z", "HEAD"])
    : names(["diff", "--cached", "--name-only", "-z"]);
  const untracked = names(["ls-files", "--others", "--exclude-standard", "-z"]);
  return [...new Set([...tracked, ...untracked])];
}

function gitNames(root: string, args: string[]): string[] {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function reviewProjectRoot(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return cwd; // Explicit file/report audits also support non-Git projects.
  }
}
