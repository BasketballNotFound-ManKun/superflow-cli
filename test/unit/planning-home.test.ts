import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveChangeDirByName,
  resolveChangesRoot,
} from "../../src/domains/config/planning-home.js";

let tmp: string;

beforeEach(() => {
  tmp = path.join(os.tmpdir(), `superflow-planning-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmp, { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.SUPERFLOW_OPENSPEC_DIR;
});

describe("resolveChangesRoot", () => {
  it("默认位置：<repo>/openspec/config.yaml + changes", () => {
    mkdirSync(path.join(tmp, "openspec", "changes", "demo"), { recursive: true });
    writeFileSync(path.join(tmp, "openspec", "config.yaml"), "schema: spec-driven\n");
    expect(resolveChangesRoot(tmp)).toBe(path.join(tmp, "openspec", "changes"));
  });

  it("子目录工作区：<repo>/doc/openspec（MPGS 场景）", () => {
    mkdirSync(path.join(tmp, "doc", "openspec", "changes", "demo"), { recursive: true });
    writeFileSync(path.join(tmp, "doc", "openspec", "config.yaml"), "schema: spec-driven\n");
    expect(resolveChangesRoot(tmp)).toBe(path.join(tmp, "doc", "openspec", "changes"));
  });

  it("环境变量 SUPERFLOW_OPENSPEC_DIR 优先", () => {
    const envWs = path.join(tmp, "custom-ws");
    mkdirSync(path.join(envWs, "changes"), { recursive: true });
    process.env.SUPERFLOW_OPENSPEC_DIR = envWs;
    expect(resolveChangesRoot(tmp)).toBe(path.join(envWs, "changes"));
  });

  it("无 config.yaml 的旧仓库回退默认路径", () => {
    mkdirSync(path.join(tmp, "openspec", "changes"), { recursive: true });
    expect(resolveChangesRoot(tmp)).toBe(path.join(tmp, "openspec", "changes"));
  });

  it("搜索跳过 node_modules 与隐藏目录", () => {
    const buried = path.join(tmp, "node_modules", "x", "doc", "openspec");
    mkdirSync(path.join(buried, "changes"), { recursive: true });
    writeFileSync(path.join(buried, "config.yaml"), "schema: spec-driven\n");
    mkdirSync(path.join(tmp, "services", "api", "openspec", "changes"), { recursive: true });
    writeFileSync(path.join(tmp, "services", "api", "openspec", "config.yaml"), "schema: x\n");
    expect(resolveChangesRoot(tmp)).toBe(
      path.join(tmp, "services", "api", "openspec", "changes"),
    );
  });
});

describe("resolveChangeDirByName", () => {
  it("子目录工作区中的 change 可被解析", () => {
    mkdirSync(path.join(tmp, "doc", "openspec", "changes", "my-change"), { recursive: true });
    writeFileSync(path.join(tmp, "doc", "openspec", "config.yaml"), "schema: x\n");
    const dir = resolveChangeDirByName(tmp, "my-change");
    expect(dir).toBe(path.join(tmp, "doc", "openspec", "changes", "my-change"));
  });

  it("找不到时回退默认拼接路径（保持旧报错行为）", () => {
    const dir = resolveChangeDirByName(tmp, "nope");
    expect(dir).toBe(path.join(tmp, "openspec", "changes", "nope"));
  });
});
