import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const observer = path.resolve("assets/scripts/superflow-loop-observer.py");
const failure = path.resolve("assets/scripts/superflow-loop-failure-hook.sh");
const end = path.resolve("assets/scripts/superflow-loop-end-hook.sh");
let root: string;

function invoke(script: string, session: string, tool: string, toolInput: object = {}) {
  return spawnSync(script, [], {
    cwd: root, encoding: "utf8",
    input: JSON.stringify({ session_id: session, tool_name: tool, tool_input: toolInput }),
  });
}

function stateFile(session: string) {
  const digest = crypto.createHash("sha256").update(`${fs.realpathSync(root)}:${session}`).digest("hex").slice(0, 24);
  return path.join(os.tmpdir(), `superflow-loop-${digest}.json`);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-loop-test-"));
  fs.mkdirSync(path.join(root, "openspec"));
  spawnSync("git", ["init", "-q"], { cwd: root });
});

afterEach(() => {
  for (const session of ["a", "b"]) fs.rmSync(stateFile(session), { force: true });
  fs.rmSync(root, { recursive: true, force: true });
});

describe("原生 Hook 会话循环观察", () => {
  it("第六次同文件编辑只提醒一次，读取工具和其他会话不计数", () => {
    const file = path.join(root, "src/Demo.java");
    for (let i = 0; i < 5; i++) {
      expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
    }
    expect(invoke(observer, "a", "Read", { file_path: file }).stderr).toBe("");
    expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toContain("循环提醒");
    expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
    expect(invoke(observer, "b", "Edit", { file_path: file }).stderr).toBe("");
  });

  it("同工具第三次连续失败提醒，成功调用清零", () => {
    expect(invoke(failure, "a", "Bash").stderr).toBe("");
    expect(invoke(failure, "a", "Bash").stderr).toBe("");
    expect(invoke(failure, "a", "Bash").stderr).toContain("失败提醒");
    expect(invoke(failure, "a", "Bash").stderr).toBe("");
    expect(invoke(observer, "a", "Bash").status).toBe(0);
    for (let i = 0; i < 2; i++) expect(invoke(failure, "a", "Bash").stderr).toBe("");
    expect(invoke(failure, "a", "Bash").stderr).toContain("失败提醒");
  });

  it("过期记录清除，SessionEnd 清理且异常输入恒放行", () => {
    const file = path.join(root, "Demo.java");
    invoke(observer, "a", "Edit", { file_path: file });
    const state = JSON.parse(fs.readFileSync(stateFile("a"), "utf8"));
    state.edits["Demo.java"].times = [Date.now() / 1000 - 700];
    fs.writeFileSync(stateFile("a"), JSON.stringify(state));
    expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
    expect(invoke(end, "a", "SessionEnd").status).toBe(0);
    expect(fs.existsSync(stateFile("a"))).toBe(false);
    const malformed = spawnSync(observer, [], { cwd: root, input: "{", encoding: "utf8" });
    expect(malformed.status).toBe(0);
  });
});
