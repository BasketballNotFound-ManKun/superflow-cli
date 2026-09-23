import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const sqlHook = path.resolve("assets/scripts/superflow-sql-sync-hook.py");
const buildHook = path.resolve("assets/scripts/superflow-java-build-hook.py");
let root: string;

function command(args: string[], input = "") {
  return spawnSync(args[0], args.slice(1), {
    cwd: root, input, encoding: "utf8",
  });
}

function hook(script: string, toolInput: object, extra: string[] = []) {
  return command(["python3", script, ...extra], JSON.stringify({
    session_id: "java-guard-fixture", tool_input: toolInput,
  }));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-java-guard-"));
  fs.mkdirSync(path.join(root, "openspec"));
  command(["git", "init", "-q"]);
  command(["git", "config", "user.name", "Fixture"]);
  command(["git", "config", "user.email", "fixture@example.com"]);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("Java 写码护栏真实 Hook 入口", () => {
  it("阻断 Mapper 危险插值，放行安全白名单与普通 XML", () => {
    const mapper = path.join(root, "src/mapper/OrderMapper.xml");
    expect(hook(sqlHook, { file_path: mapper, content: "SELECT * FROM ${table}" }).status).toBe(2);
    expect(hook(sqlHook, { file_path: mapper, content: "${ew.customSqlSegment}" }).status).toBe(0);
    expect(hook(sqlHook, { file_path: path.join(root, "pom.xml"), content: "${revision}" }).status).toBe(0);
    expect(hook(sqlHook, { file_path: mapper, edits: [{ new_string: "${tenantId}" }] }).status).toBe(2);
    expect(hook(sqlHook, {
      patch: "*** Begin Patch\n*** Add File: src/mapper/OrderMapper.xml\n+SELECT * FROM ${table}\n*** End Patch",
    }).status).toBe(2);
  });

  it("阻断 Git Hook 绕过，提交信息中的 -n 不误报", () => {
    for (const value of ["git commit --no-verify", "git commit -n", "git -c core.hooksPath=/dev/null status"]) {
      expect(hook(sqlHook, { command: value }).status).toBe(2);
    }
    expect(hook(sqlHook, { command: "git commit -m 'fix -n text'" }).status).toBe(0);
  });

  it("只扫描暂存新增行中的疑似密钥", () => {
    fs.writeFileSync(path.join(root, "config.txt"), "api_key='abcdefghijk'\n");
    command(["git", "add", "config.txt"]);
    expect(hook(sqlHook, { command: "git -c user.name=x commit -m test" }).status).toBe(2);
  });

  it("多次 Java 编辑后只编译一次受影响的 Maven 模块", () => {
    const module = path.join(root, "operator-api");
    fs.mkdirSync(path.join(module, "src/main/java"), { recursive: true });
    fs.writeFileSync(path.join(root, "pom.xml"), "<project><modules><module>operator-api</module></modules></project>");
    fs.writeFileSync(path.join(module, "pom.xml"), "<project/>");
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "mvn"), `#!/bin/sh\necho "$*" >> "${root}/builds.txt"\n`);
    fs.chmodSync(path.join(bin, "mvn"), 0o755);
    const oldPath = process.env.PATH;
    process.env.PATH = `${bin}:${oldPath}`;
    try {
      for (let i = 0; i < 10; i++) {
        const file = path.join(module, `src/main/java/Demo${i}.java`);
        expect(hook(buildHook, { file_path: file }).status).toBe(0);
      }
      expect(hook(buildHook, {}, ["--stop"]).status).toBe(0);
      expect(fs.readFileSync(path.join(root, "builds.txt"), "utf8").trim().split("\n")).toHaveLength(1);
      expect(fs.readFileSync(path.join(root, "builds.txt"), "utf8")).toContain("-pl operator-api -am compile");
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it("Gradle 模块编译失败保留待验证状态，修复后重试成功", () => {
    const module = path.join(root, "web-api");
    fs.mkdirSync(module);
    fs.writeFileSync(path.join(module, "build.gradle"), "plugins { id 'java' }");
    const wrapper = path.join(module, "gradlew");
    fs.writeFileSync(wrapper, "#!/bin/sh\nexit 1\n");
    fs.chmodSync(wrapper, 0o755);
    expect(hook(buildHook, { file_path: path.join(module, "A.java") }).status).toBe(0);
    expect(hook(buildHook, {}, ["--stop"]).status).toBe(2);
    fs.writeFileSync(wrapper, `#!/bin/sh\necho "$*" > "${root}/gradle.txt"\n`);
    expect(hook(buildHook, {}, ["--stop"]).status).toBe(0);
    expect(fs.readFileSync(path.join(root, "gradle.txt"), "utf8")).toContain("-p " + fs.realpathSync(module) + " compileJava");
    expect(hook(buildHook, {}, ["--stop"]).status).toBe(0);
  });

  it("同一 Gradle 多模块仓库只调用一次根目录 wrapper", () => {
    fs.writeFileSync(path.join(root, "settings.gradle"), "include ':operator-api', ':billing-api'\n");
    const wrapper = path.join(root, "gradlew");
    fs.writeFileSync(wrapper, `#!/bin/sh\necho "$*" >> "${root}/gradle-builds.txt"\n`);
    fs.chmodSync(wrapper, 0o755);
    for (const name of ["operator-api", "billing-api"]) {
      const module = path.join(root, name);
      fs.mkdirSync(module);
      fs.writeFileSync(path.join(module, "build.gradle"), "plugins { id 'java' }");
      hook(buildHook, { file_path: path.join(module, "Demo.java") });
    }
    expect(hook(buildHook, {}, ["--stop"]).status).toBe(0);
    const calls = fs.readFileSync(path.join(root, "gradle-builds.txt"), "utf8").trim().split("\n");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(":operator-api:compileJava");
    expect(calls[0]).toContain(":billing-api:compileJava");
  });

  it("apply_patch 能记录 Java 路径，缺少构建工具不会伪装通过", () => {
    fs.writeFileSync(path.join(root, "pom.xml"), "<project/>");
    const result = hook(buildHook, {
      patch: "*** Begin Patch\n*** Add File: Demo.java\n+class Demo {}\n*** End Patch",
    });
    expect(result.status).toBe(0);
    const python = spawnSync("which", ["python3"], { encoding: "utf8" }).stdout.trim();
    const git = spawnSync("which", ["git"], { encoding: "utf8" }).stdout.trim();
    const isolated = fs.mkdtempSync(path.join(root, "empty-bin-"));
    fs.symlinkSync(git, path.join(isolated, "git"));
    const stopped = spawnSync(python, [buildHook, "--stop"], {
      cwd: root, encoding: "utf8", env: { ...process.env, PATH: isolated },
      input: JSON.stringify({ session_id: "java-guard-fixture", tool_input: {} }),
    });
    expect(stopped.status).toBe(2);
    expect(stopped.stderr).toContain("未找到 mvn/mvnw");
  });
});
