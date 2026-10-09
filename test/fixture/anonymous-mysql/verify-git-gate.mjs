// Anonymous end-to-end Git replay; never operates on a business repository.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
const fixture = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(fixture, "../../..");
const packageRoot = process.env.SUPERFLOW_PACKAGE_ROOT || source;
const { deployScripts } = await import(
  pathToFileURL(path.join(packageRoot, "dist/domains/skill/scripts.js")).href
);
const { scriptsForAgent } = await import(
  pathToFileURL(path.join(packageRoot, "dist/domains/skill/assets.js")).href
);
const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : fs.mkdtempSync(path.join(os.tmpdir(), "superflow-mysql-git-"));
fs.mkdirSync(root, { recursive: true });
const change = path.join(root, "openspec/changes/anonymous");
// Run the frozen production-shaped sources from this disposable Git workspace.
const workspaceFixture = path.join(root, "test/fixture/anonymous-mysql");
fs.mkdirSync(path.dirname(workspaceFixture), { recursive: true });
fs.cpSync(fixture, workspaceFixture, { recursive: true });
fs.mkdirSync(path.join(root, "assets"), { recursive: true });
fs.cpSync(
  path.join(packageRoot, "assets/scripts"),
  path.join(root, "assets/scripts"),
  { recursive: true },
);
// Git setup, staging and commits share the same isolated environment.
const gitEnv = { ...process.env };
for (const key of Object.keys(gitEnv)) {
  if (key.startsWith("GIT_")) delete gitEnv[key];
}
Object.assign(gitEnv, {
  HOME: path.join(root, "git-home"),
  XDG_CONFIG_HOME: path.join(root, "git-home/.config"),
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: os.devNull,
});
const execute = (argv, options = {}) =>
  spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    ...(argv[0] === "git" ? { env: gitEnv } : {}),
    ...options,
  });
const checked = (argv, options) => {
  const result = execute(argv, options);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result;
};
checked(
  [process.execPath, path.join(workspaceFixture, "verify-gate.mjs"), change],
  {
    timeout: 180000,
  },
);
checked(["git", "init"]);
checked(["git", "config", "user.name", "Synthetic"]);
checked(["git", "config", "user.email", "synthetic@example.invalid"]);
fs.mkdirSync(path.join(change, ".sdd/reviews"), { recursive: true });
fs.writeFileSync(path.join(root, ".sdd-aggregate-closeout"), "");
fs.writeFileSync(
  path.join(change, ".sdd/state.yaml"),
  "phase: implement\nworkflow: full\narchived: false\n",
);
const choose = (variant, note) => {
  const coverage = JSON.parse(
    fs.readFileSync(path.join(change, `${variant}-coverage.json`), "utf8"),
  );
  coverage.schemaVersion = "superflow.review-coverage.v1";
  coverage.decisions = [{ disposition: "FIX", caseIds: ["C1"] }];
  fs.writeFileSync(
    path.join(change, ".sdd/reviews/document-review.json"),
    JSON.stringify({ coverage }),
  );
  fs.writeFileSync(
    path.join(change, "test-report.md"),
    [
      "# Anonymous MyBatis / MySQL integration",
      note,
      "| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |",
      "|---|---|---|---|---|",
      `| C1 | E1 | library | PASS | ${variant}-receipt.json |`,
      "Verification Result: PASS",
      "",
    ].join("\n"),
  );
};
const results = [];
for (const host of ["codex", "claude"]) {
  const home = path.join(root, `home-${host}`);
  const scripts = path.join(
    home,
    `.${host}`,
    host === "codex" ? "hooks" : "scripts",
  );
  const env = {
    ...gitEnv,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
  };
  fs.writeFileSync(
    path.join(root, ".git/hooks/pre-commit"),
    `#!/bin/sh\nGATE="$HOME/.${host}/${host === "codex" ? "hooks" : "scripts"}/sdd-delivery-check.sh"\nif [ -x "$GATE" ]; then "$GATE" --check-staged "$(pwd)" || exit $?; fi\n`,
    { mode: 0o755 },
  );
  choose("omitted", `${host}: baseline with unavailable legacy asset`);
  checked(["git", "add", "."]);
  const baseline = checked(["git", "commit", "-m", "匿名基线错误PASS"], {
    env,
  });
  fs.writeFileSync(
    path.join(change, `${host}-baseline.log`),
    baseline.stdout + baseline.stderr,
  );
  await deployScripts(
    scriptsForAgent(host),
    path.join(packageRoot, "assets/scripts"),
    scripts,
    { agent: host },
  );
  choose("omitted", `${host}: same real NULL after current installation`);
  checked(["git", "add", "."]);
  const rejected = execute(["git", "commit", "-m", "匿名漏字段错误PASS"], {
    env,
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stdout + rejected.stderr, /持久化值未达到预期/);
  fs.writeFileSync(
    path.join(change, `${host}-rejected.log`),
    rejected.stdout + rejected.stderr,
  );
  choose("correct", `${host}: real production-shaped XML write passed`);
  checked(["git", "add", "."]);
  const accepted = checked(["git", "commit", "-m", "匿名完整SQL写入"], { env });
  fs.writeFileSync(
    path.join(change, `${host}-accepted.log`),
    accepted.stdout + accepted.stderr,
  );
  results.push({
    host,
    baseline: baseline.status,
    omitted: rejected.status,
    correct: accepted.status,
  });
}
fs.writeFileSync(
  path.join(root, "result.json"),
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify({ results, evidence: root }));
