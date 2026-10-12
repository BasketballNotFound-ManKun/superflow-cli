#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This maintenance script has a narrow test owner. Production code falls back
// rather than guessing complete test coverage from source filenames.
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
      ["test"],
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

export function runChecks(
  checks,
  invocation,
  spawn = spawnSync,
  { json = false } = {},
) {
  for (const check of checks) {
    const result = spawn(
      invocation.executable,
      [...invocation.argumentPrefix, ...check.args],
      {
        stdio: json ? ["inherit", 2, 2] : "inherit",
        windowsHide: true,
        shell: false,
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

export function run(argv) {
  const language = languageFrom(argv);
  if (!["zh", "en"].includes(language))
    throw new Error(
      "--language / SUPERFLOW_LANG 必须为 zh 或 en / must be zh or en.",
    );
  const options = {
    base: "HEAD",
    full: false,
    json: false,
    plan: false,
    language,
  };
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
    } else if (argument === "--language") {
      index++;
    } else if (["--full", "--json", "--plan"].includes(argument))
      options[argument.slice(2)] = true;
    else if (argument === "--help") {
      console.log(
        text(
          language,
          "用法：npm run verify:changed -- --base <ref> [--plan] [--json] [--full] [--language zh|en]\n日常差异验证；最终交付和发布仍必须执行全量验证。",
          "Usage: npm run verify:changed -- --base <ref> [--plan] [--json] [--full] [--language zh|en]\nDaily verification aid; final delivery and release still require full verification.",
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
  const plan = planChangedVerification(
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
  const status =
    options.plan || !plan.checks.length
      ? 0
      : runChecks(plan.checks, resolveNpmInvocation({ language }), spawnSync, {
          json: options.json,
        });
  if (options.json)
    console.log(
      JSON.stringify({ base: options.base, ...plan, status }, null, 2),
    );
  return status;
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
