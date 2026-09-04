import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("managed work skill", () => {
  it("keeps the expensive host on supervision and closes reviews automatically", () => {
    const zh = fs.readFileSync(
      path.join("assets", "skills", "superflow-pipeline", "SKILL.md"),
      "utf-8",
    );
    const en = fs.readFileSync(
      path.join("assets", "skills-en", "superflow-pipeline", "SKILL.md"),
      "utf-8",
    );

    expect(zh).not.toContain("--supervisor-execution");
    expect(zh).toContain("--supervisor current");
    expect(zh).toContain("--executor peer");
    expect(zh).toContain("--submit-host-review");
    expect(zh).toContain("不得停下来等待用户人工接力");
    expect(zh).toContain("主 Agent 不参与编码、构建、启动、测试或进程管理");
    expect(zh).toContain("第一轮必须自动下发冻结的任务 Prompt");
    expect(zh).toContain("240 秒 Host 兼容传输窗口");
    expect(zh).toContain("不调用 status、不读取完整事件、不重启 Executor");
    expect(zh).toContain("Claude Executor 长会话默认提前自动压缩");
    expect(zh).toContain("执行前必须阅读 `references/managed-work.md`");
    expect(en).not.toContain("--supervisor-execution");
    expect(en).toContain("--supervisor current");
    expect(en).toContain("--executor peer");
    expect(en).toContain("--submit-host-review");
    expect(en).toContain("must not stop and wait for manual user handoff");
    expect(en).toContain("Read `references/managed-work.md` before dispatch");
    expect(en).toContain("240-second Host-compatible transport window");
    expect(en).toContain("Claude Executor long sessions use early auto-compaction");
  });
});
