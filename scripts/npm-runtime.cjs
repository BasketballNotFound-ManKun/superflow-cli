"use strict";

// Shared by the bootstrap installer, the CLI and isolated package verification.
// Keep this module usable before TypeScript has been built.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function resolveNpmInvocation({
  nodePath = process.execPath,
  npmExecPath = process.env.npm_execpath,
  npmNodeExecPath = process.env.npm_node_execpath,
  platform = process.platform,
  language = "zh",
} = {}) {
  const bin = path.dirname(nodePath);
  const candidates = [];
  let sameRuntime = !npmNodeExecPath;
  try {
    sameRuntime ||=
      fs.realpathSync(npmNodeExecPath) === fs.realpathSync(nodePath);
  } catch {
    /* An inherited lifecycle from another runtime must not override this one. */
  }
  if (sameRuntime && npmExecPath && path.isAbsolute(npmExecPath))
    candidates.push(npmExecPath);
  candidates.push(
    path.join(bin, "node_modules/npm/bin/npm-cli.js"),
    path.resolve(bin, "../lib/node_modules/npm/bin/npm-cli.js"),
  );
  const shim = path.join(bin, platform === "win32" ? "npm.cmd" : "npm");
  try {
    if (platform !== "win32" && fs.existsSync(shim))
      candidates.push(fs.realpathSync(shim));
  } catch {
    /* A broken sibling shim is not a usable npm entrypoint. */
  }
  const entry = candidates.find(
    (file) =>
      /\.(?:c?js|mjs)$/u.test(file) &&
      fs.existsSync(file) &&
      fs.statSync(file).isFile(),
  );
  if (!entry)
    throw Object.assign(
      new Error(
        language === "en"
          ? `Cannot locate npm paired with Node ${nodePath}; select an existing Node.js 20+ installation with npm and retry.`
          : `无法定位 Node ${nodePath} 配套的 npm；请选用已有的 Node.js 20+ 与 npm 后重试。`,
      ),
      { code: "SUPERFLOW_NODE_UNAVAILABLE" },
    );
  return { executable: nodePath, argumentPrefix: [entry] };
}

function projectDependsOnSuperflow(projectRoot) {
  const file = path.join(projectRoot, "package.json");
  if (!fs.existsSync(file)) return false;
  const metadata = JSON.parse(fs.readFileSync(file, "utf8"));
  return ["dependencies", "devDependencies", "optionalDependencies"].some(
    (key) => Boolean(metadata[key]?.["@chenmk/superflow"]),
  );
}

function globalInstallPrefix(packageRoot, platform = process.platform) {
  const suffix = path.join("lib", "node_modules", "@chenmk", "superflow");
  if (packageRoot.endsWith(path.sep + suffix))
    return (
      packageRoot.slice(0, -suffix.length - 1) || path.parse(packageRoot).root
    );
  const windowsSuffix = path.join("node_modules", "@chenmk", "superflow");
  if (platform === "win32" && packageRoot.endsWith(path.sep + windowsSuffix)) {
    const prefix = packageRoot.slice(0, -windowsSuffix.length - 1);
    return projectDependsOnSuperflow(prefix) ? null : prefix;
  }
  return null;
}

function npmArguments(
  args,
  packageRoot,
  platform = process.platform,
  runtime = { nodePath: process.execPath, env: process.env },
) {
  const prefix =
    globalInstallPrefix(packageRoot, platform) ||
    managedRuntimePrefix(runtime.nodePath, runtime.env, platform);
  if (!prefix || !args.some((arg) => arg === "-g" || arg === "--global"))
    return args;
  if (args.some((arg) => arg === "--prefix" || arg.startsWith("--prefix="))) {
    throw new Error(
      "The installed package owns its global npm prefix; do not override --prefix. / 当前安装包持有全局 npm 目录，不得覆盖 --prefix。",
    );
  }
  return [...args, "--prefix", prefix];
}

