import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { afterEach, describe, expect, it } from "vitest";
import { rewriteScriptContent } from "../../src/domains/skill/scripts.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("dependency update hook", () => {
  it.each(["codex", "claude"] as const)("keeps quoted runtime paths literal after %s deployment", (agent) => {
    const fixture = createFixture();
    const node = path.join(fixture.root, "runtime 'quoted' $UNSET");
    fs.copyFileSync(path.join(fixture.bin, "node"), node);
    fs.chmodSync(node, 0o755);
    const hook = path.join(fixture.root, `.${agent}`, agent === "claude" ? "scripts" : "hooks", "update.sh");
    fs.mkdirSync(path.dirname(hook), { recursive: true });
    fs.writeFileSync(hook, rewriteScriptContent(
      fs.readFileSync(path.resolve("assets/scripts/superflow-dependency-update-hook.sh"), "utf8"),
      agent, { nodePath: node, cliPath: path.join(fixture.root, "node_modules/@chenmk/superflow/dist/app/cli.js") },
    ));
    const result = runHook(fixture, { mode: "apply", script: hook });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("自动升级已完整更新");
    expect(fs.readFileSync(fixture.commandLog, "utf8")).toContain("--with-package");
  });
  it("uses the installation-bound runtime instead of another Node/npm on PATH", () => {
    const fixture = createFixture();
    const owned = path.join(fixture.root, "owned-node");
    writeExecutable(owned, `#!/bin/bash
printf 'owned-node %s\\n' "$*" >> "$COMMAND_LOG"
if [ "$2" = "view" ]; then echo 1.0.1; fi
exit 0
`);
    const hook = path.join(fixture.root, "bound-hook.sh");
    fs.writeFileSync(hook, fs.readFileSync(path.resolve("assets/scripts/superflow-dependency-update-hook.sh"), "utf8")
      .replaceAll("__SUPERFLOW_NODE__", `'${owned}'`)
      .replaceAll("__SUPERFLOW_CLI__", `'${path.join(fixture.root, "node_modules/@chenmk/superflow/dist/app/cli.js")}'`));
    const result = runHook(fixture, { mode: "apply", script: hook });
    expect(result.status, result.stderr).toBe(0);
    const commands = fs.readFileSync(fixture.commandLog, "utf8");
    expect(commands).toContain("owned-node");
    expect(commands).toContain("--with-package");
    expect(commands).not.toContain("npm install");
  });
  it("refreshes packages, plugins, Agent assets, and managed MCP together", () => {
    const fixture = createFixture();
    const result = runHook(fixture);

    expect(result.status, result.stderr).toBe(0);
    const commands = fs.readFileSync(fixture.commandLog, "utf-8");
    expect(commands).toContain("dist/app/cli.js update --agent codex,claude --scope auto --with-package");
    expect(commands).not.toContain("npm install");
    expect(commands).not.toContain("codex plugin add");
    expect(commands).not.toContain("superflow update --agent");
    expect(result.stderr).toContain("自动升级已完整更新");
  });

  it.each([undefined, ""])("automatically updates when the mode is %s", (mode) => {
    const fixture = createFixture();
    const result = runHook(fixture, { mode });

    expect(result.status, result.stderr).toBe(0);
    const commands = fs.readFileSync(fixture.commandLog, "utf-8");
    expect(commands).toContain("dist/app/cli.js update --agent codex,claude --scope auto --with-package");
    expect(commands).not.toContain("npm install");
    expect(result.stderr).toContain("自动升级已完整更新");
  });

  it("keeps explicit check mode read-only for package and plugin updates", () => {
    const fixture = createFixture();
    const result = runHook(fixture, { mode: "check" });

    expect(result.status, result.stderr).toBe(0);
    const commands = fs.readFileSync(fixture.commandLog, "utf-8");
    expect(commands).not.toContain("npm install");
    expect(commands).not.toContain("dist/app/cli.js update");
    expect(result.stderr).toContain("有核心依赖更新");
  });

  it.each(["0", "off"])("keeps explicit %s mode disabled", (mode) => {
    const fixture = createFixture();
    const result = runHook(fixture, { mode });

    expect(result.status, result.stderr).toBe(0);
    expect(fs.readFileSync(fixture.commandLog, "utf-8")).toBe("");
    expect(fs.existsSync(path.join(fixture.stateRoot, "superflow"))).toBe(false);
    expect(result.stderr).toBe("");
  });

  it("throttles automatic updates across prompts and sessions", () => {
    const fixture = createFixture();
    const first = runHook(fixture, { interval: "21600" });
    expect(first.stderr).toContain("自动升级已完整更新");
    const second = runHook(fixture, { interval: "21600" });
    const third = runHook(fixture, { interval: "21600", sessionId: "another-session" });

    expect(second.status, second.stderr).toBe(0);
    expect(third.status, third.stderr).toBe(0);
    expect(second.stderr).not.toContain("自动升级已完整更新");
    expect(third.stderr).not.toContain("自动升级已完整更新");
    const commands = fs.readFileSync(fixture.commandLog, "utf-8");
    expect(commands).not.toContain("npm install");
    expect(commands.match(/dist\/app\/cli.js update/g)).toHaveLength(1);
  });

  it("does not start another automatic update while the existing lock is held", () => {
    const fixture = createFixture();
    const lock = path.join(fixture.stateRoot, "superflow/dependency-update.lock");
    fs.mkdirSync(lock, { recursive: true });
    const result = runHook(fixture, {});

    expect(result.status, result.stderr).toBe(0);
    const commands = fs.readFileSync(fixture.commandLog, "utf-8");
    expect(commands).not.toContain("npm install");
    expect(commands).not.toContain("dist/app/cli.js update");
    expect(fs.existsSync(lock)).toBe(true);
  });

  it("removes throttle stamps after a partial failure so the next session retries", () => {
    const fixture = createFixture({ failSuperflow: true });
    const result = runHook(fixture, {});

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("自动升级未完整完成");
    const stateDir = path.join(fixture.stateRoot, "superflow");
    const stamps = fs.readdirSync(stateDir).filter((file) =>
      file.endsWith(".stamp"),
    );
    expect(stamps).toEqual([]);
    const retry = runHook(fixture, { sessionId: "retry-session" });
    expect(retry.status, retry.stderr).toBe(0);
    expect(retry.stderr).toContain("自动升级未完整完成");
    const commands = fs.readFileSync(fixture.commandLog, "utf-8");
    expect(commands.match(/dist\/app\/cli.js update/g)).toHaveLength(2);
  });

  it("does not report success when the registry cannot confirm the latest version", () => {
    const fixture = createFixture({ failVersionCheck: true });
    const result = runHook(fixture);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("自动升级未完整完成");
    const log = fs.readFileSync(
      path.join(fixture.stateRoot, "superflow", "dependency-update.log"),
      "utf-8",
    );
    expect(log).toContain("无法确认 @chenmk/superflow 的最新版本");
  });

  it("reports automatic update status in the installed English language", () => {
    const fixture = createFixture({ language: "en" });
    const result = runHook(fixture, {});

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("Automatic update refreshed CLI");
    expect(result.stderr).not.toContain("自动升级已完整更新");
  });
});

