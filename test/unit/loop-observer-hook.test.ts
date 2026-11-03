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
const observedRoots = new Set<string>();

function invoke(
  script: string, session: string, tool: string,
  toolInput: object = {}, cwd = root,
) {
  let directory = fs.realpathSync(cwd);
  while (directory.startsWith(fs.realpathSync(root))) {
    observedRoots.add(directory);
    if (directory === fs.realpathSync(root)) break;
    directory = path.dirname(directory);
  }
  return spawnSync(script, [], {
    cwd: root, encoding: "utf8",
    input: JSON.stringify({ session_id: session, tool_name: tool, tool_input: toolInput, cwd }),
  });
}

function stateFile(session: string, project = root) {
  const digest = crypto.createHash("sha256").update(`${fs.realpathSync(project)}:${session}`).digest("hex").slice(0, 24);
  return path.join(os.tmpdir(), `superflow-loop-${digest}.json`);
}

function writeFile(relative: string, content: string) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

beforeEach(() => {
  observedRoots.clear();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-loop-test-"));
  fs.mkdirSync(path.join(root, "openspec"));
  spawnSync("git", ["init", "-q"], { cwd: root });
});

afterEach(() => {
  observedRoots.add(root);
  for (const project of observedRoots) {
    for (const session of ["a", "b"]) {
      fs.rmSync(stateFile(session, project), { force: true });
    }
  }
  fs.rmSync(root, { recursive: true, force: true });
});

