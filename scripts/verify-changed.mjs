#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This maintenance script has a narrow test owner. Production code falls back
// rather than guessing complete test coverage from source filenames.
// One catalogue, verified against the same full Vitest execution, not rerun.
export const BASELINE_SUITES = [
  ["installation-matrix", "skills"],
  ["installation-scope", "install-scope"],
  ["installed-contracts", "workflow-reference-install"],
  ["document-evidence", "document-readiness"],
  ["complete-coding-ready", "coding-ready-flow"],
  ["incomplete-contract-blocking", "change-guard"],
  ["valid-resume-and-drift", "sdd-readiness"],
  ["implementation-source-resume", "coding-ready-hook"],
  ["managed-recovery", "managed-work-mcp"],
  ["upgrade", "update"],
  ["runtime-handoff", "update-runtime-handoff"],
].map(([id, name]) => ({ id, path: `test/unit/${name}.test.ts` }));
const TEST_REPORT = "<vitest-report>";
const BUILD_REPORT = "<build-snapshot>";
const OWNERS = {
  "scripts/verify-changed.mjs": ["verify-changed"],
};

function text(language, zh, en) {
  return language === "en" ? en : zh;
}
function languageFrom(argv = []) {
  const index = argv.indexOf("--language");
  return index >= 0 ? argv[index + 1] : (process.env.SUPERFLOW_LANG ?? "zh");
}

export function planChangedVerification(
  changedFiles,
  { full = false, language = "zh" } = {},
) {
  const files = [
    ...new Set(
      changedFiles.map((file) =>
        file.replaceAll("\\", "/").replace(/^\.\//u, ""),
      ),
    ),
  ].sort();
  const reasons = full
    ? [
        text(
          language,
          "显式要求完整验证。",
          "Full verification explicitly requested.",
        ),
      ]
    : [];
  const tests = new Set();
  for (const file of files) {
    if (/^test\/unit\/[^/]+\.test\.ts$/u.test(file)) tests.add(file);
    else if (OWNERS[file])
      OWNERS[file].forEach((name) => tests.add(`test/unit/${name}.test.ts`));
    else if (
      !/^(?:docs\/.*\.md|README(?:\.zh-CN)?\.md|INSTALL(?:\.en)?\.md)$/u.test(
        file,
      )
    ) {
      reasons.push(
        text(
          language,
          `未冻结窄验证映射或存在共享影响：${file}`,
          `No narrow verification mapping or shared impact: ${file}`,
        ),
      );
    }
  }
  const checks = [];
  const add = (id, args, reason) =>
    checks.push({ id, args, command: ["npm", ...args].join(" "), reason });
  if (files.length || full) {
    add(
      "design",
      ["run", "check:design-principles"],
      text(language, "核验全局设计合同。", "Check global design contracts."),
    );
    add(
      "managed-design",
      ["run", "check:managed-design"],
      text(language, "核验托管设计合同。", "Check managed design contracts."),
    );
  }
  const isFull = reasons.length > 0;
  if (isFull || files.some((file) => /^(?:src|test)\/.*\.ts$/u.test(file))) {
    add(
      "typecheck",
      ["exec", "--", "tsc", "--noEmit"],
      text(
        language,
        "只读编译检查，不生成 dist。",
        "Read-only type checking without generating dist.",
      ),
    );
    add(
      "lint",
      ["run", "lint"],
      text(language, "复用仓库静态检查。", "Run repository lint checks."),
    );
  }
  if (isFull || files.some((file) => file.startsWith("assets/"))) {
    add(
      "skill-audit",
      ["exec", "--", "tsx", "src/app/cli.ts", "skill-audit", "--strict"],
      text(language, "审计规范技能资产。", "Audit canonical skill assets."),
    );
  }
  if (isFull)
    add(
      "test:full",
      [
        "test",
        "--",
        "--maxWorkers=2",
        "--minWorkers=2",
        "--reporter=default",
        "--reporter=json",
        `--outputFile.json=${TEST_REPORT}`,
      ],
      text(
        language,
        "完整 npm test 门禁，含 pretest。",
        "Run the complete npm test gate including pretest.",
      ),
    );
  else if (tests.size)
    add(
      "test:selected",
      ["exec", "--", "vitest", "run", ...[...tests].sort()],
      text(
        language,
        "执行变更测试与已冻结映射的测试。",
        "Run changed tests and explicitly mapped tests.",
      ),
    );
  if (isFull) {
    add(
      "build",
      ["run", "build"],
      text(language, "构建实际交付产物。", "Build deliverable artifacts."),
    );
    add(
      "package-smoke",
      ["run", "test:package", "--", "--build-snapshot", BUILD_REPORT],
      text(
        language,
        "真实打包并安装到隔离 consumer。",
        "Pack and install into an isolated consumer.",
      ),
    );
  }
  return {
    files,
    full: isFull,
    reasons,
    checks,
    message:
      files.length || full
        ? text(
            language,
            `计划 ${checks.length} 项验证。`,
            `Planned ${checks.length} checks.`,
          )
        : text(
            language,
            "没有修改，无需运行验证。",
            "No changes; no verification required.",
          ),
  };
}

function gitOutput(args, cwd, language = "zh") {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      text(language, "Git 差异读取失败：", "Failed to read Git changes: ") +
        result.stderr.trim(),
    );
  return result.stdout;
}