function userCommandPath(env = process.env, platform = process.platform) {
  const delimiter = platform === "win32" ? ";" : path.delimiter;
  const original = env.SUPERFLOW_INSTALL_USER_PATH;
  const value =
    typeof original === "string"
      ? original
      : platform === "win32"
        ? env.Path || env.PATH || ""
        : env.PATH || "";
  const parts = value
    .split(delimiter)
    .filter(
      (directory) =>
        directory &&
        !/(?:^|[\\/])node_modules[\\/]\.bin[\\/]?$|[\\/]node-gyp-bin[\\/]?$/i.test(
          directory,
        ),
    );
  const home = env.HOME || env.USERPROFILE;
  if (typeof original === "string" && home) {
    const bin =
      platform === "win32"
        ? path.join(
            env.LOCALAPPDATA || path.join(home, ".local"),
            "superflow/bin",
          )
        : path.join(home, ".local/bin");
    if (!parts.includes(bin) && cliPathConfigured(env, platform, bin))
      parts.push(bin);
  }
  return parts.join(delimiter);
}

function cliPathConfigured(env, platform, bin) {
  if (platform === "win32") {
    if (process.platform !== "win32") return false;
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); [Console]::Write([Environment]::GetEnvironmentVariable('Path','User'))",
      ],
      { encoding: "utf8", env, timeout: 5000, shell: false },
    );
    return (
      result.status === 0 &&
      result.stdout
        .split(";")
        .some((entry) => entry.toLowerCase() === bin.toLowerCase())
    );
  }
  const home = env.HOME || env.USERPROFILE;
  if (env.SHELL && !/\/(?:bash|zsh|sh|dash)$/.test(env.SHELL)) return false;
  const profiles = env.SHELL?.endsWith("/zsh")
    ? [".zprofile", ".zshrc"]
    : env.SHELL?.endsWith("/bash")
      ? [
          ".bashrc",
          fs.existsSync(path.join(home, ".bash_profile"))
            ? ".bash_profile"
            : ".profile",
        ]
      : [".profile"];
  return profiles.every((name) => {
    try {
      const content = fs.readFileSync(path.join(home, name), "utf8");
      return (
        content.includes("# >>> Superflow CLI path >>>") &&
        content.includes('export PATH="$PATH:$HOME/.local/bin"')
      );
    } catch {
      return false;
    }
  });
}

