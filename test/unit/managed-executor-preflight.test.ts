import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const SCRIPT = path.resolve(
  "assets/scripts/superflow-managed-executor-preflight.mjs",
);
const roots: string[] = [];

afterEach(() => {
  roots.splice(0).forEach((root) => {
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("managed executor preflight", () => {
  it("fails on a changed Java line over 80 characters", async () => {
    const fixture = createFixture();
    fs.writeFileSync(
      path.join(fixture.root, "Demo.java"),
      `class Demo { String value = "${"x".repeat(90)}"; }\n`,
    );

    await expect(
      execFileAsync(process.execPath, [SCRIPT, fixture.root, fixture.taskId]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("超过 80 字符"),
    });
  });

  it("passes deterministic gates for a complete clean change", async () => {
    const fixture = createFixture();
    fs.writeFileSync(path.join(fixture.root, "Demo.java"), "class Demo {}\n");

    const result = await execFileAsync(process.execPath, [
      SCRIPT,
      fixture.root,
      fixture.taskId,
    ]);

    expect(result.stdout).toContain("OK Executor 交付前确定性门禁通过");
  });

  it("uses a filesystem snapshot without initializing Git", async () => {
    const fixture = createFixture(false, [], false);
    fs.writeFileSync(path.join(fixture.root, "Demo.java"), "class Demo {}\n");

    const result = await execFileAsync(process.execPath, [
      SCRIPT,
      fixture.root,
      fixture.taskId,
    ]);

    expect(result.stdout).toContain("OK Executor 交付前确定性门禁通过: 4 个需求文件");
    expect(fs.existsSync(path.join(fixture.root, ".git"))).toBe(false);
  });

  it("does not invent an 80-column rule for projects without one", async () => {
    const fixture = createFixture(false);
    fs.writeFileSync(
      path.join(fixture.root, "Demo.java"),
      `class Demo { String value = "${"x".repeat(90)}"; }\n`,
    );

    const result = await execFileAsync(process.execPath, [
      SCRIPT,
      fixture.root,
      fixture.taskId,
    ]);

    expect(result.stdout).toContain("OK Executor 交付前确定性门禁通过");
  });

  it("enforces mandatory host rules frozen into the task contract", async () => {
    const fixture = createFixture(false, [
      "所有新增 Java/XML 每行不超过 80 字符。",
    ]);
    fs.writeFileSync(
      path.join(fixture.root, "Demo.java"),
      `class Demo { String value = "${"x".repeat(90)}"; }\n`,
    );

    await expect(
      execFileAsync(process.execPath, [SCRIPT, fixture.root, fixture.taskId]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("超过 80 字符"),
    });
  });

  it("rejects downgrading a frozen local-only task", async () => {
    const fixture = createFixture(false);
    const change = path.join(fixture.root, "openspec", "changes", "demo");
    fs.writeFileSync(
      path.join(change, "implementation-prompt.md"),
      "tasks.md 仅使用 [local_required]。\n",
    );
    fs.writeFileSync(
      path.join(change, "tasks.md"),
      "- [ ] [release_required] defer local runtime validation\n",
    );

    await expect(
      execFileAsync(process.execPath, [SCRIPT, fixture.root, fixture.taskId]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("禁止把任务降级"),
    });
  });

  it("does not report shell variables as plaintext passwords", async () => {
    const fixture = createFixture(false);
    fs.writeFileSync(
      path.join(fixture.root, "verify.sh"),
      'mysql -uroot -p"$MYSQL_PASSWORD"\n',
    );

    const result = await execFileAsync(process.execPath, [
      SCRIPT,
      fixture.root,
      fixture.taskId,
    ]);

    expect(result.stderr).not.toContain("疑似明文凭据");
  });

  it("allows nonce-derived temporary container passwords", async () => {
    const fixture = createFixture(false);
    fs.writeFileSync(
      path.join(fixture.root, "verify.sh"),
      'R21_REDIS_PASSWORD="r21-redis-${NONCE}"\n' +
        'R22_MYSQL_PASSWORD="r22-$NONCE"\n',
    );

    const result = await execFileAsync(process.execPath, [
      SCRIPT,
      fixture.root,
      fixture.taskId,
    ]);

    expect(result.stderr).not.toContain("疑似明文凭据");
  });

  it("allows documentation-only credential placeholders", async () => {
    const fixture = createFixture(false);
    fs.writeFileSync(
      path.join(fixture.root, "release-sql.md"),
      "mysql -u demo -p<pass> -e 'SELECT 1'\n",
    );

    const result = await execFileAsync(process.execPath, [
      SCRIPT,
      fixture.root,
      fixture.taskId,
    ]);

    expect(result.stderr).not.toContain("疑似明文凭据");
  });

  it("rejects plaintext credentials persisted in delivery evidence", async () => {
    const fixture = createFixture(false);
    const evidence = path.join(
      fixture.root,
      "openspec",
      "changes",
      "demo",
      "evidence",
    );
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(
      path.join(evidence, "operator-tests.log"),
      "MYSQL_PASSWORD=r25\nproperties: {password=r25, user=r25}\n",
    );

    await expect(
      execFileAsync(process.execPath, [SCRIPT, fixture.root, fixture.taskId]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("交付证据包含明文凭据"),
    });
  });

  it("rejects a personal absolute path in a portable acceptance script", async () => {
    const fixture = createFixture(false);
    const prompt = path.join(
      fixture.root,
      "openspec",
      "changes",
      "demo",
      "implementation-prompt.md",
    );
    fs.writeFileSync(prompt, "验收入口必须可移植，禁止个人绝对路径。\n");
    fs.writeFileSync(
      path.join(fixture.root, "acceptance.sh"),
      "#!/usr/bin/env bash\n/Users/alice/.local/bin/node verify.mjs\n",
    );

    await expect(
      execFileAsync(process.execPath, [SCRIPT, fixture.root, fixture.taskId]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("个人绝对路径"),
    });
  });

  it("rejects a protected design deleted before delivery", async () => {
    const fixture = createFixture(false);
    const design = path.join(
      fixture.root,
      "openspec",
      "changes",
      "demo",
      "design.md",
    );
    fs.writeFileSync(design, "# frozen design\n");
    writeContextManifest(fixture.root, fixture.taskId, [
      {
        path: design,
        sha256: sha256("# frozen design\n"),
        protection: "immutable",
      },
    ]);
    fs.rmSync(design);
    fs.writeFileSync(path.join(fixture.root, "Demo.java"), "class Demo {}\n");

    await expect(
      execFileAsync(process.execPath, [SCRIPT, fixture.root, fixture.taskId]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("受保护输入已被删除"),
    });
  });

  it("rejects broad process cleanup in a runtime acceptance script", async () => {
    const fixture = createFixture(false);
    const taskFile = path.join(
      fixture.root,
      ".superflow",
      "tasks",
      fixture.taskId,
      "task.json",
    );
    const task = JSON.parse(fs.readFileSync(taskFile, "utf8"));
    task.request = "启动 API 并完成 HTTP 端到端测试";
    fs.writeFileSync(taskFile, JSON.stringify(task));
    fs.writeFileSync(
      path.join(fixture.root, "acceptance.sh"),
      "#!/usr/bin/env bash\npkill -9 java\n",
    );

    await expect(
      execFileAsync(process.execPath, [SCRIPT, fixture.root, fixture.taskId]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("使用按进程名清理"),
    });
  });
});

function writeContextManifest(
  root: string,
  taskId: string,
  entries: Array<{ path: string; sha256: string; protection: string }>,
): void {
  fs.writeFileSync(
    path.join(root, ".superflow", "tasks", taskId, "context-manifest.json"),
    JSON.stringify({ entries }),
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createFixture(
  enforceEightyColumns = true,
  mandatoryEngineeringRules: string[] = [],
  initializeGit = true,
): { root: string; taskId: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "executor-preflight-"));
  roots.push(root);
  const taskId = "task-test";
  const change = path.join(root, "openspec", "changes", "demo");
  fs.mkdirSync(change, { recursive: true });
  fs.writeFileSync(
    path.join(change, "implementation-prompt.md"),
    enforceEightyColumns
      ? "# task\n\n所有新增 Java/XML 每行不超过 80 字符。\n"
      : "# task\n",
  );
  fs.writeFileSync(
    path.join(change, "tasks.md"),
    "- [x] 1.1 [local_required] implementation\n",
  );
  fs.writeFileSync(path.join(change, "test-report.md"), "# report\n");
  const taskDir = path.join(root, ".superflow", "tasks", taskId);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(
    path.join(taskDir, "task.json"),
    JSON.stringify({
      mandatoryEngineeringRules,
      taskPrompt: {
        originalPath: path.join(change, "implementation-prompt.md"),
        snapshotPath: path.join(change, "implementation-prompt.md"),
      },
    }),
  );
  if (initializeGit) {
    exec("git", ["init"], root);
    exec("git", ["config", "user.email", "test@example.com"], root);
    exec("git", ["config", "user.name", "Test"], root);
    exec("git", ["add", "."], root);
    exec("git", ["commit", "-m", "baseline"], root);
  }
  return { root, taskId };
}

function exec(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: "ignore" });
}
