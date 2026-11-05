#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const {
  selectInstallerRuntime,
  managedRuntimePrefix,
} = require("../../scripts/npm-runtime.cjs");

const MAIN = `@chenmk/superflow@${require("../../package.json").version}`;

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed with ${result.status}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "Usage / 用法: superflow-install [--yes]\nReuse existing Node/npm; otherwise show a plan and request consent. / 优先复用已有 Node/npm，缺少时展示方案并确认。\n--yes explicitly accepts the displayed Node installation plan. / --yes 显式认可 Node 安装方案。",
    );
    return false;
  }
  if (args.some((arg) => arg !== "--yes"))
    throw new Error("Unknown installer option / 未知安装参数");
  console.log("[Superflow] Starting one-command installation...");
  let invocation;
  try {
    invocation = selectInstallerRuntime({
      nodePath: process.execPath,
      nodeVersion: process.version,
      env: process.env,
      platform: process.platform,
      run: spawnSync,
    });
  } catch (error) {
    if (error.code !== "SUPERFLOW_NODE_UNAVAILABLE") throw error;
    const yes = process.argv.includes("--yes");
    if (!yes && !process.stdin?.isTTY)
      throw new Error(
        `${error.message} Review the plan interactively or use --yes. / 请交互确认，或认可方案后使用 --yes。`,
      );
    const windows = process.platform === "win32";
    const result = spawnSync(
      windows ? "powershell.exe" : "bash",
      windows
        ? [
            "-NoProfile",
            "-File",
            path.join(__dirname, "../bootstrap-node.ps1"),
            ...(yes ? ["-Yes"] : []),
          ]
        : [
            path.join(__dirname, "../bootstrap-node.sh"),
            ...(yes ? ["--yes"] : []),
          ],
      {
        stdio: ["inherit", "pipe", "inherit"],
        encoding: "utf8",
        env: process.env,
      },
    );
    if (result.error || result.status !== 0)
      throw new Error(
        "Node installation cancelled or failed / Node 安装已取消或失败",
      );
    const node = result.stdout.trim();
    if (!existsSync(node))
      throw new Error(
        "Node bootstrap did not return an executable / Node 引导未返回有效路径",
      );
    const probe = spawnSync(node, ["--version"], {
      encoding: "utf8",
      timeout: 5000,
    });
    invocation = selectInstallerRuntime({
      nodePath: node,
      nodeVersion: probe.stdout.trim(),
      env: { ...process.env, npm_execpath: "", npm_node_execpath: "" },
      platform: process.platform,
      run: spawnSync,
    });
  }
  console.log(
    `[Superflow] Node: ${invocation.executable}; npm: ${invocation.argumentPrefix[0]}`,
  );
  const home = process.env.HOME || process.env.USERPROFILE;
  const userBin =
    process.platform === "win32"
      ? path.join(
          process.env.LOCALAPPDATA || path.join(home, ".local"),
          "superflow/bin",
        )
      : path.join(home, ".local/bin");
  const extraPath = managedRuntimePrefix(
    invocation.executable,
    process.env,
    process.platform,
  )
    ? path.delimiter + userBin
    : "";
  const childPath =
    path.dirname(invocation.executable) +
    path.delimiter +
    (process.env.PATH || process.env.Path || "") +
    extraPath;
  run(
    invocation.executable,
    [
      ...invocation.argumentPrefix,
      "install",
      "-g",
      MAIN,
      ...(invocation.prefix ? ["--prefix", invocation.prefix] : []),
      "--registry",
      "https://registry.npmjs.org",
    ],
    {
      env: {
        ...process.env,
        SUPERFLOW_INSTALL_USER_PATH:
          process.env.SUPERFLOW_INSTALL_USER_PATH ??
          (process.env.PATH || process.env.Path || ""),
        PATH: childPath,
        ...(process.platform === "win32" ? { Path: childPath } : {}),
      },
    },
  );
}

if (require.main === module) {
  try {
    if (main() !== false) {
      console.log(
        "[Superflow] npm installation finished. To customize scope or initialize project context: superflow init",
      );
      console.log(
        "[Superflow] npm 安装已结束；如需调整范围或初始化项目上下文，进入项目运行 superflow init。",
      );
    }
  } catch (error) {
    console.error(`[Superflow] Installation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