function visibleInstallation(env, platform) {
  const launchers = require("../installer/launchers.cjs");
  const names =
    platform === "win32"
      ? ["superflow.exe", "superflow.cmd", "superflow"]
      : ["superflow"];
  for (const directory of userCommandPath(env, platform).split(
    platform === "win32" ? ";" : path.delimiter,
  )) {
    for (const name of names) {
      const entry = path.join(directory, name);
      if (!fs.existsSync(entry)) continue;
      const bound = launchers.ownedCli(entry);
      const cli = bound?.cliPath || fs.realpathSync(entry);
      let root = path.resolve(path.dirname(cli), "../..");
      if (platform === "win32" && /\.(?:cmd|ps1)$/i.test(entry)) {
        root = path.join(directory, "node_modules/@chenmk/superflow");
        const source = fs.readFileSync(entry, "utf8");
        if (
          !/node_modules[\\/]@chenmk[\\/]superflow[\\/]dist[\\/]app[\\/]cli\.js/i.test(
            source,
          )
        )
          break;
      } else if (
        path.basename(cli) !== "cli.js" ||
        path.basename(path.dirname(cli)) !== "app"
      )
        break;
      try {
        const metadata = JSON.parse(
          fs.readFileSync(path.join(root, "package.json"), "utf8"),
        );
        const prefix =
          metadata.name === "@chenmk/superflow"
            ? globalInstallPrefix(root, platform)
            : null;
        return prefix ? { prefix, nodePath: bound?.nodePath } : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function selectInstallerRuntime({
  nodePath = process.execPath,
  nodeVersion = process.version,
  env = process.env,
  platform = process.platform,
  run = spawnSync,
} = {}) {
  const existing = visibleInstallation(env, platform);
  if (existing) {
    const ownedNode =
      existing.nodePath ||
      path.join(
        existing.prefix,
        platform === "win32" ? "node.exe" : "bin/node",
      );
    if (fs.existsSync(ownedNode)) {
      const probe = run(ownedNode, ["--version"], {
        encoding: "utf8",
        env,
        timeout: 5000,
        shell: false,
      });
      if (
        probe.status === 0 &&
        Number(String(probe.stdout).trim().replace(/^v/, "").split(".")[0]) >=
          20
      ) {
        try {
          return {
            ...resolveNpmInvocation({
              nodePath: ownedNode,
              npmExecPath: "",
              platform,
            }),
            prefix: existing.prefix,
          };
        } catch (error) {
          if (error.code !== "SUPERFLOW_NODE_UNAVAILABLE") throw error;
        }
      }
    }
  }
  if (Number(String(nodeVersion).replace(/^v/, "").split(".")[0]) >= 20) {
    return {
      ...resolveNpmInvocation({
        nodePath,
        npmExecPath: env.npm_execpath,
        npmNodeExecPath: env.npm_node_execpath,
        platform,
        language: env.SUPERFLOW_LANG,
      }),
      ...(existing
        ? { prefix: existing.prefix }
        : managedRuntimePrefix(nodePath, env, platform)
          ? { prefix: managedRuntimePrefix(nodePath, env, platform) }
          : {}),
    };
  }
  const candidates = [
    env.npm_node_execpath,
    env.NVM_BIN &&
      path.join(env.NVM_BIN, platform === "win32" ? "node.exe" : "node"),
    ...(platform === "win32" ? env.Path || env.PATH || "" : env.PATH || "")
      .split(platform === "win32" ? ";" : path.delimiter)
      .filter(Boolean)
      .map((directory) =>
        path.join(directory, platform === "win32" ? "node.exe" : "node"),
      ),
  ];
  for (const file of new Set(candidates.filter(Boolean))) {
    if (file === nodePath || !fs.existsSync(file)) continue;
    const result = run(file, ["--version"], {
      encoding: "utf8",
      env,
      timeout: 5000,
      shell: false,
    });
    if (
      result.status !== 0 ||
      !(
        Number(String(result.stdout).trim().replace(/^v/, "").split(".")[0]) >=
        20
      )
    )
      continue;
    try {
      return {
        ...resolveNpmInvocation({
          nodePath: file,
          npmExecPath: "",
          platform,
          language: env.SUPERFLOW_LANG,
        }),
        ...(existing
          ? { prefix: existing.prefix }
          : managedRuntimePrefix(file, env, platform)
            ? { prefix: managedRuntimePrefix(file, env, platform) }
            : {}),
      };
    } catch {
      /* Try another existing supported runtime; never install one. */
    }
  }
  throw Object.assign(
    new Error(
      "Node.js 20+ with npm is required. Use the bootstrap installer to review and approve installation. / 请通过引导安装器查看方案并确认补齐 Node.js 20+ 与 npm。",
    ),
    { code: "SUPERFLOW_NODE_UNAVAILABLE" },
  );
}

function managedRuntimePrefix(
  nodePath,
  env = process.env,
  platform = process.platform,
) {
  const home = env.HOME || env.USERPROFILE;
  if (!home) return null;
  const data =
    platform === "win32"
      ? env.LOCALAPPDATA || path.join(home, ".local")
      : env.XDG_DATA_HOME || path.join(home, ".local/share");
  const real = fs.realpathSync(nodePath);
  const relative = path.relative(path.join(data, "superflow/node"), real);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? platform === "win32"
      ? path.dirname(real)
      : path.resolve(path.dirname(real), "..")
    : null;
}

function resolveManagedNodeTool(
  command,
  packageRoot,
  nodePath = process.execPath,
  env = process.env,
) {
  if (command !== "openspec") return null;
  const bases = [];
  const peer = path.resolve(packageRoot, "../..");
  if (path.basename(peer) === "node_modules") bases.push(peer);
  const privatePrefix = managedRuntimePrefix(nodePath, env);
  if (privatePrefix)
    bases.push(
      path.join(
        privatePrefix,
        process.platform === "win32" ? "node_modules" : "lib/node_modules",
      ),
    );
  for (const base of bases) {
    const root = path.join(base, "@fission-ai/openspec");
    const file = path.join(root, "package.json");
    if (!fs.existsSync(file)) continue;
    const metadata = JSON.parse(fs.readFileSync(file, "utf8"));
    const bin =
      typeof metadata.bin === "string" ? metadata.bin : metadata.bin?.openspec;
    if (metadata.name !== "@fission-ai/openspec" || typeof bin !== "string")
      throw new Error("Invalid workflow dependency / 工作流依赖元数据无效");
    const target = fs.realpathSync(path.resolve(root, bin));
    const relative = path.relative(fs.realpathSync(root), target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error(
        "Workflow entry escapes its package / 工作流入口越出安装包",
      );
    return { executable: nodePath, argumentPrefix: [target] };
  }
  return null;
}

function repairGlobalLaunchers(
  packageRoot,
  nodePath = process.execPath,
  env = process.env,
) {
  const launchers = require("../installer/launchers.cjs");
  const prefix = globalInstallPrefix(packageRoot);
  if (!prefix) return;
  const active = [];
  for (const name of ["superflow", "superflow-mcp"]) {
    const files =
      process.platform === "win32"
        ? [name + ".cmd", name + ".ps1", name]
        : [name];
    let found = false;
    for (const directory of userCommandPath(env).split(path.delimiter)) {
      for (const file of files) {
        const entry = path.join(directory, file);
        if (!fs.existsSync(entry)) continue;
        if (launchers.ownedCli(entry)) active.push({ entry, name });
        found = true;
        break;
      }
      if (found) break;
    }
  }
  launchers.installLaunchers(
    process.platform === "win32" ? prefix : path.join(prefix, "bin"),
    packageRoot,
    nodePath,
    process.platform,
    env.SUPERFLOW_INSTALL_OWNER === "update" ||
      (env.npm_lifecycle_event === "postinstall" &&
        env.npm_config_global === "true"),
  );
  for (const { entry, name } of active)
    launchers.writeLauncher(
      entry,
      nodePath,
      path.join(
        packageRoot,
        name === "superflow" ? "dist/app/cli.js" : "dist/mcp/server.js",
      ),
    );
  const home = env.HOME || env.USERPROFILE;
  if (!home) return;
  const data =
    process.platform === "win32"
      ? env.LOCALAPPDATA || path.join(home, ".local")
      : env.XDG_DATA_HOME || path.join(home, ".local/share");
  const relative = path.relative(path.join(data, "superflow/node"), nodePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    const bin =
      process.platform === "win32"
        ? path.join(data, "superflow/bin")
        : path.join(home, ".local/bin");
    launchers.installLaunchers(bin, packageRoot, nodePath);
  }
}

module.exports = {
  resolveNpmInvocation,
  globalInstallPrefix,
  npmArguments,
  selectInstallerRuntime,
  userCommandPath,
  projectDependsOnSuperflow,
  repairGlobalLaunchers,
  managedRuntimePrefix,
  resolveManagedNodeTool,
};

if (require.main === module) {
  try {
    if (process.argv[2] === "--select-installer-node") {
      process.stdout.write(selectInstallerRuntime().executable + "\n");
      process.exit(0);
    }
    const invocation = resolveNpmInvocation();
    const args = npmArguments(
      process.argv.slice(2),
      path.resolve(__dirname, ".."),
    );
    const result = spawnSync(
      invocation.executable,
      [...invocation.argumentPrefix, ...args],
      {
        stdio: "inherit",
        env: process.env,
        shell: false,
      },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(`[Superflow] ${error.message}`);
    process.exitCode = 1;
  }
}