export function collectChangedFiles(
  base = "HEAD",
  cwd = process.cwd(),
  language = "zh",
) {
  // Resolve to a hash first: user revisions can never become diff options.
  const revision = gitOutput(
    ["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`],
    cwd,
    language,
  ).trim();
  if (!/^[a-f0-9]{40,64}$/u.test(revision))
    throw new Error(text(language, "无效 Git 提交。", "Invalid Git commit."));
  const tracked = gitOutput(
    ["diff", "--name-only", "-z", revision, "--"],
    cwd,
    language,
  );
  const untracked = gitOutput(
    ["ls-files", "--others", "--exclude-standard", "-z"],
    cwd,
    language,
  );
  return [...new Set((tracked + untracked).split("\0").filter(Boolean))].sort();
}

export function resolveNpmInvocation({
  npmExecPath = process.env.npm_execpath,
  pathValue = process.env.PATH ?? "",
  platform = process.platform,
  language = "zh",
} = {}) {
  if (
    npmExecPath &&
    /\.(?:c?js|mjs)$/u.test(npmExecPath) &&
    existsSync(npmExecPath)
  ) {
    return { executable: process.execPath, argumentPrefix: [npmExecPath] };
  }
  for (const directory of pathValue.split(
    platform === "win32" ? ";" : path.delimiter,
  )) {
    const shim = path.join(directory, platform === "win32" ? "npm.cmd" : "npm");
    const candidates = [
      path.join(directory, "node_modules/npm/bin/npm-cli.js"),
    ];
    if (existsSync(shim) && platform !== "win32")
      candidates.push(realpathSync(shim));
    const entry = candidates.find(
      (candidate) => candidate.endsWith(".js") && existsSync(candidate),
    );
    if (entry) return { executable: process.execPath, argumentPrefix: [entry] };
  }
  throw new Error(
    text(
      language,
      "无法定位 npm JavaScript 入口；请通过 npm run verify:changed 运行。",
      "Cannot locate npm JavaScript entrypoint; use npm run verify:changed.",
    ),
  );
}

export function validateBaselineReport(
  report,
  { cwd = process.cwd(), required = BASELINE_SUITES, language = "zh" } = {},
) {
  const issues = [];
  if (
    report?.success !== true ||
    report?.numFailedTests !== 0 ||
    !(report?.numPassedTests > 0)
  )
    issues.push(
      text(
        language,
        "Vitest 未报告真实全绿执行。",
        "Vitest did not report a successful executed run.",
      ),
    );
  const suites = required.map((suite) => {
    const actual = Array.isArray(report?.testResults)
      ? report.testResults.filter(
          (result) =>
            typeof result?.name === "string" &&
            path.resolve(cwd, result.name) === path.resolve(cwd, suite.path),
        )
      : [];
    const assertions = actual.flatMap((result) =>
      Array.isArray(result.assertionResults) ? result.assertionResults : [],
    );
    const passed = assertions.filter(
      (assertion) => assertion.status === "passed",
    ).length;
    const valid =
      actual.length === 1 &&
      actual[0].status === "passed" &&
      assertions.length > 0 &&
      passed === assertions.length;
    if (!valid)
      issues.push(
        text(
          language,
          `基线未完整通过：${suite.path}`,
          `Baseline was not fully executed and passed: ${suite.path}`,
        ),
      );
    return {
      ...suite,
      status: valid ? "PASS" : "FAIL",
      passed,
      total: assertions.length,
    };
  });
  return { status: issues.length ? "FAIL" : "PASS", suites, issues };
}

function treeFiles(root, relative) {
  const full = path.join(root, relative);
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(relative, entry.name);
    return entry.isDirectory()
      ? treeFiles(root, file)
      : entry.isFile()
        ? [file]
        : [];
  });
}
function contentHash(root, files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort())
    hash
      .update(file)
      .update("\0")
      .update(
        existsSync(path.join(root, file))
          ? readFileSync(path.join(root, file))
          : "<missing>",
      )
      .update("\0");
  return hash.digest("hex");
}
function buildInputs(root) {
  return contentHash(root, [
    ...treeFiles(root, "src"),
    "package.json",
    "tsconfig.json",
    "scripts/clean-dist.js",
    "scripts/ensure-bin-modes.js",
  ]);
}
// A temporary same-run freshness check, not a persistent build certificate.
export function captureBuildSnapshot(root) {
  for (const file of ["dist/app/cli.js", "dist/build-info.json"])
    if (!existsSync(path.join(root, file)))
      throw new Error(
        `Missing build output: ${file}; run the full verification entrypoint.`,
      );
  return {
    inputs: buildInputs(root),
    outputs: contentHash(root, treeFiles(root, "dist")),
  };
}
export function assertBuildSnapshot(root, snapshot) {
  const current = captureBuildSnapshot(root);
  if (
    snapshot?.inputs !== current.inputs ||
    snapshot?.outputs !== current.outputs
  )
    throw new Error(
      "Build inputs or outputs changed; rerun full verification before packaging.",
    );
}

