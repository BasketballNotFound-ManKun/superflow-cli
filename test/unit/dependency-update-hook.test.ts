import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("dependency update hook", () => {
  it("refreshes packages, plugins, Agent assets, and managed MCP together", () => {
    const fixture = createFixture();
    const result = runHook(fixture);

    expect(result.status, result.stderr).toBe(0);
    const commands = fs.readFileSync(fixture.commandLog, "utf-8");
    expect(commands).toContain(
      "npm install -g @chenmk/superflow@latest",
    );
    expect(commands).toContain(
      "npm install -g @fission-ai/openspec@latest",
    );
    expect(commands).toContain(
      "claude plugin install superpowers@superpowers-marketplace",
    );
    expect(commands).toContain(
      "codex plugin add superpowers@openai-api-curated",
    );
    expect(commands).toContain(
      "superflow update --agent codex,claude --scope global",
    );
    expect(result.stderr).toContain("自动升级已完整更新");
  });

  it("removes throttle stamps after a partial failure so the next session retries", () => {
    const fixture = createFixture({ failSuperflow: true });
    const result = runHook(fixture);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("自动升级未完整完成");
    const stateDir = path.join(fixture.stateRoot, "superflow");
    const stamps = fs.readdirSync(stateDir).filter((file) =>
      file.endsWith(".stamp"),
    );
    expect(stamps).toEqual([]);
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
    const result = runHook(fixture);

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
  return { root, bin, stateRoot, commandLog, language: options.language };
}

function runHook(fixture: ReturnType<typeof createFixture>) {
  return spawnSync(
    "bash",
    [path.resolve("assets/scripts/superflow-dependency-update-hook.sh")],
    {
      encoding: "utf-8",
      input: JSON.stringify({ session_id: "update-hook-test" }),
      env: {
        ...process.env,
        PATH: `${fixture.bin}:${process.env.PATH ?? ""}`,
        COMMAND_LOG: fixture.commandLog,
        XDG_STATE_HOME: fixture.stateRoot,
        SUPERFLOW_AUTO_UPDATE: "apply",
        SUPERFLOW_LANG: fixture.language ?? "zh",
        SUPERFLOW_UPDATE_MIN_INTERVAL_SECONDS: "0",
      },
    },
  );
}

function writeExecutable(file: string, content: string): void {
  fs.writeFileSync(file, content, "utf-8");
  fs.chmodSync(file, 0o755);
}
