"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

function launcherContent(nodePath, cliPath, extension = "") {
  const metadata = JSON.stringify({ nodePath, cliPath });
  if (extension === ".cmd") {
    const quote = (value) => '"' + value.replaceAll("%", "%%") + '"';
    return `@echo off\r\n:: Superflow launcher ${metadata}\r\nsetlocal DisableDelayedExpansion\r\n${quote(nodePath)} ${quote(cliPath)} %*\r\n`;
  }
  if (extension === ".ps1") {
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    return `# Superflow launcher ${metadata}\n& ${quote(nodePath)} ${quote(cliPath)} @args\nexit $LASTEXITCODE\n`;
  }
  const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
  return `#!/bin/sh\n# Superflow launcher ${metadata}\nexec ${quote(nodePath)} ${quote(cliPath)} "$@"\n`;
}

function readLauncher(file) {
  try {
    const content = fs.readFileSync(file, "utf8");
    const raw = content.match(/^(?:#|::) Superflow launcher (.+)$/m)?.[1];
    const data = JSON.parse(raw);
    const extension = /\.(cmd|ps1)$/i.test(file)
      ? path.extname(file).toLowerCase()
      : "";
    return content === launcherContent(data.nodePath, data.cliPath, extension)
      ? data
      : null;
  } catch {
    return null;
  }
}

function ownedCli(file) {
  try {
    const bound = readLauncher(file);
    if (!bound && !fs.lstatSync(file).isSymbolicLink()) return null;
    const cliPath = bound?.cliPath || fs.realpathSync(file);
    const root = path.resolve(path.dirname(cliPath), "../..");
    const metadata = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    );
    return metadata.name === "@chenmk/superflow" &&
      ["dist/app/cli.js", "dist/mcp/server.js"].some(
        (relative) => cliPath === path.join(root, relative),
      )
      ? { cliPath, nodePath: bound?.nodePath }
      : null;
  } catch {
    return null;
  }
}

function writeLauncher(file, nodePath, cliPath, allowNpmShim = false) {
  const extension = /\.(cmd|ps1)$/i.test(file)
    ? path.extname(file).toLowerCase()
    : "";
  const content = launcherContent(nodePath, cliPath, extension);
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (stat) {
    const previous = fs.readFileSync(file, "utf8");
    if (!stat.isSymbolicLink() && previous === content) return;
    const npmShim =
      allowNpmShim &&
      extension &&
      /node_modules[\\/]@chenmk[\\/]superflow[\\/]dist[\\/]/.test(previous);
    if (!ownedCli(file) && !npmShim)
      throw new Error(`Preserve custom launcher / 保留用户自定义入口: ${file}`);
    const original = stat.isSymbolicLink() ? fs.readlinkSync(file) : previous;
    const backup =
      file +
      ".superflow-backup-" +
      createHash("sha256").update(original).digest("hex").slice(0, 12);
    if (!fs.lstatSync(backup, { throwIfNoEntry: false })) {
      if (stat.isSymbolicLink()) fs.symlinkSync(original, backup);
      else fs.copyFileSync(file, backup);
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + ".superflow-" + process.pid;
  fs.writeFileSync(temporary, content, { flag: "wx", mode: 0o755 });
  try {
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function installLaunchers(
  directory,
  packageRoot,
  nodePath,
  platform = process.platform,
  npmInstalled = false,
) {
  for (const [name, target] of [
    ["superflow", "dist/app/cli.js"],
    ["superflow-mcp", "dist/mcp/server.js"],
  ]) {
    for (const extension of platform === "win32" ? [".cmd", ".ps1"] : [""]) {
      writeLauncher(
        path.join(directory, name + extension),
        nodePath,
        path.join(packageRoot, target),
        platform === "win32" && npmInstalled,
      );
    }
  }
}

module.exports = {
  launcherContent,
  readLauncher,
  ownedCli,
  writeLauncher,
  installLaunchers,
};