describe("原生 Hook 会话循环观察", () => {
  it("第六次同文件编辑只提醒一次，读取工具和其他会话不计数", () => {
    const file = writeFile("src/demo.txt", "initial");
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(file, `edit-${i}`);
      expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
    }
    expect(invoke(observer, "a", "Read", { file_path: file }).stderr).toBe("");
    fs.writeFileSync(file, "sixth");
    expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toContain("循环提醒");
    expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
    expect(invoke(observer, "b", "Edit", { file_path: file }).stderr).toBe("");
  });

  it("同操作第三次失败提醒，成功诊断和其他会话不能清除失败", () => {
    const test = { command: "npm test -- --run unit" };
    for (let i = 0; i < 2; i++) {
      expect(invoke(failure, "a", "Bash", test).stderr).toBe("");
      expect(invoke(observer, "a", "Bash", { command: "cat test.log" }).stderr).toBe("");
      expect(invoke(failure, "b", "Bash", test).stderr).toBe("");
    }
    const third = invoke(failure, "a", "Bash", test);
    expect(third.status).toBe(0);
    expect(third.stderr).toContain("失败提醒");
    expect(invoke(failure, "a", "Bash", test).stderr).toBe("");
  });

  it("同工具不同操作失败隔离，同操作真正成功后重新计数", () => {
    const test = { command: "npm test -- --run unit" };
    const build = { command: "npm run build" };
    for (let i = 0; i < 2; i++) {
      expect(invoke(failure, "a", "Bash", test).stderr).toBe("");
      expect(invoke(failure, "a", "Bash", build).stderr).toBe("");
    }
    expect(invoke(observer, "a", "Bash", { ...test, description: "测试通过" }).status).toBe(0);
    expect(invoke(failure, "a", "Bash", build).stderr).toContain("失败提醒");
    for (let i = 0; i < 2; i++) expect(invoke(failure, "a", "Bash", test).stderr).toBe("");
    expect(invoke(failure, "a", "Bash", test).stderr).toContain("失败提醒");
  });

  it("缺明确操作身份及成功输出中的失败字样不推断业务失败", () => {
    for (let i = 0; i < 4; i++) {
      expect(invoke(failure, "a", "Bash").stderr).toBe("");
    }
    for (let i = 0; i < 4; i++) {
      const result = spawnSync(observer, [], {
        cwd: root, encoding: "utf8",
        input: JSON.stringify({
          session_id: "a", cwd: root, tool_name: "Bash",
          tool_input: { command: "npm test" },
          tool_response: { stdout: "BUILD FAILED", exit_code: 0 },
        }),
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    }
  });

  it.each(["openspec", "doc/openspec", ".sdd", ".sdd-enforced"])(
    "按 payload.cwd 识别嵌套子项目的 %s 标记且不激活相邻项目", (marker) => {
      fs.rmSync(path.join(root, "openspec"), { recursive: true });
      const project = path.join(root, "packages/one");
      const cwd = path.join(project, "src");
      const sibling = path.join(root, "packages/two");
      fs.mkdirSync(cwd, { recursive: true });
      fs.mkdirSync(sibling, { recursive: true });
      if (marker === ".sdd-enforced") fs.writeFileSync(path.join(project, marker), "");
      else fs.mkdirSync(path.join(project, marker), { recursive: true });
      const input = { command: "npm test" };
      invoke(failure, "a", "Bash", input, cwd);
      invoke(failure, "a", "Bash", input, cwd);
      expect(invoke(failure, "a", "Bash", input, cwd).stderr).toContain("失败提醒");
      expect(fs.existsSync(stateFile("a", project))).toBe(true);
      for (let i = 0; i < 4; i++) {
        expect(invoke(failure, "b", "Bash", input, sibling).stderr).toBe("");
      }
      expect(fs.existsSync(stateFile("b"))).toBe(false);
      expect(invoke(end, "a", "SessionEnd", {}, cwd).status).toBe(0);
      expect(fs.existsSync(stateFile("a", project))).toBe(false);
      observedRoots.add(project);
    },
  );

  it("命令工作目录不同不能合并失败记录", () => {
    const first = path.join(root, "one");
    const second = path.join(root, "two");
    fs.mkdirSync(first);
    fs.mkdirSync(second);
    const input = { command: "npm test" };
    for (let i = 0; i < 2; i++) {
      expect(invoke(failure, "a", "Bash", input, first).stderr).toBe("");
      expect(invoke(failure, "a", "Bash", input, second).stderr).toBe("");
    }
    expect(invoke(failure, "a", "Bash", input, first).stderr).toContain("失败提醒");
    expect(invoke(failure, "a", "Bash", input, second).stderr).toContain("失败提醒");
  });

  it("同命令指定不同 workdir 时隔离失败，任一工作目录成功不清另一记录", () => {
    const first = { cmd: "npm test", workdir: path.join(root, "one") };
    const second = { cmd: "npm test", workdir: path.join(root, "two") };
    for (let i = 0; i < 2; i++) {
      expect(invoke(failure, "a", "functions.exec_command", first).stderr).toBe("");
      expect(invoke(failure, "a", "functions.exec_command", second).stderr).toBe("");
    }
    expect(invoke(observer, "a", "functions.exec_command", first).status).toBe(0);
    expect(invoke(failure, "a", "functions.exec_command", second).stderr).toContain("失败提醒");
    expect(invoke(failure, "a", "functions.exec_command", first).stderr).toBe("");
  });

  it("嵌套子项目的 Git 路径转换到项目根，其他子项目的编辑不计数", () => {
    fs.rmSync(path.join(root, "openspec"), { recursive: true });
    const cwd = path.join(root, "packages/one");
    fs.mkdirSync(path.join(cwd, "doc/openspec"), { recursive: true });
    const file = writeFile("packages/one/demo.txt", "initial");
    const other = writeFile("packages/two/demo.txt", "initial");
    const input = { cmd: "python3 rewrite.py" };
    invoke(observer, "a", "functions.exec_command", input, cwd);
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(file, `local-${i}`);
      fs.writeFileSync(other, `other-${i}`);
      expect(invoke(observer, "a", "functions.exec_command", input, cwd).stderr).toBe("");
    }
    fs.writeFileSync(file, "sixth");
    const result = invoke(observer, "a", "Edit", { file_path: "demo.txt" }, cwd);
    expect(result.stderr).toContain("循环提醒");
    const edits = JSON.parse(fs.readFileSync(stateFile("a", cwd), "utf8")).edits;
    expect(Object.keys(edits)).toEqual(["demo.txt"]);
  });

  it("Shell 后只观察 Git 可见内容变化，首次建基线且同内容不计数", () => {
    const file = writeFile("src/demo.txt", "initial");
    const input = { command: "python3 - <<'PY'\n# rewrite a file\nPY" };
    expect(invoke(observer, "a", "Bash", input).stderr).toBe("");
    expect(JSON.parse(fs.readFileSync(stateFile("a"), "utf8")).edits).toEqual({});
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(file, `shell-${i}`);
      expect(invoke(observer, "a", "Bash", input).stderr).toBe("");
      fs.writeFileSync(file, `shell-${i}`);
      expect(invoke(observer, "a", "Bash", input).stderr).toBe("");
    }
    fs.writeFileSync(file, "shell-sixth");
    expect(invoke(observer, "a", "Bash", input).stderr).toContain("循环提醒");
    fs.writeFileSync(file, "shell-seventh");
    expect(invoke(observer, "a", "Bash", input).stderr).toBe("");
    expect(invoke(observer, "b", "Bash", input).stderr).toBe("");
  });

  it("直接 Edit 与 Shell 共享同文件计数及提醒去重", () => {
    const file = writeFile("demo.txt", "initial");
    invoke(observer, "a", "Bash", { command: "cat demo.txt" });
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(file, `direct-${i}`);
      expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
      expect(invoke(observer, "a", "Bash", { command: "cat demo.txt" }).stderr).toBe("");
      fs.writeFileSync(file, `shell-${i}`);
      const result = invoke(observer, "a", "Bash", { command: "python3 rewrite.py" });
      expect(result.stderr.includes("循环提醒")).toBe(i === 2);
    }
    expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
  });

  it("忽略 Git 不可见文件且不读取越界符号链接，Git 提交本身不算内容编辑", () => {
    writeFile(".gitignore", "ignored.txt\n");
    const file = writeFile("demo.txt", "initial");
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-outside-test-"));
    try {
      fs.writeFileSync(path.join(outside, "data.txt"), "external");
      fs.symlinkSync(path.join(outside, "data.txt"), path.join(root, "linked.txt"));
      invoke(observer, "a", "Bash", { command: "cat demo.txt" });
      for (let i = 0; i < 7; i++) {
        writeFile("ignored.txt", `ignored-${i}`);
        fs.writeFileSync(path.join(outside, "data.txt"), `external-${i}`);
        expect(invoke(observer, "a", "Bash", { command: "python3 rewrite.py" }).stderr).toBe("");
      }
      spawnSync("git", ["add", "."], { cwd: root });
      spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "基线"], { cwd: root });
      expect(invoke(observer, "a", "Bash", { command: "git commit" }).stderr).toBe("");
      expect(JSON.parse(fs.readFileSync(stateFile("a"), "utf8")).edits).toEqual({});
      expect(fs.readFileSync(file, "utf8")).toBe("initial");
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("过期记录清除，SessionEnd 清理且异常输入恒放行", () => {
    const file = writeFile("demo.txt", "initial");
    invoke(observer, "a", "Edit", { file_path: file });
    const state = JSON.parse(fs.readFileSync(stateFile("a"), "utf8"));
    state.edits["demo.txt"].times = [Date.now() / 1000 - 700];
    fs.writeFileSync(stateFile("a"), JSON.stringify(state));
    expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
    expect(invoke(end, "a", "SessionEnd").status).toBe(0);
    expect(fs.existsSync(stateFile("a"))).toBe(false);
    const malformed = spawnSync(observer, [], { cwd: root, input: "{", encoding: "utf8" });
    expect(malformed.status).toBe(0);
  });

  it("项目标记在会话结束前移除后仍清理观察状态", () => {
    invoke(failure, "a", "Bash", { command: "npm test" });
    expect(fs.existsSync(stateFile("a"))).toBe(true);
    fs.rmSync(path.join(root, "openspec"), { recursive: true });
    expect(invoke(end, "a", "SessionEnd").status).toBe(0);
    expect(fs.existsSync(stateFile("a"))).toBe(false);
  });

  it("超出观察预算时跳过编辑计数且保持 fail-open", () => {
    for (let i = 0; i < 129; i++) writeFile(`many/${i}.txt`, "initial");
    for (let i = 0; i < 7; i++) {
      writeFile("many/0.txt", `changed-${i}`);
      const result = invoke(observer, "a", "Bash", { command: "python3 rewrite.py" });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    }
    expect(JSON.parse(fs.readFileSync(stateFile("a"), "utf8")).edits).toEqual({});
  });

  it("Git 忽略的显式 Edit 路径不受无关 dirty 数量影响，未变化不计数且可观察删除", () => {
    writeFile(".gitignore", "ignored.txt\n");
    const file = writeFile("ignored.txt", "initial");
    for (let i = 0; i < 129; i++) writeFile(`many/${i}.txt`, "initial");
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(file, `direct-${i}`);
      expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
      expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
    }
    fs.rmSync(file);
    const deletion = { patch: "*** Begin Patch\n*** Delete File: ignored.txt\n*** End Patch" };
    expect(invoke(observer, "a", "functions.apply_patch", deletion).stderr).toContain("循环提醒");
    expect(invoke(observer, "a", "functions.apply_patch", deletion).stderr).toBe("");
  });

  it("超限后首次可用 Git 观察仍只建基线，不把已有 dirty 当新编辑", () => {
    for (let i = 0; i < 129; i++) writeFile(`many/${i}.txt`, "initial");
    const input = { command: "python3 rewrite.py" };
    invoke(observer, "a", "Bash", input);
    fs.rmSync(path.join(root, "many/127.txt"));
    fs.rmSync(path.join(root, "many/128.txt"));
    invoke(observer, "a", "Bash", input);
    for (let i = 0; i < 5; i++) {
      writeFile("many/0.txt", `changed-${i}`);
      expect(invoke(observer, "a", "Bash", input).stderr).toBe("");
    }
    writeFile("many/0.txt", "sixth");
    expect(invoke(observer, "a", "Bash", input).stderr).toContain("循环提醒");
  });

  it("首次观察不存在的显式路径不算编辑，随后创建和内容变化正常计数", () => {
    const file = path.join(root, "new.txt");
    invoke(observer, "a", "Bash", { command: "pwd" });
    invoke(observer, "a", "Edit", { file_path: file });
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(file, `changed-${i}`);
      expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
    }
    fs.writeFileSync(file, "sixth");
    expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toContain("循环提醒");
  });

  it("Git 内容观察超时仍回退明确 Edit 路径，不阻断工具执行", () => {
    const file = writeFile("demo.txt", "initial");
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(file, `changed-${i}`);
      invoke(observer, "a", "Edit", { file_path: file });
    }
    const git = spawnSync("which", ["git"], { encoding: "utf8" }).stdout.trim();
    const shim = writeFile("shim/git", [
      "#!/bin/sh",
      'case "$*" in *" status "*) exec /bin/sleep 2;; esac',
      'exec "$SUPERFLOW_TEST_REAL_GIT" "$@"',
      "",
    ].join("\n"));
    fs.chmodSync(shim, 0o755);
    fs.writeFileSync(file, "sixth");
    const result = spawnSync(observer, [], {
      cwd: root, encoding: "utf8",
      env: {
        ...process.env, PATH: `${path.dirname(shim)}:${process.env.PATH}`,
        SUPERFLOW_TEST_REAL_GIT: git,
      },
      input: JSON.stringify({
        session_id: "a", cwd: root, tool_name: "Edit",
        tool_input: { file_path: file },
      }),
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("循环提醒");
  });

  it.each([false, true])(
    "已有内容摘要在超限后恢复只建基线，保留间隙明确 Edit 计数（%s）",
    (editDuringGap) => {
      const file = writeFile("demo.txt", "initial");
      const read = { command: "cat demo.txt" };
      invoke(observer, "a", "Bash", read);
      for (let i = 0; i < (editDuringGap ? 4 : 5); i++) {
        fs.writeFileSync(file, `known-${i}`);
        expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
      }
      for (let i = 0; i < 129; i++) writeFile(`many/${i}.txt`, "initial");
      expect(invoke(observer, "a", "Bash", read).stderr).toBe("");
      if (editDuringGap) {
        fs.writeFileSync(file, "known-fifth");
        expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
      }
      fs.writeFileSync(file, "unobserved-gap-change");
      expect(invoke(observer, "a", "Bash", read).stderr).toBe("");
      fs.rmSync(path.join(root, "many"), { recursive: true });
      expect(invoke(observer, "a", "Bash", read).stderr).toBe("");
      expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toBe("");
      fs.writeFileSync(file, "known-sixth");
      expect(invoke(observer, "a", "Edit", { file_path: file }).stderr).toContain("循环提醒");
    },
  );
});