function verificationInputs(cwd, excluded) {
  const files = gitOutput(
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    cwd,
  )
    .split("\0")
    .filter(Boolean);
  return contentHash(
    cwd,
    files.filter((file) => {
      const absolute = path.resolve(cwd, file);
      return (
        !/^(?:dist|node_modules)\//.test(file) &&
        !excluded.some(
          (item) =>
            item && (absolute === item || absolute.startsWith(item + path.sep)),
        )
      );
    }),
  );
}

export function runChecks(
  checks,
  invocation,
  spawn = spawnSync,
  {
    cwd = process.cwd(),
    testReportPath,
    buildSnapshotPath,
    language = "zh",
    verifyInputs = false,
    inputExclusions = [],
  } = {},
) {
  const results = checks.map((check) => ({
    id: check.id,
    command: check.command,
    status: "NOT_RUN",
    exitCode: null,
  }));
  let baseline = { status: "NOT_RUN", suites: [], issues: [] };
  const consistency = { status: "NOT_RUN" };
  let inputHash;
  try {
    if (verifyInputs) inputHash = verificationInputs(cwd, inputExclusions);
  } catch (error) {
    return {
      status: 1,
      results,
      baseline,
      consistency: { status: "FAIL", error: String(error) },
    };
  }
  const finish = (status) => {
    if (verifyInputs && status === 0) {
      try {
        consistency.status =
          inputHash === verificationInputs(cwd, inputExclusions)
            ? "PASS"
            : "FAIL";
        if (consistency.status === "FAIL")
          consistency.error = text(
            language,
            "验证期间输入发生变化，请重新运行完整验证。",
            "Verification inputs changed during this run; rerun full verification.",
          );
      } catch (error) {
        consistency.status = "FAIL";
        consistency.error = String(error);
      }
    }
    return {
      status: consistency.status === "FAIL" ? 1 : status,
      results,
      baseline,
      consistency,
    };
  };
  for (const [index, check] of checks.entries()) {
    const item = results[index];
    const startedAt = Date.now();
    try {
      const inputs = check.id === "build" ? buildInputs(cwd) : null;
      const args = check.args.map((arg) =>
        arg
          .replace(TEST_REPORT, () => testReportPath ?? TEST_REPORT)
          .replace(BUILD_REPORT, () => buildSnapshotPath ?? BUILD_REPORT),
      );
      item.command = ["npm", ...args].join(" ");
      const result = spawn(
        invocation.executable,
        [...invocation.argumentPrefix, ...args],
        {
          cwd,
          stdio: ["inherit", 2, 2],
          windowsHide: true,
          shell: false,
        },
      );
      if (result.error) throw result.error;
      item.exitCode = result.status ?? 1;
      if (item.exitCode === 0 && check.id === "test:full") {
        baseline = validateBaselineReport(
          JSON.parse(readFileSync(testReportPath, "utf8")),
          { cwd, language },
        );
        if (baseline.status !== "PASS")
          throw new Error(baseline.issues.join("\n"));
      }
      if (item.exitCode === 0 && check.id === "build") {
        if (inputs !== buildInputs(cwd))
          throw new Error(
            "Build inputs changed during build; rerun verification.",
          );
        writeFileSync(
          buildSnapshotPath,
          JSON.stringify(captureBuildSnapshot(cwd)),
        );
      }
      item.status = item.exitCode === 0 ? "PASS" : "FAIL";
    } catch (error) {
      item.status = "FAIL";
      item.exitCode = item.exitCode || 1;
      item.error = error instanceof Error ? error.message : String(error);
      if (check.id === "test:full")
        baseline = {
          ...baseline,
          status: "FAIL",
          issues: [...baseline.issues, item.error],
        };
    }
    item.durationMs = Date.now() - startedAt;
    if (item.status === "FAIL") return finish(item.exitCode);
  }
  return finish(0);
}