function createFixture(
  options: {
    failSuperflow?: boolean;
    failVersionCheck?: boolean;
    language?: "zh" | "en";
  } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-update-hook-"));
  roots.push(root);
  const bin = path.join(root, "bin");
  const stateRoot = path.join(root, "state");
  const commandLog = path.join(root, "commands.log");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(commandLog, "");
  const cli = path.join(root, 'node_modules/@chenmk/superflow/dist/app/cli.js');
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(cli, '// freshly installed CLI fixture');
  writeExecutable(path.join(bin, 'node'), `#!/bin/bash
printf 'bound-node %s\\n' "$*" >> "$COMMAND_LOG"
if [ "$1" = '${cli}' ]; then exit ${options.failSuperflow ? 1 : 0}; fi
if [ "$2" = "view" ]; then
  ${options.failVersionCheck ? "exit 1" : 'echo "1.0.1"; exit 0'}
fi
if [ "$2" = "list" ]; then
  printf '{"dependencies":{"%s":{"version":"1.0.0"}}}\\n' "$4"
fi
exit 0
`);
  writeExecutable(
    path.join(bin, "npm"),
    `#!/bin/bash
if [ "$1" = "view" ]; then
  ${options.failVersionCheck ? "exit 1" : 'echo "1.0.1"; exit 0'}
fi
if [ "$1" = "list" ]; then
  printf '{"dependencies":{"%s":{"version":"1.0.0"}}}\n' "$3"
  exit 0
fi
if [ "$1" = "root" ]; then echo "${root}/node_modules"; exit 0; fi
printf 'npm %s\n' "$*" >> "$COMMAND_LOG"
exit 0
`,
  );
  for (const agent of ["codex", "claude"]) {
    writeExecutable(
      path.join(bin, agent),
      `#!/bin/bash
printf '${agent} %s\n' "$*" >> "$COMMAND_LOG"
exit 0
`,
    );
  }
  writeExecutable(
    path.join(bin, "superflow"),
    `#!/bin/bash
printf 'superflow %s\n' "$*" >> "$COMMAND_LOG"
exit ${options.failSuperflow ? 1 : 0}
`,
  );
  const hook = path.join(root, "installed-hook.sh");
  fs.writeFileSync(hook, rewriteScriptContent(
    fs.readFileSync(path.resolve("assets/scripts/superflow-dependency-update-hook.sh"), "utf8"),
    "codex", { nodePath: path.join(bin, "node"), cliPath: cli },
  ));
  return { root, bin, stateRoot, commandLog, language: options.language, hook };
}

function runHook(
  fixture: ReturnType<typeof createFixture>,
  options: { mode?: string; sessionId?: string; interval?: string; script?: string } = { mode: "apply" },
) {
  const env = { ...process.env };
  delete env.SUPERFLOW_AUTO_UPDATE;
  if (options.mode !== undefined) env.SUPERFLOW_AUTO_UPDATE = options.mode;
  return spawnSync(
    "bash",
    [options.script ?? fixture.hook],
    {
      encoding: "utf-8",
      input: JSON.stringify({ session_id: options.sessionId ?? "update-hook-test" }),
      env: {
        ...env,
        PATH: `${fixture.bin}:${process.env.PATH ?? ""}`,
        COMMAND_LOG: fixture.commandLog,
        XDG_STATE_HOME: fixture.stateRoot,
        SUPERFLOW_LANG: fixture.language ?? "zh",
        SUPERFLOW_UPDATE_MIN_INTERVAL_SECONDS: options.interval ?? "0",
      },
    },
  );
}

function writeExecutable(file: string, content: string): void {
  fs.writeFileSync(file, content, "utf-8");
  fs.chmodSync(file, 0o755);
}
