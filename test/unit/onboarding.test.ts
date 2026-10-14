import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initCommand,
  parseInitAgentInput,
  runInit,
} from "../../src/app/commands/init.js";
import { updateCommand } from "../../src/app/commands/update.js";
import * as state from "../../src/domains/state.js";

const terminal = vi.hoisted(() => ({
  answers: [] as string[],
  questions: [] as string[],
  mcpFile: "",
  mcpFailure: false,
}));
vi.mock("readline/promises", () => ({
  createInterface: () => ({
    question: async (question: string) => {
      terminal.questions.push(question);
      const answer = terminal.answers.shift();
      if (answer === undefined)
        throw new Error("Unexpected question: " + question);
      return answer;
    },
    close: () => {},
  }),
}));
vi.mock("../../src/domains/deps.js", async (load) => ({
  ...(await load<object>()),
  installOpenspec: async () => {
    throw new Error("installation started before consent");
  },
}));
vi.mock("../../src/domains/skill/deploy.js", async (load) => ({
  ...(await load<object>()),
  deploySkill: async () => {
    throw new Error("deployment started before consent");
  },
}));
vi.mock("../../src/platform/process.js", () => ({
  runCommand: async () => {
    throw new Error("external command started before consent");
  },
}));
vi.mock("../../src/app/commands/mcp.js", () => ({
  manageMcpIntegration: (
    action: string,
    options: { agent: string; dryRun?: boolean },
  ) => {
    if (terminal.mcpFailure) throw new Error("MCP registration failed");
    if (!options.dryRun)
      fs.writeFileSync(
        terminal.mcpFile,
        JSON.stringify({ action, agent: options.agent }),
      );
    return { action, serverPath: "/test/server.js", agents: [] };
  },
}));

let root: string;
let inputDescriptor: PropertyDescriptor | undefined;
let outputDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-onboarding-"));
  terminal.answers = [];
  terminal.questions = [];
  terminal.mcpFile = path.join(root, "mcp.json");
  terminal.mcpFailure = false;
  inputDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  outputDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value: true,
  });
  vi.stubEnv("SUPERFLOW_LANG", "");
  vi.spyOn(state, "loadState").mockReturnValue(null);
  vi.spyOn(state, "saveState").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`exit:${code}`);
  });
});
afterEach(() => {
  for (const [stream, descriptor] of [
    [process.stdin, inputDescriptor],
    [process.stdout, outputDescriptor],
  ] as const) {
    if (descriptor) Object.defineProperty(stream, "isTTY", descriptor);
    else delete (stream as { isTTY?: boolean }).isTTY;
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("onboarding confirmation and installation closure", () => {
  it("keeps a detected single-agent default when Enter is pressed", () => {
    const select = parseInitAgentInput as (
      answer: string,
      fallback: string,
    ) => string;
    expect(select("", "codex")).toBe("codex");
  });
  it("declining init confirmation leaves installation and state untouched", async () => {
    terminal.answers = ["zh", "codex", "global", "n"];
    await expect(initCommand({ targetPath: root })).resolves.toBeUndefined();
    expect(state.saveState).not.toHaveBeenCalled();
    expect(fs.existsSync(terminal.mcpFile)).toBe(false);
  });
  it("declining the bare update wizard does not install or deploy", async () => {
    terminal.answers = ["zh", "codex", "1", "global", "n"];
    const options = { targetPath: root, interactive: true };
    await expect(updateCommand(options)).resolves.toBeUndefined();
    expect(state.saveState).not.toHaveBeenCalled();
  });
  it("JSON dry runs never ask questions even when a TTY is present", async () => {
    const options = {
      targetPath: root,
      agent: "codex",
      json: true,
      dryRun: true,
      interactive: true,
    };
    await updateCommand(options);
    expect(terminal.questions).toEqual([]);
    expect(fs.existsSync(terminal.mcpFile)).toBe(false);
  });
  it("a preview selected in the wizard returns a plan without side effects", async () => {
    terminal.answers = ["zh", "codex", "3", "global"];
    const options = { targetPath: root, interactive: true };
    await expect(updateCommand(options)).resolves.toBeUndefined();
    expect(state.saveState).not.toHaveBeenCalled();
    expect(terminal.answers).toEqual([]);
  });
  it("finishes legacy seven-step initialization by registering selected MCP", async () => {
    const previous = state.initState("0.6.1", "codex");
    previous.completedSteps = [1, 2, 3, 4, 5, 6, 7];
    vi.mocked(state.loadState).mockReturnValue(previous);
    const result = await runInit({
      projectPath: root,
      agent: "codex",
      language: "zh",
      scope: "global",
      dryRun: false,
      resume: true,
      noHooks: true,
      noOpenspecInit: true,
      noScan: true,
      yes: true,
      json: true,
      skipExisting: false,
    });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(terminal.mcpFile)).toBe(true);
    expect(JSON.parse(fs.readFileSync(terminal.mcpFile, "utf8"))).toEqual({
      action: "install",
      agent: "codex",
    });
    expect(previous.completedSteps).toContain(8);
  });
  it("MCP failure prevents init success and retains the resumable seven steps", async () => {
    const previous = state.initState("0.6.1", "codex");
    previous.completedSteps = [1, 2, 3, 4, 5, 6, 7];
    vi.mocked(state.loadState).mockReturnValue(previous);
    terminal.mcpFailure = true;
    await expect(
      runInit({
        projectPath: root,
        agent: "codex",
        language: "zh",
        scope: "global",
        dryRun: false,
        resume: true,
        noHooks: true,
        noOpenspecInit: true,
        noScan: true,
        yes: true,
        json: true,
        skipExisting: false,
      }),
    ).rejects.toThrow("exit:1");
    expect(previous.completedSteps).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