export function formatTextResults(report) {
  if (report.mode === "plan" && report.status === 0) return "";
  const lines = report.results.map(
    (result) =>
      `${result.status} ${result.id}${result.error ? `: ${result.error}` : ""}`,
  );
  if (report.consistency?.status === "FAIL")
    lines.push(`FAIL input-consistency: ${report.consistency.error}`);
  lines.push(`${report.status === 0 ? "PASS" : "FAIL"} verification`);
  return lines.join("\n");
}

function emitReport(report, options) {
  const target =
    options.report ??
    (report.evidenceDirectory &&
      path.join(report.evidenceDirectory, "verification.json"));
  if (target) {
    try {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    } catch (error) {
      report.status = 1;
      report.success = false;
      report.reportWriteError = String(error);
      console.error(report.reportWriteError);
    }
  }
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    const output = formatTextResults(report);
    if (output) console.log(output);
  }
  return report.status;
}

export function run(argv) {
  const language = languageFrom(argv);
  const options = {
    base: "HEAD",
    full: argv.includes("--full"),
    json: argv.includes("--json"),
    plan: argv.includes("--plan"),
    language,
    report: undefined,
  };
  // Recover output destinations even when an earlier argument or startup fails.
  const reportIndex = argv.indexOf("--report");
  if (
    reportIndex >= 0 &&
    argv[reportIndex + 1] &&
    !argv[reportIndex + 1].startsWith("--")
  )
    options.report = path.resolve(argv[reportIndex + 1]);
  let plan;
  let evidenceDirectory;
  try {
    if (!["zh", "en"].includes(language))
      throw new Error(
        "--language / SUPERFLOW_LANG 必须为 zh 或 en / must be zh or en.",
      );

    for (let index = 0; index < argv.length; index++) {
      const argument = argv[index];
      if (argument === "--base") {
        if (!argv[index + 1] || argv[index + 1].startsWith("--"))
          throw new Error(
            text(
              language,
              "--base 需要 Git 引用。",
              "--base requires a Git revision.",
            ),
          );
        options.base = argv[++index];
      } else if (argument === "--report") {
        if (!argv[index + 1] || argv[index + 1].startsWith("--"))
          throw new Error(
            text(
              language,
              "--report 需要输出文件路径。",
              "--report requires an output file.",
            ),
          );
        options.report = path.resolve(argv[++index]);
      } else if (argument === "--language") {
        index++;
      } else if (["--full", "--json", "--plan"].includes(argument))
        options[argument.slice(2)] = true;
      else if (argument === "--help") {
        console.log(
          text(
            language,
            "用法：npm run verify:changed -- --base <ref> [--plan] [--json] [--full] [--report <file>] [--language zh|en]\n差异验证保持轻量；--full 执行完整交付验证并核验固定流程基线。",
            "Usage: npm run verify:changed -- --base <ref> [--plan] [--json] [--full] [--report <file>] [--language zh|en]\nNarrow verification stays lightweight; --full verifies delivery and the fixed workflow baseline.",
          ),
        );
        return 0;
      } else
        throw new Error(
          text(
            language,
            `未知参数：${argument}`,
            `Unknown argument: ${argument}`,
          ),
        );
    }
    plan = planChangedVerification(
      collectChangedFiles(options.base, process.cwd(), language),
      options,
    );
    if (!options.json)
      console.log(
        [
          plan.message,
          ...plan.reasons,
          ...plan.checks.map((check) => `${check.command} (${check.reason})`),
        ].join("\n"),
      );
    if (!options.plan && plan.full) {
      const parent = options.report ? path.dirname(options.report) : tmpdir();
      mkdirSync(parent, { recursive: true });
      evidenceDirectory = mkdtempSync(
        path.join(parent, "superflow-verification-"),
      );
    }
    const execution =
      options.plan || !plan.checks.length
        ? {
            status: 0,
            results: plan.checks.map((check) => ({
              id: check.id,
              command: check.command,
              status: "NOT_RUN",
              exitCode: null,
            })),
            baseline: { status: "NOT_RUN", suites: [], issues: [] },
          }
        : runChecks(
            plan.checks,
            resolveNpmInvocation({ language }),
            spawnSync,
            {
              language,
              verifyInputs: plan.full,
              inputExclusions: [options.report, evidenceDirectory],
              testReportPath:
                evidenceDirectory &&
                path.join(evidenceDirectory, "vitest.json"),
              buildSnapshotPath:
                evidenceDirectory && path.join(evidenceDirectory, "build.json"),
            },
          );
    const status = execution.status;
    const report = {
      schemaVersion: "superflow.verification.v1",
      base: options.base,
      ...plan,
      mode: options.plan ? "plan" : "execute",
      success: options.plan
        ? null
        : status === 0 &&
          execution.results.every((item) => item.status === "PASS"),
      ...execution,
      evidenceDirectory,
    };
    return emitReport(report, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return emitReport(
      {
        schemaVersion: "superflow.verification.v1",
        base: options.base,
        ...(plan ?? { files: [], full: options.full, checks: [], reasons: [] }),
        mode: options.plan ? "plan" : "execute",
        status: 1,
        success: false,
        results: (plan?.checks ?? []).map((check) => ({
          id: check.id,
          command: check.command,
          status: "NOT_RUN",
          exitCode: null,
        })),
        baseline: { status: "NOT_RUN", suites: [], issues: [] },
        consistency: { status: "NOT_RUN" },
        error: message,
        evidenceDirectory,
      },
      options,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
