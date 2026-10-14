import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";
import { initState } from "../../src/domains/state.js";

let compiled: string;
let root: string;
let project: string;
let env: NodeJS.ProcessEnv;
const packageRoot = path.resolve(__dirname, "../..");
const terminalSuite = process.platform === "win32" ? describe.skip : describe;

terminalSuite("installed CLI terminal onboarding", () => {
  beforeAll(() => {
    compiled = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "superflow-cli-runtime-")),
    );
    fs.copyFileSync(
      path.join(packageRoot, "package.json"),
      path.join(compiled, "package.json"),
    );
    fs.symlinkSync(
      path.join(packageRoot, "assets"),
      path.join(compiled, "assets"),
      "dir",
    );
    fs.symlinkSync(
      path.join(packageRoot, "node_modules"),
      path.join(compiled, "node_modules"),
      "dir",
    );
    execFileSync(
      process.execPath,
      [
        path.join(packageRoot, "node_modules/typescript/bin/tsc"),
        "--outDir",
        path.join(compiled, "dist"),
      ],
      { cwd: packageRoot, stdio: "pipe" },
    );
  }, 30_000);
  afterAll(() => {
    if (compiled) fs.rmSync(compiled, { recursive: true, force: true });
  });
  beforeEach(() => {
    root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "superflow-terminal-")),
    );
    project = path.join(root, "project");
    const bin = path.join(root, "bin");
    fs.mkdirSync(project);
    fs.mkdirSync(bin);
    for (const name of ["npm", "claude", "codex"]) {
      fs.writeFileSync(
        path.join(bin, name),
        `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_COMMAND_LOG, JSON.stringify({ name: ${JSON.stringify(name)}, args }) + '\\n');
if (args[0] === '--version') { console.log('test-cli'); process.exit(0); }
if (${JSON.stringify(name)} === 'npm') { if(args[0] !== 'view') process.exit(91); console.log('0.6.1'); process.exit(0); }
const config = path.join(process.env.HOME, ${JSON.stringify(name + ".mcp.json")});
if (args[0] === 'mcp' && args[1] === 'get') process.exit(fs.existsSync(config) ? 0 : 1);
if (args[0] === 'mcp' && args[1] === 'add') { if(process.env.TEST_MCP_FAIL) process.exit(2); fs.writeFileSync(config, JSON.stringify(args)); process.exit(0); }
if (args[0] === 'mcp' && args[1] === 'remove') { fs.rmSync(config, { force: true }); process.exit(0); }
process.exit(92);
`,
        { mode: 0o755 },
      );
    }
    env = {
      ...fixtureProcessEnv(root),
      PATH: bin + path.delimiter + process.env.PATH,
      SUPERFLOW_LANG: "",
      TEST_COMMAND_LOG: path.join(root, "commands.jsonl"),
    };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function tty(args: string[], answers: string[]) {
    return JSON.parse(
      execFileSync(
        "python3",
        [
          path.join(packageRoot, "test/fixture/terminal/drive.py"),
          JSON.stringify([
            process.execPath,
            path.join(compiled, "dist/app/cli.js"),
            ...args,
          ]),
          JSON.stringify(answers),
        ],
        { cwd: project, env, encoding: "utf8", timeout: 25_000 },
      ),
    ) as { code: number; output: string; answersSent: number };
  }
  function commandLog() {
    const file = path.join(root, "commands.jsonl");
    return fs.existsSync(file)
      ? fs
          .readFileSync(file, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as { name: string; args: string[] })
      : [];
  }
  function noDeployment() {
    for (const file of [".sdd-state.json", ".codex", ".claude"])
      expect(fs.existsSync(path.join(root, file))).toBe(false);
    expect(commandLog().some(({ args }) => args[0] === "install")).toBe(false);
    expect(fs.readdirSync(project)).toEqual([]);
  }
  it("bare update previews a full plan without installing or copying assets", () => {
    const result = tty(["update"], ["en", "codex", "3", "global"]);
    expect(result.code).toBe(0);
    expect(result.answersSent).toBe(4);
    expect(result.output).toContain("@chenmk/superflow@latest");
    expect(result.output).toContain(path.join(root, ".codex", "skills"));
    noDeployment();
  });
  it("declining the bare update confirmation leaves the machine unchanged", () => {
    expect(tty(["update"], ["zh", "a", "1", "global", "n"]).code).toBe(0);
    noDeployment();
  });
  it.each(["__EOF__", "__SIGINT__", "q"])(
    "%s cancels an init wizard without partial state",
    (answer) => {
      const result = tty(["init"], [answer]);
      expect(result.code).toBe(0);
      noDeployment();
    },
  );
  it("explicit JSON plans remain noninteractive on a terminal", () => {
    const result = tty(
      [
        "update",
        "--agent",
        "codex",
        "--scope",
        "global",
        "--language",
        "en",
        "--json",
        "--dry-run",
      ],
      [],
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.output)).toMatchObject({
      status: "planned",
      agents: ["codex"],
    });
    noDeployment();
  });
  it("resuming a seven-step install registers MCP before reporting completion", () => {
    const state = initState("0.6.1", "codex");
    state.completedSteps = [1, 2, 3, 4, 5, 6, 7];
    fs.writeFileSync(path.join(root, ".sdd-state.json"), JSON.stringify(state));
    const result = tty(
      [
        "init",
        "--resume",
        "--agent",
        "codex",
        "--scope",
        "global",
        "--language",
        "en",
        "--no-hooks",
      ],
      [],
    );
    expect(result.code).toBe(0);
    const args = JSON.parse(
      fs.readFileSync(path.join(root, "codex.mcp.json"), "utf8"),
    );
    expect(args.slice(0, 4)).toEqual(["mcp", "add", "superflow", "--"]);
    expect(args.at(-1)).toBe(path.join(compiled, "dist/mcp/server.js"));
    expect(
      JSON.parse(fs.readFileSync(path.join(root, ".sdd-state.json"), "utf8"))
        .completedSteps,
    ).toContain(8);
  });
  it("an MCP registration error keeps step eight pending and returns failure", () => {
    const state = initState("0.6.1", "codex");
    state.completedSteps = [1, 2, 3, 4, 5, 6, 7];
    fs.writeFileSync(path.join(root, ".sdd-state.json"), JSON.stringify(state));
    env.TEST_MCP_FAIL = "1";
    const result = tty(
      [
        "init",
        "--resume",
        "--agent",
        "codex",
        "--scope",
        "global",
        "--language",
        "en",
        "--no-hooks",
      ],
      [],
    );
    expect(result.code).toBe(1);
    expect(result.output).not.toContain("superflow init complete");
    expect(
      JSON.parse(fs.readFileSync(path.join(root, ".sdd-state.json"), "utf8"))
        .completedSteps,
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it("the emitted recovery command preserves the single Agent and project scope", () => {
    const prior = project;
    project = path.join(root, "project's $value");
    fs.renameSync(prior, project);
    const state = initState("0.6.1", "codex");
    state.completedSteps = [1, 2, 3, 4, 5, 6, 7];
    fs.writeFileSync(path.join(root, ".sdd-state.json"), JSON.stringify(state));
    env.TEST_MCP_FAIL = "1";
    const failed = tty(
      [
        "init",
        "--resume",
        "--agent",
        "codex",
        "--scope",
        "project",
        "--language",
        "en",
        "--no-hooks",
        "--json",
      ],
      [],
    );
    expect(failed.code).toBe(1);
    const report = JSON.parse(failed.output);
    expect(report.resumeCommand).toContain("--agent codex");
    expect(report.resumeCommand).toContain("--scope project");
    const shim = path.join(root, "bin", "superflow");
    fs.writeFileSync(
      shim,
      `#!${process.execPath}\nimport(${JSON.stringify(pathToFileURL(path.join(compiled, "dist/app/cli.js")).href)});\n`,
      { mode: 0o755 },
    );
    delete env.TEST_MCP_FAIL;
    const resumed = spawnSync("sh", ["-c", report.resumeCommand], {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(resumed.status, resumed.stderr).toBe(0);
    expect(fs.existsSync(path.join(root, "codex.mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "claude.mcp.json"))).toBe(false);
    const restored = JSON.parse(
      fs.readFileSync(path.join(root, ".sdd-state.json"), "utf8"),
    );
    expect(restored.platforms.codex.scope).toBe("project");
    expect(restored.managedProjects.projects[0].root).toBe(project);
    expect(restored.completedSteps).toContain(8);
  });
  it("complete explicit init options do not acquire a new confirmation prompt", () => {
    const result = tty(
      ["init", "--agent", "codex", "--scope", "global", "--language", "en"],
      ["q"],
    );
    expect(result.answersSent).toBe(0);
    expect(result.output).not.toContain("Apply the changes above");
    expect(commandLog().some(({ args }) => args[0] === "install")).toBe(true);
  });
  it("a program-level language flag keeps the old noninteractive update behavior", () => {
    const result = tty(["--language", "en", "update"], ["q"]);
    expect(result.code).toBe(0);
    expect(result.answersSent).toBe(0);
    expect(fs.existsSync(path.join(root, ".sdd-state.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "codex.mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "claude.mcp.json"))).toBe(true);
    expect(commandLog().some(({ args }) => args[0] === "install")).toBe(false);
  });
  it.each([undefined, "global"] as const)(
    "bare resume with incomplete context refuses to guess even with scope=%s",
    (scope) => {
      const state = initState("0.6.1", "codex");
      state.completedSteps = [1, 2, 3, 4, 5, 6, 7];
      state.platforms.codex.scope = scope;
      const original = JSON.stringify(state);
      fs.writeFileSync(path.join(root, ".sdd-state.json"), original);
      const result = tty(["init", "--resume"], []);
      expect(result.code).toBe(1);
      expect(result.output).toContain("--agent");
      expect(fs.existsSync(path.join(root, "codex.mcp.json"))).toBe(false);
      expect(fs.existsSync(path.join(root, "claude.mcp.json"))).toBe(false);
      expect(fs.readFileSync(path.join(root, ".sdd-state.json"), "utf8")).toBe(
        original,
      );
    },
  );
  it("explicit no-hooks updates preserve custom Hook configuration", () => {
    const settings = path.join(project, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(settings), { recursive: true });
    const custom = JSON.stringify({
      hooks: { Stop: [{ hooks: [{ command: "custom-tool" }] }] },
    });
    fs.writeFileSync(settings, custom);
    const result = spawnSync(
      process.execPath,
      [
        path.join(compiled, "dist/app/cli.js"),
        "update",
        "--agent",
        "claude",
        "--scope",
        "project",
        "--language",
        "en",
        "--no-hooks",
      ],
      { cwd: project, env, encoding: "utf8", timeout: 15_000 },
    );
    expect(result.status).toBe(0);
    expect(fs.readFileSync(settings, "utf8")).toBe(custom);
  });
});
